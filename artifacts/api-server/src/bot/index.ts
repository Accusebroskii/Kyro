import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  TextChannel,
  ChannelType,
} from "discord.js";
import { db, guildConfigTable, modmailTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { onReady } from "./events/ready.js";
import { onGuildCreate } from "./events/guildCreate.js";
import { onGuildMemberAdd } from "./events/guildMemberAdd.js";
import { onInteractionCreate } from "./events/interactionCreate.js";
import { onMessageCreate } from "./events/messageCreate.js";
import { onVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { onMessageReactionAdd } from "./events/messageReactionAdd.js";
import { onMessageReactionRemove } from "./events/messageReactionRemove.js";
import { logger } from "../lib/logger.js";
import { ensureYtDlp } from "./lib/music.js";

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
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction],
  });

  client.once(Events.ClientReady, () => onReady(client));
  client.on(Events.GuildCreate, onGuildCreate);
  client.on(Events.GuildMemberAdd, onGuildMemberAdd);
  client.on(Events.InteractionCreate, onInteractionCreate);
  client.on(Events.MessageCreate, onMessageCreate);
  client.on(Events.VoiceStateUpdate, onVoiceStateUpdate);
  client.on(Events.MessageReactionAdd, onMessageReactionAdd);
  client.on(Events.MessageReactionRemove, onMessageReactionRemove);

  // ModMail: handle DMs to the bot
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;

    const user = message.author;
    const content = message.content;

    const allConfigs = await db.select().from(guildConfigTable);
    const guildsWithForum = allConfigs.filter((c) => c.modmailForumId);

    if (guildsWithForum.length === 0) {
      await message.channel.send("There is no ModMail system configured for this bot. Please contact a server admin.");
      return;
    }

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

      const [existing] = await db.select().from(modmailTable)
        .where(and(eq(modmailTable.guildId, config.guildId), eq(modmailTable.userId, user.id), eq(modmailTable.status, "open")))
        .limit(1);

      if (existing && existing.threadChannelId) {
        const threadChannel = guild.channels.cache.get(existing.threadChannelId) as TextChannel | undefined;
        if (threadChannel) {
          await threadChannel.send(`**${user.tag}:** ${content}`);
          return;
        }
      }

      try {
        const forumChannel = guild.channels.cache.get(
          process.env.MODMAIL_FORUM_ID!
        ) as any;
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

  // Create tables if they don't exist
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS guild_config (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL UNIQUE, guild_name TEXT, guild_icon_url TEXT,
        member_count INTEGER, welcome_channel_id TEXT, welcome_message TEXT, log_channel_id TEXT,
        mod_log_channel_id TEXT, ticket_category_id TEXT, ticket_log_channel_id TEXT,
        ticket_counter INTEGER DEFAULT 0, modmail_forum_id TEXT, mute_role_id TEXT,
        mod_role_id TEXT, admin_role_id TEXT, owner_id TEXT, antispam_enabled BOOLEAN DEFAULT false,
        anti_raid_enabled BOOLEAN DEFAULT false, automod_enabled BOOLEAN DEFAULT false,
        join_to_create_channel_id TEXT, join_to_create_category_id TEXT, max_warnings INTEGER DEFAULT 3,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, ticket_number INTEGER NOT NULL,
        user_id TEXT NOT NULL, user_tag TEXT NOT NULL, subject TEXT, channel_id TEXT,
        status TEXT NOT NULL DEFAULT 'open', claimed_by TEXT, claimed_by_tag TEXT,
        closed_by TEXT, closed_reason TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        closed_at TIMESTAMP WITH TIME ZONE
      );
      CREATE TABLE IF NOT EXISTS ticket_topics (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, label TEXT NOT NULL,
        description TEXT, emoji TEXT DEFAULT '📩', created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS mod_logs (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, target_id TEXT NOT NULL,
        target_tag TEXT NOT NULL, moderator_id TEXT NOT NULL, moderator_tag TEXT NOT NULL,
        action TEXT NOT NULL, reason TEXT, duration INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS warnings (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        user_tag TEXT NOT NULL, moderator_id TEXT NOT NULL, moderator_tag TEXT NOT NULL,
        reason TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS modmail_threads (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        user_tag TEXT NOT NULL, subject TEXT, thread_channel_id TEXT,
        status TEXT NOT NULL DEFAULT 'open', closed_by TEXT, closed_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), closed_at TIMESTAMP WITH TIME ZONE
      );
      CREATE TABLE IF NOT EXISTS auto_roles (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, role_id TEXT NOT NULL, role_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS music_playlists (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, name TEXT NOT NULL,
        created_by TEXT NOT NULL, created_by_tag TEXT NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS music_playlist_songs (
        id SERIAL PRIMARY KEY, playlist_id INTEGER NOT NULL, title TEXT NOT NULL,
        url TEXT NOT NULL, duration TEXT NOT NULL, thumbnail TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, reporter_id TEXT NOT NULL,
        reporter_tag TEXT NOT NULL, target_id TEXT NOT NULL, target_tag TEXT NOT NULL,
        reason TEXT, message_id TEXT, channel_id TEXT, status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    logger.info("Database tables created/verified");
  } catch (err) {
    logger.warn({ err }, "Table creation failed, continuing anyway");
  }

  await ensureYtDlp();

  const client = createBotClient();
  botClient = client;

  try {
    await client.login(token);
    logger.info("Discord bot logged in");
  } catch (err) {
    logger.error({ err }, "Failed to login to Discord");
  }
}