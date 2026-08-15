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
import { onGuildMemberRemove } from "./events/guildMemberRemove.js";
import { onInteractionCreate } from "./events/interactionCreate.js";
import { onMessageCreate } from "./events/messageCreate.js";
import { onMessageDelete } from "./events/messageDelete.js";
import { onMessageUpdate } from "./events/messageUpdate.js";
import { onVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { onMessageReactionAdd } from "./events/messageReactionAdd.js";
import { onMessageReactionRemove } from "./events/messageReactionRemove.js";
import { logger } from "../lib/logger.js";
import { ensureYtDlp } from "./lib/music.js";
import { deliverDueReminders } from "./commands/utility.js";

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
  client.on(Events.GuildMemberRemove, onGuildMemberRemove);
  client.on(Events.InteractionCreate, onInteractionCreate);
  client.on(Events.MessageCreate, onMessageCreate);
  client.on(Events.MessageDelete, onMessageDelete);
  client.on(Events.MessageUpdate, onMessageUpdate);
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
        if (!config.modmailForumId) continue;
        const forumChannel = guild.channels.cache.get(config.modmailForumId) as any;
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
  const token = process.env["DISCORD_TOKEN"] ?? process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot will not start");
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
        verification_enabled BOOLEAN DEFAULT false, verification_method TEXT,
        verification_channel_id TEXT, verification_message_id TEXT,
        unverified_role_id TEXT, verified_role_id TEXT, verification_word TEXT,
        suggestions_channel_id TEXT, starboard_channel_id TEXT, starboard_threshold INTEGER DEFAULT 3,
        boost_message_enabled BOOLEAN DEFAULT false, boost_message TEXT, boost_channel_id TEXT,
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
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
        panel_name TEXT NOT NULL DEFAULT 'default',
        label TEXT NOT NULL, description TEXT, emoji TEXT DEFAULT '📩',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ticket_panels (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, panel_name TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT, channel_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS panel_drafts (
        id SERIAL PRIMARY KEY, session_id TEXT NOT NULL UNIQUE,
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        data JSONB NOT NULL, updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
      CREATE TABLE IF NOT EXISTS reaction_roles (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL, emoji_key TEXT NOT NULL, emoji_display TEXT NOT NULL,
        role_id TEXT NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS music_playlists (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, name TEXT NOT NULL,
        created_by TEXT NOT NULL, created_by_tag TEXT NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS music_playlist_songs (
        id SERIAL PRIMARY KEY, playlist_id INTEGER NOT NULL, title TEXT NOT NULL,
        url TEXT NOT NULL, duration TEXT NOT NULL, thumbnail TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_backups (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, created_by TEXT NOT NULL,
        data JSONB NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, reporter_id TEXT NOT NULL,
        reporter_tag TEXT NOT NULL, target_id TEXT NOT NULL, target_tag TEXT NOT NULL,
        reason TEXT, message_id TEXT, channel_id TEXT, status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS giveaways (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        message_id TEXT, prize TEXT NOT NULL, winners_count INTEGER NOT NULL DEFAULT 1,
        hosted_by TEXT NOT NULL, ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
        ended BOOLEAN NOT NULL DEFAULT false, winner_ids TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS giveaway_entries (
        id SERIAL PRIMARY KEY, giveaway_id INTEGER NOT NULL, user_id TEXT NOT NULL,
        entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL, message TEXT NOT NULL,
        remind_at TIMESTAMP WITH TIME ZONE NOT NULL, delivered BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS suggestions (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        user_tag TEXT NOT NULL, content TEXT NOT NULL, message_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS starboard_posts (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, message_id TEXT NOT NULL UNIQUE,
        starboard_message_id TEXT NOT NULL, star_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS afk_status (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        reason TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_levels (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 0,
        last_message_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(guild_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS level_role_rewards (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
        level INTEGER NOT NULL, role_id TEXT NOT NULL
      );
    `);
    /* Patch columns that may be missing on existing deployments */
    await db.execute(sql`
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS counting_channel_id TEXT;
    ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS counting_current INTEGER DEFAULT 0;
    ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS counting_high_score INTEGER DEFAULT 0;
    ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS counting_last_user_id TEXT;
    ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS verification_enabled BOOLEAN DEFAULT false;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS verification_method TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS verification_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS verification_message_id TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS unverified_role_id TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS verified_role_id TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS verification_word TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS suggestions_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS starboard_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS starboard_threshold INTEGER DEFAULT 3;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS boost_message_enabled BOOLEAN DEFAULT false;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS boost_message TEXT;
      ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS boost_channel_id TEXT;
      ALTER TABLE ticket_topics ADD COLUMN IF NOT EXISTS panel_name TEXT NOT NULL DEFAULT 'default';
    `);
    logger.info("Database tables created/verified");
  } catch (err) {
    logger.warn({ err }, "Table creation failed, continuing anyway");
  }

  try {
    await ensureYtDlp();
  } catch (err) {
    logger.error({ err }, "Failed to download/update yt-dlp — music features may be unavailable, continuing bot startup");
  }

  const client = createBotClient();
  botClient = client;

  try {
    await client.login(token);
    logger.info("Discord bot logged in");
    // Deliver reminders every minute
    setInterval(() => deliverDueReminders(client), 60_000);
  } catch (err) {
    logger.error({ err }, "Failed to login to Discord");
    throw err;
  }
}