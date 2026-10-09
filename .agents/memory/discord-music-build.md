---
name: Discord bot music build
description: How to build a discord.js v14 bot with play-dl/voice music in esbuild monorepo
---

The entire audio stack must be listed as esbuild externals in `build.mjs`:
- `@discordjs/voice`, `play-dl`, `play-audio`, `play-opus`, `opusscript`, `@discordjs/opus`, `sodium`, `sodium-native`, `libsodium-wrappers`, `ffmpeg-static`, `prism-media`, `@snazzah/davey`, `@snazzah/davey-linux-x64-gnu`

**Why:** These packages load `.node` native binaries at runtime or dynamically require modules that esbuild can't bundle. The `play-audio` → `play-opus` chain is unresolvable at bundle time.

**How to apply:** Add all of the above to the `external` array in `artifacts/api-server/build.mjs` any time these packages are installed.

System FFmpeg is available in Replit NixOS at `/nix/store/.../bin/ffmpeg` — no need for `ffmpeg-static`.

For consistent playback quality, select the best available audio source with yt-dlp,
decode it through FFmpeg to 48 kHz stereo PCM, and pass it to
`createAudioResource` as `StreamType.Raw`; direct `StreamType.Arbitrary` playback
varies with the source container and codec.

Search responses from `yt-dlp --dump-single-json --flat-playlist` must be mapped from
`entries[]`; the top-level `webpage_url` can be the non-playable `ytsearch...` query.

**Why:** Passing that search URI into the playback extractor produces an empty/failed
stream, which makes the audio player become idle and the queue cleanup disconnect.

**How to apply:** Require an `http(s)` video URL from an entry (or construct one from
its video ID) before adding a result to the queue, and log yt-dlp/FFmpeg exit details.

For Railway's Docker image, Node is present but Deno is not installed by the
Dockerfile. Use Node as yt-dlp's JavaScript runtime, or explicitly install Deno
before selecting it. The image installs system FFmpeg at `/usr/bin/ffmpeg`, so set
`FFMPEG_PATH` there instead of relying on `ffmpeg-static`.

**Why:** Search metadata can succeed while actual YouTube format extraction fails
when the selected JavaScript runtime is missing; the stream then closes and the bot
leaves after its queue is exhausted.

**How to apply:** Keep the configured yt-dlp runtime consistent with the deployment
image and prefer the installed system FFmpeg for Railway.

Railway's log view may show Pino's message but omit structured fields. Include a
short stderr summary in the message text for yt-dlp and FFmpeg failures.

**Why:** The supplied production logs showed only generic failure messages, hiding
the actual subprocess exit and stderr fields.

**How to apply:** Put the most actionable bounded diagnostic in the log message as
well as structured metadata.

For the `Command` interface in discord.js v14 slash command registries, use duck typing:
```ts
export interface Command {
  data: { name: string; toJSON(): object };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
```
The various builder return types (`SlashCommandOptionsOnlyBuilder`, `SlashCommandSubcommandsOnlyBuilder`) don't satisfy `SlashCommandBuilder` directly.
