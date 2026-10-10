import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const setupAccessRolesTable = pgTable(
  "setup_access_roles",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    roleId: text("role_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    guildRoleUnique: uniqueIndex("setup_access_roles_guild_role_unique").on(
      table.guildId,
      table.roleId,
    ),
    guildIndex: index("setup_access_roles_guild_idx").on(table.guildId),
  }),
);

export type SetupAccessRole = typeof setupAccessRolesTable.$inferSelect;
