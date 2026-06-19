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

  // Rotating bot activity
  const statuses: { text: string; type: ActivityType }[] = [
    { text: "Kyro /help", type: ActivityType.Watching },
    { text: "Owner accusebroski_", type: ActivityType.Watching },
    { text: `${client.guilds.cache.size} servers`, type: ActivityType.Watching },
  ];
  let statusIndex = 0;

  const updateActivity = () => {
    // Recompute server count live each time it's that status's turn
    if (statuses[statusIndex].text.endsWith("servers")) {
      statuses[statusIndex].text = `${client.guilds.cache.size} servers`;
    }
    client.user!.setActivity(statuses[statusIndex].text, { type: statuses[statusIndex].type });
    statusIndex = (statusIndex + 1) % statuses.length;
  };

  updateActivity(); // set immediately on ready
  setInterval(updateActivity, 15_000); // rotate every 15 seconds

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