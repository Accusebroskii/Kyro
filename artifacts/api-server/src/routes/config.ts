import { Router, type IRouter } from "express";
import { db, guildConfigTable, autoRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/guilds/:guildId/config", async (req, res) => {
  const { guildId } = req.params;
  const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
  if (!config) { res.status(404).json({ error: "Guild config not found" }); return; }
  res.json(config);
});

router.patch("/guilds/:guildId/config", async (req, res) => {
  const { guildId } = req.params;
  const allowed = ["welcomeChannelId", "welcomeMessage", "logChannelId", "modLogChannelId", "ticketCategoryId", "ticketLogChannelId", "modmailForumId", "muteRoleId", "modRoleId", "adminRoleId", "antispamEnabled", "antiRaidEnabled", "automodEnabled", "joinToCreateChannelId", "joinToCreateCategoryId", "maxWarnings"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (req.body as object)) updates[key] = (req.body as Record<string, unknown>)[key];
  }
  await db.update(guildConfigTable).set(updates).where(eq(guildConfigTable.guildId, guildId));
  res.json({ success: true });
});

router.get("/guilds/:guildId/auto-roles", async (req, res) => {
  const { guildId } = req.params;
  const roles = await db.select().from(autoRolesTable).where(eq(autoRolesTable.guildId, guildId));
  res.json(roles);
});

export default router;
