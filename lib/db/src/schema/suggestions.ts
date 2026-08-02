import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const suggestionsTable = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull(),
  content: text("content").notNull(),
  messageId: text("message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Suggestion = typeof suggestionsTable.$inferSelect;
