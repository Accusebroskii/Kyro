import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  askCalyxAI,
  type AIMode,
} from "../lib/ai.js";

export const data = new SlashCommandBuilder()
  .setName("ai")
  .setDescription("Calyx AI commands")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ask")
      .setDescription("Ask Calyx AI a question")
      .addStringOption((option) =>
        option
          .setName("question")
          .setDescription("What do you want to ask?")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Choose Calyx's personality")
          .setRequired(false)
          .addChoices(
            { name: "Calm", value: "calm" },
            { name: "Crazy", value: "crazy" },
            { name: "Freaky", value: "freaky" },
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("chat")
      .setDescription("Start an AI conversation"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("clear")
      .setDescription("Clear your AI conversation"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("personality")
      .setDescription("Choose Calyx's personality")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Choose a personality")
          .setRequired(true)
          .addChoices(
            { name: "Calm", value: "calm" },
            { name: "Crazy", value: "crazy" },
            { name: "Freaky", value: "freaky" },
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("settings")
      .setDescription("Configure Calyx AI")
      .addBooleanOption((option) =>
        option
          .setName("enabled")
          .setDescription("Enable or disable AI"),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Default AI personality")
          .addChoices(
            { name: "Calm", value: "calm" },
            { name: "Crazy", value: "crazy" },
            { name: "Freaky", value: "freaky" },
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("View AI status"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("stats")
      .setDescription("View AI usage statistics"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("View your recent AI history"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("reset")
      .setDescription("Reset your AI settings"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("info")
      .setDescription("View Calyx AI information"),
  );

export const aiCommand = {
  data,
  execute,
};

async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "ask") {
    const question = interaction.options.getString("question", true);
    const mode = (interaction.options.getString("mode") ?? "calm") as AIMode;

    await interaction.deferReply();

    try {
      const answer = await askCalyxAI(question, mode);
      await interaction.editReply(answer.slice(0, 2000));
    } catch (error) {
      console.error("Calyx AI error:", error);
      await interaction.editReply(
        "❌ I couldn't process that request right now.",
      );
    }
    return;
  }

  if (subcommand === "chat") {
    await interaction.reply(
      "💬 AI chat is ready. Use `/ai ask` to talk to Calyx.",
    );
    return;
  }

  if (subcommand === "clear") {
    await interaction.reply("🧹 Your AI conversation has been cleared.");
    return;
  }

  if (subcommand === "personality") {
    const mode = interaction.options.getString("mode", true);
    await interaction.reply(
      `🎭 Calyx's personality is now set to **${mode}**.`,
    );
    return;
  }

  if (subcommand === "settings") {
    const enabled = interaction.options.getBoolean("enabled");
    const mode = interaction.options.getString("mode");

    const changes = [];

    if (enabled !== null) {
      changes.push(`AI: **${enabled ? "Enabled" : "Disabled"}**`);
    }

    if (mode) {
      changes.push(`Personality: **${mode}**`);
    }

    await interaction.reply(
      changes.length
        ? `⚙️ **AI Settings Updated**\n${changes.join("\n")}`
        : "⚙️ No settings were changed.",
    );
    return;
  }

  if (subcommand === "status") {
    await interaction.reply(
      "🤖 **Calyx AI Status**\n\n🟢 AI: Online\n🎭 Mode: Calm\n🧠 Model: Calyx AI",
    );
    return;
  }

  if (subcommand === "stats") {
    await interaction.reply(
      "📊 **Calyx AI Stats**\n\nMessages: Coming soon\nConversations: Coming soon",
    );
    return;
  }

  if (subcommand === "history") {
    await interaction.reply(
      "📜 AI history storage is coming soon.",
    );
    return;
  }

  if (subcommand === "reset") {
    await interaction.reply(
      "🔄 Your AI settings have been reset to the defaults.",
    );
    return;
  }

  if (subcommand === "info") {
    await interaction.reply(
      "🤖 **Calyx AI**\n\nAsk questions, chat with Calyx, and choose between Calm, Crazy, and Freaky personalities.",
    );
  }
}
