import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const starboardPostsTable = pgTable("starboard_posts", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  messageId: text("message_id").notNull().unique(),
  starboardMessageId: text("starboard_message_id").notNull(),
  starCount: integer("star_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StarboardPost = typeof starboardPostsTable.$inferSelect;
