import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  TextChannel,
  ChannelType,
} from "discord.js";
import { db, modLogsTable, guildConfigTable, remindersTable } from "@workspace/db";
import { eq, and, desc, lte } from "drizzle-orm";
import { checkModerator } from "../lib/permissions.js";
import { successEmbed, errorEmbed, infoEmbed, modEmbed } from "../lib/embeds.js";
import { snipeCache } from "../lib/snipeCache.js";
import { logger } from "../../lib/logger.js";

export { snipeCache };

// ─── /unban ───────────────────────────────────────────────────────────────────
export const unbanCommand = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from the server")
    .addStringOption((o) => o.setName("user_id").setDescription("User ID to unban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for unban"))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const userId = interaction.options.getString("user_id", true).trim();
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    try {
      const bans = await interaction.guild!.bans.fetch();
      const ban = bans.get(userId);
      if (!ban) {
        await interaction.reply({ embeds: [errorEmbed("No ban found for that user ID.")], ephemeral: true });
        return;
      }
      await interaction.guild!.members.unban(userId, reason);
      await db.insert(modLogsTable).values({
        guildId: interaction.guildId!,
        action: "unban",
        targetId: userId,
        targetTag: ban.user.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
      });
      await interaction.reply({ embeds: [modEmbed("Unban", ban.user.tag, interaction.user.tag, reason)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(`Could not unban: ${String(err)}`)], ephemeral: true });
    }
  },
};

// ─── /modlogs ─────────────────────────────────────────────────────────────────
export const modlogsCommand = {
  data: new SlashCommandBuilder()
    .setName("modlogs")
    .setDescription("View moderation history for a user")
    .addUserOption((o) => o.setName("user").setDescription("User to check").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getUser("user", true);
    const logs = await db
      .select()
      .from(modLogsTable)
      .where(and(eq(modLogsTable.guildId, interaction.guildId!), eq(modLogsTable.targetId, target.id)))
      .orderBy(desc(modLogsTable.createdAt))
      .limit(15);

    if (logs.length === 0) {
      await interaction.reply({
        embeds: [infoEmbed(`📋 Mod Logs — ${target.tag}`, "No moderation history found for this user.")],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Mod Logs — ${target.tag}`)
      .setColor(0xff6b35)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(
        logs
          .map(
            (l, i) =>
              `**${i + 1}.** \`${l.action.toUpperCase()}\`${l.duration ? ` (${l.duration})` : ""}\n↳ By: ${l.moderatorTag} | <t:${Math.floor(new Date(l.createdAt).getTime() / 1000)}:R>\n↳ Reason: ${l.reason ?? "None"}`,
          )
          .join("\n\n"),
      )
      .setFooter({ text: `Showing last ${logs.length} entries` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /snipe ───────────────────────────────────────────────────────────────────
export const snipeCommand = {
  data: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("See the last deleted message in this channel"),
  async execute(interaction: ChatInputCommandInteraction) {
    const cached = snipeCache.get(interaction.channelId);
    if (!cached) {
      await interaction.reply({
        embeds: [infoEmbed("🔍 Snipe", "No recently deleted messages found in this channel.")],
        ephemeral: true,
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("🔍 Sniped Message")
      .setColor(0x5865f2)
      .setDescription(cached.content)
      .setAuthor({ name: cached.authorTag, iconURL: cached.authorAvatar ?? undefined })
      .setTimestamp(cached.timestamp);
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /move ────────────────────────────────────────────────────────────────────
export const moveCommand = {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a user to another voice channel")
    .addUserOption((o) => o.setName("user").setDescription("User to move").setRequired(true))
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Destination voice channel")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getMember("user") as GuildMember;
    const channel = interaction.options.getChannel("channel", true);
    if (!target) {
      await interaction.reply({ embeds: [errorEmbed("User not found.")], ephemeral: true });
      return;
    }
    if (!target.voice.channel) {
      await interaction.reply({
        embeds: [errorEmbed("That user is not currently in a voice channel.")],
        ephemeral: true,
      });
      return;
    }
    try {
      await target.voice.setChannel(channel.id);
      await interaction.reply({
        embeds: [successEmbed("Moved", `${target.user.tag} has been moved to <#${channel.id}>.`)],
      });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(`Could not move user: ${String(err)}`)], ephemeral: true });
    }
  },
};

// ─── /suggest ─────────────────────────────────────────────────────────────────
export const suggestCommand = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion to the server")
    .addStringOption((o) =>
      o
        .setName("suggestion")
        .setDescription("Your suggestion")
        .setRequired(true)
        .setMaxLength(1000),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const suggestion = interaction.options.getString("suggestion", true);
    const guildId = interaction.guildId!;
    const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
    if (!config?.suggestionsChannelId) {
      await interaction.reply({
        embeds: [errorEmbed("Suggestions are not set up. Ask an admin to run `/setup suggestions`.")],
        ephemeral: true,
      });
      return;
    }
    const channel = interaction.guild!.channels.cache.get(config.suggestionsChannelId) as TextChannel | undefined;
    if (!channel) {
      await interaction.reply({
        embeds: [errorEmbed("The suggestions channel no longer exists. Please contact an admin.")],
        ephemeral: true,
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("💡 New Suggestion")
      .setDescription(suggestion)
      .setColor(0x5865f2)
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setFooter({ text: `User ID: ${interaction.user.id}` })
      .setTimestamp();
    const msg = await channel.send({ embeds: [embed] });
    await msg.react("👍").catch(() => {});
    await msg.react("👎").catch(() => {});
    await interaction.reply({
      embeds: [successEmbed("Suggestion Submitted", `Your suggestion has been posted in <#${channel.id}>!`)],
      ephemeral: true,
    });
  },
};

// ─── /remindme ────────────────────────────────────────────────────────────────
export const remindmeCommand = {
  data: new SlashCommandBuilder()
    .setName("remindme")
    .setDescription("Set a reminder")
    .addStringOption((o) =>
      o
        .setName("time")
        .setDescription("When to remind you (e.g. 10m, 2h, 1d)")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("message")
        .setDescription("What to remind you about")
        .setRequired(true)
        .setMaxLength(500),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const timeStr = interaction.options.getString("time", true);
    const message = interaction.options.getString("message", true);

    const match = timeStr.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid time format. Examples: `30s`, `10m`, `2h`, `1d`")],
        ephemeral: true,
      });
      return;
    }
    const amount = parseInt(match[1]!);
    const unit = match[2]!.toLowerCase();
    const msMap: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const ms = amount * msMap[unit]!;
    if (ms > 7 * 86_400_000) {
      await interaction.reply({
        embeds: [errorEmbed("Reminders can be set at most 7 days from now.")],
        ephemeral: true,
      });
      return;
    }
    const remindAt = new Date(Date.now() + ms);
    await db.insert(remindersTable).values({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      message,
      remindAt,
    });
    const ts = Math.floor(remindAt.getTime() / 1000);
    await interaction.reply({
      embeds: [successEmbed("⏰ Reminder Set", `I'll remind you <t:${ts}:R>!\n\n**Message:** ${message}`)],
      ephemeral: true,
    });
  },
};

// Export reminder delivery helper for bot startup
export async function deliverDueReminders(client: import("discord.js").Client): Promise<void> {
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(remindersTable)
      .where(and(eq(remindersTable.delivered, false), lte(remindersTable.remindAt, now)));

    for (const reminder of due) {
      await db.update(remindersTable).set({ delivered: true }).where(eq(remindersTable.id, reminder.id));
      try {
        const channel = client.channels.cache.get(reminder.channelId) as TextChannel | null;
        if (channel) {
          await channel.send({
            content: `⏰ <@${reminder.userId}> Reminder: **${reminder.message}**`,
          });
        } else {
          const user = await client.users.fetch(reminder.userId).catch(() => null);
          if (user) await user.send(`⏰ **Reminder:** ${reminder.message}`).catch(() => {});
        }
      } catch (e) {
        logger.warn({ e }, "Failed to deliver reminder");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error checking reminders");
  }
}
