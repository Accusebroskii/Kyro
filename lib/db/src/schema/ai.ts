import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const aiUserSettingsTable = pgTable("ai_user_settings", {
  userId: text("user_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  mode: text("mode").notNull().default("calm"),
  totalRequests: integer("total_requests").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiMessagesTable = pgTable(
  "ai_messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    scopeId: text("scope_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userScopeIdIndex: index("ai_messages_user_scope_id_idx").on(
      table.userId,
      table.scopeId,
      table.id,
    ),
  }),
);

export type AiUserSettings = typeof aiUserSettingsTable.$inferSelect;
export type AiMessage = typeof aiMessagesTable.$inferSelect;
