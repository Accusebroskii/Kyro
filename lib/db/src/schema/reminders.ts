import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const remindersTable = pgTable("reminders", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  message: text("message").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  delivered: boolean("delivered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Reminder = typeof remindersTable.$inferSelect;
