import { REST, Routes } from "discord.js";
import { getAllCommands } from "./artifacts/api-server/src/bot/commands/index.ts";

async function main() {
  const rest = new REST({
    version: "10",
    timeout: 10000,
    retries: 0,
  }).setToken(process.env.DISCORD_TOKEN!);

  const commands = getAllCommands().map(c => c.data.toJSON());

  console.log(`Commands: ${commands.length}`);
  console.log("Sending...");

  try {
    const result = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands }
    );

    console.log("SUCCESS", result);
  } catch (e) {
    console.error("ERROR:", e);
  }
}

main();
