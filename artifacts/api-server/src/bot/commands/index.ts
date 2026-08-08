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
  roleAllCommand,
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
  shipCommand,
  rpsCommand,
  wyrCommand,
  hackCommand,
  roastCommand,
  ppCommand,
  memeCommand,
  triviaCommand,
} from "./fun.js";
import {
  unbanCommand,
  modlogsCommand,
  snipeCommand,
  moveCommand,
  suggestCommand,
  remindmeCommand,
} from "./utility.js";
import { helpCommand } from "./help.js";
import { inviteCommand } from "./invite.js";
import { backupCommand } from "./backup.js";
import { giveawayCommand } from "./giveaway.js";
import { reactionRoleCommand } from "./reactionrole.js";
import { afkCommand } from "./afk.js";
import { createRolesCommand } from "./createroles.js";
import { rankCommand, leaderboardCommand } from "./levels.js";
import { securityCommand } from "./security.js";
import { embedCommand } from "./embed.js";
import { templateCommand } from "./template.js";
import { automodCommand } from "./automod.js";
import { guildCommand } from "./guild.js";

import {
  restartCommand,
  pingCommand,
  botinfoCommand,
  bugCommand,
  sayCommand,
  dmCommand,
  setstatusCommand,
  globalbanCommand,
  botnameCommand,
  botavatarCommand,
  broadcastCommand,
  guildsCommand,
} from "./owner.js";

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
  unbanCommand,
  modlogsCommand,

  // Admin
  roleCommand,
  roleAllCommand,
  slowmodeCommand,
  lockCommand,
  unlockCommand,
  announceCommand,
  nickCommand,

  // Utility
  snipeCommand,
  moveCommand,
  suggestCommand,
  remindmeCommand,

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
  shipCommand,
  rpsCommand,
  wyrCommand,
  hackCommand,
  roastCommand,
  ppCommand,
  memeCommand,
  triviaCommand,
  afkCommand,

  // Leveling
  rankCommand,
  leaderboardCommand,

  // Giveaways
  giveawayCommand,

  // Reaction roles
  reactionRoleCommand,

  // Utility misc
  backupCommand,
  createRolesCommand,
  templateCommand,
  embedCommand,

  // Help & Info
  helpCommand,
  inviteCommand,

  // Security & AutoMod
  securityCommand,
  automodCommand,

  // Owner/Misc
  restartCommand,
  pingCommand,
  botinfoCommand,
  bugCommand,
  sayCommand,
  dmCommand,
  setstatusCommand,
  globalbanCommand,
  botnameCommand,
  botavatarCommand,
  broadcastCommand,
  guildsCommand,
  guildCommand,
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
