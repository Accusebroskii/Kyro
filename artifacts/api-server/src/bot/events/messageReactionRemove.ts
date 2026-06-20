import { MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import { db, reactionRolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

function emojiKeyOf(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? "";
}

export async function onMessageReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (!reaction.message.guild) return;

    const guildId = reaction.message.guild.id;
    const key = emojiKeyOf(reaction);

    const [binding] = await db.select().from(reactionRolesTable).where(
      and(
        eq(reactionRolesTable.guildId, guildId),
        eq(reactionRolesTable.messageId, reaction.message.id),
        eq(reactionRolesTable.emojiKey, key),
      ),
    ).limit(1);

    if (!binding) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    await member.roles.remove(binding.roleId).catch((err) => {
      logger.warn({ err }, "Failed to remove reaction role");
    });
  } catch (err) {
    logger.error({ err }, "Error in messageReactionRemove handler");
  }
}