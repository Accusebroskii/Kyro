#  Community Discord Bot

A full-featured Discord bot for a gaming community with a React web dashboard. All commands are slash commands only.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — rebuild lib TS declarations (run before leaf typechecks after schema changes)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `DISCORD_BOT_TOKEN`, `SESSION_SECRET`
- Optional env: `OWNER_ID` — Discord user ID for owner-only `/restart` command

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Discord: discord.js v14, @discordjs/voice, play-dl (music)
- Build: esbuild (externals include @discordjs/voice, play-dl, opusscript)
- Dashboard: React 19 + Vite, Discord dark theme

## Where things live

- `artifacts/api-server/src/bot/` — all Discord bot code
  - `commands/` — slash command handlers by category
  - `events/` — Discord event handlers
  - `lib/` — permissions, embeds, music queue manager
- `artifacts/dashboard/src/` — React dashboard frontend
- `lib/db/src/schema/` — Drizzle ORM table definitions (source of truth)
- `artifacts/api-server/build.mjs` — esbuild config with audio package externals

## Architecture decisions

- Bot starts inside the Express API server process (single process, same DB connection)
- Music queue stored in-memory (Map<guildId, GuildQueue>) — resets on restart
- `play-dl` + `@discordjs/voice` for music; system FFmpeg handles WebM/Opus transcoding
- All voice/audio packages (`@discordjs/voice`, `play-dl`, `opusscript`) are esbuild externals
- `DISCORD_BOT_TOKEN` absence is graceful — server still starts, bot just won't connect

## Product

- **Moderation**: ban, kick, mute/unmute, warn, timeout, purge
- **Music**: play/pause/resume/skip/stop, queue, volume, loop, shuffle, playlists (save/load/delete)
- **Tickets**: open/close/claim/add/remove user (private channel per ticket)
- **ModMail**: DM the bot → auto-creates forum thread for staff
- **Setup**: /setup subcommands configure all features (welcome, logs, automod, roles, tickets, join-to-voice)
- **Reports**: /bugreport, /playerreport, /support
- **Fun**: /8ball, /coinflip, /dice, /joke, /poll, /serverinfo, /userinfo
- **Security**: antispam, antiraid toggles
- **Join-to-Create**: users join configured channel to get private voice channel
- **Auto-mod**: spam detection with auto-timeout

## Gotchas

- After updating `lib/db/src/schema/`, run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck`
- `play-dl` + `@discordjs/voice` must stay in esbuild externals (see build.mjs) — they use native .node files
- Music requires system FFmpeg (available in Replit NixOS at `/nix/store/.../bin/ffmpeg`)
- Bot token goes in `DISCORD_BOT_TOKEN` secret (not .env file)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
