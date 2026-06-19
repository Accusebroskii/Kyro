import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { pathToFileURL } from "url";
import path from "path";

const token = process.env.DISCORD_BOT_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;

const commands: object[] = [];

const commandsPath = path.join(process.cwd(), "src/bot/commands");
const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith(".ts") || f.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const mod = await import(pathToFileURL(filePath).href);
  const command = mod.default ?? Object.values(mod)[0];
  if (command?.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(token);

console.log(`Registering ${commands.length} commands...`);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log("Done!");
