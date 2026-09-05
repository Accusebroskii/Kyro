import { MessageFlags } from "discord.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { db, modmailTable, guildConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { checkModerator } from "../lib/permissions.js";
import { successEmbed, errorEmbed } from "../lib/embeds.js";

export const modmailCommand = {
  data: new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("ModMail management (use in modmail threads)")
    .addSubcommand((s) =>
      s.setName("close").setDescription("Close a ModMail thread")
        .addStringOption((o) => o.setName("reason").setDescription("Reason for closing"))
    )
    .addSubcommand((s) =>
      s.setName("reply").setDescription("Reply to the user anonymously")
        .addStringOption((o) => o.setName("message").setDescription("Your reply").setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const channel = interaction.channel as TextChannel;

    const [thread] = await db.select().from(modmailTable)
      .where(and(eq(modmailTable.guildId, guildId), eq(modmailTable.threadChannelId, channel.id), eq(modmailTable.status, "open")))
      .limit(1);

    if (!thread) {
      await interaction.reply({ embeds: [errorEmbed("This command can only be used in an active ModMail thread.")], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "close") {
      const reason = interaction.options.getString("reason") ?? "Closed by staff";
      await db.update(modmailTable).set({ status: "closed", closedBy: interaction.user.id, closedReason: reason, closedAt: new Date() }).where(eq(modmailTable.id, thread.id));
      await interaction.reply({ embeds: [successEmbed("ModMail Closed", `Thread closed.\n**Reason:** ${reason}`)] });
      // Try to DM the user
      try {
        const client = interaction.client;
        const user = await client.users.fetch(thread.userId);
        await user.send(`Your ModMail thread in **${interaction.guild!.name}** has been closed.\n**Reason:** ${reason}`);
      } catch {
        // User DMs may be closed
      }
      setTimeout(() => channel.delete().catch(() => {}), 5000);
    } else if (sub === "reply") {
      const message = interaction.options.getString("message", true);
      try {
        const user = await interaction.client.users.fetch(thread.userId);
        await user.send(`**Reply from ${interaction.guild!.name} Staff:**\n${message}`);
        await interaction.reply({ embeds: [successEmbed("Reply Sent", `Reply delivered to ${thread.userTag}.`)] });
      } catch {
        await interaction.reply({ embeds: [errorEmbed("Could not DM the user. Their DMs may be closed.")] });
      }
    }
  },
};
