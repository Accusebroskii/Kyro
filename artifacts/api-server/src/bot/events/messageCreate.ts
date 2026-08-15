import { Message, TextChannel, GuildMember } from "discord.js";
import { db, guildConfigTable, modmailTable, afkStatusTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { handleMessageXp } from "../commands/levels.js";

const spamTracker = new Map<string, { count: number; lastMessage: number; warned: boolean }>();
const KALEIGH_USER_ID = "1492136743493828790";

// Counting system
async function handleCounting(message: Message, guildId: string): Promise<boolean> {
  const [config] = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, guildId))
    .limit(1);

  // Counting isn't configured for this guild/channel.
  if (!config?.countingChannelId || message.channelId !== config.countingChannelId) {
    return false;
  }

  const content = message.content.trim();

  // Only handle whole-number messages in the counting channel.
  // Other messages are ignored by the counting system.
  if (!/^\d+$/.test(content)) {
    return true;
  }

  const number = Number(content);
  const current = config.countingCurrent ?? 0;
  const expected = current + 1;

  // ─────────────────────────────────────────────
  // Same user cannot count twice in a row
  // ─────────────────────────────────────────────

  if (config.countingLastUserId === message.author.id) {
    await message.delete().catch(() => {});

    if (message.channel instanceof TextChannel) {
      await message.channel.send(
        `❌ <@${message.author.id}> You can't count twice in a row!`
      ).catch(() => {});
    }

    return true;
  }

  // ─────────────────────────────────────────────
  // Wrong number
  // ─────────────────────────────────────────────

  if (number !== expected) {
    // Delete the user's incorrect number.
    await message.delete().catch(() => {});

    // Reset the counting game.
    await db
      .update(guildConfigTable)
      .set({
        countingCurrent: 0,
        countingLastUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(guildConfigTable.guildId, guildId));

    // IMPORTANT:
    // This warning is NOT deleted anymore.
    if (message.channel instanceof TextChannel) {
      await message.channel.send(
        `❌ <@${message.author.id}> Wrong number! You sent **${number}**, but the next number was **${expected}**.\n` +
        `🔄 The count has been reset. Start again with **1**.`
      ).catch(() => {});
    }

    return true;
  }

  // ─────────────────────────────────────────────
  // Correct number
  // ─────────────────────────────────────────────

  const newCount = number;

  const highScore = Math.max(
    config.countingHighScore ?? 0,
    newCount,
  );

  await db
    .update(guildConfigTable)
    .set({
      countingCurrent: newCount,
      countingHighScore: highScore,
      countingLastUserId: message.author.id,
      updatedAt: new Date(),
    })
    .where(eq(guildConfigTable.guildId, guildId));

  // React with ✅ to the correct counting message.
  await message.react("✅").catch(() => {});

  return true;
}

export async function onMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;
  const guildId = message.guild.id;

// Counting must run before other message handlers.
try {
  const handledByCounting = await handleCounting(message, guildId);
  if (handledByCounting) return;
} catch (err) {
  logger.error("Error in counting messageCreate handler: " + (err instanceof Error ? err.stack || err.message : String(err)));
}


  // Kale ping
  if (message.content.toLowerCase().includes("kale")) {
    if ("send" in message.channel) (message.channel as import("discord.js").TextChannel).send(`<@${KALEIGH_USER_ID}>`).catch(() => {});
  }

  // AFK: clear AFK status if the author was AFK, and notify if a mentioned user is AFK
  try {
    const [selfAfk] = await db
      .select()
      .from(afkStatusTable)
      .where(and(eq(afkStatusTable.guildId, guildId), eq(afkStatusTable.userId, message.author.id)))
      .limit(1);
    if (selfAfk) {
      await db.delete(afkStatusTable).where(eq(afkStatusTable.id, selfAfk.id));
      (message.channel as TextChannel)
        .send(`👋 Welcome back <@${message.author.id}>, I removed your AFK status.`)
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
        .catch(() => {});
    }

    if (message.mentions.users.size > 0) {
      for (const [, mentioned] of message.mentions.users) {
        if (mentioned.bot) continue;
        const [mentionedAfk] = await db
          .select()
          .from(afkStatusTable)
          .where(and(eq(afkStatusTable.guildId, guildId), eq(afkStatusTable.userId, mentioned.id)))
          .limit(1);
        if (mentionedAfk) {
          (message.channel as TextChannel)
            .send(`💤 <@${mentioned.id}> is AFK: ${mentionedAfk.reason}`)
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Error in AFK messageCreate handler");
  }

  // Leveling: award XP for this message
  try {
    if (message.member && message.channel instanceof TextChannel) {
      await handleMessageXp(message.member, message.channel);
    }
  } catch (err) {
    logger.error({ err }, "Error in leveling messageCreate handler");
  }
  
  // ModMail: if a staff member types in a modmail thread, forward it to the user
  try {
    const [thread] = await db
      .select()
      .from(modmailTable)
      .where(
        and(
          eq(modmailTable.guildId, guildId),
          eq(modmailTable.threadChannelId, message.channelId),
          eq(modmailTable.status, "open"),
        ),
      )
      .limit(1);
    if (thread) {
      try {
        const user = await message.client.users.fetch(thread.userId);
        const member = message.member as GuildMember;
        const senderName = member?.displayName ?? message.author.username;
        await user.send(`**${senderName} (Staff):** ${message.content}`);
      } catch (err) {
        logger.warn({ err }, "Failed to forward modmail reply to user");
        (message.channel as TextChannel)
          .send("⚠️ Could not deliver your message — the user's DMs may be closed.")
          .catch(() => {});
      }
      return;
    }
  } catch (err) {
    logger.error({ err }, "Error in modmail messageCreate handler");
  }

  // Antispam
  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);
    if (!config?.antispamEnabled) return;
    // Skip mods, admins, and anyone with Administrator permission
    let member = message.guild.members.cache.get(message.author.id);
    if (!member) {
      try {
        member = await message.guild.members.fetch(message.author.id);
      } catch {
        // ignore
      }
    }
    if (config.modRoleId && member?.roles.cache.has(config.modRoleId)) return;
    if (config.adminRoleId && member?.roles.cache.has(config.adminRoleId)) return;
    if (member?.permissions.has("Administrator")) return;
    const key = `${guildId}:${message.author.id}`;
    const now = Date.now();
    const tracker = spamTracker.get(key) ?? { count: 0, lastMessage: now, warned: false };
    if (now - tracker.lastMessage < 3000) {
      tracker.count++;
    } else {
      tracker.count = 1;
      tracker.warned = false;
    }
    tracker.lastMessage = now;
    spamTracker.set(key, tracker);
    if (tracker.count >= 5) {
      try {
        await message.delete();
      } catch {
        // ignore
      }
      if (!tracker.warned) {
        tracker.warned = true;
        if (message.channel instanceof TextChannel) {
          message.channel
            .send(`<@${message.author.id}> Please stop spamming! You will be timed out if this continues.`)
            .then((m: { delete: () => Promise<unknown> }) => setTimeout(() => m.delete().catch(() => {}), 5000))
            .catch(() => {});
        }
        if (tracker.count >= 8) {
          try {
            const member = await message.guild.members.fetch(message.author.id);
            await member.timeout(60_000, "Auto-mod: spam detected");
          } catch (err) {
            logger.warn({ err }, "Failed to timeout spammer");
          }
        }
      }
    }
  } catch (err) {
    logger.error("Error in automod messageCreate: " + (err instanceof Error ? err.stack || err.message : String(err)));
  }
}