import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modLogsTable = pgTable("mod_logs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id").notNull(),
  targetTag: text("target_tag").notNull(),
  moderatorId: text("moderator_id").notNull(),
  moderatorTag: text("moderator_tag").notNull(),
  reason: text("reason"),
  duration: text("duration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertModLogSchema = createInsertSchema(modLogsTable).omit({ id: true, createdAt: true });
export type InsertModLog = z.infer<typeof insertModLogSchema>;
export type ModLog = typeof modLogsTable.$inferSelect;
