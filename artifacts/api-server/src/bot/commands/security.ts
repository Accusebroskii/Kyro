import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkAdmin } from "../lib/permissions.js";
import { successEmbed, errorEmbed } from "../lib/embeds.js";

export const securityCommand = {
  data: new SlashCommandBuilder()
    .setName("security")
    .setDescription("Manage server security settings")
    .addSubcommand((s) => s.setName("status").setDescription("View current security settings"))
    .addSubcommand((s) =>
      s.setName("antispam").setDescription("Toggle anti-spam detection")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("antiraid").setDescription("Toggle anti-raid mode")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("whitelist").setDescription("Manage the anti-raid whitelist")
        .addStringOption((o) => o.setName("action").setDescription("add or remove or list").setRequired(true).addChoices({ name: "List", value: "list" }))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === "status") {
      const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
      const embed = new EmbedBuilder().setTitle("🛡️ Security Status").setColor(0x5865f2)
        .addFields(
          { name: "Anti-Spam", value: config?.antispamEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Anti-Raid", value: config?.antiRaidEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Auto-Mod", value: config?.automodEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Max Warnings", value: String(config?.maxWarnings ?? 3), inline: true },
        ).setDescription(
          "**Anti-Spam**: Detects and removes repeated messages. Auto-mutes at 8+ messages/3s.\n" +
          "**Anti-Raid**: Monitors for mass-join events.\n" +
          "**Auto-Mod**: General rule enforcement."
        ).setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else if (sub === "antispam") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await db.update(guildConfigTable).set({ antispamEnabled: enabled }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Anti-Spam", `Anti-spam has been ${enabled ? "enabled" : "disabled"}.`)] });
    } else if (sub === "antiraid") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await db.update(guildConfigTable).set({ antiRaidEnabled: enabled }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Anti-Raid", `Anti-raid mode has been ${enabled ? "enabled" : "disabled"}.`)] });
    } else if (sub === "whitelist") {
      await interaction.reply({ embeds: [successEmbed("Whitelist", "Use `/setup roles` to configure role-based exemptions.")] });
    }
  },
};
