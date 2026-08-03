import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  ChannelType,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import { errorEmbed } from "../lib/embeds.js";

const OWNER_ID = "1375707337104429088";

export const guildCommand = {
  data: new SlashCommandBuilder()
    .setName("guild")
    .setDescription("Guild management (owner only)")
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("Create a permanent invite for any server the bot is in")
        .addStringOption((o) =>
          o.setName("server_id").setDescription("Server ID").setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ content: "🔒 Owner only.", flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // Graceful fallback for stale Discord-cached "list" subcommand
    if (sub === "list") {
      await interaction.reply({
        content: "Use `/guilds` to see all servers the bot is in.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.options.getString("server_id", true).trim();

    try {
      const guild = await interaction.client.guilds.fetch(guildId);
      await guild.fetch(); // populate channels cache

      const channel = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && "createInvite" in c,
      );

      if (!channel || !("createInvite" in channel)) {
        await interaction.reply({
          embeds: [errorEmbed("No usable text channel found in that server.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const invite = await (channel as import("discord.js").TextChannel).createInvite({
        maxAge: 0,
        maxUses: 0,
        reason: "Created via /guild invite by bot owner",
      });

      await interaction.reply({
        content: `✅ Permanent invite for **${guild.name}**:\n${invite.url}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.error({ err, guildId }, "guild invite failed");
      await interaction.reply({
        embeds: [errorEmbed("Couldn't access that server or create an invite. Check the server ID and that I'm actually in it.")],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
