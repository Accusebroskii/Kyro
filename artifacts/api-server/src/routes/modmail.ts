import { Router, type IRouter } from "express";
import { db, modmailTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/guilds/:guildId/modmail", async (req, res) => {
  const { guildId } = req.params;
  const status = req.query["status"] as string | undefined;
  const conditions = [eq(modmailTable.guildId, guildId)];
  if (status) conditions.push(eq(modmailTable.status, status));
  const threads = await db.select().from(modmailTable).where(and(...conditions)).orderBy(desc(modmailTable.createdAt));
  res.json(threads);
});

router.get("/guilds/:guildId/modmail/:id", async (req, res) => {
  const id = parseInt(req.params["id"]!, 10);
  const [thread] = await db.select().from(modmailTable).where(eq(modmailTable.id, id)).limit(1);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  res.json(thread);
});

export default router;
