import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from "discord.js";

import {
  joinAndPlay,
  searchSongs,
  getQueue,
  pausePlayer,
  resumePlayer,
  skipSong,
  stopPlayer,
  setVolume,
  setLoop,
  shuffleQueue,
  removeSong,
  disconnectBot,
  getCurrentSong,
  getQueueList,
  type Song,
  type LoopMode,
} from "../lib/music.js";

import { db, musicPlaylistsTable, musicPlaylistSongsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed, errorEmbed, musicEmbed, infoEmbed } from "../lib/embeds.js";

function requireVoiceChannel(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember;
  return member.voice?.channel ?? null;
}

//
// ========================= PLAY COMMAND (FIXED) =========================
//
export const playCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song or search YouTube")
    .addStringOption((o) =>
      o.setName("query").setDescription("Song name or URL").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc)
      return interaction.reply({
        embeds: [errorEmbed("You must be in a voice channel.")],
        ephemeral: true,
      });

    await interaction.deferReply();

    // ✅ FIX: normalize query (important)
    let query = interaction.options.getString("query", true);
    query = query.replace(/['’]/g, "").trim();

    // ✅ FIX: more results for stability
    const songs = await searchSongs(query, 5);

    if (!songs?.length) {
      return interaction.editReply({
        embeds: [errorEmbed("❌ No results found.")],
      });
    }

    songs.forEach((s) => {
      s.requestedBy = interaction.user.tag;
      s.requestedById = interaction.user.id;
    });

    const result = await joinAndPlay(
      interaction.guild!,
      vc,
      interaction.channelId,
      songs
    );

    if (!result.success) {
      return interaction.editReply({
        embeds: [errorEmbed(`Failed: ${result.error}`)],
      });
    }

    const queue = getQueue(interaction.guildId!);
    const song = songs[0];

    const isPlaying = queue && queue.songs.length > 0;

    return interaction.editReply({
      embeds: [
        musicEmbed(
          isPlaying ? "Added to Queue" : "Now Playing",
          `**[${song.title}](${song.url})**\nDuration: \`${song.duration}\``,
          song.thumbnail
        ),
      ],
    });
  },
};

//
// ========================= PAUSE =========================
//
export const pauseCommand = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause"),
  async execute(interaction: ChatInputCommandInteraction) {
    const ok = pausePlayer(interaction.guildId!);
    return interaction.reply({
      embeds: [
        ok ? successEmbed("Paused", "Playback paused.") : errorEmbed("Nothing playing."),
      ],
    });
  },
};

//
// ========================= RESUME =========================
//
export const resumeCommand = {
  data: new SlashCommandBuilder().setName("resume").setDescription("Resume"),
  async execute(interaction: ChatInputCommandInteraction) {
    const ok = resumePlayer(interaction.guildId!);
    return interaction.reply({
      embeds: [
        ok ? successEmbed("Resumed", "Playback resumed.") : errorEmbed("Nothing paused."),
      ],
    });
  },
};

//
// ========================= SKIP =========================
//
export const skipCommand = {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip song"),
  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc)
      return interaction.reply({
        embeds: [errorEmbed("Join a voice channel.")],
        ephemeral: true,
      });

    const song = getCurrentSong(interaction.guildId!);
    const ok = skipSong(interaction.guildId!);

    return interaction.reply({
      embeds: [
        ok
          ? successEmbed("Skipped", song ? `Skipped ${song.title}` : "Skipped")
          : errorEmbed("Nothing playing."),
      ],
    });
  },
};

//
// ========================= STOP =========================
//
export const stopCommand = {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop"),
  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc)
      return interaction.reply({
        embeds: [errorEmbed("Join a voice channel.")],
        ephemeral: true,
      });

    stopPlayer(interaction.guildId!);

    return interaction.reply({
      embeds: [successEmbed("Stopped", "Queue cleared.")],
    });
  },
};

//
// ========================= RESTART (NEW FIX) =========================
//
export const restartCommand = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Restart current song"),

  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc)
      return interaction.reply({
        embeds: [errorEmbed("Join a voice channel.")],
        ephemeral: true,
      });

    const song = getCurrentSong(interaction.guildId!);

    if (!song)
      return interaction.reply({
        embeds: [errorEmbed("Nothing is playing.")],
      });

    // restart = replay current song
    skipSong(interaction.guildId!);

    await joinAndPlay(
      interaction.guild!,
      vc,
      interaction.channelId,
      [song]
    );

    return interaction.reply({
      embeds: [successEmbed("Restarted", `Restarted ${song.title}`)],
    });
  },
};