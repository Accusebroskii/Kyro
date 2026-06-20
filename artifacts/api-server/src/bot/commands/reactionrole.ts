import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  TextChannel,
  PermissionFlagsBits,
} from "discord.js";
import { db, reactionRolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { checkAdmin } from "../lib/permissions.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";

// Extracts a matchable key from emoji input: custom emoji -> its id, unicode -> the char itself
function parseEmoji(input: string): { key: string; display: string } {
  const customMatch = input.match(/^<a?:(\w+):(\d+)>$/);
  if (customMatch) {
    return { key: customMatch[2], display: input };
  }
  return { key: input.trim(), display: input.trim() };
}

export const reactionRoleCommand = {
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Manage reaction roles")
    .addSubcommand((s) =>
      s.setName("add").setDescription("Add a reaction role to a message")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel the message is in").setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName("message_id").setDescription("ID of the message to react to").setRequired(true))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji to react with (unicode or custom)").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role to give when reacted").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Remove a reaction role binding")
        .addStringOption((o) => o.setName("message_id").setDescription("ID of the message").setRequired(true))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji bound to the role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List all reaction roles in this server"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === "add") {
      const channel = interaction.options.getChannel("channel", true) as TextChannel;
      const messageId = interaction.options.getString("message_id", true);
      const emojiInput = interaction.options.getString("emoji", true);
      const role = interaction.options.getRole("role", true);

      const { key, display } = parseEmoji(emojiInput);

      let message;
      try {
        message = await channel.messages.fetch(messageId);
      } catch {
        await interaction.reply({ embeds: [errorEmbed("Could not find a message with that ID in that channel.")], ephemeral: true });
        return;
      }

      try {
        await message.react(display);
      } catch {
        await interaction.reply({ embeds: [errorEmbed("Could not react with that emoji. Make sure it's valid and the bot has access to it.")], ephemeral: true });
        return;
      }

      const existing = await db.select().from(reactionRolesTable).where(
        and(eq(reactionRolesTable.guildId, guildId), eq(reactionRolesTable.messageId, messageId), eq(reactionRolesTable.emojiKey, key)),
      );
      if (existing.length > 0) {
        await interaction.reply({ embeds: [errorEmbed("This emoji is already bound to a role on this message.")], ephemeral: true });
        return;
      }

      await db.insert(reactionRolesTable).values({
        guildId, channelId: channel.id, messageId, emojiKey: key, emojiDisplay: display, roleId: role.id,
      });

      await interaction.reply({ embeds: [successEmbed("Reaction Role Added", `Reacting with ${display} on that message now gives <@&${role.id}>.`)], ephemeral: true });

    } else if (sub === "remove") {
      const messageId = interaction.options.getString("message_id", true);
      const emojiInput = interaction.options.getString("emoji", true);
      const { key } = parseEmoji(emojiInput);

      const deleted = await db.delete(reactionRolesTable).where(
        and(eq(reactionRolesTable.guildId, guildId), eq(reactionRolesTable.messageId, messageId), eq(reactionRolesTable.emojiKey, key)),
      ).returning();

      if (deleted.length === 0) {
        await interaction.reply({ embeds: [errorEmbed("No reaction role binding found for that message/emoji.")], ephemeral: true });
        return;
      }

      await interaction.reply({ embeds: [successEmbed("Reaction Role Removed", "That binding has been removed.")], ephemeral: true });

    } else if (sub === "list") {
      const rows = await db.select().from(reactionRolesTable).where(eq(reactionRolesTable.guildId, guildId));
      if (!rows.length) {
        await interaction.reply({ embeds: [infoEmbed("Reaction Roles", "No reaction roles configured.")], ephemeral: true });
        return;
      }
      const list = rows.map((r) => `${r.emojiDisplay} → <@&${r.roleId}> (message \`${r.messageId}\` in <#${r.channelId}>)`).join("\n");
      await interaction.reply({ embeds: [infoEmbed("Reaction Roles", list)], ephemeral: true });
    }
  },
};