import { Router, type IRouter } from "express";
import { botClient, botStartTime } from "../bot/index.js";

const router: IRouter = Router();

router.get("/bot/status", (_req, res) => {
  const client = botClient;
  if (!client?.isReady()) {
    res.json({ online: false, tag: null, avatarUrl: null, guilds: 0, users: 0, uptime: 0, latency: 0 });
    return;
  }
  const totalUsers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
  res.json({
    online: true,
    tag: client.user?.tag ?? null,
    avatarUrl: client.user?.displayAvatarURL() ?? null,
    guilds: client.guilds.cache.size,
    users: totalUsers,
    uptime: Math.floor((Date.now() - botStartTime) / 1000),
    latency: client.ws.ping,
  });
});

export default router;
