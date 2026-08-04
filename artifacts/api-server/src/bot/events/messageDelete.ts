import { Message, PartialMessage, TextChannel, EmbedBuilder } from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { snipeCache } from "../lib/snipeCache.js";

export async function onMessageDelete(
  message: Message | PartialMessage,
): Promise<void> {
  if (!message.guild) return;
  if (message.author?.bot) return;

  // Cache for /snipe
  if (message.content && message.author) {
    snipeCache.set(message.channelId, {
      content: message.content.slice(0, 2000),
      authorTag: message.author.username,
      authorAvatar: message.author.displayAvatarURL(),
      timestamp: new Date(),
    });
  }

  const guildId = message.guild.id;
  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);
    if (!config?.logChannelId) return;
    if (config.logChannelId === message.channelId) return; // avoid logging deletes in the log channel itself

    const logChannel = message.guild.channels.cache.get(
      config.logChannelId,
    ) as TextChannel | undefined;
    if (!logChannel) return;

    // Partial messages (not in cache when deleted) may not have full content.
    const content = message.content || "*(content unavailable — message was not cached)*";

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Message Deleted")
      .setColor(0xed4245)
      .addFields(
        {
          name: "Author",
          value: message.author ? `<@${message.author.id}> (${message.author.username})` : "Unknown",
          inline: true,
        },
        { name: "Channel", value: `<#${message.channelId}>`, inline: true },
        { name: "Content", value: content.slice(0, 1000) },
      )
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp();

    if (message.attachments.size > 0) {
      embed.addFields({
        name: "Attachments",
        value: message.attachments.map((a) => a.url).slice(0, 5).join("\n"),
      });
    }

    logChannel.send({ embeds: [embed] }).catch((err) =>
      logger.warn({ err }, "Failed to send message delete log"),
    );
  } catch (err) {
    logger.error({ err, guildId }, "Error in messageDelete");
  }
}