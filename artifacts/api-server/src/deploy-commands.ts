import { REST, Routes } from "discord.js";
import { getAllCommands } from "./bot/commands/index.js";

const token = (process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN)!;
const clientId = process.env.DISCORD_CLIENT_ID!;

if (!token) {
  console.error("Missing DISCORD_TOKEN / DISCORD_BOT_TOKEN");
  process.exit(1);
}
if (!clientId) {
  console.error("Missing DISCORD_CLIENT_ID");
  process.exit(1);
}

const rest = new REST().setToken(token);

// ── 1. Wipe stale guild-specific commands ─────────────────────────────────────
// Pass CLEANUP_GUILD_IDS as a comma-separated list of guild IDs to nuke their
// guild commands (the old /guild list, /guildinvite, etc.).
const cleanupIds = (process.env.CLEANUP_GUILD_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

if (cleanupIds.length > 0) {
  for (const guildId of cleanupIds) {
    console.log(`🧹 Clearing guild commands from guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    console.log(`   ✅ Cleared guild ${guildId}`);
  }
} else {
  console.log("ℹ️  No CLEANUP_GUILD_IDS set — skipping guild command cleanup.");
  console.log("   To remove stale guild commands, set CLEANUP_GUILD_IDS=<guild_id1>,<guild_id2>");
}

// ── 2. Register all commands globally ────────────────────────────────────────
const commands = getAllCommands().map((c) => c.data.toJSON());
console.log(`\nRegistering ${commands.length} global commands...`);
console.log("Commands:", commands.map((c: { name: string }) => c.name).join(", "));

await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log(`\n✅ Done! ${commands.length} commands registered globally.`);
