import { Client, ActivityType } from "discord.js";
import { REST, Routes } from "discord.js";
import { logger } from "../../lib/logger.js";
import { getAllCommands } from "../commands/index.js";

export async function onReady(client: Client): Promise<void> {
  if (!client.user) {
    logger.error("Client user is undefined on ready event");
    return;
  }

  logger.info({ tag: client.user.tag }, "Bot is ready");

  // Set bot activity
  client.user.setActivity("Kyro /help", {
    type: ActivityType.Watching,
  });

  // Load all commands
  const commands = getAllCommands();

  const commandNames = commands.map((c) => c.data.name);
  console.log("Loaded commands:", commandNames);

  // Convert commands to Discord API format
  const commandData = commands.map((c) => c.data.toJSON());

  const rest = new REST().setToken(process.env["DISCORD_BOT_TOKEN"]!);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commandData,
    });

    logger.info(
      { count: commandData.length },
      "Slash commands registered globally",
    );
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}
