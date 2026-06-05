import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { db, modLogsTable, warningsTable, guildConfigTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { checkModerator } from "../lib/permissions.js";
import { successEmbed, errorEmbed, modEmbed } from "../lib/embeds.js";
import { logger } from "../../lib/logger.js";

export const banCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for ban"))
    .addIntegerOption((o) => o.setName("delete_days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    try {
      await interaction.guild!.members.ban(target.id, { reason, deleteMessageDays: deleteDays });
      await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "ban", targetId: target.id, targetTag: target.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason });
      await interaction.reply({ embeds: [modEmbed("Ban", target.tag, interaction.user.tag, reason)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(`Could not ban ${target.tag}: ${String(err)}`)], ephemeral: true });
    }
  },
};

export const kickCommand = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption((o) => o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for kick"))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getMember("user") as GuildMember;
    if (!target) { await interaction.reply({ embeds: [errorEmbed("User not found in this server.")], ephemeral: true }); return; }
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    try {
      await target.kick(reason);
      await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "kick", targetId: target.id, targetTag: target.user.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason });
      await interaction.reply({ embeds: [modEmbed("Kick", target.user.tag, interaction.user.tag, reason)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(`Could not kick: ${String(err)}`)], ephemeral: true });
    }
  },
};

export const muteCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a member (timeout) for a duration")
    .addUserOption((o) => o.setName("user").setDescription("User to mute").setRequired(true))
    .addIntegerOption((o) => o.setName("duration").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName("reason").setDescription("Reason"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getMember("user") as GuildMember;
    if (!target) { await interaction.reply({ embeds: [errorEmbed("User not found.")], ephemeral: true }); return; }
    const mins = interaction.options.getInteger("duration", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    try {
      await target.timeout(mins * 60 * 1000, reason);
      await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "mute", targetId: target.id, targetTag: target.user.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason, duration: `${mins}m` });
      await interaction.reply({ embeds: [modEmbed("Mute", target.user.tag, interaction.user.tag, reason, { Duration: `${mins} minutes` })] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(String(err))], ephemeral: true });
    }
  },
};

export const unmuteCommand = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove a timeout from a member")
    .addUserOption((o) => o.setName("user").setDescription("User to unmute").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getMember("user") as GuildMember;
    if (!target) { await interaction.reply({ embeds: [errorEmbed("User not found.")], ephemeral: true }); return; }
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    await target.timeout(null, reason);
    await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "unmute", targetId: target.id, targetTag: target.user.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason });
    await interaction.reply({ embeds: [successEmbed("Unmuted", `${target.user.tag} has been unmuted.`)] });
  },
};

export const warnCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption((o) => o.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const guildId = interaction.guildId!;
    await db.insert(warningsTable).values({ guildId, userId: target.id, userTag: target.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason });
    await db.insert(modLogsTable).values({ guildId, action: "warn", targetId: target.id, targetTag: target.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason });

    const [{ value: warnCount }] = await db.select({ value: count() }).from(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, target.id), eq(warningsTable.active, true)));
    const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
    const max = config?.maxWarnings ?? 3;

    await interaction.reply({ embeds: [modEmbed("Warning", target.tag, interaction.user.tag, reason, { "Total Warnings": `${warnCount}/${max}` })] });

    if (warnCount >= max) {
      const member = interaction.options.getMember("user") as GuildMember | null;
      if (member) {
        await member.timeout(10 * 60 * 1000, `Auto-mute: reached ${max} warnings`).catch(() => {});
        await interaction.followUp({ content: `⚠️ ${target.tag} has reached ${max} warnings and has been automatically muted for 10 minutes.` });
      }
    }
  },
};

export const warningsCommand = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings for a user")
    .addUserOption((o) => o.setName("user").setDescription("User to check").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user", true);
    const warns = await db.select().from(warningsTable).where(and(eq(warningsTable.guildId, interaction.guildId!), eq(warningsTable.userId, target.id)));
    if (warns.length === 0) {
      await interaction.reply({ embeds: [successEmbed("No Warnings", `${target.tag} has no warnings.`)] });
      return;
    }
    const { EmbedBuilder } = await import("discord.js");
    const embed = new EmbedBuilder().setTitle(`⚠️ Warnings for ${target.tag}`).setColor(0xfee75c).setDescription(
      warns.map((w, i) => `**${i + 1}.** ${w.reason}\n↳ By: ${w.moderatorTag} | ${w.active ? "Active" : "Cleared"} | <t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`).join("\n\n")
    ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

export const clearwarningsCommand = {
  data: new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear all warnings for a user")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getUser("user", true);
    await db.update(warningsTable).set({ active: false }).where(and(eq(warningsTable.guildId, interaction.guildId!), eq(warningsTable.userId, target.id)));
    await interaction.reply({ embeds: [successEmbed("Warnings Cleared", `All warnings cleared for ${target.tag}.`)] });
  },
};

export const timeoutCommand = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addIntegerOption((o) => o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName("reason").setDescription("Reason"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getMember("user") as GuildMember;
    if (!target) { await interaction.reply({ embeds: [errorEmbed("User not found.")], ephemeral: true }); return; }
    const mins = interaction.options.getInteger("minutes", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    await target.timeout(mins * 60 * 1000, reason);
    await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "timeout", targetId: target.id, targetTag: target.user.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason, duration: `${mins}m` });
    await interaction.reply({ embeds: [modEmbed("Timeout", target.user.tag, interaction.user.tag, reason, { Duration: `${mins} minutes` })] });
  },
};

export const untimeoutCommand = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout from a member")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getMember("user") as GuildMember;
    if (!target) { await interaction.reply({ embeds: [errorEmbed("User not found.")], ephemeral: true }); return; }
    await target.timeout(null);
    await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "untimeout", targetId: target.id, targetTag: target.user.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag });
    await interaction.reply({ embeds: [successEmbed("Timeout Removed", `Timeout removed from ${target.user.tag}.`)] });
  },
};

export const purgeCommand = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages in this channel")
    .addIntegerOption((o) => o.setName("amount").setDescription("Number of messages to delete (1–100)").setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const amount = interaction.options.getInteger("amount", true);
    const filterUser = interaction.options.getUser("user");
    await interaction.deferReply({ ephemeral: true });
    const { TextChannel } = await import("discord.js");
    const channel = interaction.channel;
    if (!(channel instanceof TextChannel)) { await interaction.editReply("This command can only be used in text channels."); return; }
    const messages = await channel.messages.fetch({ limit: amount });
    const toDelete = filterUser ? messages.filter((m) => m.author.id === filterUser.id) : messages;
    const deleted = await channel.bulkDelete(toDelete, true);
    await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "purge", targetId: channel.id, targetTag: `#${channel.name}`, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason: `Purged ${deleted.size} messages` });
    await interaction.editReply(`Deleted ${deleted.size} messages.`);
  },
};
