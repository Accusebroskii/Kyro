import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  askCalyxAI,
  getOpenRouterConfigStatus,
  type AIMode,
} from "../lib/ai.js";
import {
  clearAiHistory,
  getAiHistory,
  getAiUserSettings,
  getAiUserStats,
  resetAiUser,
  saveAiTurn,
  updateAiUserSettings,
} from "../lib/aiStore.js";
import { logger } from "../../lib/logger.js";

const MODES = [
  { name: "Calm", value: "calm" },
  { name: "Crazy", value: "crazy" },
  { name: "Freaky", value: "freaky" },
] as const;

export const data = new SlashCommandBuilder()
  .setName("ai")
  .setDescription("Chat with Calyx AI and manage your AI settings")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ask")
      .setDescription("Ask Calyx one question")
      .addStringOption((option) =>
        option
          .setName("question")
          .setDescription("What do you want to ask?")
          .setMaxLength(2000)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Personality for this answer")
          .addChoices(...MODES),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("chat")
      .setDescription("Continue your saved conversation with Calyx")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("What would you like to say?")
          .setMaxLength(2000)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("clear")
      .setDescription("Clear your conversation in this server"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("personality")
      .setDescription("Set your default Calyx personality")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Choose a personality")
          .addChoices(...MODES)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("settings")
      .setDescription("View or update your personal AI settings")
      .addBooleanOption((option) =>
        option
          .setName("enabled")
          .setDescription("Allow Calyx to answer your AI requests"),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Your default personality")
          .addChoices(...MODES),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Check AI configuration and your settings"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("stats")
      .setDescription("View your saved AI usage count"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("View recent messages in this server"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("reset")
      .setDescription("Delete your AI history and reset your settings"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("info")
      .setDescription("Learn how Calyx AI works"),
  );

export const aiCommand = {
  data,
  execute,
};

function getScopeId(interaction: ChatInputCommandInteraction): string {
  return interaction.guildId ?? "dm";
}

function escapeMentions(value: string): string {
  return value.replace(/@/g, "@\u200b");
}

async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const scopeId = getScopeId(interaction);

  try {
    if (subcommand === "ask" || subcommand === "chat") {
      await interaction.deferReply();

      const settings = await getAiUserSettings(userId);
      if (!settings.enabled) {
        await interaction.editReply(
          "AI is disabled for your account. Turn it back on with `/ai settings enabled:true`.",
        );
        return;
      }

      const prompt =
        subcommand === "ask"
          ? interaction.options.getString("question", true)
          : interaction.options.getString("message", true);
      const selectedMode = interaction.options.getString("mode") as AIMode | null;
      const history =
        subcommand === "chat"
          ? await getAiHistory(userId, scopeId, 20)
          : [];
      const answer = await askCalyxAI(
        prompt,
        selectedMode ?? settings.mode,
        history,
      );

      let saveWarning = "";
      try {
        await saveAiTurn(userId, scopeId, prompt, answer.slice(0, 4000));
      } catch (error) {
        logger.error({ err: error, userId }, "Failed to save Calyx AI conversation");
        saveWarning = "\n\n⚠️ I couldn't save this response to your AI history.";
      }

      await interaction.editReply({
        content: `${answer}${saveWarning}`.slice(0, 2000),
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === "clear") {
      await clearAiHistory(userId, scopeId);
      await interaction.reply({
        content: "🧹 Your AI conversation in this server has been cleared.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "personality") {
      const mode = interaction.options.getString("mode", true) as AIMode;
      await updateAiUserSettings(userId, { mode });
      await interaction.reply({
        content: `🎭 Your default Calyx personality is now **${mode}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "settings") {
      const enabled = interaction.options.getBoolean("enabled");
      const mode = interaction.options.getString("mode") as AIMode | null;
      const changes: string[] = [];

      if (enabled !== null) {
        await updateAiUserSettings(userId, { enabled });
        changes.push(`AI: **${enabled ? "Enabled" : "Disabled"}**`);
      }
      if (mode) {
        await updateAiUserSettings(userId, { mode });
        changes.push(`Default personality: **${mode}**`);
      }

      const settings = await getAiUserSettings(userId);
      await interaction.reply({
        content: changes.length
          ? `⚙️ **AI settings updated**\n${changes.join("\n")}`
          : `⚙️ **Your AI settings**\nAI: **${settings.enabled ? "Enabled" : "Disabled"}**\nDefault personality: **${settings.mode}**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "status") {
      const [settings, config] = await Promise.all([
        getAiUserSettings(userId),
        Promise.resolve(getOpenRouterConfigStatus()),
      ]);
      await interaction.reply({
        content:
          `🤖 **Calyx AI status**\n` +
          `Provider: **OpenRouter**\n` +
          `API key configured: **${config.apiKeyConfigured ? "Yes" : "No"}**\n` +
          `Model configured: **${config.modelConfigured ? "Yes" : "No"}**\n` +
          `Your AI: **${settings.enabled ? "Enabled" : "Disabled"}**\n` +
          `Your default personality: **${settings.mode}**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "stats") {
      const totalRequests = await getAiUserStats(userId);
      await interaction.reply({
        content: `📊 Calyx has completed **${totalRequests}** AI request${totalRequests === 1 ? "" : "s"} for your account.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "history") {
      const history = await getAiHistory(userId, scopeId, 8);
      const content = history.length
        ? history
            .map(
              (entry) =>
                `**${entry.role === "user" ? "You" : "Calyx"}:** ${escapeMentions(entry.content.slice(0, 350))}`,
            )
            .join("\n\n")
            .slice(0, 1800)
        : "No saved AI messages in this server yet.";
      await interaction.reply({
        content: `📜 **Recent AI history**\n\n${content}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === "reset") {
      await resetAiUser(userId);
      await interaction.reply({
        content: "🔄 Your AI history and settings have been reset.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "info") {
      await interaction.reply({
        content:
          "**Calyx AI uses OpenRouter.** Use `/ai ask` for a one-off question or `/ai chat` to continue a saved conversation. " +
          "Your recent history is kept separately per server (up to 12 turns). `/ai clear` removes history for this server; `/ai reset` removes all your history and settings.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    logger.error(
      { err: error, userId, subcommand },
      "Calyx AI command failed",
    );

    const missingConfig =
      error instanceof Error && error.message.startsWith("OPENROUTER_")
        ? `\n${error.message}`
        : "";
    const reply =
      `❌ I couldn't complete that AI command. Check that the bot can reach its database and that Railway has the OpenRouter variables configured.${missingConfig}`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply({
        content: reply,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
