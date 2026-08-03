import { REST, Routes } from "discord.js";
import { getAllCommands } from "../artifacts/api-server/src/bot/commands/index.js";

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;

const guildId = "1515345672583385160";

const commands = getAllCommands().map(command => command.data.toJSON());

console.log(`Registering ${commands.length} guild commands...`);

const rest = new REST({
  version: "10",
  timeout: 30000
}).setToken(token);

try {
  console.log("Sending guild command request...");

  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    {
      body: commands
    }
  );

  console.log("Guild commands updated!");
} catch (error) {
  console.error("Failed to register commands:");
  console.error(error);
  process.exit(1);
}
