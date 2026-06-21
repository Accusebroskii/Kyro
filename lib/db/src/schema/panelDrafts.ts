import { pgTable, text, serial, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const panelDraftsTable = pgTable("panel_drafts", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPanelDraftSchema = createInsertSchema(panelDraftsTable).omit({ id: true, updatedAt: true });
export type InsertPanelDraft = z.infer<typeof insertPanelDraftSchema>;
export type PanelDraftRow = typeof panelDraftsTable.$inferSelect;