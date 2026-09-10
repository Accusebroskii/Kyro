import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import type { Guild, TextChannel, VoiceBasedChannel } from "discord.js";
import { spawn } from "child_process";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { PassThrough } from "stream";
import { musicEmbed } from "./embeds.js";
import { logger } from "../../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const FFMPEG_PATH =
  process.env.FFMPEG_PATH ||
  (() => {
    try {
      return (require("ffmpeg-static") as string | null) || "ffmpeg";
    } catch {
      return "ffmpeg";
    }
  })();
const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";
const COOKIES_PATH =
  process.env.COOKIES_PATH ||
  [path.resolve(process.cwd(), "cookies.txt"), path.resolve(__dirname, "../../../cookies.txt")]
    .find((file) => existsSync(file)) ||
  path.resolve(process.cwd(), "cookies.txt");
const YTDLP_DOWNLOAD_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

if (process.env.YT_COOKIES && !existsSync(COOKIES_PATH)) {
  try {
    writeFileSync(COOKIES_PATH, process.env.YT_COOKIES);
    logger.info({ cookiesPath: COOKIES_PATH }, "Wrote YouTube cookies");
  } catch (err) {
    logger.error({ err }, "Failed to write YouTube cookies");
  }
}

export async function ensureYtDlp(): Promise<void> {
  const available = await new Promise<boolean>((resolve) => {
    const proc = spawn(YTDLP_PATH, ["--version"]);
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
  if (available) {
    logger.info({ ytdlpPath: YTDLP_PATH }, "yt-dlp is available");
    return;
  }
  if (process.env.FORCE_YTDLP_DOWNLOAD !== "1") {
    logger.error({ ytdlpPath: YTDLP_PATH }, "yt-dlp is unavailable");
    return;
  }
  const { chmod, mkdir } = await import("fs/promises");
  const binDir = path.resolve(process.cwd(), "bin");
  const localPath = path.join(binDir, "yt-dlp");
  await mkdir(binDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("curl", ["-sL", YTDLP_DOWNLOAD_URL, "-o", localPath]);
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`curl exited ${code}`)),
    );
  });
  await chmod(localPath, 0o755);
  logger.info({ localPath }, "Downloaded yt-dlp");
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
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function getCookiesArgs(): string[] {
  const exists = existsSync(COOKIES_PATH);
  logger.info({ cookiesPath: COOKIES_PATH, exists }, "Resolved cookies file");
  return exists ? ["--cookies", COOKIES_PATH] : [];
}

function spawnYtDlp(args: string[]) {
  const proc = spawn(YTDLP_PATH, args);
  proc.on("error", (err) =>
    logger.error({ err, ytdlpPath: YTDLP_PATH }, "yt-dlp spawn error"),
  );
  return proc;
}

function youtubeArgs(urlOrSearch: string): string[] {
  return [
    "--no-warnings",
    "--geo-bypass",
    "--js-runtimes",
    "deno",
    "--remote-components",
    "ejs:github",
    ...getCookiesArgs(),
    urlOrSearch,
  ];
}

function createYtDlpStream(url: string): PassThrough {
  const output = new PassThrough();
  const yt = spawnYtDlp([
    "-f",
    "bestaudio[acodec=opus]/bestaudio/best",
    "-o",
    "-",
    "--no-playlist",
    ...youtubeArgs(url),
  ]);
  const ffmpeg = spawn(
    FFMPEG_PATH,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let ytStderr = "";
  let ffmpegStderr = "";
  yt.stderr.on("data", (chunk: Buffer) => (ytStderr += chunk.toString()));
  ffmpeg.stderr.on("data", (chunk: Buffer) => (ffmpegStderr += chunk.toString()));
  yt.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(output);
  yt.on("error", (err) => {
    logger.error({ err, url }, "yt-dlp stream error");
    output.destroy(err);
  });
  ffmpeg.on("error", (err) => {
    logger.error({ err, ffmpegPath: FFMPEG_PATH, url }, "FFmpeg spawn error");
    output.destroy(err);
  });
  yt.on("close", (code) => {
    if (code !== 0)
      logger.error({ code, url, stderr: ytStderr.trim() }, "yt-dlp playback failed");
  });
  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      const error = new Error(`FFmpeg exited with code ${code}`);
      logger.error({ code, url, stderr: ffmpegStderr.trim() }, "FFmpeg playback failed");
      output.destroy(error);
    } else {
      output.end();
    }
  });
  output.on("close", () => {
    if (!yt.killed) yt.kill();
    if (!ffmpeg.killed) ffmpeg.kill();
  });
  return output;
}

export async function searchSongs(query: string, limit = 5): Promise<Song[]> {
  try {
    const value = query.trim();
    const isUrl = /^https?:\/\//i.test(value);
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolve, reject) => {
        const proc = spawnYtDlp([
          "--dump-single-json",
          "--flat-playlist",
          ...youtubeArgs(isUrl ? value : `ytsearch${Math.max(1, limit)}:${value}`),
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => resolve({ stdout, stderr, code }));
      },
    );
    if (!result.stdout.trim()) {
      logger.error(
        { query: value, code: result.code, stderr: result.stderr.trim() },
        "yt-dlp search failed",
      );
      return [];
    }
    const data = JSON.parse(result.stdout) as {
      entries?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    const entries = Array.isArray(data.entries) ? data.entries : [data];
    const songs: Song[] = [];
    for (const entry of entries) {
      const id = typeof entry.id === "string" ? entry.id : "";
      const rawUrl =
        (typeof entry.webpage_url === "string" && entry.webpage_url) ||
        (typeof entry.url === "string" && entry.url) ||
        (id ? `https://www.youtube.com/watch?v=${id}` : "");
      const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
      if (!url) continue;
      songs.push({
        title: typeof entry.title === "string" ? entry.title : "Unknown",
        url,
        duration: formatDuration(Number(entry.duration) || 0),
        thumbnail: typeof entry.thumbnail === "string" ? entry.thumbnail : "",
        requestedBy: "",
        requestedById: "",
      });
      if (songs.length >= limit) break;
    }
    logger.info({ query: value, resultCount: songs.length }, "Search complete");
    return songs;
  } catch (err) {
    logger.error({ err, query }, "Error searching songs");
    return [];
  }
}

async function playNext(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  const connection = getVoiceConnection(guildId);
  if (!queue || !connection) {
    queues.delete(guildId);
    return;
  }
  if (queue.currentIndex >= queue.songs.length) {
    if (queue.loop === "queue" && queue.songs.length) queue.currentIndex = 0;
    else {
      const textChannel = queue.guild.channels.cache.get(queue.textChannelId) as
        | TextChannel
        | undefined;
      await textChannel?.send({
        embeds: [musicEmbed("Queue ended", "No more songs in queue.")],
      });
      queue.player.stop();
      connection.destroy();
      queues.delete(guildId);
      return;
    }
  }
  const song = queue.songs[queue.currentIndex];
  if (!song) return;
  try {
    const resource = createAudioResource(createYtDlpStream(song.url), {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    resource.volume?.setVolume(queue.volume / 100);
    queue.resource = resource;
    connection.subscribe(queue.player);
    queue.player.play(resource);
    const textChannel = queue.guild.channels.cache.get(queue.textChannelId) as
      | TextChannel
      | undefined;
    await textChannel?.send({
      embeds: [
        musicEmbed(
          "Now Playing",
          `**[${song.title}](${song.url})**\nDuration: \`${song.duration}\` | Requested by: ${song.requestedBy}`,
          song.thumbnail,
        ),
      ],
    });
  } catch (err) {
    logger.error({ err, song }, "Error starting song");
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
  if (!songs.length) return { success: false, error: "No playable songs were found." };
  let connection = getVoiceConnection(guild.id);
  try {
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
      });
    }
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
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
        const current = queues.get(guild.id);
        if (!current) return;
        if (current.loop !== "song") current.currentIndex++;
        void playNext(guild.id);
      });
      player.on("error", (err) => {
        logger.error({ err, guildId: guild.id }, "AudioPlayer error");
        const current = queues.get(guild.id);
        if (current) {
          current.currentIndex++;
          void playNext(guild.id);
        }
      });
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection!, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection!, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          queues.delete(guild.id);
          connection?.destroy();
        }
      });
    }
    const wasEmpty = queue.songs.length === 0;
    queue.songs.push(...songs);
    if (wasEmpty || queue.player.state.status === AudioPlayerStatus.Idle)
      await playNext(guild.id);
    return { success: true };
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "Error joining voice channel");
    if (!queues.has(guild.id)) connection?.destroy();
    return { success: false, error: String(err) };
  }
}

export function getQueue(guildId: string): GuildQueue | undefined {
  return queues.get(guildId);
}
export function pausePlayer(guildId: string): boolean {
  return queues.get(guildId)?.player.pause() ?? false;
}
export function resumePlayer(guildId: string): boolean {
  return queues.get(guildId)?.player.unpause() ?? false;
}
export function skipSong(guildId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;
  if (queue.loop !== "song") queue.currentIndex++;
  queue.player.stop();
  return true;
}
export function stopPlayer(guildId: string): void {
  const queue = queues.get(guildId);
  if (!queue) return;
  queue.songs = [];
  queue.currentIndex = 0;
  queue.player.stop();
  getVoiceConnection(guildId)?.destroy();
  queues.delete(guildId);
}
export function setVolume(guildId: string, volume: number): boolean {
  const queue = queues.get(guildId);
  if (!queue?.resource) return false;
  queue.volume = volume;
  queue.resource.volume?.setVolume(volume / 100);
  return true;
}
export function setLoop(guildId: string, mode: LoopMode): void {
  const queue = queues.get(guildId);
  if (queue) queue.loop = mode;
}
export function shuffleQueue(guildId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue || queue.songs.length - queue.currentIndex < 2) return false;
  const remaining = queue.songs.splice(queue.currentIndex + 1);
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!];
  }
  queue.songs.push(...remaining);
  return true;
}
export function removeSong(guildId: string, position: number): Song | null {
  const queue = queues.get(guildId);
  if (!queue) return null;
  const index = position - 1;
  if (index <= queue.currentIndex || index >= queue.songs.length) return null;
  return queue.songs.splice(index, 1)[0] ?? null;
}
export function disconnectBot(guildId: string): void {
  stopPlayer(guildId);
}
export function getCurrentSong(guildId: string): Song | null {
  const queue = queues.get(guildId);
  return queue?.songs[queue.currentIndex] ?? null;
}
export function getQueueList(guildId: string): {
  current: Song | null;
  upcoming: Song[];
  total: number;
} {
  const queue = queues.get(guildId);
  if (!queue) return { current: null, upcoming: [], total: 0 };
  return {
    current: queue.songs[queue.currentIndex] ?? null,
    upcoming: queue.songs.slice(queue.currentIndex + 1, queue.currentIndex + 11),
    total: queue.songs.length,
  };
}