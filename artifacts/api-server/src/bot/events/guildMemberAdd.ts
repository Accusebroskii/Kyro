import { AttachmentBuilder, GuildMember, TextChannel, EmbedBuilder } from "discord.js";
import { db, guildConfigTable, autoRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { generateWelcomeCard, renderWelcomeMessage } from "../lib/welcomeCard.js";

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  const guildId = member.guild.id;
  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);
    if (!config) return;

    // Join log
    if (config.logChannelId) {
      const logChannel = member.guild.channels.cache.get(
        config.logChannelId,
      ) as TextChannel | undefined;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("📥 Member Joined")
          .setColor(0x57f287)
          .setThumbnail(member.user.displayAvatarURL())
          .addFields(
            { name: "User", value: `<@${member.id}> (${member.user.username})`, inline: true },
            { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: "Member Count", value: String(member.guild.memberCount), inline: true },
          )
          .setFooter({ text: `User ID: ${member.id}` })
          .setTimestamp();
        logChannel.send({ embeds: [embed] }).catch((err) =>
          logger.warn({ err }, "Failed to send join log"),
        );
      }
    }

    // Verification: lock new members to the unverified role
    if (config.verificationEnabled && config.unverifiedRoleId) {
      const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole).catch((err) =>
          logger.warn({ err }, "Failed to assign unverified role on join"),
        );
      }
    }

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
    // Welcome card and message
    if (config.welcomeChannelId) {
      const channel = member.guild.channels.cache.get(config.welcomeChannelId) as TextChannel | undefined;
      if (channel) {
        const msg = renderWelcomeMessage(member, config.welcomeMessage);
        try {
          const card = await generateWelcomeCard(member, config);
          const attachment = new AttachmentBuilder(card, { name: "welcome-card.png" });
          const accent = config.welcomeAccentColor ?? "#9b59b6";
          const embedColor = /^#[0-9a-f]{6}$/i.test(accent)
            ? parseInt(accent.slice(1), 16)
            : 0x9b59b6;
          await channel.send({
            content: msg,
            embeds: [
              new EmbedBuilder()
                .setColor(embedColor)
                .setDescription(msg)
                .setImage("attachment://welcome-card.png")
                .setFooter({ text: `${member.guild.name} • Welcome` }),
            ],
            files: [attachment],
          });
        } catch (err) {
          logger.warn({ err, guildId }, "Welcome card generation failed; sending text fallback");
          await channel.send(msg).catch((sendErr) =>
            logger.warn({ err: sendErr, guildId }, "Failed to send welcome fallback"),
          );
        }
      }
    }
  } catch (err) {
    logger.error({ err, guildId }, "Error in guildMemberAdd");
  }
}