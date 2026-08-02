import { MessageReaction, PartialMessageReaction, User, PartialUser, EmbedBuilder, TextChannel } from "discord.js";
import { db, reactionRolesTable, guildConfigTable, starboardPostsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

function emojiKeyOf(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? "";
}

export async function onMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (!reaction.message.guild) return;

    const guildId = reaction.message.guild.id;
    const key = emojiKeyOf(reaction);

    // ── Reaction roles ─────────────────────────────────────────────────────
    const [binding] = await db
      .select()
      .from(reactionRolesTable)
      .where(
        and(
          eq(reactionRolesTable.guildId, guildId),
          eq(reactionRolesTable.messageId, reaction.message.id),
          eq(reactionRolesTable.emojiKey, key),
        ),
      )
      .limit(1);

    if (binding) {
      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        await member.roles.add(binding.roleId).catch((err) => {
          logger.warn({ err }, "Failed to add reaction role");
        });
      }
    }

    // ── Starboard ──────────────────────────────────────────────────────────
    if (key === "⭐" || key === "star") {
      const [config] = await db
        .select()
        .from(guildConfigTable)
        .where(eq(guildConfigTable.guildId, guildId))
        .limit(1);

      if (!config?.starboardChannelId) return;

      const threshold = config.starboardThreshold ?? 3;
      if (reaction.message.partial) await reaction.message.fetch();
      const starCount = reaction.count ?? 0;

      if (starCount < threshold) return;

      const starChannel = reaction.message.guild.channels.cache.get(config.starboardChannelId) as TextChannel | undefined;
      if (!starChannel) return;

      // Don't star messages in the starboard channel itself
      if (reaction.message.channelId === config.starboardChannelId) return;

      const [existing] = await db
        .select()
        .from(starboardPostsTable)
        .where(eq(starboardPostsTable.messageId, reaction.message.id))
        .limit(1);

      const msg = reaction.message;
      const author = msg.author;
      if (!author) return;

      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() })
        .setDescription(msg.content || null)
        .addFields({ name: "Source", value: `[Jump to message](${msg.url})`, inline: true })
        .setFooter({ text: `⭐ ${starCount} | #${(msg.channel as TextChannel).name ?? ""}` })
        .setTimestamp(msg.createdAt);

      if (msg.attachments.size > 0) {
        const image = msg.attachments.find((a) => a.contentType?.startsWith("image/"));
        if (image) embed.setImage(image.url);
      }

      if (existing) {
        // Update star count on existing starboard post
        try {
          const sbMsg = await starChannel.messages.fetch(existing.starboardMessageId);
          const updatedEmbed = EmbedBuilder.from(sbMsg.embeds[0]!).setFooter({
            text: `⭐ ${starCount} | #${(msg.channel as TextChannel).name ?? ""}`,
          });
          await sbMsg.edit({ embeds: [updatedEmbed] });
          await db
            .update(starboardPostsTable)
            .set({ starCount })
            .where(eq(starboardPostsTable.messageId, reaction.message.id));
        } catch {
          // Message may have been deleted
        }
      } else {
        // Post new starboard entry
        const sbMsg = await starChannel.send({ embeds: [embed] });
        await db.insert(starboardPostsTable).values({
          guildId,
          messageId: reaction.message.id,
          starboardMessageId: sbMsg.id,
          starCount,
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Error in messageReactionAdd handler");
  }
}
