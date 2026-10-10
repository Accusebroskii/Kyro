import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
  ModalSubmitInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  db,
  guildConfigTable,
  ticketsTable,
  type PartnershipApplicationData,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openTicket } from "./tickets.js";
import { verifyPartnershipAdvertisement } from "../lib/partnershipVerification.js";
import { grantPartnershipPostingRole } from "../lib/partnershipAccess.js";

const STAFF_PERMISSIONS = PermissionFlagsBits.ManageGuild;

export async function handlePartnershipApplyModalSubmit(
  interaction: ModalSubmitInteraction,
) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "❌ This can only be used inside a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const server = interaction.fields.getTextInputValue("server");
  const invite = interaction.fields.getTextInputValue("invite");
  const members = interaction.fields.getTextInputValue("members");
  const contact = interaction.fields.getTextInputValue("contact");
  const advertisement = interaction.fields.getTextInputValue("advertisement");

  const guildId = interaction.guildId;

  const [config] = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, guildId))
    .limit(1);

  if (
    !config?.partnershipChannelId ||
    !config.partnershipReviewChannelId ||
    !config.partnershipRoleId
  ) {
    await interaction.reply({
      content:
        "❌ The partnership destination, review channel, and access role must be configured with `/setup partnership` first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!config.partnershipAd) {
    await interaction.reply({
      content:
        "❌ The partnership advertisement for this server has not been configured yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existing = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        eq(ticketsTable.guildId, guildId),
        eq(ticketsTable.userId, interaction.user.id),
        eq(ticketsTable.subject, "Partnership Application"),
      ),
    )
    .limit(1);

  const existingChannelId = existing[0]?.channelId;
  if (existingChannelId) {
    const existingChannel = await interaction.guild.channels
      .fetch(existingChannelId)
      .catch(() => null);

    if (existingChannel) {
      await interaction.reply({
        content: `❌ You already have a partnership ticket: <#${existingChannelId}>`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const ticket = await openTicket({
    guildId,
    guild: interaction.guild,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    subject: "Partnership Application",
    categoryId: config.partnershipTicketCategoryId ?? undefined,
  });

  const ticketChannel = ticket.channel as TextChannel;
  const ticketRecord = ticket.ticket;
  if (!ticketRecord) {
    throw new Error("Partnership ticket was created without a database record");
  }
  await ticketChannel.permissionOverwrites.edit(interaction.user.id, {
    AttachFiles: true,
  });

  const applicationData: PartnershipApplicationData = {
    server,
    invite,
    members,
    contact,
    advertisement,
  };
  await db
    .update(ticketsTable)
    .set({ partnershipApplicationData: applicationData })
    .where(eq(ticketsTable.id, ticketRecord.id));

  const calyxAd = new EmbedBuilder()
    .setTitle("🤝 Partnership Advertisement")
    .setDescription(config.partnershipAd)
    .setColor(0x4f8cff);

  await ticketChannel.send({
    content:
      `Welcome <@${interaction.user.id}>!\n\n` +
      `Post the Calyx advertisement below in your server, then upload a clear screenshot showing it was sent.\n\n` +
      `📸 The AI checks the screenshot automatically. If it clearly matches, I’ll give you the configured partner role so you can post your ad in <#${config.partnershipChannelId}>.\n\n` +
      `Use one PNG, JPEG, or WebP screenshot per message. If the image is unclear or the check fails, you can try again.`,
    embeds: [calyxAd],
  });

  const dataEmbed = new EmbedBuilder()
    .setTitle("🤝 Partnership Application Data")
    .setColor(0x4f8cff)
    .addFields(
      {
        name: "Applicant ID",
        value: interaction.user.id,
      },
      {
        name: "Server",
        value: server.slice(0, 1024),
        inline: true,
      },
      {
        name: "Members",
        value: members.slice(0, 1024),
        inline: true,
      },
      {
        name: "Invite",
        value: invite.slice(0, 1024),
      },
      {
        name: "Contact",
        value: contact.slice(0, 1024),
      },
    )
    .setFooter({ text: "Calyx Partnership Application Data" });

  await ticketChannel.send({
    embeds: [dataEmbed],
  });

  // Store the full advertisement in Discord-safe chunks.
  const adChunks = advertisement.match(/[\s\S]{1,1900}/g) ?? [];
  for (let i = 0; i < adChunks.length; i++) {
    await ticketChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            adChunks.length > 1
              ? `📢 Applicant Advertisement (${i + 1}/${adChunks.length})`
              : "📢 Applicant Advertisement",
          )
          .setDescription(adChunks[i])
          .setColor(0x4f8cff),
      ],
    });
  }

  await interaction.reply({
    content: `✅ Your partnership ticket has been created: ${ticketChannel}`,
    flags: MessageFlags.Ephemeral,
  });
}

export const partnershipCommand = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Manage and apply for server partnerships")

    .addSubcommand((sub) =>
      sub
        .setName("apply")
        .setDescription("Apply for a partnership"),
    )

    .addSubcommand((sub) =>
      sub.setName("info").setDescription("View partnership requirements"),
    )

    .addSubcommand((sub) =>
      sub.setName("list").setDescription("View partnered servers"),
    )

    .addSubcommand((sub) =>
      sub
        .setName("accept")
      .setDescription("Staff override: manually grant posting access for this ticket"),
    )

    .addSubcommand((sub) =>
      sub
        .setName("verify")
        .setDescription("Text-search a partner server for Calyx's ad; ticket screenshots are checked automatically")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Partner server ID or invite link/code; the bot must be in that server")
            .setRequired(true)
            .setMaxLength(100),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("deny")
        .setDescription("Deny the partnership in the current partnership ticket"),
    )

    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a partnered server")
        .addStringOption((o) =>
          o.setName("server").setDescription("Server name").setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "❌ This command can only be used inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // APPLY
    if (subcommand === "apply") {
      const modal = new ModalBuilder()
        .setCustomId("partnership_apply_modal")
        .setTitle("Partnership Application")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("server")
              .setLabel("Server Name")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("invite")
              .setLabel("Discord Invite")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("members")
              .setLabel("Member Count")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("contact")
              .setLabel("Contact")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("advertisement")
              .setLabel("Advertisement")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(4000)
              .setPlaceholder("Paste your full partnership advertisement here...")
          )
        );

      await interaction.showModal(modal);
      return;
      }

    // INFO
    if (subcommand === "info") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🤝 Partnership Information")
            .setDescription(
              "Interested in partnering with us? Use `/partnership apply`.",
            )
            .addFields({
              name: "📋 Requirements",
              value:
                "• Real and active Discord server\n" +
                "• Valid Discord invite\n" +
                "• Accurate server information\n" +
                "• Professional partnership advertisement\n" +
                "• A clear screenshot showing our advertisement posted in your server",
            })
            .setTimestamp(),
        ],
      });
      return;
    }

    // LIST
    if (subcommand === "list") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🤝 Partnered Servers")
            .setDescription(
              "Our partnered server list will appear here once partnerships are added.",
            )
            .setTimestamp(),
        ],
      });
      return;
    }

    // STAFF ONLY
    if (!interaction.memberPermissions?.has(STAFF_PERMISSIONS)) {
      await interaction.reply({
        content: "❌ You need the **Manage Server** permission.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ACCEPT is a staff override; successful screenshot checks grant this role automatically.
    if (subcommand === "accept") {
      const [ticket] = await db
        .select()
        .from(ticketsTable)
        .where(
          and(
            eq(ticketsTable.guildId, guildId),
            eq(ticketsTable.channelId, interaction.channelId!),
            eq(ticketsTable.subject, "Partnership Application"),
          ),
        )
        .limit(1);

      if (!ticket) {
        await interaction.reply({
          content:
            "❌ `/partnership accept` must be used inside the applicant's partnership ticket.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const [config] = await db
        .select()
        .from(guildConfigTable)
        .where(eq(guildConfigTable.guildId, guildId))
        .limit(1);

      if (!config?.partnershipChannelId || !config.partnershipRoleId) {
        await interaction.editReply({
          content: "❌ Run `/setup partnership` to configure the posting destination and role.",
        });
        return;
      }

      const result = await grantPartnershipPostingRole(
        interaction.guild,
        ticket.userId,
        config.partnershipRoleId,
      );
      if (!result.ok) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
      }

      await interaction.editReply({
        content:
          `✅ Manually granted <@&${result.role.id}> to <@${ticket.userId}>. ` +
          `They can now post their own ad in <#${config.partnershipChannelId}>.`,
      });

      if (interaction.channel instanceof TextChannel) {
        await interaction.channel.send(
          `✅ Staff manually granted <@&${result.role.id}> to <@${ticket.userId}> for partnership posting.`,
        );
      }

      return;
    }

    if (subcommand === "verify") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const [config] = await db
        .select()
        .from(guildConfigTable)
        .where(eq(guildConfigTable.guildId, guildId))
        .limit(1);
      if (!config?.partnershipAd?.trim()) {
        await interaction.editReply({
          content:
            "UNABLE TO VERIFY — Calyx's partnership advertisement is not configured. " +
            "Set it with `/setup partnership` first.",
        });
        return;
      }

      const identifier = interaction.options.getString("server", true).trim();
      let partnerGuildId = identifier;
      if (!/^\d{17,20}$/.test(identifier)) {
        const invite = await interaction.client
          .fetchInvite(identifier)
          .catch(() => null);
        if (!invite?.guild?.id) {
          await interaction.editReply({
            content:
              "UNABLE TO VERIFY — I couldn't resolve that server ID or invite. " +
              "Check the invite and make sure it hasn't expired.",
          });
          return;
        }
        partnerGuildId = invite.guild.id;
      }

      const result = await verifyPartnershipAdvertisement(
        interaction.client,
        partnerGuildId,
        config.partnershipAd,
      );
      const color =
        result.status === "VERIFIED"
          ? 0x57f287
          : result.status === "NOT FOUND"
            ? 0xed4245
            : 0xfee75c;
      const embed = new EmbedBuilder()
        .setTitle(`🤝 Partnership Check: ${result.status}`)
        .setDescription(result.explanation)
        .setColor(color)
        .setFooter({
          text: "Text-only check. Screenshot and image proof are not analyzed.",
        })
        .setTimestamp();

      if (result.evidence) {
        embed.addFields({
          name: "Evidence",
          value:
            `Channel: <#${result.evidence.channelId}> (${result.evidence.channelName})\n` +
            `[Open message](${result.evidence.messageUrl})`,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // DENY
    if (subcommand === "deny") {
      const [ticket] = await db
        .select()
        .from(ticketsTable)
        .where(
          and(
            eq(ticketsTable.guildId, guildId),
            eq(ticketsTable.channelId, interaction.channelId!),
            eq(ticketsTable.subject, "Partnership Application"),
          ),
        )
        .limit(1);

      if (!ticket) {
        await interaction.reply({
          content:
            "❌ `/partnership deny` must be used inside the applicant's partnership ticket.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        content: "❌ This partnership application has been denied.",
      });
      return;
    }

    // REMOVE
    if (subcommand === "remove") {
      const server = interaction.options.getString("server", true);

      await interaction.reply({
        content: `🗑️ Partnership with **${server}** has been removed.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
