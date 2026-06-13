import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";

const OWNER_ID = "1375707337104429088";

export const restartCommand = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Restart the bot"),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({
        content: "Only the bot owner can use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: "Restarting bot...",
      flags: MessageFlags.Ephemeral,
    });
    setTimeout(() => process.exit(0), 1000);
  },
};

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),
  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.reply({
      content: "Pinging...",
      fetchReply: true,
    });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply({
      content: `🏓 Pong! ${latency}ms`,
    });
  },
};

export const botinfoCommand = {
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Shows information about the bot"),
  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client;
    await interaction.reply({
      embeds: [
        {
          title: "🤖 Bot Information",
          color: 0x5865f2,
          thumbnail: {
            url: client.user?.displayAvatarURL() ?? "",
          },
          fields: [
            { name: "👑 Owner", value: "<@1375707337104429088>", inline: true },
            { name: "📛 Owner Username", value: "accusebroski_", inline: true },
            { name: "🆔 Owner ID", value: "1375707337104429088", inline: true },
            { name: "🧑‍💻 Developer", value: "<@1285144624096084000>", inline: true },
            { name: "📛 Developer Username", value: "ziadlive", inline: true },
            { name: "🆔 Developer ID", value: "1285144624096084000", inline: true },
            { name: "👥 Users", value: `${client.users.cache.size}`, inline: true },
            { name: "🌐 Servers", value: `${client.guilds.cache.size}`, inline: true },
            { name: "🏓 Ping", value: `${Math.max(0, client.ws.ping)}ms`, inline: true },
          ],
          footer: { text: "Thanks for using the bot!" },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  },
};