import { REST, Routes } from "discord.js";

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

await rest.put(
  Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
  { body: [] }
);

console.log("Cleared all global commands");
