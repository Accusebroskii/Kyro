import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  TextChannel,
  ChannelType,
} from "discord.js";
import { db, guildConfigTable, modmailTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { onReady } from "./events/ready.js";
import { onGuildCreate } from "./events/guildCreate.js";
import { onGuildMemberAdd } from "./events/guildMemberAdd.js";
import { onInteractionCreate } from "./events/interactionCreate.js";
import { onMessageCreate } from "./events/messageCreate.js";
import { onVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { logger } from "../lib/logger.js";

export let botClient: Client | null = null;
export const botStartTime = Date.now();

export function createBotClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
  });

  client.once(Events.ClientReady, () => onReady(client));
  client.on(Events.GuildCreate, onGuildCreate);
  client.on(Events.GuildMemberAdd, onGuildMemberAdd);
  client.on(Events.InteractionCreate, onInteractionCreate);
  client.on(Events.MessageCreate, onMessageCreate);
  client.on(Events.VoiceStateUpdate, onVoiceStateUpdate);

  // ModMail: handle DMs to the bot
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;

    const user = message.author;
    const content = message.content;

    // Find guilds with modmail configured where the user is a member
    const allConfigs = await db.select().from(guildConfigTable);
    const guildsWithForum = allConfigs.filter((c) => c.modmailForumId);

    if (guildsWithForum.length === 0) {
      await message.channel.send("There is no ModMail system configured for this bot. Please contact a server admin.");
      return;
    }

    // Use the first guild that has modmail configured where the user is a member
    for (const config of guildsWithForum) {
      const guild = client.guilds.cache.get(config.guildId);
      if (!guild) continue;

      let member;
      try {
        member = await guild.members.fetch(user.id);
      } catch {
        continue;
      }
      if (!member) continue;

      // Check for existing open modmail thread
      const [existing] = await db.select().from(modmailTable)
        .where(and(eq(modmailTable.guildId, config.guildId), eq(modmailTable.userId, user.id), eq(modmailTable.status, "open")))
        .limit(1);

      if (existing && existing.threadChannelId) {
        // Forward message to existing thread
        const threadChannel = guild.channels.cache.get(existing.threadChannelId) as TextChannel | undefined;
        if (threadChannel) {
          await threadChannel.send(`**${user.tag}:** ${content}`);
          await message.channel.send("Your message has been forwarded to staff.");
          return;
        }
      }

      // Open new modmail thread
      try {
        const forumChannel = guild.channels.cache.get(config.modmailForumId!) as any;
        if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) continue;

        const thread = await forumChannel.threads.create({
          name: `ModMail — ${user.tag}`,
          message: {
            content: `**New ModMail from ${user.tag} (<@${user.id}>)**\n\n**Message:**\n${content}\n\nUse \`/modmail reply\` to respond or \`/modmail close\` to close.`,
          },
          reason: `ModMail from ${user.tag}`,
        });

        await db.insert(modmailTable).values({
          guildId: config.guildId,
          userId: user.id,
          userTag: user.tag,
          subject: content.slice(0, 100),
          threadChannelId: thread.id,
        });

        await message.channel.send(`Your message has been sent to the staff of **${guild.name}**. They will reply shortly.\n\nYou can continue to message me to add more context.`);
        return;
      } catch (err) {
        logger.error({ err }, "Failed to create modmail thread");
      }
    }

    await message.channel.send("Could not find a configured ModMail system. Please contact a server admin directly.");
  });

  client.on("error", (err) => logger.error({ err }, "Discord client error"));

  return client;
}

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — bot will not start");
    return;
  }

  const client = createBotClient();
  botClient = client;

  try {
    await client.login(token);
    logger.info("Discord bot logged in");
  } catch (err) {
    logger.error({ err }, "Failed to login to Discord");
  }
}
