import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  ticketNumber: integer("ticket_number").notNull(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull(),
  subject: text("subject"),
  channelId: text("channel_id"),
  status: text("status").notNull().default("open"),
  claimedBy: text("claimed_by"),
  claimedByTag: text("claimed_by_tag"),
  closedBy: text("closed_by"),
  closedReason: text("closed_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const ticketTopicsTable = pgTable("ticket_topics", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  emoji: text("emoji").default("📩"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;
export type TicketTopic = typeof ticketTopicsTable.$inferSelect;