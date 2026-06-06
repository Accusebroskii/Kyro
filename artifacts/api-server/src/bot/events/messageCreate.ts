import { Message, TextChannel, GuildMember } from "discord.js";
import { db, guildConfigTable, modmailTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const spamTracker = new Map<string, { count: number; lastMessage: number; warned: boolean }>();

export async function onMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;

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
      // This is a modmail thread — forward the message to the user
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
    logger.error({ err }, "Error in automod messageCreate");
  }
}
