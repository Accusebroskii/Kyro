import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { db, reportsTable, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { successEmbed, errorEmbed } from "../lib/embeds.js";

async function sendToStaffChannel(interaction: ChatInputCommandInteraction, embed: EmbedBuilder): Promise<void> {
  const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, interaction.guildId!)).limit(1);
  const channelId = config?.modLogChannelId ?? config?.logChannelId;
  if (channelId) {
    const ch = interaction.guild!.channels.cache.get(channelId) as TextChannel | undefined;
    ch?.send({ embeds: [embed] }).catch(() => {});
  }
}

export const bugreportCommand = {
  data: new SlashCommandBuilder()
    .setName("bugreport")
    .setDescription("Submit a bug report")
    .addStringOption((o) => o.setName("title").setDescription("Short bug title").setRequired(true))
    .addStringOption((o) => o.setName("description").setDescription("Detailed bug description").setRequired(true))
    .addStringOption((o) => o.setName("server").setDescription("server name (if applicable)"))
    .addStringOption((o) => o.setName("priority").setDescription("Priority level").addChoices(
      { name: "Low", value: "low" }, { name: "Medium", value: "medium" }, { name: "High", value: "high" }, { name: "Critical", value: "critical" }
    )),

  async execute(interaction: ChatInputCommandInteraction) {
    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);
    const server = interaction.options.getString("server");
    const priority = interaction.options.getString("priority") ?? "medium";

    const [report] = await db.insert(reportsTable).values({
      guildId: interaction.guildId!, type: "bug", userId: interaction.user.id, userTag: interaction.user.tag,
      title, description, serverName: server, priority,
    }).returning();

    const embed = new EmbedBuilder().setTitle(`🐛 Bug Report #${report!.id}`).setColor(0xed4245)
      .addFields(
        { name: "Title", value: title, inline: false },
        { name: "Reporter", value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: "Priority", value: priority.toUpperCase(), inline: true },
        { name: "Server", value: server ?? "N/A", inline: true },
        { name: "Description", value: description.slice(0, 1000) },
      ).setTimestamp();

    await sendToStaffChannel(interaction, embed);
    await interaction.reply({ embeds: [successEmbed("Bug Report Submitted", `Your bug report has been submitted (ID: #${report!.id}).\nStaff will review it shortly.`)], ephemeral: true });
  },
};

export const playerreportCommand = {
  data: new SlashCommandBuilder()
    .setName("playerreport")
    .setDescription("Report a player for rule violations")
    .addUserOption((o) => o.setName("player").setDescription("Player to report").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for report").setRequired(true))
    .addStringOption((o) => o.setName("details").setDescription("Additional details / evidence"))
    .addStringOption((o) => o.setName("server").setDescription("server name")),

  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("player", true);
    const reason = interaction.options.getString("reason", true);
    const details = interaction.options.getString("details") ?? "";
    const server = interaction.options.getString("server");

    const [report] = await db.insert(reportsTable).values({
      guildId: interaction.guildId!, type: "player", userId: interaction.user.id, userTag: interaction.user.tag,
      title: `Player Report: ${target.tag}`, description: `${reason}${details ? `\n\nDetails: ${details}` : ""}`,
      reportedUserId: target.id, reportedUserTag: target.tag, serverName: server, priority: "medium",
    }).returning();

    const embed = new EmbedBuilder().setTitle(`⚠️ Player Report #${report!.id}`).setColor(0xfee75c)
      .addFields(
        { name: "Reported Player", value: `<@${target.id}> (${target.tag})`, inline: true },
        { name: "Reporter", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Server", value: server ?? "N/A", inline: true },
        { name: "Reason", value: reason },
        ...(details ? [{ name: "Details", value: details.slice(0, 500) }] : []),
      ).setTimestamp();

    await sendToStaffChannel(interaction, embed);
    await interaction.reply({ embeds: [successEmbed("Player Report Submitted", `Report #${report!.id} submitted. Staff will review it.`)], ephemeral: true });
  },
};

export const supportCommand = {
  data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get an invite link to the support Discord server"),

  async execute(interaction: ChatInputCommandInteraction) {
    const button = new ButtonBuilder()
      .setLabel("Join Support Server")
      .setStyle(ButtonStyle.Link)
      .setURL("https://discord.gg/qeNgnjUC5Z")
      .setEmoji("🛠️");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const embed = new EmbedBuilder()
      .setTitle("🛠️ Support Server")
      .setDescription("Need help or have a question? Tap the button below to join our support server.")
      .setColor(0x5865f2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};