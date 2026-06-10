import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuInteraction,
} from "discord.js";
import { db, ticketsTable, guildConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { checkModerator } from "../lib/permissions.js";
import { successEmbed, errorEmbed } from "../lib/embeds.js";

export const ticketCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket system")
    .addSubcommand((s) =>
      s.setName("open").setDescription("Open a new support ticket")
        .addStringOption((o) => o.setName("subject").setDescription("What do you need help with?").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("close").setDescription("Close this ticket")
        .addStringOption((o) => o.setName("reason").setDescription("Reason for closing"))
    )
    .addSubcommand((s) =>
      s.setName("add").setDescription("Add a user to this ticket")
        .addUserOption((o) => o.setName("user").setDescription("User to add").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Remove a user from this ticket")
        .addUserOption((o) => o.setName("user").setDescription("User to remove").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("claim").setDescription("Claim this ticket")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const guild = interaction.guild!;

    if (sub === "open") {
      const subject = interaction.options.getString("subject", true);
      await openTicket({ guildId, guild, userId: interaction.user.id, userTag: interaction.user.tag, subject });
      const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
      const counter = config?.ticketCounter ?? 1;
      const channel = guild.channels.cache.find((c) => c.name === `ticket-${String(counter).padStart(4, "0")}`);
      await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });

    } else if (sub === "close") {
      const channel = interaction.channel as TextChannel;
      const reason = interaction.options.getString("reason") ?? "Closed by staff";
      const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.channelId, channel.id), eq(ticketsTable.status, "open"))).limit(1);
      if (!ticket) { await interaction.reply({ embeds: [errorEmbed("This is not an open ticket channel.")], ephemeral: true }); return; }
      if (!(await checkModerator(interaction)) && ticket.userId !== interaction.user.id) return;
      await db.update(ticketsTable).set({ status: "closed", closedBy: interaction.user.id, closedReason: reason, closedAt: new Date() }).where(eq(ticketsTable.id, ticket.id));
      await interaction.reply({ embeds: [successEmbed("Ticket Closed", `This ticket has been closed.\n**Reason:** ${reason}`)] });
      setTimeout(() => channel.delete().catch(() => {}), 5000);

    } else if (sub === "add") {
      const user = interaction.options.getMember("user") as GuildMember;
      const channel = interaction.channel as TextChannel;
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
      await interaction.reply({ embeds: [successEmbed("User Added", `${user.user.tag} has been added to this ticket.`)] });

    } else if (sub === "remove") {
      const user = interaction.options.getMember("user") as GuildMember;
      const channel = interaction.channel as TextChannel;
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
      await interaction.reply({ embeds: [successEmbed("User Removed", `${user.user.tag} has been removed from this ticket.`)] });

    } else if (sub === "claim") {
      if (!(await checkModerator(interaction))) return;
      const channel = interaction.channel as TextChannel;
      const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.channelId, channel.id))).limit(1);
      if (!ticket) { await interaction.reply({ embeds: [errorEmbed("This is not a ticket channel.")], ephemeral: true }); return; }
      await db.update(ticketsTable).set({ claimedBy: interaction.user.id, claimedByTag: interaction.user.tag }).where(eq(ticketsTable.id, ticket.id));
      await interaction.reply({ embeds: [successEmbed("Ticket Claimed", `${interaction.user.tag} has claimed this ticket.`)] });
    }
  },
};

// Shared helper to create a ticket channel
async function openTicket({ guildId, guild, userId, userTag, subject }: {
  guildId: string;
  guild: any;
  userId: string;
  userTag: string;
  subject: string;
}) {
  const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
  const counter = (config?.ticketCounter ?? 0) + 1;
  await db.update(guildConfigTable).set({ ticketCounter: counter }).where(eq(guildConfigTable.guildId, guildId));

  const ticketName = `ticket-${String(counter).padStart(4, "0")}`;
  const category = config?.ticketCategoryId ? guild.channels.cache.get(config.ticketCategoryId) : null;

  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category?.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: guild.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ...(config?.modRoleId ? [{ id: config.modRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ],
  });

  const [ticket] = await db.insert(ticketsTable).values({
    guildId, ticketNumber: counter, userId, userTag, subject, channelId: channel.id,
  }).returning();

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${counter} — ${subject}`)
    .setColor(0x5865f2)
    .setDescription(`Thank you for opening a ticket, <@${userId}>!\n\n**Topic:** ${subject}\n\nOur staff will be with you shortly.`)
    .setTimestamp();

  const closeBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_${ticket!.id}`).setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
  );

  await channel.send({ embeds: [embed], components: [closeBtn] });
  return { channel, ticket, counter };
}

// Handler for ticket panel dropdown
export async function handleTicketPanelSelect(interaction: StringSelectMenuInteraction) {
  const topicMap: Record<string, string> = {
    general: "General Support",
    staff: "Staff Report",
    perks: "Claim Paid Perks",
  };

  const topic = interaction.values[0];
  const subject = topicMap[topic] ?? topic;

  const { channel } = await openTicket({
    guildId: interaction.guildId!,
    guild: interaction.guild!,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    subject,
  });

  await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
}