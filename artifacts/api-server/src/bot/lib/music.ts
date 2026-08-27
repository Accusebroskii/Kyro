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
import path from "path";
import { fileURLToPath } from "url";
import { musicEmbed } from "./embeds.js";
import { logger } from "../../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * yt-dlp binary resolution.
 *
 * We do NOT compute this from __dirname. __dirname's depth depends on how
 * the project is built (tsc to dist/, tsx running .ts directly, an esbuild
 * bundle, etc.), and a relative path like "../../../../bin" that's tuned for
 * one build layout will silently resolve to the wrong place under another
 * (this previously resolved to "/bin" on Railway and caused spawn ENOENT).
 *
 * Instead:
 *   1. If YTDLP_PATH env var is set, use it explicitly (escape hatch).
 *   2. Otherwise assume yt-dlp is installed on $PATH (e.g. via Nixpacks/apt
 *      at build time â€" see nixpacks.toml) and just spawn "yt-dlp".
 *
 * This means ensureYtDlp() below is no longer required for normal operation.
 * It's kept only as an optional fallback for local dev environments that
 * don't have yt-dlp installed system-wide.
 */
const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";

const COOKIES_PATH =
  process.env.COOKIES_PATH || path.resolve(__dirname, "../../../cookies.txt");

const YTDLP_DOWNLOAD_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

if (process.env.YT_COOKIES && !existsSync(COOKIES_PATH)) {
  try {
    writeFileSync(COOKIES_PATH, process.env.YT_COOKIES);
    logger.info("Wrote YouTube cookies from YT_COOKIES env var");
  } catch (err) {
    logger.error({ err }, "Failed to write cookies.txt from env var");
  }
}

/**
 * Verifies yt-dlp is reachable. Logs a clear, actionable error on boot
 * instead of failing silently/late inside a slash command handler.
 *
 * This does NOT download yt-dlp by default anymore — install it via
 * Nixpacks/apt/Dockerfile so it's on $PATH. Set FORCE_YTDLP_DOWNLOAD=1 if
 * you explicitly want the legacy runtime-download behavior (e.g. local dev
 * without system yt-dlp installed).
 */
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

  if (process.env.FORCE_YTDLP_DOWNLOAD === "1") {
    logger.warn(
      "yt-dlp not found on PATH; downloading to a local bin/ directory (FORCE_YTDLP_DOWNLOAD=1)",
    );
    const { mkdir, chmod } = await import("fs/promises");
    const binDir = path.resolve(process.cwd(), "bin");
    const localPath = path.join(binDir, "yt-dlp");
    await mkdir(binDir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("curl", ["-sL", YTDLP_DOWNLOAD_URL, "-o", localPath]);
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`curl exited ${code}`)),
      );
      proc.on("error", reject);
    });
    await chmod(localPath, 0o755);
    logger.warn(
      { localPath },
      "Downloaded yt-dlp locally. Set YTDLP_PATH to this path, or better: install yt-dlp at build time (Nixpacks/Dockerfile) so this download isn't needed.",
    );
    return;
  }

  logger.error(
    { ytdlpPath: YTDLP_PATH },
    "yt-dlp was not found and could not be executed. Install it at build time " +
      "(see nixpacks.toml), or set YTDLP_PATH to an explicit binary path, or " +
      "set FORCE_YTDLP_DOWNLOAD=1 for a temporary runtime download.",
  );
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
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
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
      const res = await fetch(
        `https://api.spotify.com/v1/tracks/${trackMatch[1]}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const track = (await res.json()) as any;
      const query = `${track.name} ${track.artists[0]?.name}`;
      return await searchSongs(query, 1);
    }

    const playlistMatch = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
    if (playlistMatch) {
      const songs: Song[] = [];
      let next: string | null =
        `https://api.spotify.com/v1/playlists/${playlistMatch[1]}/tracks?limit=50`;
      while (next && songs.length < 100) {
        const res = await fetch(next, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as any;
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
      const res = await fetch(
        `https://api.spotify.com/v1/albums/${albumMatch[1]}/tracks?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as any;
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
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getCookiesArgs(): string[] {
  const exists = existsSync(COOKIES_PATH);
  logger.info({ cookiesPath: COOKIES_PATH, exists }, "Resolved cookies file");
  return exists ? ["--cookies", COOKIES_PATH] : [];
}

/**
 * Spawns yt-dlp and rejects/logs clearly on ENOENT instead of letting the
 * caller silently end up with empty output.
 */
function spawnYtDlp(args: string[]) {
  const proc = spawn(YTDLP_PATH, args);
  proc.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      logger.error(
        { ytdlpPath: YTDLP_PATH },
        "yt-dlp binary not found. Install it at build time (nixpacks.toml) " +
          "or set YTDLP_PATH to a valid binary path.",
      );
    } else {
      logger.error({ err }, "yt-dlp spawn error");
    }
  });
  return proc;
}

function createYtDlpStream(url: string): Readable {
  const proc = spawnYtDlp([
    "-f",
    "bestaudio/best",
    "-o",
    "-",
    "--no-playlist",
    "--no-warnings",
    "--geo-bypass",
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    ...getCookiesArgs(),
    url,
  ]);

  proc.stderr.on("data", (chunk: Buffer) => {
    logger.warn({ ytdlp: chunk.toString().trim() }, "yt-dlp stderr (stream)");
  });

  return proc.stdout as Readable;
}

export async function searchSongs(query: string, limit = 5): Promise<Song[]> {
  try {
    if (query.includes("spotify.com")) {
      return await resolveSpotifyUrl(query);
    }

    const isUrl = /^https?:\/\//i.test(query.trim());

    const args = [
      "--dump-single-json",
      "--flat-playlist",
      "--no-warnings",
      "--geo-bypass",
      "--js-runtimes",
      "node",
      "--remote-components",
      "ejs:github",
      ...getCookiesArgs(),
      isUrl ? query : `ytsearch${Math.max(1, limit)}:${query}`,
    ];

    logger.info(
      {
        ytdlpPath: YTDLP_PATH,
        query,
        limit,
        isUrl,
        args: args.map((arg) =>
          arg === COOKIES_PATH ? "[COOKIES_PATH]" : arg,
        ),
      },
      "Starting yt-dlp music search",
    );

    const result = await new Promise<{
      stdout: string;
      stderr: string;
      exitCode: number | null;
    }>((resolve, reject) => {
      const proc = spawnYtDlp(args);

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", reject);

      proc.on("close", (exitCode) => {
        resolve({
          stdout,
          stderr,
          exitCode,
        });
      });
    });

    if (result.stderr.trim()) {
      logger.warn(
        {
          query,
          exitCode: result.exitCode,
          stderr: result.stderr.trim(),
        },
        "yt-dlp search stderr",
      );
    }

    if (result.exitCode !== 0 && !result.stdout.trim()) {
      logger.error(
        {
          query,
          exitCode: result.exitCode,
          stderr: result.stderr.trim(),
        },
        "yt-dlp search failed",
      );

      return [];
    }

    const songs: Song[] = [];

    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) continue;

      try {
        const data = JSON.parse(trimmed);

        const url =
          data.webpage_url ||
          data.url ||
          (data.id ? `https://www.youtube.com/watch?v=${data.id}` : "");

        if (!url) continue;

        songs.push({
          title: data.title || data.fulltitle || "Unknown",
          url,
          duration: formatDuration(
            Number(data.duration) || 0,
          ),
          thumbnail:
            data.thumbnail ||
            (data.thumbnails?.length
              ? data.thumbnails[data.thumbnails.length - 1]?.url || ""
              : ""),
          requestedBy: "",
          requestedById: "",
        });

        if (songs.length >= limit) break;
      } catch {
        // Ignore non-JSON lines from yt-dlp.
      }
    }

    if (songs.length === 0) {
      logger.warn(
        {
          query,
          exitCode: result.exitCode,
          stdoutLength: result.stdout.length,
          stderr: result.stderr.trim(),
        },
        "yt-dlp returned no playable search results",
      );
    }

    logger.info(
      {
        query,
        resultCount: songs.length,
      },
      "Search complete",
    );

    return songs;
  } catch (err) {
    logger.error(
      {
        err,
        query,
      },
      "Error searching songs",
    );

    return [];
  }
{
  try {
    if (query.includes("spotify.com")) {
      return await resolveSpotifyUrl(query);
    }

    const isUrl = query.startsWith("http");

    // NOTE: player_client=android is intentionally NOT used for search.
    // YouTube search extraction under the android client frequently returns
    // zero parseable results in yt-dlp (this was the root cause of every
    // search returning "Songs found: []" regardless of query). The android
    // client is still useful for the actual audio stream/download below,
    // where it helps avoid throttling on the watch page â€" so it stays there.
    const args = [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      "--geo-bypass",
      "--js-runtimes",
      "node",
      "--remote-components",
      "ejs:github",
      ...getCookiesArgs(),
      isUrl ? query : `ytsearch${limit}:${query}`,
    ];

    // TEMPORARY DEBUG — remove once the empty-results bug is found.
    // Logs the exact binary path and args array used by the REAL search
    // call, so it can be compared against what worked when tested manually
    // in the shell.
    logger.info(
      { ytdlpPath: YTDLP_PATH, args, limit, query },
    );

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawnYtDlp(args);
      let output = "";
      let stderrOutput = "";
      proc.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      proc.stderr.on("data", (chunk: Buffer) => {
        stderrOutput += chunk.toString();
      });
      proc.on("close", (code) => {
        if (stderrOutput.trim()) {
          logger.warn(
            { ytdlp: stderrOutput.trim(), exitCode: code },
            "yt-dlp stderr (search)",
          );
        }
        // TEMPORARY DEBUG — remove once the empty-results bug is found.
        logger.info(
          { exitCode: code, stdoutLength: output.length },
        );
        resolve(output);
      });
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

    logger.info(
      { query, resultCount: songs.length },
      "Search complete",
    );

    return songs;
  } catch (err) {
    logger.error({ err, query }, "Error searching songs");
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