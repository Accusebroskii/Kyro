import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userLevelsTable = pgTable("user_levels", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(0),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
});

export const levelRoleRewardsTable = pgTable("level_role_rewards", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  level: integer("level").notNull(),
  roleId: text("role_id").notNull(),
});

export const insertUserLevelSchema = createInsertSchema(userLevelsTable).omit({ id: true });
export type InsertUserLevel = z.infer<typeof insertUserLevelSchema>;
export type UserLevel = typeof userLevelsTable.$inferSelect;

export const insertLevelRoleRewardSchema = createInsertSchema(levelRoleRewardsTable).omit({ id: true });
export type InsertLevelRoleReward = z.infer<typeof insertLevelRoleRewardSchema>;
export type LevelRoleReward = typeof levelRoleRewardsTable.$inferSelect;