import { MessageFlags } from "discord.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { infoEmbed } from "../lib/embeds.js";

// Curated permission set matching what this bot actually uses:
// moderation (kick/ban/timeout/manage messages), tickets & admin (manage channels/roles),
// auto-role (manage roles), join-to-voice & music (connect/speak/move members),
// plus baseline read/send/embed permissions.
const INVITE_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
]);

export const inviteCommand = {
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get an invite link to add this bot to your server"),

  async execute(interaction: ChatInputCommandInteraction) {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      await interaction.reply({ content: "Bot client ID is not configured.", flags: MessageFlags.Ephemeral });
      return;
    }

    const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS.bitfield.toString()}`;

    await interaction.reply({
      embeds: [infoEmbed("📨 Invite Me", `[Click here to add this bot to your server](${url})`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};