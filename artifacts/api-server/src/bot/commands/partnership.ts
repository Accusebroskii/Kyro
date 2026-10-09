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

const STAFF_PERMISSIONS = PermissionFlagsBits.ManageGuild;

async function getPartnershipData(
  channel: TextChannel,
  savedData: PartnershipApplicationData | null,
  applicantId: string,
) {
  if (savedData) {
    return { ...savedData, applicantId };
  }

  const messages = [];
  let before: string | undefined;

  // Read the full ticket history, not just its newest 100 messages.
  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;

    messages.push(...batch.values());
    before = batch.last()?.id;

    if (batch.size < 100 || !before) break;
  }

  const botMessages = messages.filter(
    (message) => message.author.id === message.client.user?.id,
  );

  const dataMessage = botMessages.find((message) =>
    message.embeds.some(
      (embed) => embed.title === "🤝 Partnership Application Data",
    ),
  );

  if (!dataMessage) return null;

  const embed = dataMessage.embeds.find(
    (item) => item.title === "🤝 Partnership Application Data",
  )!;

  const getField = (name: string) =>
    embed.fields.find((field) => field.name === name)?.value ?? "";

  const advertisementMessages = botMessages
    .filter((message) =>
      message.embeds.some(
        (item) =>
          item.title === "📢 Applicant Advertisement" ||
          item.title?.startsWith("📢 Applicant Advertisement ("),
      ),
    )
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const extractedAdvertisement = advertisementMessages
    .map((message) => {
      const adEmbed = message.embeds.find(
        (item) =>
          item.title === "📢 Applicant Advertisement" ||
          item.title?.startsWith("📢 Applicant Advertisement ("),
      );
      return adEmbed?.description ?? "";
    })
    .join("");
  const advertisement = /^[sS\\]+$/.test(extractedAdvertisement)
    ? ""
    : extractedAdvertisement;

  return {
    applicantId,
    server: getField("Server"),
    invite: getField("Invite"),
    members: getField("Members"),
    contact: getField("Contact"),
    advertisement,
  };
}

function partnershipPostMarker(ticketId: number): string {
  return `Calyx Partnerships • Application #${ticketId}`;
}

function isExistingPartnershipPost(
  message: import("discord.js").Message,
  ticketId: number,
  data: Awaited<ReturnType<typeof getPartnershipData>>,
): boolean {
  if (message.author.id !== message.client.user?.id || !data) return false;
  return message.embeds.some((embed) => {
    if (embed.footer?.text === partnershipPostMarker(ticketId)) return true;
    if (embed.title !== "🤝 New Partnership") return false;

    const serverField = embed.fields.find((field) => field.name === "Server");
    const inviteField = embed.fields.find((field) => field.name === "Invite");
    if (serverField?.value === data.server && inviteField?.value === data.invite) {
      return true;
    }

    return (
      embed.description?.includes(`**Server:** ${data.server}`) === true &&
      embed.description.includes(`**Invite:** ${data.invite}`)
    );
  });
}

function resolveMention(
  interaction: ChatInputCommandInteraction,
  value: string,
) {
  const input = value.trim();

  if (input === "@everyone" || input === "@here") {
    return {
      mention: input,
      everyone: true,
      roleId: null,
    };
  }

  const match = input.match(/^<@&(\d+)>$/);
  const roleId = match?.[1] ?? (/^\d+$/.test(input) ? input : null);

  if (!roleId) {
    const role = interaction.guild?.roles.cache.find(
      (r) => r.name.toLowerCase() === input.toLowerCase(),
    );

    if (role) {
      return {
        mention: `<@&${role.id}>`,
        everyone: false,
        roleId: role.id,
      };
    }

    return null;
  }

  const role = interaction.guild?.roles.cache.get(roleId);

  if (!role) return null;

  return {
    mention: `<@&${role.id}>`,
    everyone: false,
    roleId: role.id,
  };
}

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

  if (!config?.partnershipChannelId || !config.partnershipReviewChannelId) {
    await interaction.reply({
      content:
        "❌ The partnership system is not fully configured. An administrator needs to run `/setup partnership` first.",
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
  });

  const ticketChannel = ticket.channel as TextChannel;
  const ticketRecord = ticket.ticket;
  if (!ticketRecord) {
    throw new Error("Partnership ticket was created without a database record");
  }

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
      `Please send **proof that you sent our partnership advertisement in your partnership command**.\n\n` +
      `📸 Upload a screenshot/image as proof below.\n\n` +
      `Once your proof has been submitted, staff will review it.`,
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
        .setDescription("Accept the partnership in the current partnership ticket")
        .addStringOption((o) =>
          o
            .setName("role")
            .setDescription("Optional role to ping: @everyone, @here, role mention, ID, or name"),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("verify")
        .setDescription("Check a partner server for Calyx's required advertisement")
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
                "• Proof that our advertisement was sent in your partnership command",
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

    // ACCEPT
    if (subcommand === "accept") {
      const mentionInput = interaction.options.getString("role");
      const resolved = mentionInput ? resolveMention(interaction, mentionInput) : null;

      if (mentionInput && !resolved) {
        await interaction.reply({
          content:
            "❌ I couldn't find that role. Use a role mention, role ID, role name, `@everyone`, or `@here`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

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

      const ticketChannel = interaction.channel;

      if (!(ticketChannel instanceof TextChannel)) {
        await interaction.reply({
          content: "❌ This is not a valid partnership ticket.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const data = await getPartnershipData(
        ticketChannel,
        ticket.partnershipApplicationData,
        ticket.userId,
      );

      if (!data) {
        await interaction.editReply({
          content: "❌ I couldn't find the partnership application data in this ticket.",
        });
        return;
      }

      const missingFields = [
        ["server", data.server],
        ["invite", data.invite],
        ["member count", data.members],
        ["contact", data.contact],
        ["advertisement", data.advertisement],
      ]
        .filter(([, value]) => typeof value !== "string" || !value.trim())
        .map(([label]) => label);

      if (missingFields.length > 0) {
        await interaction.editReply({
          content:
            `❌ The application is missing required field(s): **${missingFields.join(", ")}**. ` +
            "Please ask the applicant to submit a complete application.",
        });
        return;
      }

      const [config] = await db
        .select()
        .from(guildConfigTable)
        .where(eq(guildConfigTable.guildId, guildId))
        .limit(1);

      if (!config?.partnershipChannelId) {
        await interaction.editReply({
          content: "❌ The partnership channel has not been configured.",
        });
        return;
      }

      const partnershipChannel = await interaction.guild.channels
        .fetch(config.partnershipChannelId)
        .catch(() => null);

      if (!partnershipChannel?.isTextBased()) {
        await interaction.editReply({
          content: "❌ The partnership channel could not be found.",
        });
        return;
      }

      if (!(partnershipChannel instanceof TextChannel)) {
        await interaction.editReply({
          content: "❌ The configured partnership channel is not a text channel.",
        });
        return;
      }

      let alreadyPosted: import("discord.js").Message | undefined;
      if (ticket.partnershipPostMessageId) {
        alreadyPosted = await partnershipChannel.messages
          .fetch(ticket.partnershipPostMessageId)
          .catch(() => undefined);
      }

      if (!alreadyPosted) {
        const recentPosts = await partnershipChannel.messages
          .fetch({ limit: 100 })
          .catch(() => null);
        if (!recentPosts) {
          await interaction.editReply({
            content:
              "❌ I couldn't check whether this application was already posted. " +
              "No new post was created; check that I have Read Message History in the partnership channel.",
          });
          return;
        }
        alreadyPosted = recentPosts.find((message) =>
          isExistingPartnershipPost(message, ticket.id, data),
        );
      }

      if (alreadyPosted) {
        await db
          .update(ticketsTable)
          .set({ partnershipPostMessageId: alreadyPosted.id })
          .where(eq(ticketsTable.id, ticket.id));
        await interaction.editReply({
          content:
            `✅ Partnership for **${data.server}** was already posted: ${alreadyPosted.url}` +
            (resolved?.mention ? `\n📢 Selected ping: ${resolved.mention}` : ""),
        });
        return;
      }

      const partnerEmbed = new EmbedBuilder()
        .setTitle("🤝 New Partnership")
        .setDescription(data.advertisement)
        .addFields(
          { name: "Server", value: data.server },
          { name: "Invite", value: data.invite },
        )
        .setFooter({ text: partnershipPostMarker(ticket.id) })
        .setTimestamp();

      const publishedPost = await partnershipChannel.send({
        content: resolved?.mention || undefined,
        embeds: [partnerEmbed],
        allowedMentions: resolved
          ? resolved.everyone
            ? { parse: ["everyone"] }
            : { roles: resolved.roleId ? [resolved.roleId] : [] }
          : { parse: [] },
      });

      await db
        .update(ticketsTable)
        .set({ partnershipPostMessageId: publishedPost.id })
        .where(eq(ticketsTable.id, ticket.id));

      await interaction.editReply({
        content:
          `✅ Partnership for **${data.server}** has been accepted and posted: ${publishedPost.url}` +
          (resolved?.mention ? `\n📢 Ping: ${resolved.mention}` : ""),
      });

      await ticketChannel.send(
        `✅ Partnership accepted by ${interaction.user}. The partner advertisement has been posted.`,
      );

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
