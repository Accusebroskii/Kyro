import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import guildsRouter from "./guilds.js";
import moderationRouter from "./moderation.js";
import ticketsRouter from "./tickets.js";
import modmailRouter from "./modmail.js";
import reportsRouter from "./reports.js";
import configRouter from "./config.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(guildsRouter);
router.use(moderationRouter);
router.use(ticketsRouter);
router.use(modmailRouter);
router.use(reportsRouter);
router.use(configRouter);

export default router;
