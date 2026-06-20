import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reactionRolesTable = pgTable("reaction_roles", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  emojiKey: text("emoji_key").notNull(), // unicode char, or custom emoji id
  emojiDisplay: text("emoji_display").notNull(), // what to react with / show in lists
  roleId: text("role_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReactionRoleSchema = createInsertSchema(reactionRolesTable).omit({ id: true, createdAt: true });
export type InsertReactionRole = z.infer<typeof insertReactionRoleSchema>;
export type ReactionRole = typeof reactionRolesTable.$inferSelect;