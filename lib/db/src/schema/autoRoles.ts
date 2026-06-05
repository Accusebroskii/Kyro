import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const autoRolesTable = pgTable("auto_roles", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  roleId: text("role_id").notNull(),
  roleName: text("role_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAutoRoleSchema = createInsertSchema(autoRolesTable).omit({ id: true, createdAt: true });
export type InsertAutoRole = z.infer<typeof insertAutoRoleSchema>;
export type AutoRole = typeof autoRolesTable.$inferSelect;
