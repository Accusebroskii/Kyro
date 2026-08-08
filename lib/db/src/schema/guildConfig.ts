import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildConfigTable = pgTable("guild_config", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  guildName: text("guild_name").notNull().default("Unknown Guild"),
  guildIconUrl: text("guild_icon_url"),
  memberCount: integer("member_count").default(0),
  welcomeChannelId: text("welcome_channel_id"),
  welcomeMessage: text("welcome_message"),
  logChannelId: text("log_channel_id"),
  modLogChannelId: text("mod_log_channel_id"),
  ticketCategoryId: text("ticket_category_id"),
  ticketLogChannelId: text("ticket_log_channel_id"),
  ticketCounter: integer("ticket_counter").notNull().default(0),
  modmailForumId: text("modmail_forum_id"),
  muteRoleId: text("mute_role_id"),
  modRoleId: text("mod_role_id"),
  adminRoleId: text("admin_role_id"),
  ownerId: text("owner_id"),
  antispamEnabled: boolean("antispam_enabled").notNull().default(false),
  antiRaidEnabled: boolean("anti_raid_enabled").notNull().default(false),
  automodEnabled: boolean("automod_enabled").notNull().default(false),
  joinToCreateChannelId: text("join_to_create_channel_id"),
  joinToCreateCategoryId: text("join_to_create_category_id"),
  maxWarnings: integer("max_warnings").notNull().default(3),
  // Verification system
  verificationEnabled: boolean("verification_enabled").notNull().default(false),
  verificationMethod: text("verification_method"), // "button" | "reaction" | "word" | "captcha"
  verificationChannelId: text("verification_channel_id"),
  verificationMessageId: text("verification_message_id"),
  unverifiedRoleId: text("unverified_role_id"),
  verifiedRoleId: text("verified_role_id"),
  verificationWord: text("verification_word"),
  // Counting system
  countingChannelId: text("counting_channel_id"),
  countingCurrent: integer("counting_current").notNull().default(0),
  countingHighScore: integer("counting_high_score").notNull().default(0),
  countingLastUserId: text("counting_last_user_id"),

  // Suggestions system
  suggestionsChannelId: text("suggestions_channel_id"),
  // Starboard
  starboardChannelId: text("starboard_channel_id"),
  starboardThreshold: integer("starboard_threshold").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigTable.$inferSelect;