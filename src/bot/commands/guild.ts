import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("guild")
    .setDescription("Guild related commands")
    .addSubcommand(sub =>
      sub
        .setName("invite")
        .setDescription("Create an invite for a server")
        .addStringOption(option =>
          option
            .setName("server_id")
            .setDescription("The server ID")
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === "invite") {
      const guildId = interaction.options.getString("server_id", true);

      try {
        const guild = await interaction.client.guilds.fetch(guildId);

        const channel = guild.channels.cache.find(
          c => c.isTextBased()
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
          content: `✅ Invite created: ${invite.url}`,
          ephemeral: true
        });

      } catch (error) {
        return interaction.reply({
          content: "❌ I can't access that server or create an invite.",
          ephemeral: true
        });
      }
    }
  }
};
