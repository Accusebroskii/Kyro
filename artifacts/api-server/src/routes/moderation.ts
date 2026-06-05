import { Router, type IRouter } from "express";
import { db, modLogsTable, warningsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/guilds/:guildId/mod-logs", async (req, res) => {
  const { guildId } = req.params;
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "50", 10), 200);
  const offset = parseInt(req.query["offset"] as string ?? "0", 10);
  const logs = await db.select().from(modLogsTable)
    .where(eq(modLogsTable.guildId, guildId))
    .orderBy(desc(modLogsTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(logs);
});

router.get("/guilds/:guildId/warnings", async (req, res) => {
  const { guildId } = req.params;
  const userId = req.query["userId"] as string | undefined;
  const activeOnly = req.query["active"] !== "false";
  const conditions = [eq(warningsTable.guildId, guildId)];
  if (userId) conditions.push(eq(warningsTable.userId, userId));
  if (activeOnly) conditions.push(eq(warningsTable.active, true));
  const warns = await db.select().from(warningsTable).where(and(...conditions)).orderBy(desc(warningsTable.createdAt));
  res.json(warns);
});

router.patch("/guilds/:guildId/warnings/:id", async (req, res) => {
  const id = parseInt(req.params["id"]!, 10);
  const { active } = req.body as { active: boolean };
  await db.update(warningsTable).set({ active }).where(eq(warningsTable.id, id));
  res.json({ success: true });
});

export default router;
