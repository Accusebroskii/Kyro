import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const afkStatusTable = pgTable("afk_status", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAfkStatusSchema = createInsertSchema(afkStatusTable).omit({ id: true, createdAt: true });
export type InsertAfkStatus = z.infer<typeof insertAfkStatusSchema>;
export type AfkStatus = typeof afkStatusTable.$inferSelect;