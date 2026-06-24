import {
  AudioPlayer,
  AudioPlayerStatus,
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
import { spawn } from "child_process";
import { Readable } from "stream";
import { existsSync, writeFileSync } from "fs";
import { chmod, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { musicEmbed } from "./embeds.js";
import { logger } from "../../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.resolve(__dirname, "../../../../bin");
const YTDLP_PATH = path.join(BIN_DIR, "yt-dlp");
const COOKIES_PATH = existsSync("/opt/render/project/src/artifacts/api-server/cookies.txt")
  ? "/opt/render/project/src/artifacts/api-server/cookies.txt"
  : path.resolve(__dirname, "../../../cookies.txt");
const YTDLP_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

if (process.env.YT_COOKIES && !existsSync(COOKIES_PATH)) {
  try {
    writeFileSync(COOKIES_PATH, process.env.YT_COOKIES);
    logger.info("Wrote YouTube cookies from YT_COOKIES env var");
  } catch (err) {
    logger.error({ err }, "Failed to write cookies.txt from env var");
  }
}

export async function ensureYtDlp(): Promise<void> {
  await mkdir(BIN_DIR, { recursive: true });
  logger.info("Downloading/updating yt-dlp...");
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("curl", ["-sL", YTDLP_URL, "-o", YTDLP_PATH]);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`curl exited ${code}`)),
    );
    proc.on("error", reject);
  });
  await chmod(YTDLP_PATH, 0o755);
  logger.info("yt-dlp updated successfully");
}

// Spotify token cache
let spotifyToken: string | null = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    const data = await res.json() as { access_token: string; expires_in: number };
    spotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch (err) {
    logger.error({ err }, "Failed to get Spotify token");
    return null;
  }
}

async function resolveSpotifyUrl(url: string): Promise<Song[]> {
  const token = await getSpotifyToken();
  if (!token) return [];

  try {
    const trackMatch = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (trackMatch) {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${trackMatch[1]}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const track = await res.json() as any;
      const query = `${track.name} ${track.artists[0]?.name}`;
      return await searchSongs(query, 1);
    }

    const playlistMatch = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
    if (playlistMatch) {
      const songs: Song[] = [];
      let next: string | null = `https://api.spotify.com/v1/playlists/${playlistMatch[1]}/tracks?limit=50`;
      while (next && songs.length < 100) {
        const res = await fetch(next, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as any;
        next = data.next;
        for (const item of data.items) {
          if (!item.track) continue;
          const query = `${item.track.name} ${item.track.artists[0]?.name}`;
          const results = await searchSongs(query, 1);
          if (results.length) songs.push(results[0]!);
        }
      }
      return songs;
    }

    const albumMatch = url.match(/spotify\.com\/album\/([a-zA-Z0-9]+)/);
    if (albumMatch) {
      const res = await fetch(`https://api.spotify.com/v1/albums/${albumMatch[1]}/tracks?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as any;
      const songs: Song[] = [];
      for (const track of data.items.slice(0, 50)) {
        const query = `${track.name} ${track.artists[0]?.name}`;
        const results = await searchSongs(query, 1);
        if (results.length) songs.push(results[0]!);
      }
      return songs;
    }
  } catch (err) {
    logger.error({ err }, "Error resolving Spotify URL");
  }

  return [];
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

function getCookiesArgs(): string[] {
  const exists = existsSync(COOKIES_PATH);
  console.log("Cookies path:", COOKIES_PATH, "exists:", exists);
  return exists ? ["--cookies", COOKIES_PATH] : [];
}

function createYtDlpStream(url: string): Readable {
  const proc = spawn(YTDLP_PATH, [
    "-f", "bestaudio/best",
    "-o", "-",
    "--no-playlist",
    "--quiet",
    "--no-warnings",
    "--geo-bypass",
    "--extractor-args", "youtube:player_client=android",
    ...getCookiesArgs(),
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
    if (query.includes("spotify.com")) {
      return await resolveSpotifyUrl(query);
    }

    const isUrl = query.startsWith("http");
    const args = isUrl
      ? [
          "--dump-json",
          "--no-playlist",
          "--geo-bypass",
          ...getCookiesArgs(),
          query,
        ]
      : [
          "--dump-json",
          "--no-playlist",
          "--geo-bypass",
          ...getCookiesArgs(),
          `ytsearch${limit}:${query}`,
        ];

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn(YTDLP_PATH, args);
      let output = "";
      proc.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      proc.stderr.on("data", (chunk: Buffer) => console.log(chunk.toString()));
      proc.on("close", () => resolve(output));
      proc.on("error", reject);
    });

    const songs: Song[] = [];
    for (const line of result.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        songs.push({
          title: data.title ?? "Unknown",
          url: data.webpage_url ?? data.url,
          duration: formatDuration(data.duration ?? 0),
          thumbnail: data.thumbnail ?? "",
          requestedBy: "",
          requestedById: "",
        });
      } catch {
        // skip bad lines
      }
    }
    return songs;
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