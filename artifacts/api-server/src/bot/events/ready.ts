import { Client, ActivityType } from "discord.js";
import { REST, Routes } from "discord.js";
import { logger } from "../../lib/logger.js";
import { getAllCommands } from "../commands/index.js";

export async function onReady(client: Client): Promise<void> {
  logger.info({ tag: client.user?.tag }, "Bot is ready");

  client.user?.setActivity("Area12 /help", { type: ActivityType.Watching });

  const commands = getAllCommands();
  const commandData = commands.map((c) => c.data.toJSON());

  const rest = new REST().setToken(process.env["DISCORD_BOT_TOKEN"]!);
  try {
    await rest.put(Routes.applicationCommands(client.user!.id), { body: commandData });
    logger.info({ count: commandData.length }, "Slash commands registered globally");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}
