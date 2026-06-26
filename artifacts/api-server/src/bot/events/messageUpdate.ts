import { Message, PartialMessage, TextChannel, EmbedBuilder } from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

export async function onMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  // Ignore edits where content didn't actually change (e.g. embed link
  // unfurls trigger an update event with identical content).
  if (oldMessage.content === newMessage.content) return;

  const guildId = newMessage.guild.id;
  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);
    if (!config?.logChannelId) return;
    if (config.logChannelId === newMessage.channelId) return;

    const logChannel = newMessage.guild.channels.cache.get(
      config.logChannelId,
    ) as TextChannel | undefined;
    if (!logChannel) return;

    const beforeContent = oldMessage.content || "*(content unavailable)*";
    const afterContent = newMessage.content || "*(content unavailable)*";

    const embed = new EmbedBuilder()
      .setTitle("✏️ Message Edited")
      .setColor(0xfee75c)
      .addFields(
        {
          name: "Author",
          value: newMessage.author ? `<@${newMessage.author.id}> (${newMessage.author.tag})` : "Unknown",
          inline: true,
        },
        { name: "Channel", value: `<#${newMessage.channelId}>`, inline: true },
        { name: "Before", value: beforeContent.slice(0, 500) },
        { name: "After", value: afterContent.slice(0, 500) },
      )
      .setFooter({ text: `Message ID: ${newMessage.id}` })
      .setTimestamp();

    if (newMessage.url) {
      embed.addFields({ name: "Jump to Message", value: `[Click here](${newMessage.url})` });
    }

    logChannel.send({ embeds: [embed] }).catch((err) =>
      logger.warn({ err }, "Failed to send message edit log"),
    );
  } catch (err) {
    logger.error({ err, guildId }, "Error in messageUpdate");
  }
}