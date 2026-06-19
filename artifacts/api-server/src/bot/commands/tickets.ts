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
  ButtonInteraction,
  AttachmentBuilder,
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
      const { channel } = await openTicket({
        guildId, guild, userId: interaction.user.id,
        userTag: interaction.user.tag, subject,
      });
      await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
    } else if (sub === "close") {
      const channel = interaction.channel as TextChannel;
      const reason = interaction.options.getString("reason") ?? "Closed by staff";
      const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.channelId, channel.id), eq(ticketsTable.status, "open"))).limit(1);
      if (!ticket) { await interaction.reply({ embeds: [errorEmbed("This is not an open ticket channel.")], ephemeral: true }); return; }
      if (!(await checkModerator(interaction)) && ticket.userId !== interaction.user.id) return;

      await interaction.reply({ embeds: [successEmbed("Ticket Closed", `This ticket has been closed.\n**Reason:** ${reason}`)] });
      await closeTicketWithTranscript({
        guild, channel, ticket,
        closedByUserId: interaction.user.id,
        closedByTag: interaction.user.tag,
        reason,
      });
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

export async function openTicket({ guildId, guild, userId, userTag, subject }: {
  guildId: string;
  guild: any;
  userId: string;
  userTag: string;
  subject: string;
}) {
  const [config] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
  const counter = (config?.ticketCounter ?? 0) + 1;
  await db.update(guildConfigTable).set({ ticketCounter: counter }).where(eq(guildConfigTable.guildId, guildId));
  const slug = subject.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const ticketName = `${slug}-${String(counter).padStart(4, "0")}`;
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
    .setTitle(`🎫 ${subject} #${counter}`)
    .setColor(0x5865f2)
    .setDescription(`Thank you for opening a ticket, <@${userId}>!\n\n**Topic:** ${subject}\n\nOur staff will be with you shortly.`)
    .setTimestamp();
  const closeBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_${ticket!.id}`).setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
  );
  await channel.send({ embeds: [embed], components: [closeBtn] });
  return { channel, ticket, counter };
}

export async function handleTicketPanelSelect(interaction: StringSelectMenuInteraction) {
  const subject = interaction.values[0]!;
  const { channel } = await openTicket({
    guildId: interaction.guildId!,
    guild: interaction.guild!,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    subject,
  });
  await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
}

export async function handleTicketCreate(interaction: ButtonInteraction) {
  const panelName = interaction.customId.replace("ticket_create:", "");
  const { channel } = await openTicket({
    guildId: interaction.guildId!,
    guild: interaction.guild!,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    subject: panelName,
  });
  await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
}

/**
 * Builds a plain-text transcript of a ticket channel (up to 500 most recent messages),
 * DMs it to the ticket opener along with who closed it and why, then marks the
 * ticket closed in the DB and deletes the channel after a short delay.
 */
export async function closeTicketWithTranscript({
  guild,
  channel,
  ticket,
  closedByUserId,
  closedByTag,
  reason,
}: {
  guild: any;
  channel: TextChannel;
  ticket: typeof ticketsTable.$inferSelect;
  closedByUserId: string;
  closedByTag: string;
  reason: string;
}) {
  // Build transcript text
  let allMessages: any[] = [];
  let lastId: string | undefined;
  for (let i = 0; i < 5; i++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }
  allMessages.reverse();

  const lines = allMessages.map((m) => {
    const time = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
    const content = m.content || "[no text content]";
    const attachments = m.attachments?.size ? `\n  Attachments: ${[...m.attachments.values()].map((a: any) => a.url).join(", ")}` : "";
    return `[${time}] ${m.author?.tag ?? "Unknown"}: ${content}${attachments}`;
  });

  const transcriptText = [
    `Ticket Transcript`,
    `Channel: #${channel.name}`,
    `Subject: ${ticket.subject}`,
    `Opened by: ${ticket.userTag} (${ticket.userId})`,
    `Closed by: ${closedByTag} (${closedByUserId})`,
    `Reason: ${reason}`,
    `Closed at: ${new Date().toISOString()}`,
    "",
    "----- Messages -----",
    "",
    ...(lines.length ? lines : ["[No messages found]"]),
  ].join("\n");

  const attachment = new AttachmentBuilder(Buffer.from(transcriptText, "utf-8"), { name: `transcript-${channel.name}.txt` });

  // Try to DM the ticket opener
  try {
    const member = await guild.members.fetch(ticket.userId).catch(() => null);
    const user = member?.user ?? (await guild.client.users.fetch(ticket.userId).catch(() => null));
    if (user) {
      const dmEmbed = new EmbedBuilder()
        .setTitle("🎫 Your Ticket Was Closed")
        .setColor(0xed4245)
        .setDescription(
          `**Subject:** ${ticket.subject}\n**Closed by:** ${closedByTag}\n**Reason:** ${reason}\n\nA full transcript is attached below.`,
        )
        .setTimestamp();
      await user.send({ embeds: [dmEmbed], files: [attachment] });
    }
  } catch {
    // User may have DMs disabled — ignore silently
  }

  await db.update(ticketsTable).set({
    status: "closed",
    closedBy: closedByUserId,
    closedReason: reason,
    closedAt: new Date(),
  }).where(eq(ticketsTable.id, ticket.id));

  setTimeout(() => channel.delete().catch(() => {}), 5000);
}