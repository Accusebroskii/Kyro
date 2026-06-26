import { GuildMember, PartialGuildMember, TextChannel, EmbedBuilder } from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

export async function onGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const guildId = member.guild.id;
  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);
    if (!config?.logChannelId) return;

    const logChannel = member.guild.channels.cache.get(
      config.logChannelId,
    ) as TextChannel | undefined;
    if (!logChannel) return;

    const joinedTimestamp = member.joinedTimestamp;
    const roles = member.roles.cache
      .filter((r) => r.id !== member.guild.roles.everyone.id)
      .map((r) => r.name);

    const embed = new EmbedBuilder()
      .setTitle("📤 Member Left")
      .setColor(0xed4245)
      .setThumbnail(member.user?.displayAvatarURL() ?? null)
      .addFields(
        { name: "User", value: `${member.user?.tag ?? "Unknown"} (<@${member.id}>)`, inline: true },
        {
          name: "Joined",
          value: joinedTimestamp ? `<t:${Math.floor(joinedTimestamp / 1000)}:R>` : "Unknown",
          inline: true,
        },
        { name: "Member Count", value: String(member.guild.memberCount), inline: true },
        ...(roles.length
          ? [{ name: "Roles", value: roles.slice(0, 20).join(", ") || "None" }]
          : []),
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch((err) =>
      logger.warn({ err }, "Failed to send leave log"),
    );
  } catch (err) {
    logger.error({ err, guildId }, "Error in guildMemberRemove");
  }
}