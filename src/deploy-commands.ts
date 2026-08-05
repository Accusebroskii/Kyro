import { REST, Routes } from "discord.js";
import { getAllCommands } from "../artifacts/api-server/src/bot/commands/index.js";

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;

const guildIds = [
  "1515345672583385160",
  "1452849638741639201",
];

const commands = getAllCommands().map(command => command.data.toJSON());

console.log(`Registering ${commands.length} commands to ${guildIds.length} guild(s)...`);

const rest = new REST({
  version: "10",
  timeout: 30000,
}).setToken(token);

try {
  for (const guildId of guildIds) {
    console.log(`Updating guild ${guildId}...`);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      {
        body: commands,
      }
    );

    console.log(`✅ Updated ${guildId}`);
  }

  console.log("🎉 All guild commands updated!");
} catch (error) {
  console.error("Failed to register commands:");
  console.error(error);
  process.exit(1);
}