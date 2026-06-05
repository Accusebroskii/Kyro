import { GuildMember, TextChannel } from "discord.js";
import { db, guildConfigTable, autoRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  const guildId = member.guild.id;

  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);

    if (!config) return;

    // Auto-roles
    const roles = await db
      .select()
      .from(autoRolesTable)
      .where(eq(autoRolesTable.guildId, guildId));

    for (const ar of roles) {
      try {
        const role = member.guild.roles.cache.get(ar.roleId);
        if (role) await member.roles.add(role);
      } catch (err) {
        logger.warn({ err, roleId: ar.roleId }, "Failed to assign auto-role");
      }
    }

    // Welcome message
    if (config.welcomeChannelId) {
      const channel = member.guild.channels.cache.get(config.welcomeChannelId) as TextChannel | undefined;
      if (channel) {
        const msg = (config.welcomeMessage ?? "Welcome to **{server}**, {user}!")
          .replace("{user}", `<@${member.id}>`)
          .replace("{username}", member.user.username)
          .replace("{server}", member.guild.name)
          .replace("{membercount}", String(member.guild.memberCount));
        channel.send(msg).catch((err) => logger.warn({ err }, "Failed to send welcome message"));
      }
    }
  } catch (err) {
    logger.error({ err, guildId }, "Error in guildMemberAdd");
  }
}
