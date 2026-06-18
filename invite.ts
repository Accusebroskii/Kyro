import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the link to our support server!'),

  async execute(interaction: CommandInteraction) {
    const embed = new EmbedBuilder()
      .setTitle('Join our Support Server!')
      .setDescription('[Click here to join!](https://discord.gg/eF8p9Gtumz)')
      .setColor(0x5865F2);

    await interaction.reply({ embeds: [embed] });
  },
};