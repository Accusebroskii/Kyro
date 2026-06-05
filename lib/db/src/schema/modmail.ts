import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modmailTable = pgTable("modmail_threads", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull(),
  subject: text("subject"),
  threadChannelId: text("thread_channel_id"),
  status: text("status").notNull().default("open"),
  closedBy: text("closed_by"),
  closedReason: text("closed_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertModmailSchema = createInsertSchema(modmailTable).omit({ id: true, createdAt: true });
export type InsertModmail = z.infer<typeof insertModmailSchema>;
export type ModmailThread = typeof modmailTable.$inferSelect;
