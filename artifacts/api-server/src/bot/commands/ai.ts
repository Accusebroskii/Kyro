import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { askCalyxAI } from "../lib/ai.js";

export const data = new SlashCommandBuilder()
  .setName("ai")
  .setDescription("Ask Calyx AI")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ask")
      .setDescription("Ask Calyx AI a question")
      .addStringOption((option) =>
        option
          .setName("question")
          .setDescription("What do you want to ask?")
          .setRequired(true),
      ),
  );

export const aiCommand = {
  data,
  execute,
};

async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const question = interaction.options.getString("question", true);

  await interaction.deferReply();

  try {
    const answer = await askCalyxAI(question);

    await interaction.editReply(answer.slice(0, 2000));
  } catch (error) {
    console.error("Calyx AI error:", error);

    await interaction.editReply(
      "❌ I couldn't process that request right now.",
    );
  }
}
