import { type ChatInputCommandInteraction } from "discord.js";

import {
  banCommand,
  kickCommand,
  muteCommand,
  unmuteCommand,
  warnCommand,
  warningsCommand,
  clearwarningsCommand,
  timeoutCommand,
  untimeoutCommand,
  purgeCommand,
} from "./moderation.js";
import {
  roleCommand,
  slowmodeCommand,
  lockCommand,
  unlockCommand,
  announceCommand,
  nickCommand,
} from "./admin.js";
import { setupCommand } from "./setup.js";
import { ticketCommand } from "./tickets.js";
import { modmailCommand } from "./modmail.js";
import {
  bugreportCommand,
  playerreportCommand,
  supportCommand,
} from "./reports.js";
import {
  playCommand,
  pauseCommand,
  resumeCommand,
  skipCommand,
  stopCommand,
  queueCommand,
  nowplayingCommand,
  volumeCommand,
  loopCommand,
  shuffleCommand,
  removeCommand,
  disconnectCommand,
  playlistCommand,
} from "./music.js";
import {
  eightballCommand,
  coinflipCommand,
  diceCommand,
  jokeCommand,
  pollCommand,
  serverinfoCommand,
  userinfoCommand,
} from "./fun.js";
import { helpCommand } from "./help.js";
import { inviteCommand } from "./invite.js";
import { afkCommand } from "./afk.js";
import { securityCommand } from "./security.js";
import { restartCommand, pingCommand, botinfoCommand } from "./owner.js";

export interface Command {
  data: { name: string; toJSON(): object };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const ALL_COMMANDS: Command[] = [
  // Moderation
  banCommand,
  kickCommand,
  muteCommand,
  unmuteCommand,
  warnCommand,
  warningsCommand,
  clearwarningsCommand,
  timeoutCommand,
  untimeoutCommand,
  purgeCommand,

  // Admin
  roleCommand,
  slowmodeCommand,
  lockCommand,
  unlockCommand,
  announceCommand,
  nickCommand,

  // Setup
  setupCommand,

  // Tickets
  ticketCommand,

  // ModMail
  modmailCommand,

  // Reports
  bugreportCommand,
  playerreportCommand,
  supportCommand,

  // Music
  playCommand,
  pauseCommand,
  resumeCommand,
  skipCommand,
  stopCommand,
  queueCommand,
  nowplayingCommand,
  volumeCommand,
  loopCommand,
  shuffleCommand,
  removeCommand,
  disconnectCommand,
  playlistCommand,

  // Fun
  eightballCommand,
  coinflipCommand,
  diceCommand,
  jokeCommand,
  pollCommand,
  serverinfoCommand,
  userinfoCommand,
  afkCommand,

  // Help
  helpCommand,
  inviteCommand,

  // Security
  securityCommand,

  // Owner/Misc
  restartCommand,
  pingCommand,
  botinfoCommand,
];

const commandMap = new Map<string, Command>(
  ALL_COMMANDS.map((c) => [c.data.name, c]),
);

export function getAllCommands(): Command[] {
  return ALL_COMMANDS;
}

export function getCommand(name: string): Command | undefined {
  return commandMap.get(name);
}
