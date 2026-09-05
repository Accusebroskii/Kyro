import { MessageFlags } from "discord.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  Guild,
} from "discord.js";
import { checkAdmin, isOwner } from "../lib/permissions.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";

// Split into small batches so each rule stays well under Discord's per-rule
// keyword limits, while still giving us several distinct keyword rules.
const KEYWORD_BATCHES: string[][] = [
  ["viagra", "cialis", "casino", "lottery winner", "claim your prize"],
  ["free nitro", "steam gift", "discord nitro free", "you won a giveaway"],
  ["click here now", "limited time offer", "act now", "double your money"],
  ["nudes for sale", "onlyfans leak", "cp trade", "cheap followers"],
  ["crypto giveaway", "send bitcoin", "guaranteed profit", "investment opportunity"],
  ["hacked account", "free robux", "free vbucks", "account generator"],
];

interface RuleResult {
  created: string[];
  skipped: string[];
}

async function createRuleSet(guild: Guild): Promise<RuleResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const existing = await guild.autoModerationRules.fetch();
  const existingNames = new Set(existing.map((r) => r.name));

  const tryCreate = async (name: string, fn: () => Promise<unknown>) => {
    if (existingNames.has(name)) {
      skipped.push(`${name} (already exists)`);
      return;
    }
    try {
      await fn();
      created.push(name);
    } catch (err: any) {
      skipped.push(`${name} (${err?.message ?? "failed"})`);
    }
  };

  // Preset filters — profanity, sexual content, slurs (3 separate rules)
  const presets: [string, AutoModerationRuleKeywordPresetType][] = [
    ["Filter — Profanity", AutoModerationRuleKeywordPresetType.Profanity],
    ["Filter — Sexual Content", AutoModerationRuleKeywordPresetType.SexualContent],
    ["Filter — Slurs", AutoModerationRuleKeywordPresetType.Slurs],
  ];
  for (const [name, preset] of presets) {
    await tryCreate(name, () =>
      guild.autoModerationRules.create({
        name,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.KeywordPreset,
        triggerMetadata: { presets: [preset] },
        actions: [{ type: AutoModerationActionType.BlockMessage }],
        enabled: true,
        reason: "AutoMod setup",
      }),
    );
  }

  // Spam detection
  await tryCreate("Spam Detection", () =>
    guild.autoModerationRules.create({
      name: "Spam Detection",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      actions: [{ type: AutoModerationActionType.BlockMessage }],
      enabled: true,
      reason: "AutoMod setup",
    }),
  );

  // Mention spam
  await tryCreate("Mention Spam Limit", () =>
    guild.autoModerationRules.create({
      name: "Mention Spam Limit",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: 5 },
      actions: [{ type: AutoModerationActionType.BlockMessage }],
      enabled: true,
      reason: "AutoMod setup",
    }),
  );

  // Custom keyword batches
  for (let i = 0; i < KEYWORD_BATCHES.length; i++) {
    const name = `Keyword Filter ${i + 1}`;
    await tryCreate(name, () =>
      guild.autoModerationRules.create({
        name,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: KEYWORD_BATCHES[i] },
        actions: [{ type: AutoModerationActionType.BlockMessage }],
        enabled: true,
        reason: "AutoMod setup",
      }),
    );
  }

  return { created, skipped };
}

export const automodCommand = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Manage AutoMod rule setup")
    .addSubcommand((s) =>
      s.setName("setup").setDescription("Create a standard set of AutoMod rules in this server"),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show how many AutoMod rules exist across all servers"),
    )
    .addSubcommand((s) =>
      s
        .setName("setup-all")
        .setDescription("(Owner only) Create AutoMod rules across every server the bot is in"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
      if (!(await checkAdmin(interaction))) return;
      if (!interaction.guild) {
        await interaction.reply({ embeds: [errorEmbed("This command must be used in a server.")] });
        return;
      }
      await interaction.deferReply();
      const { created, skipped } = await createRuleSet(interaction.guild);
      await interaction.editReply({
        embeds: [
          successEmbed(
            "AutoMod Setup",
            `Created **${created.length}** rule(s) in this server.\n\n` +
              (created.length ? `**Created:**\n${created.map((n) => `• ${n}`).join("\n")}\n\n` : "") +
              (skipped.length ? `**Skipped:**\n${skipped.map((n) => `• ${n}`).join("\n")}` : ""),
          ),
        ],
      });
      return;
    }

    if (sub === "status") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const client = interaction.client;
      let total = 0;
      const perGuild: string[] = [];
      for (const [, guild] of client.guilds.cache) {
        try {
          const rules = await guild.autoModerationRules.fetch();
          total += rules.size;
          perGuild.push(`${guild.name}: ${rules.size}`);
        } catch {
          perGuild.push(`${guild.name}: unable to fetch`);
        }
      }
      await interaction.editReply({
        embeds: [
          infoEmbed(
            "AutoMod Rule Count",
            `**Total rules across all servers: ${total}**\n(Badge threshold is 100)\n\n${perGuild.join("\n")}`,
          ),
        ],
      });
      return;
    }

    if (sub === "setup-all") {
      if (!isOwner(interaction)) {
        await interaction.reply({ embeds: [errorEmbed("Only the bot owner can use this.")], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply();
      const client = interaction.client;
      let totalCreated = 0;
      const summary: string[] = [];
      for (const [, guild] of client.guilds.cache) {
        try {
          const { created } = await createRuleSet(guild);
          totalCreated += created.length;
          summary.push(`${guild.name}: +${created.length}`);
        } catch (err: any) {
          summary.push(`${guild.name}: failed (${err?.message ?? "unknown error"})`);
        }
      }
      await interaction.editReply({
        embeds: [
          successEmbed(
            "AutoMod Setup — All Servers",
            `Created **${totalCreated}** new rule(s) across ${client.guilds.cache.size} server(s).\n\n${summary.join("\n")}`,
          ),
        ],
      });
      return;
    }
  },
};
