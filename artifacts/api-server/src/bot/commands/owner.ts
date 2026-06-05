import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { isOwner } from "../lib/permissions.js";
import { successEmbed, errorEmbed } from "../lib/embeds.js";
import { logger } from "../../lib/logger.js";

export const restartCommand = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Restart the bot (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!isOwner(interaction)) {
      await interaction.reply({ embeds: [errorEmbed("Only the bot owner can use this command.")], ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [successEmbed("Restarting", "Bot is restarting...")] });
    logger.info("Owner-initiated restart");
    setTimeout(() => process.exit(0), 1000);
  },
};

export const pingCommand = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;
    await interaction.editReply({
      content: "",
      embeds: [{
        title: "🏓 Pong!",
        color: latency < 100 ? 0x57f287 : latency < 300 ? 0xfee75c : 0xed4245,
        fields: [
          { name: "Bot Latency", value: `${latency}ms`, inline: true },
          { name: "WebSocket", value: `${wsLatency}ms`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  },
};
