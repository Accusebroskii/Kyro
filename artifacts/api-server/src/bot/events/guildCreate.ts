import { Guild } from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

export async function onGuildCreate(guild: Guild): Promise<void> {
  logger.info({ guildId: guild.id, name: guild.name }, "Bot joined a new guild");
  try {
    const existing = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guild.id))
      .limit(1);

    if (!existing[0]) {
      await db.insert(guildConfigTable).values({
        guildId: guild.id,
        guildName: guild.name,
        guildIconUrl: guild.iconURL(),
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      });
      logger.info({ guildId: guild.id }, "Created guild config");
    }
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "Error creating guild config");
  }
}
