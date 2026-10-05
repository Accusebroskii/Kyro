import {
  EmbedBuilder,
  Message,
  TextChannel,
} from "discord.js";
import { db, guildConfigTable, ticketsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export async function handlePartnershipProof(message: Message) {
  if (!message.guildId || message.author.bot) return;
  if (!message.channel.isTextBased()) return;

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        eq(ticketsTable.guildId, message.guildId),
        eq(ticketsTable.channelId, message.channelId),
        eq(ticketsTable.subject, "Partnership Application"),
      ),
    )
    .limit(1);

  if (!ticket || ticket.userId !== message.author.id) return;
  if (message.attachments.size === 0) return;

  const imageAttachments = [...message.attachments.values()].filter(
    (attachment) =>
      attachment.contentType?.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/i.test(attachment.name ?? ""),
  );

  if (imageAttachments.length === 0) return;

  const [config] = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, message.guildId))
    .limit(1);

  if (!config?.partnershipReviewChannelId) {
    await message.reply(
      "⚠️ Your proof was received, but the partnership review channel is not configured.",
    );
    return;
  }

  const reviewChannel = await message.guild.channels
    .fetch(config.partnershipReviewChannelId)
    .catch(() => null);

  if (!reviewChannel || !(reviewChannel instanceof TextChannel)) {
    await message.reply(
      "⚠️ Your proof was received, but I couldn't find the partnership review channel.",
    );
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📸 Partnership Proof Submitted")
    .setDescription(
      `A partnership applicant has submitted proof for staff review.\n\n` +
      `**Applicant:** <@${ticket.userId}>\n` +
      `**Ticket:** <#${message.channelId}>`,
    )
    .setTimestamp();

  await reviewChannel.send({
    embeds: [embed],
    files: imageAttachments.map((attachment) => ({
      attachment: attachment.url,
      name: attachment.name ?? "partnership-proof",
    })),
  });

  await message.reply(
    "✅ Proof received and sent to the partnership review team. Please wait for staff to review it.",
  );
}
