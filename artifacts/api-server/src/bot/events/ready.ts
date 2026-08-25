import { Client, ActivityType } from "discord.js";
import { REST, Routes } from "discord.js";
import { logger } from "../../lib/logger.js";
import { getAllCommands } from "../commands/index.js";
import { scheduleActiveGiveaways } from "../commands/giveaway.js";

// Shared bug-mode state, toggled by the /bug command. While active, the
// rotating status interval below skips updating so the "Fixing Bugs 😭" status
// (set elsewhere, e.g. owner.ts) stays visible instead of being overwritten
// every 5 seconds.
let bugModeActive = false;
let customStatusActive = false;
let botClient: Client | null = null;

export function setCustomStatus(active: boolean): void {
  customStatusActive = active;
}

export function setBugMode(active: boolean): void {
  bugModeActive = active;

  if (!botClient?.user) return;

  if (active) {
    botClient.user.setPresence({
      activities: [{ name: "Fixing Bugs 😭", type: ActivityType.Watching }],
      status: "dnd",
    });
  } else {
    // Immediately restore a normal status on disable rather than waiting
    // up to 5s for the next interval tick.
    botClient.user.setPresence({
      activities: [
        {
          name: `${botClient.guilds.cache.size} servers`,
          type: ActivityType.Watching,
        },
      ],
      status: "online",
    });
  }
}

export function isBugModeActive(): boolean {
  return bugModeActive;
}

export async function onReady(client: Client): Promise<void> {
  if (!client.user) {
    logger.error("Client user is undefined on ready event");
    return;
  }
  logger.info({ tag: client.user.tag }, "Bot is ready");

  botClient = client;

  // Rotating bot activity
  const statuses: { text: string; type: ActivityType }[] = [
    { text: "Calyx /help", type: ActivityType.Watching },
    { text: "Owner: accusebroski_", type: ActivityType.Watching },
    { text: `${client.guilds.cache.size} servers`, type: ActivityType.Watching },
  ];
  let statusIndex = 0;
  const updateActivity = () => {
    // Skip rotating while bug mode is active so the "Fixing Bugs 😭" status
    // set by /bug isn't immediately overwritten.
    if (bugModeActive || customStatusActive) return;

    if (statuses[statusIndex].text.endsWith("servers")) {
      statuses[statusIndex].text = `${client.guilds.cache.size} servers`;
    }
    client.user!.setActivity(statuses[statusIndex].text, { type: statuses[statusIndex].type });
    statusIndex = (statusIndex + 1) % statuses.length;
  };
  updateActivity();
  setInterval(updateActivity, 5_000);

  // Schedule any active giveaways that survived a restart
  await scheduleActiveGiveaways(client);

  // Load all commands
  const commands = getAllCommands();
  const commandNames = commands.map((c) => c.data.name);
  console.log("Loaded commands:", commandNames);

  // Convert commands to Discord API format
  const commandData = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken((process.env["DISCORD_TOKEN"] ?? process.env["DISCORD_BOT_TOKEN"])!);
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