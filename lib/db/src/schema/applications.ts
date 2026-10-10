import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type ApplicationAnswer = {
  question: string;
  answer: string;
};

export const applicationFormsTable = pgTable(
  "application_forms",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    panelChannelId: text("panel_channel_id").notNull(),
    reviewChannelId: text("review_channel_id").notNull(),
    questions: jsonb("questions").$type<string[]>().notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by").notNull(),
    panelMessageId: text("panel_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    guildIndex: index("application_forms_guild_idx").on(table.guildId, table.id),
  }),
);

export const applicationSubmissionsTable = pgTable(
  "application_submissions",
  {
    id: serial("id").primaryKey(),
    formId: integer("form_id").notNull(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    answers: jsonb("answers").$type<ApplicationAnswer[]>().notNull(),
    status: text("status").notNull().default("pending"),
    reviewMessageId: text("review_message_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    formIndex: index("application_submissions_form_idx").on(
      table.formId,
      table.id,
    ),
    applicantIndex: index("application_submissions_applicant_idx").on(
      table.guildId,
      table.userId,
    ),
  }),
);

export type ApplicationForm = typeof applicationFormsTable.$inferSelect;
export type ApplicationSubmission =
  typeof applicationSubmissionsTable.$inferSelect;
