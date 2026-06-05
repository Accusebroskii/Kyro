import { Router, type IRouter } from "express";
import { db, guildConfigTable, modLogsTable, warningsTable, ticketsTable, modmailTable, reportsTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { botClient } from "../bot/index.js";

const router: IRouter = Router();

router.get("/guilds", async (req, res) => {
  const guilds = await db.select().from(guildConfigTable).orderBy(guildConfigTable.guildName);
  const client = botClient;
  const enriched = guilds.map((g) => {
    const guild = client?.guilds.cache.get(g.guildId);
    return {
      ...g,
      memberCount: guild?.memberCount ?? g.memberCount ?? 0,
      guildIconUrl: guild?.iconURL() ?? g.guildIconUrl ?? null,
    };
  });
  res.json(enriched);
});

router.get("/guilds/:guildId", async (req, res) => {
  const { guildId } = req.params;
  const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
  if (!config) { res.status(404).json({ error: "Guild not found" }); return; }
  const client = botClient;
  const guild = client?.guilds.cache.get(guildId);
  res.json({ ...config, memberCount: guild?.memberCount ?? config.memberCount ?? 0, guildIconUrl: guild?.iconURL() ?? config.guildIconUrl ?? null });
});

router.get("/guilds/:guildId/stats", async (req, res) => {
  const { guildId } = req.params;
  const [totalWarnings] = await db.select({ value: count() }).from(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.active, true)));
  const [totalBans] = await db.select({ value: count() }).from(modLogsTable).where(and(eq(modLogsTable.guildId, guildId), eq(modLogsTable.action, "ban")));
  const [totalMutes] = await db.select({ value: count() }).from(modLogsTable).where(and(eq(modLogsTable.guildId, guildId), eq(modLogsTable.action, "mute")));
  const [openTickets] = await db.select({ value: count() }).from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.status, "open")));
  const [openModmail] = await db.select({ value: count() }).from(modmailTable).where(and(eq(modmailTable.guildId, guildId), eq(modmailTable.status, "open")));
  const [openReports] = await db.select({ value: count() }).from(reportsTable).where(and(eq(reportsTable.guildId, guildId), eq(reportsTable.status, "open")));
  const recentLogs = await db.select().from(modLogsTable).where(eq(modLogsTable.guildId, guildId)).orderBy(modLogsTable.createdAt).limit(10);

  res.json({
    warnings: totalWarnings?.value ?? 0,
    bans: totalBans?.value ?? 0,
    mutes: totalMutes?.value ?? 0,
    openTickets: openTickets?.value ?? 0,
    openModmail: openModmail?.value ?? 0,
    openReports: openReports?.value ?? 0,
    recentActions: recentLogs,
  });
});

export default router;
