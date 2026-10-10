import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import {
  aiMessagesTable,
  aiUserSettingsTable,
  db,
} from "@workspace/db";
import type { AIMode, AIConversationMessage } from "./ai.js";

const MAX_STORED_MESSAGES_PER_SCOPE = 24;

export type AiUserSettings = {
  enabled: boolean;
  mode: AIMode;
};

export async function getAiUserSettings(userId: string): Promise<AiUserSettings> {
  const [settings] = await db
    .select()
    .from(aiUserSettingsTable)
    .where(eq(aiUserSettingsTable.userId, userId))
    .limit(1);

  const mode = settings?.mode;
  return {
    enabled: settings?.enabled ?? true,
    mode: mode === "crazy" || mode === "freaky" ? mode : "calm",
  };
}

export async function updateAiUserSettings(
  userId: string,
  update: Partial<AiUserSettings>,
): Promise<AiUserSettings> {
  const current = await getAiUserSettings(userId);
  const next = { ...current, ...update };

  await db
    .insert(aiUserSettingsTable)
    .values({ userId, enabled: next.enabled, mode: next.mode })
    .onConflictDoUpdate({
      target: aiUserSettingsTable.userId,
      set: {
        enabled: next.enabled,
        mode: next.mode,
        updatedAt: new Date(),
      },
    });

  return next;
}

export async function getAiHistory(
  userId: string,
  scopeId: string,
  limit = MAX_STORED_MESSAGES_PER_SCOPE,
): Promise<AIConversationMessage[]> {
  const rows = await db
    .select({
      role: aiMessagesTable.role,
      content: aiMessagesTable.content,
    })
    .from(aiMessagesTable)
    .where(
      and(
        eq(aiMessagesTable.userId, userId),
        eq(aiMessagesTable.scopeId, scopeId),
      ),
    )
    .orderBy(desc(aiMessagesTable.id))
    .limit(limit);

  return rows
    .reverse()
    .filter(
      (row): row is { role: "user" | "assistant"; content: string } =>
        row.role === "user" || row.role === "assistant",
    );
}

export async function saveAiTurn(
  userId: string,
  scopeId: string,
  prompt: string,
  response: string,
): Promise<void> {
  await db.insert(aiMessagesTable).values([
    { userId, scopeId, role: "user", content: prompt },
    { userId, scopeId, role: "assistant", content: response },
  ]);
  await db
    .insert(aiUserSettingsTable)
    .values({ userId, totalRequests: 1 })
    .onConflictDoUpdate({
      target: aiUserSettingsTable.userId,
      set: {
        totalRequests: sql`${aiUserSettingsTable.totalRequests} + 1`,
        updatedAt: new Date(),
      },
    });

  const retained = await db
    .select({ id: aiMessagesTable.id })
    .from(aiMessagesTable)
    .where(
      and(
        eq(aiMessagesTable.userId, userId),
        eq(aiMessagesTable.scopeId, scopeId),
      ),
    )
    .orderBy(desc(aiMessagesTable.id))
    .limit(MAX_STORED_MESSAGES_PER_SCOPE);

  if (retained.length > 0) {
    await db
      .delete(aiMessagesTable)
      .where(
        and(
          eq(aiMessagesTable.userId, userId),
          eq(aiMessagesTable.scopeId, scopeId),
          notInArray(
            aiMessagesTable.id,
            retained.map((message) => message.id),
          ),
        ),
      );
  }
}

export async function clearAiHistory(
  userId: string,
  scopeId?: string,
): Promise<void> {
  await db
    .delete(aiMessagesTable)
    .where(
      scopeId
        ? and(
            eq(aiMessagesTable.userId, userId),
            eq(aiMessagesTable.scopeId, scopeId),
          )
        : eq(aiMessagesTable.userId, userId),
    );
}

export async function getAiUserStats(userId: string): Promise<number> {
  const [settings] = await db
    .select({ totalRequests: aiUserSettingsTable.totalRequests })
    .from(aiUserSettingsTable)
    .where(eq(aiUserSettingsTable.userId, userId))
    .limit(1);
  return settings?.totalRequests ?? 0;
}

export async function resetAiUser(userId: string): Promise<void> {
  await clearAiHistory(userId);
  await db
    .delete(aiUserSettingsTable)
    .where(eq(aiUserSettingsTable.userId, userId));
}
