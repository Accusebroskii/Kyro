import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("guildinvite")
    .setDescription("Create an invite for a server")
    .addStringOption(option =>
      option
        .setName("server_id")
        .setDescription("The server ID")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({
        content: "❌ This command is only available to the bot owner.",
        ephemeral: true
      });
    }
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({
        content: "❌ This command is only available to the bot owner.",
        ephemeral: true
      });
    }
    const guildId = interaction.options.getString("server_id", true);

    try {
      const guild = await interaction.client.guilds.fetch(guildId);

      const channel = guild.channels.cache.find(
        channel => channel.isTextBased()
      );

      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          content: "❌ No usable text channel found.",
          ephemeral: true
        });
      }

      const invite = await channel.createInvite({
        maxAge: 0,
        maxUses: 0
      });

      return interaction.reply({
        content: `✅ Invite for **${guild.name}**:\n${invite.url}`,
        ephemeral: true
      });

    } catch {
      return interaction.reply({
        content: "❌ I can't access that server or create an invite.",
        ephemeral: true
      });
    }
  }
};
