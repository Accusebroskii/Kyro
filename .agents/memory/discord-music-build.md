---
name: Discord bot music build
description: How to build a discord.js v14 bot with play-dl/voice music in esbuild monorepo
---

The entire audio stack must be listed as esbuild externals in `build.mjs`:
- `@discordjs/voice`, `play-dl`, `play-audio`, `play-opus`, `opusscript`, `@discordjs/opus`, `sodium`, `sodium-native`, `libsodium-wrappers`, `ffmpeg-static`, `prism-media`, `@snazzah/davey`, `@snazzah/davey-linux-x64-gnu`

**Why:** These packages load `.node` native binaries at runtime or dynamically require modules that esbuild can't bundle. The `play-audio` → `play-opus` chain is unresolvable at bundle time.

**How to apply:** Add all of the above to the `external` array in `artifacts/api-server/build.mjs` any time these packages are installed.

System FFmpeg is available in Replit NixOS at `/nix/store/.../bin/ffmpeg` — no need for `ffmpeg-static`.

For the `Command` interface in discord.js v14 slash command registries, use duck typing:
```ts
export interface Command {
  data: { name: string; toJSON(): object };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
```
The various builder return types (`SlashCommandOptionsOnlyBuilder`, `SlashCommandSubcommandsOnlyBuilder`) don't satisfy `SlashCommandBuilder` directly.
