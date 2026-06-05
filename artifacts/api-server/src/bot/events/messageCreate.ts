import { Message, TextChannel } from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const spamTracker = new Map<string, { count: number; lastMessage: number; warned: boolean }>();

export async function onMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;

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
