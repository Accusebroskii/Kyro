import { Router, type IRouter } from "express";
import { db, reportsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/guilds/:guildId/reports", async (req, res) => {
  const { guildId } = req.params;
  const type = req.query["type"] as string | undefined;
  const status = req.query["status"] as string | undefined;
  const conditions = [eq(reportsTable.guildId, guildId)];
  if (type) conditions.push(eq(reportsTable.type, type));
  if (status) conditions.push(eq(reportsTable.status, status));
  const reports = await db.select().from(reportsTable).where(and(...conditions)).orderBy(desc(reportsTable.createdAt));
  res.json(reports);
});

router.get("/guilds/:guildId/reports/:id", async (req, res) => {
  const id = parseInt(req.params["id"]!, 10);
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id)).limit(1);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  res.json(report);
});

router.patch("/guilds/:guildId/reports/:id", async (req, res) => {
  const id = parseInt(req.params["id"]!, 10);
  const { status, assignedTo, resolution, priority } = req.body as { status?: string; assignedTo?: string; resolution?: string; priority?: string };
  const updates: Record<string, unknown> = {};
  if (status) updates["status"] = status;
  if (assignedTo) updates["assignedTo"] = assignedTo;
  if (resolution) updates["resolution"] = resolution;
  if (priority) updates["priority"] = priority;
  await db.update(reportsTable).set(updates).where(eq(reportsTable.id, id));
  res.json({ success: true });
});

export default router;
