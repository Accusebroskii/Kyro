import {
  AudioPlayer,
  AudioPlayerStatus,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
  AudioResource,
  StreamType,
} from "@discordjs/voice";
import { Guild, TextChannel, VoiceBasedChannel } from "discord.js";
import play from "play-dl";
import { spawn } from "child_process";
import { Readable } from "stream";
import { existsSync } from "fs";
import { chmod, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { musicEmbed } from "./embeds.js";
import { logger } from "../../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.resolve(__dirname, "../../../../bin");
const YTDLP_PATH = path.join(BIN_DIR, "yt-dlp");
const YTDLP_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

export async function ensureYtDlp(): Promise<void> {
  if (existsSync(YTDLP_PATH)) return;
  logger.info("yt-dlp not found, downloading...");
  await mkdir(BIN_DIR, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("curl", ["-sL", YTDLP_URL, "-o", YTDLP_PATH]);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`curl exited ${code}`)),
    );
    proc.on("error", reject);
  });
  await chmod(YTDLP_PATH, 0o755);
  logger.info("yt-dlp downloaded successfully");
}

export interface Song {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requestedBy: string;
  requestedById: string;
}

export type LoopMode = "off" | "song" | "queue";

export interface GuildQueue {
  songs: Song[];
  currentIndex: number;
  player: AudioPlayer;
  textChannelId: string;
  voiceChannelId: string;
  loop: LoopMode;
  volume: number;
  guild: Guild;
  resource: AudioResource | null;
}

const queues = new Map<string, GuildQueue>();

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createYtDlpStream(url: string): Readable {
  const proc = spawn(YTDLP_PATH, [
    "-f",
    "bestaudio/best",
    "-o",
    "-",
    "--no-playlist",
    "--quiet",
    "--no-warnings",
    url,
  ]);

  proc.stderr.on("data", (chunk: Buffer) => {
    console.log(chunk.toString());
  });

  proc.on("error", (err) => logger.error({ err }, "yt-dlp spawn error"));

  return proc.stdout as Readable;
}

export async function searchSongs(query: string, limit = 5): Promise<Song[]> {
  try {
    if (play.yt_validate(query) === "video") {
      const info = await play.video_info(query);
      const d = info.video_details;
      return [
        {
          title: d.title ?? "Unknown",
          url: d.url,
          duration: formatDuration(d.durationInSec),
          thumbnail: d.thumbnails?.[0]?.url ?? "",
          requestedBy: "",
          requestedById: "",
        },
      ];
    }

    if (play.yt_validate(query) === "playlist") {
      const playlist = await play.playlist_info(query, { incomplete: true });
      const videos = await playlist.all_videos();
      return videos.slice(0, 50).map((v) => ({
        title: v.title ?? "Unknown",
        url: v.url,
        duration: formatDuration(v.durationInSec),
        thumbnail: v.thumbnails?.[0]?.url ?? "",
        requestedBy: "",
        requestedById: "",
      }));
    }

    const results = await play.search(query, {
      source: { youtube: "video" },
      limit,
    });
    return results.map((v) => ({
      title: v.title ?? "Unknown",
      url: v.url,
      duration: formatDuration(v.durationInSec),
      thumbnail: v.thumbnails?.[0]?.url ?? "",
      requestedBy: "",
      requestedById: "",
    }));
  } catch (err) {
    logger.error({ err }, "Error searching songs");
    return [];
  }
}

async function playNext(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue) return;

  const conn = getVoiceConnection(guildId);
  if (!conn) {
    queues.delete(guildId);
    return;
  }

  if (queue.currentIndex >= queue.songs.length) {
    if (queue.loop === "queue" && queue.songs.length > 0) {
      queue.currentIndex = 0;
    } else {
      queues.delete(guildId);
      const textChannel = queue.guild.channels.cache.get(
        queue.textChannelId,
      ) as TextChannel | undefined;
      textChannel?.send({
        embeds: [musicEmbed("Queue ended", "No more songs in queue.")],
      });
      conn.destroy();
      return;
    }
  }

  const song = queue.songs[queue.currentIndex];
  if (!song) return;

  try {
    const stream = createYtDlpStream(song.url);

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });
    resource.volume?.setVolume(queue.volume / 100);
    queue.resource = resource;
    queue.player.play(resource);
    conn.subscribe(queue.player);

    const textChannel = queue.guild.channels.cache.get(queue.textChannelId) as
      | TextChannel
      | undefined;
    textChannel?.send({
      embeds: [
        musicEmbed(
          "Now Playing",
          `**[${song.title}](${song.url})**\nDuration: \`${song.duration}\` | Requested by: ${song.requestedBy}`,
          song.thumbnail,
        ),
      ],
    });
  } catch (err) {
    logger.error({ err, song }, "Error playing song, skipping");
    queue.currentIndex++;
    await playNext(guildId);
  }
}

export async function joinAndPlay(
  guild: Guild,
  voiceChannel: VoiceBasedChannel,
  textChannelId: string,
  songs: Song[],
): Promise<{ success: boolean; error?: string }> {
  try {
    let conn = getVoiceConnection(guild.id);
    if (!conn) {
      conn = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
      });
    }

    await entersState(conn, VoiceConnectionStatus.Ready, 10_000);

    let queue = queues.get(guild.id);
    if (!queue) {
      const player = createAudioPlayer();
      queue = {
        songs: [],
        currentIndex: 0,
        player,
        textChannelId,
        voiceChannelId: voiceChannel.id,
        loop: "off",
        volume: 50,
        guild,
        resource: null,
      };
      queues.set(guild.id, queue);

      player.on(AudioPlayerStatus.Idle, () => {
        const q = queues.get(guild.id);
        if (!q) return;
        if (q.loop === "song") {
          playNext(guild.id);
        } else {
          q.currentIndex++;
          playNext(guild.id);
        }
      });

      player.on("error", (err) => {
        logger.error({ err }, "AudioPlayer error");
        const q = queues.get(guild.id);
        if (q) {
          q.currentIndex++;
          playNext(guild.id);
        }
      });

      conn.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(conn!, VoiceConnectionStatus.Signalling, 5_000),
            entersState(conn!, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          queues.delete(guild.id);
          conn!.destroy();
        }
      });
    }

    const wasEmpty = queue.songs.length === 0;
    queue.songs.push(...songs);

    if (wasEmpty || queue.player.state.status === AudioPlayerStatus.Idle) {
      await playNext(guild.id);
    }

    return { success: true };
  } catch (err) {
    logger.error({ err }, "Error joining voice channel");
    return { success: false, error: String(err) };
  }
}

export function getQueue(guildId: string): GuildQueue | undefined {
  return queues.get(guildId);
}

export function pausePlayer(guildId: string): boolean {
  const q = queues.get(guildId);
  if (!q) return false;
  return q.player.pause();
}

export function resumePlayer(guildId: string): boolean {
  const q = queues.get(guildId);
  if (!q) return false;
  return q.player.unpause();
}

export function skipSong(guildId: string): boolean {
  const q = queues.get(guildId);
  if (!q) return false;
  if (q.loop !== "song") q.currentIndex++;
  q.player.stop();
  return true;
}

export function stopPlayer(guildId: string): void {
  const q = queues.get(guildId);
  if (!q) return;
  q.songs = [];
  q.currentIndex = 0;
  q.player.stop();
  const conn = getVoiceConnection(guildId);
  conn?.destroy();
  queues.delete(guildId);
}

export function setVolume(guildId: string, volume: number): boolean {
  const q = queues.get(guildId);
  if (!q || !q.resource) return false;
  q.volume = volume;
  q.resource.volume?.setVolume(volume / 100);
  return true;
}

export function setLoop(guildId: string, mode: LoopMode): void {
  const q = queues.get(guildId);
  if (q) q.loop = mode;
}

export function shuffleQueue(guildId: string): boolean {
  const q = queues.get(guildId);
  if (!q || q.songs.length < 2) return false;
  const remaining = q.songs.splice(q.currentIndex + 1);
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!];
  }
  q.songs.push(...remaining);
  return true;
}

export function removeSong(guildId: string, position: number): Song | null {
  const q = queues.get(guildId);
  if (!q) return null;
  const idx = position - 1;
  if (idx <= q.currentIndex || idx >= q.songs.length) return null;
  const [removed] = q.songs.splice(idx, 1);
  return removed ?? null;
}

export function disconnectBot(guildId: string): void {
  stopPlayer(guildId);
}

export function getCurrentSong(guildId: string): Song | null {
  const q = queues.get(guildId);
  if (!q || q.songs.length === 0) return null;
  return q.songs[q.currentIndex] ?? null;
}

export function getQueueList(guildId: string): {
  current: Song | null;
  upcoming: Song[];
  total: number;
} {
  const q = queues.get(guildId);
  if (!q) return { current: null, upcoming: [], total: 0 };
  const current = q.songs[q.currentIndex] ?? null;
  const upcoming = q.songs.slice(q.currentIndex + 1, q.currentIndex + 11);
  return { current, upcoming, total: q.songs.length };
}
