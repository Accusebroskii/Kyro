import { Router, type IRouter } from "express";
import { db, ticketsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/guilds/:guildId/tickets", async (req, res) => {
  const { guildId } = req.params;
  const status = req.query["status"] as string | undefined;
  const conditions = [eq(ticketsTable.guildId, guildId)];
  if (status) conditions.push(eq(ticketsTable.status, status));
  const tickets = await db.select().from(ticketsTable).where(and(...conditions)).orderBy(desc(ticketsTable.createdAt));
  res.json(tickets);
});

router.get("/guilds/:guildId/tickets/:id", async (req, res) => {
  const id = parseInt(req.params["id"]!, 10);
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id)).limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(ticket);
});

export default router;
