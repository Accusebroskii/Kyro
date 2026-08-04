import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  TextChannel,
} from "discord.js";
import { db, userLevelsTable, levelRoleRewardsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { infoEmbed, errorEmbed } from "../lib/embeds.js";

// Standard MEE6-style XP curve: total XP needed to reach a given level
export function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

const XP_COOLDOWN_MS = 60_000; // 1 message-XP-gain per 60s per user
const XP_MIN = 15;
const XP_MAX = 25;

/**
 * Call this from messageCreate. Awards XP (with cooldown), and handles level-up
 * announcements + role rewards if the user leveled up.
 */
export async function handleMessageXp(member: GuildMember, channel: TextChannel): Promise<void> {
  const guildId = member.guild.id;
  const userId = member.id;

  const [existing] = await db.select().from(userLevelsTable).where(and(eq(userLevelsTable.guildId, guildId), eq(userLevelsTable.userId, userId))).limit(1);

  const now = new Date();
  if (existing?.lastMessageAt && now.getTime() - new Date(existing.lastMessageAt).getTime() < XP_COOLDOWN_MS) {
    return; // still on cooldown
  }

  const gained = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const newXp = (existing?.xp ?? 0) + gained;
  const oldLevel = existing?.level ?? 0;
  const newLevel = levelFromXp(newXp);

  if (existing) {
    await db.update(userLevelsTable).set({ xp: newXp, level: newLevel, lastMessageAt: now }).where(eq(userLevelsTable.id, existing.id));
  } else {
    await db.insert(userLevelsTable).values({ guildId, userId, xp: newXp, level: newLevel, lastMessageAt: now });
  }

  if (newLevel > oldLevel) {
    channel.send(`🎉 <@${userId}> leveled up to **Level ${newLevel}**!`).catch(() => {});

    // Apply any role rewards for levels reached
    const rewards = await db.select().from(levelRoleRewardsTable).where(eq(levelRoleRewardsTable.guildId, guildId));
    for (const reward of rewards) {
      if (reward.level <= newLevel && !member.roles.cache.has(reward.roleId)) {
        await member.roles.add(reward.roleId).catch(() => {});
      }
    }
  }
}

export const rankCommand = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your or someone else's level and XP")
    .addUserOption((o) => o.setName("user").setDescription("User to check (defaults to you)")),

  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId!;

    const [row] = await db.select().from(userLevelsTable).where(and(eq(userLevelsTable.guildId, guildId), eq(userLevelsTable.userId, target.id))).limit(1);
    if (!row) {
      await interaction.reply({ embeds: [infoEmbed("Rank", `${target.id === interaction.user.id ? "You haven't" : `${target.username} hasn't`} sent any messages yet.`)], ephemeral: true });
      return;
    }

    const currentLevelXp = xpForLevel(row.level);
    const nextLevelXp = xpForLevel(row.level + 1);
    const progress = row.xp - currentLevelXp;
    const needed = nextLevelXp - currentLevelXp;

    const embed = new EmbedBuilder()
      .setTitle(`📊 Rank — ${target.username}`)
      .setColor(0x5865f2)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Level", value: String(row.level), inline: true },
        { name: "Total XP", value: String(row.xp), inline: true },
        { name: "Progress to Next Level", value: `${progress} / ${needed} XP`, inline: false },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server XP leaderboard"),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const top = await db.select().from(userLevelsTable).where(eq(userLevelsTable.guildId, guildId)).orderBy(desc(userLevelsTable.xp)).limit(10);

    if (!top.length) {
      await interaction.reply({ embeds: [infoEmbed("Leaderboard", "No one has earned XP yet.")] });
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const list = top.map((row, i) => `${medals[i] ?? `**${i + 1}.**`} <@${row.userId}> — Level ${row.level} (${row.xp} XP)`).join("\n");

    await interaction.reply({ embeds: [infoEmbed("🏆 Leaderboard", list)] });
  },
};