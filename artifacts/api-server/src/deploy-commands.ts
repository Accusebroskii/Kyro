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

const commands = getAllCommands().map((c) => c.data.toJSON());

console.log(`Registering ${commands.length} commands globally...`);
console.log("Commands:", commands.map((c: any) => c.name).join(", "));

const rest = new REST().setToken(token);
await rest.put(Routes.applicationCommands(clientId), { body: commands });

console.log(`✅ Done! ${commands.length} commands registered.`);
