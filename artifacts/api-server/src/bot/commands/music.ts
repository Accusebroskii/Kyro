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
import {
  db,
  musicPlaylistsTable,
  musicPlaylistSongsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  successEmbed,
  errorEmbed,
  musicEmbed,
  infoEmbed,
} from "../lib/embeds.js";

function requireVoiceChannel(
  interaction: ChatInputCommandInteraction,
): import("discord.js").VoiceBasedChannel | null {
  const member = interaction.member as GuildMember;
  return member.voice?.channel ?? null;
}

export const playCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song or search YouTube")
    .addStringOption((o) =>
      o
        .setName("query")
        .setDescription("Song name, YouTube URL, or playlist URL")
        .setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc) {
      await interaction.reply({
        embeds: [errorEmbed("You must be in a voice channel.")],
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);
    const songs = await searchSongs(query, 1);

    console.log("Search query:", query);
    console.log("Songs found:", songs);

    if (!songs.length) {
      await interaction.editReply({
        embeds: [
          errorEmbed("No results found.\n\nYouTube may be blocking play-dl."),
        ],
      });
      return;
    }
    songs.forEach((s) => {
      s.requestedBy = interaction.user.tag;
      s.requestedById = interaction.user.id;
    });
    const result = await joinAndPlay(
      interaction.guild!,
      vc,
      interaction.channelId,
      songs,
    );
    if (!result.success) {
      await interaction.editReply({
        embeds: [errorEmbed(`Failed to play: ${result.error}`)],
      });
      return;
    }
    const queue = getQueue(interaction.guildId!);
    const song = songs[0]!;
    const isPlaying = queue && queue.songs.length > 1;
    await interaction.editReply({
      embeds: [
        musicEmbed(
          isPlaying ? "Added to Queue" : "Now Playing",
          `**[${song.title}](${song.url})**\nDuration: \`${song.duration}\``,
          song.thumbnail,
        ),
      ],
    });
  },
};

export const pauseCommand = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause the current song"),
  async execute(interaction: ChatInputCommandInteraction) {
    const paused = pausePlayer(interaction.guildId!);
    await interaction.reply({
      embeds: [
        paused
          ? successEmbed("Paused", "Playback paused.")
          : errorEmbed("Nothing is playing."),
      ],
    });
  },
};

export const resumeCommand = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume paused playback"),
  async execute(interaction: ChatInputCommandInteraction) {
    const resumed = resumePlayer(interaction.guildId!);
    await interaction.reply({
      embeds: [
        resumed
          ? successEmbed("Resumed", "Playback resumed.")
          : errorEmbed("Nothing is paused."),
      ],
    });
  },
};

export const skipCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current song"),
  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc) {
      await interaction.reply({
        embeds: [errorEmbed("You must be in the voice channel.")],
        ephemeral: true,
      });
      return;
    }
    const song = getCurrentSong(interaction.guildId!);
    const skipped = skipSong(interaction.guildId!);
    await interaction.reply({
      embeds: [
        skipped
          ? successEmbed(
              "Skipped",
              song ? `Skipped **${song.title}**.` : "Skipped.",
            )
          : errorEmbed("Nothing is playing."),
      ],
    });
  },
};

export const stopCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop playback and clear the queue"),
  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc) {
      await interaction.reply({
        embeds: [errorEmbed("You must be in the voice channel.")],
        ephemeral: true,
      });
      return;
    }
    stopPlayer(interaction.guildId!);
    await interaction.reply({
      embeds: [successEmbed("Stopped", "Playback stopped and queue cleared.")],
    });
  },
};

export const queueCommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("View the current song queue")
    .addIntegerOption((o) =>
      o.setName("page").setDescription("Page number").setMinValue(1),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const { current, upcoming, total } = getQueueList(interaction.guildId!);
    if (!current) {
      await interaction.reply({
        embeds: [infoEmbed("Queue", "The queue is empty.")],
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("🎵 Music Queue")
      .setColor(0x1db954)
      .addFields({
        name: "Now Playing",
        value: `**[${current.title}](${current.url})** \`${current.duration}\``,
      })
      .setTimestamp();
    if (upcoming.length) {
      embed.addFields({
        name: `Up Next (${total - 1} remaining)`,
        value: upcoming
          .map(
            (s, i) => `**${i + 1}.** [${s.title}](${s.url}) \`${s.duration}\``,
          )
          .join("\n"),
      });
    }
    await interaction.reply({ embeds: [embed] });
  },
};

export const nowplayingCommand = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the currently playing song"),
  async execute(interaction: ChatInputCommandInteraction) {
    const song = getCurrentSong(interaction.guildId!);
    if (!song) {
      await interaction.reply({
        embeds: [infoEmbed("Now Playing", "Nothing is currently playing.")],
      });
      return;
    }
    const queue = getQueue(interaction.guildId!);
    const embed = new EmbedBuilder()
      .setTitle("🎵 Now Playing")
      .setColor(0x1db954)
      .setDescription(`**[${song.title}](${song.url})**`)
      .addFields(
        { name: "Duration", value: song.duration, inline: true },
        { name: "Requested By", value: song.requestedBy, inline: true },
        { name: "Loop", value: queue?.loop ?? "off", inline: true },
        { name: "Volume", value: `${queue?.volume ?? 50}%`, inline: true },
      )
      .setThumbnail(song.thumbnail)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

export const volumeCommand = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set playback volume")
    .addIntegerOption((o) =>
      o
        .setName("level")
        .setDescription("Volume level (0–100)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const level = interaction.options.getInteger("level", true);
    const ok = setVolume(interaction.guildId!, level);
    await interaction.reply({
      embeds: [
        ok
          ? successEmbed("Volume", `Volume set to **${level}%**.`)
          : errorEmbed("Nothing is playing."),
      ],
    });
  },
};

export const loopCommand = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Set loop mode")
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("Loop mode")
        .setRequired(true)
        .addChoices(
          { name: "Off", value: "off" },
          { name: "Song", value: "song" },
          { name: "Queue", value: "queue" },
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const mode = interaction.options.getString("mode", true) as LoopMode;
    setLoop(interaction.guildId!, mode);
    await interaction.reply({
      embeds: [successEmbed("Loop", `Loop mode set to **${mode}**.`)],
    });
  },
};

export const shuffleCommand = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Shuffle the queue"),
  async execute(interaction: ChatInputCommandInteraction) {
    const ok = shuffleQueue(interaction.guildId!);
    await interaction.reply({
      embeds: [
        ok
          ? successEmbed("Shuffled", "Queue shuffled.")
          : errorEmbed("Not enough songs in the queue to shuffle."),
      ],
    });
  },
};

export const removeCommand = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a song from the queue")
    .addIntegerOption((o) =>
      o
        .setName("position")
        .setDescription("Position in queue to remove")
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const pos = interaction.options.getInteger("position", true);
    const removed = removeSong(interaction.guildId!, pos);
    await interaction.reply({
      embeds: [
        removed
          ? successEmbed(
              "Removed",
              `Removed **${removed.title}** from the queue.`,
            )
          : errorEmbed(
              "Invalid position or cannot remove the currently playing song.",
            ),
      ],
    });
  },
};

export const disconnectCommand = {
  data: new SlashCommandBuilder()
    .setName("disconnect")
    .setDescription("Disconnect the bot from the voice channel"),
  async execute(interaction: ChatInputCommandInteraction) {
    const vc = requireVoiceChannel(interaction);
    if (!vc) {
      await interaction.reply({
        embeds: [errorEmbed("You must be in the voice channel.")],
        ephemeral: true,
      });
      return;
    }
    disconnectBot(interaction.guildId!);
    await interaction.reply({
      embeds: [
        successEmbed(
          "Disconnected",
          "Left the voice channel and cleared the queue.",
        ),
      ],
    });
  },
};

export const playlistCommand = {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Manage saved playlists")
    .addSubcommand((s) =>
      s
        .setName("save")
        .setDescription("Save the current queue as a playlist")
        .addStringOption((o) =>
          o.setName("name").setDescription("Playlist name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("load")
        .setDescription("Load a saved playlist")
        .addStringOption((o) =>
          o.setName("name").setDescription("Playlist name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Delete a saved playlist")
        .addStringOption((o) =>
          o.setName("name").setDescription("Playlist name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List all saved playlists"),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === "save") {
      const name = interaction.options.getString("name", true);
      const { current, upcoming } = getQueueList(guildId);
      if (!current) {
        await interaction.reply({
          embeds: [errorEmbed("Nothing in the queue to save.")],
          ephemeral: true,
        });
        return;
      }
      const songs = [current, ...upcoming];
      const existing = await db
        .select()
        .from(musicPlaylistsTable)
        .where(
          and(
            eq(musicPlaylistsTable.guildId, guildId),
            eq(musicPlaylistsTable.name, name),
          ),
        )
        .limit(1);
      let playlistId: number;
      if (existing[0]) {
        playlistId = existing[0].id;
        await db
          .delete(musicPlaylistSongsTable)
          .where(eq(musicPlaylistSongsTable.playlistId, playlistId));
      } else {
        const [pl] = await db
          .insert(musicPlaylistsTable)
          .values({
            guildId,
            name,
            createdBy: interaction.user.id,
            createdByTag: interaction.user.tag,
          })
          .returning();
        playlistId = pl!.id;
      }
      await db
        .insert(musicPlaylistSongsTable)
        .values(
          songs.map((s) => ({
            playlistId,
            title: s.title,
            url: s.url,
            duration: s.duration,
            thumbnail: s.thumbnail,
          })),
        );
      await interaction.reply({
        embeds: [
          successEmbed(
            "Playlist Saved",
            `Saved **${songs.length}** songs as "**${name}**".`,
          ),
        ],
      });
    } else if (sub === "load") {
      const name = interaction.options.getString("name", true);
      const vc = requireVoiceChannel(interaction);
      if (!vc) {
        await interaction.reply({
          embeds: [errorEmbed("You must be in a voice channel.")],
          ephemeral: true,
        });
        return;
      }
      const [pl] = await db
        .select()
        .from(musicPlaylistsTable)
        .where(
          and(
            eq(musicPlaylistsTable.guildId, guildId),
            eq(musicPlaylistsTable.name, name),
          ),
        )
        .limit(1);
      if (!pl) {
        await interaction.reply({
          embeds: [errorEmbed(`Playlist "**${name}**" not found.`)],
        });
        return;
      }
      const songs = await db
        .select()
        .from(musicPlaylistSongsTable)
        .where(eq(musicPlaylistSongsTable.playlistId, pl.id));
      if (!songs.length) {
        await interaction.reply({
          embeds: [errorEmbed("This playlist is empty.")],
        });
        return;
      }
      await interaction.deferReply();
      const songList: Song[] = songs.map((s) => ({
        title: s.title,
        url: s.url,
        duration: s.duration,
        thumbnail: s.thumbnail,
        requestedBy: interaction.user.tag,
        requestedById: interaction.user.id,
      }));
      await joinAndPlay(
        interaction.guild!,
        vc,
        interaction.channelId,
        songList,
      );
      await interaction.editReply({
        embeds: [
          musicEmbed(
            "Playlist Loaded",
            `Loaded **${songs.length}** songs from "**${name}**".`,
          ),
        ],
      });
    } else if (sub === "delete") {
      const name = interaction.options.getString("name", true);
      const [pl] = await db
        .select()
        .from(musicPlaylistsTable)
        .where(
          and(
            eq(musicPlaylistsTable.guildId, guildId),
            eq(musicPlaylistsTable.name, name),
          ),
        )
        .limit(1);
      if (!pl) {
        await interaction.reply({
          embeds: [errorEmbed(`Playlist "**${name}**" not found.`)],
        });
        return;
      }
      await db
        .delete(musicPlaylistSongsTable)
        .where(eq(musicPlaylistSongsTable.playlistId, pl.id));
      await db
        .delete(musicPlaylistsTable)
        .where(eq(musicPlaylistsTable.id, pl.id));
      await interaction.reply({
        embeds: [
          successEmbed("Playlist Deleted", `Deleted playlist "**${name}**".`),
        ],
      });
    } else if (sub === "list") {
      const playlists = await db
        .select()
        .from(musicPlaylistsTable)
        .where(eq(musicPlaylistsTable.guildId, guildId));
      if (!playlists.length) {
        await interaction.reply({
          embeds: [infoEmbed("Playlists", "No saved playlists.")],
        });
        return;
      }
      const songs = await Promise.all(
        playlists.map((p) =>
          db
            .select()
            .from(musicPlaylistSongsTable)
            .where(eq(musicPlaylistSongsTable.playlistId, p.id)),
        ),
      );
      const embed = new EmbedBuilder()
        .setTitle("🎵 Saved Playlists")
        .setColor(0x1db954)
        .setDescription(
          playlists
            .map(
              (p, i) =>
                `**${i + 1}.** ${p.name} — ${songs[i]?.length ?? 0} songs`,
            )
            .join("\n"),
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
  },
};
