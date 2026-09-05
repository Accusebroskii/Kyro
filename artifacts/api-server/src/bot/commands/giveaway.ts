import { MessageFlags } from "discord.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  TextChannel,
  Client,
} from "discord.js";
import { db, giveawaysTable, giveawayEntriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { checkModerator } from "../lib/permissions.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";

function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

function giveawayEmbed(prize: string, endsAt: Date, hostedBy: string, entryCount: number, winnersCount: number) {
  return new EmbedBuilder()
    .setTitle(`🎉 ${prize}`)
    .setColor(0xf1c40f)
    .setDescription(
      `Click the button below to enter!\n\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n**Hosted by:** <@${hostedBy}>\n**Winners:** ${winnersCount}\n**Entries:** ${entryCount}`,
    )
    .setFooter({ text: "Good luck!" })
    .setTimestamp(endsAt);
}

function enterButton(giveawayId: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter:${giveawayId}`)
      .setLabel("🎉 Enter Giveaway")
      .setStyle(ButtonStyle.Success),
  );
}

export async function endGiveaway(giveawayId: number, client: Client): Promise<void> {
  const [giveaway] = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, giveawayId)).limit(1);
  if (!giveaway || giveaway.ended) return;

  const entries = await db.select().from(giveawayEntriesTable).where(eq(giveawayEntriesTable.giveawayId, giveawayId));

  let winnerIds: string[] = [];
  if (entries.length > 0) {
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    winnerIds = shuffled.slice(0, giveaway.winnersCount).map((e) => e.userId);
  }

  await db.update(giveawaysTable).set({ ended: true, winnerIds }).where(eq(giveawaysTable.id, giveawayId));

  try {
    const guild = client.guilds.cache.get(giveaway.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(giveaway.channelId) as TextChannel;
    if (!channel) return;

    if (giveaway.messageId) {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg) {
        const endedEmbed = new EmbedBuilder()
          .setTitle(`🎉 ${giveaway.prize}`)
          .setColor(0x95a5a6)
          .setDescription(
            `**Giveaway ended!**\n\n**Winners:** ${winnerIds.length > 0 ? winnerIds.map((id) => `<@${id}>`).join(", ") : "No valid entries"}\n**Hosted by:** <@${giveaway.hostedBy}>\n**Entries:** ${entries.length}`,
          )
          .setFooter({ text: "Giveaway ended" })
          .setTimestamp();
        await msg.edit({ embeds: [endedEmbed], components: [] }).catch(() => {});
      }
    }

    if (winnerIds.length > 0) {
      await channel.send(`🎉 Congratulations ${winnerIds.map((id) => `<@${id}>`).join(", ")}! You won **${giveaway.prize}**!`);
    } else {
      await channel.send(`😔 No one entered the giveaway for **${giveaway.prize}**.`);
    }
  } catch {
    // ignore
  }
}

// Schedule all active giveaways on bot startup
export async function scheduleActiveGiveaways(client: Client): Promise<void> {
  const active = await db.select().from(giveawaysTable).where(eq(giveawaysTable.ended, false));
  const now = Date.now();
  for (const giveaway of active) {
    const delay = new Date(giveaway.endsAt).getTime() - now;
    if (delay <= 0) {
      await endGiveaway(giveaway.id, client);
    } else {
      setTimeout(() => endGiveaway(giveaway.id, client), delay);
    }
  }
}

export const giveawayCommand = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .addSubcommand((s) =>
      s.setName("start").setDescription("Start a new giveaway")
        .addStringOption((o) => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
        .addStringOption((o) => o.setName("duration").setDescription("Duration e.g. 1h, 30m, 1d").setRequired(true))
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to post in").setRequired(true))
        .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(20)),
    )
    .addSubcommand((s) =>
      s.setName("end").setDescription("End a giveaway early")
        .addIntegerOption((o) => o.setName("id").setDescription("Giveaway ID").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("reroll").setDescription("Reroll winners for a ended giveaway")
        .addIntegerOption((o) => o.setName("id").setDescription("Giveaway ID").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List active giveaways in this server"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const client = interaction.client;

    if (sub === "start") {
      const prize = interaction.options.getString("prize", true);
      const durationStr = interaction.options.getString("duration", true);
      const channel = interaction.options.getChannel("channel", true);
      const winnersCount = interaction.options.getInteger("winners") ?? 1;

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        await interaction.reply({ embeds: [errorEmbed("Invalid duration. Use formats like `1h`, `30m`, `2d`.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const endsAt = new Date(Date.now() + durationMs);
      const textChannel = interaction.guild!.channels.cache.get(channel.id) as TextChannel;
      if (!textChannel) {
        await interaction.reply({ embeds: [errorEmbed("Could not find that channel.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const [giveaway] = await db.insert(giveawaysTable).values({
        guildId, channelId: channel.id, prize, winnersCount,
        hostedBy: interaction.user.id, endsAt, ended: false,
      }).returning();

      const msg = await textChannel.send({
        embeds: [giveawayEmbed(prize, endsAt, interaction.user.id, 0, winnersCount)],
        components: [enterButton(giveaway!.id)],
      });

      await db.update(giveawaysTable).set({ messageId: msg.id }).where(eq(giveawaysTable.id, giveaway!.id));

      setTimeout(() => endGiveaway(giveaway!.id, client), durationMs);

      await interaction.reply({ embeds: [successEmbed("Giveaway Started", `Giveaway for **${prize}** started in <#${channel.id}>!\n**ID:** ${giveaway!.id}`)], flags: MessageFlags.Ephemeral });

    } else if (sub === "end") {
      const id = interaction.options.getInteger("id", true);
      const [giveaway] = await db.select().from(giveawaysTable).where(and(eq(giveawaysTable.id, id), eq(giveawaysTable.guildId, guildId))).limit(1);
      if (!giveaway) { await interaction.reply({ embeds: [errorEmbed("Giveaway not found.")], flags: MessageFlags.Ephemeral }); return; }
      if (giveaway.ended) { await interaction.reply({ embeds: [errorEmbed("This giveaway has already ended.")], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed("Ending Giveaway", "Picking winners now...")], flags: MessageFlags.Ephemeral });
      await endGiveaway(id, client);

    } else if (sub === "reroll") {
      const id = interaction.options.getInteger("id", true);
      const [giveaway] = await db.select().from(giveawaysTable).where(and(eq(giveawaysTable.id, id), eq(giveawaysTable.guildId, guildId))).limit(1);
      if (!giveaway) { await interaction.reply({ embeds: [errorEmbed("Giveaway not found.")], flags: MessageFlags.Ephemeral }); return; }
      if (!giveaway.ended) { await interaction.reply({ embeds: [errorEmbed("This giveaway hasn't ended yet.")], flags: MessageFlags.Ephemeral }); return; }

      const entries = await db.select().from(giveawayEntriesTable).where(eq(giveawayEntriesTable.giveawayId, id));
      if (entries.length === 0) { await interaction.reply({ embeds: [errorEmbed("No entries to reroll from.")], flags: MessageFlags.Ephemeral }); return; }

      const shuffled = [...entries].sort(() => Math.random() - 0.5);
      const newWinners = shuffled.slice(0, giveaway.winnersCount).map((e) => e.userId);
      await db.update(giveawaysTable).set({ winnerIds: newWinners }).where(eq(giveawaysTable.id, id));

      const channel = interaction.guild!.channels.cache.get(giveaway.channelId) as TextChannel;
      if (channel) {
        await channel.send(`🎉 Reroll! New winner(s) for **${giveaway.prize}**: ${newWinners.map((id) => `<@${id}>`).join(", ")}!`);
      }
      await interaction.reply({ embeds: [successEmbed("Rerolled", `New winners: ${newWinners.map((id) => `<@${id}>`).join(", ")}`)] });

    } else if (sub === "list") {
      const active = await db.select().from(giveawaysTable).where(and(eq(giveawaysTable.guildId, guildId), eq(giveawaysTable.ended, false)));
      if (!active.length) {
        await interaction.reply({ embeds: [infoEmbed("Active Giveaways", "No active giveaways.")], flags: MessageFlags.Ephemeral });
        return;
      }
      const list = active.map((g) => `**#${g.id}** — ${g.prize} — ends <t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R> in <#${g.channelId}>`).join("\n");
      await interaction.reply({ embeds: [infoEmbed("Active Giveaways", list)], flags: MessageFlags.Ephemeral });
    }
  },
};

export async function handleGiveawayEnter(interaction: ButtonInteraction) {
  const giveawayId = parseInt(interaction.customId.split(":")[1], 10);
  const [giveaway] = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, giveawayId)).limit(1);

  if (!giveaway || giveaway.ended) {
    await interaction.reply({ content: "This giveaway has already ended.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existing = await db.select().from(giveawayEntriesTable).where(
    and(eq(giveawayEntriesTable.giveawayId, giveawayId), eq(giveawayEntriesTable.userId, interaction.user.id))
  ).limit(1);

  if (existing.length > 0) {
    await interaction.reply({ content: "You've already entered this giveaway!", flags: MessageFlags.Ephemeral });
    return;
  }

  await db.insert(giveawayEntriesTable).values({ giveawayId, userId: interaction.user.id });

  const entryCount = await db.select().from(giveawayEntriesTable).where(eq(giveawayEntriesTable.giveawayId, giveawayId));

  const updatedEmbed = giveawayEmbed(giveaway.prize, new Date(giveaway.endsAt), giveaway.hostedBy, entryCount.length, giveaway.winnersCount);
  await interaction.update({ embeds: [updatedEmbed], components: [enterButton(giveawayId)] });
}