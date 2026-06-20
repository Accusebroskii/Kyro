import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serverBackupsTable = pgTable("server_backups", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  createdBy: text("created_by").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertServerBackupSchema = createInsertSchema(serverBackupsTable).omit({ id: true, createdAt: true });
export type InsertServerBackup = z.infer<typeof insertServerBackupSchema>;
export type ServerBackup = typeof serverBackupsTable.$inferSelect;