import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import {
  applicationFormsTable,
  applicationSubmissionsTable,
  db,
  type ApplicationAnswer,
} from "@workspace/db";
import { requireApplicationStaff } from "../lib/setupAccess.js";
import { errorEmbed, successEmbed } from "../lib/embeds.js";
import { logger } from "../../lib/logger.js";

const QUESTION_OPTION_NAMES = [
  "question1",
  "question2",
  "question3",
  "question4",
  "question5",
] as const;

export const applicationCommand = {
  data: new SlashCommandBuilder()
    .setName("application")
    .setDescription("Create and manage application forms")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create an application form people can fill out")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Name of this application")
            .setMaxLength(100)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Instructions shown with the application")
            .setMaxLength(1000)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("panel_channel")
            .setDescription("Where people can find the Apply button")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("review_channel")
            .setDescription("Private staff channel where submissions are sent")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("question1")
            .setDescription("First required question (max 45 characters)")
            .setMaxLength(45)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("question2")
            .setDescription("Optional second question (max 45 characters)")
            .setMaxLength(45),
        )
        .addStringOption((option) =>
          option
            .setName("question3")
            .setDescription("Optional third question (max 45 characters)")
            .setMaxLength(45),
        )
        .addStringOption((option) =>
          option
            .setName("question4")
            .setDescription("Optional fourth question (max 45 characters)")
            .setMaxLength(45),
        )
        .addStringOption((option) =>
          option
            .setName("question5")
            .setDescription("Optional fifth question (max 45 characters)")
            .setMaxLength(45),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List this server's application forms"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Close an application form")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Application form ID from /application list")
            .setMinValue(1)
            .setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(null),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireApplicationStaff(interaction))) return;
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      await createApplicationForm(interaction);
      return;
    }
    if (subcommand === "list") {
      await listApplicationForms(interaction);
      return;
    }
    if (subcommand === "disable") {
      await disableApplicationForm(interaction);
    }
  },
};

async function createApplicationForm(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const panelChannel = interaction.options.getChannel(
    "panel_channel",
    true,
  ) as TextChannel;
  const reviewChannel = interaction.options.getChannel(
    "review_channel",
    true,
  ) as TextChannel;
  const questions = QUESTION_OPTION_NAMES
    .map((name) => interaction.options.getString(name)?.trim())
    .filter((question): question is string => Boolean(question));
  const title = interaction.options.getString("title", true).trim();
  const description = interaction.options.getString("description", true).trim();
  if (!title || !description) {
    await interaction.reply({
      embeds: [errorEmbed("The application title and description cannot be blank.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (questions.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed("Add at least one non-empty application question.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild!;
  const botMember =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const requiredPermissions =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessages |
    PermissionFlagsBits.EmbedLinks;
  const panelPermissions = botMember
    ? panelChannel.permissionsFor(botMember)
    : null;
  const reviewPermissions = botMember
    ? reviewChannel.permissionsFor(botMember)
    : null;
  if (
    !panelPermissions?.has(requiredPermissions) ||
    !reviewPermissions?.has(requiredPermissions)
  ) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          "I need View Channel, Send Messages, and Embed Links permissions in both selected channels.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const everyoneReviewPermissions = reviewChannel.permissionsFor(
    guild.roles.everyone,
  );
  if (
    !everyoneReviewPermissions ||
    everyoneReviewPermissions.has(PermissionFlagsBits.ViewChannel)
  ) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          "Choose a private staff review channel where @everyone cannot view messages, so application answers stay private.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [form] = await db
    .insert(applicationFormsTable)
    .values({
      guildId,
      title,
      description,
      panelChannelId: panelChannel.id,
      reviewChannelId: reviewChannel.id,
      questions,
      createdBy: interaction.user.id,
    })
    .returning();

  try {
    const panel = await panelChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(form.title)
          .setDescription(
            `${form.description}\n\nClick **Apply** below to submit your answers.`,
          )
          .setColor(0x5865f2)
          .setFooter({ text: `Application form #${form.id}` }),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`application:apply:${form.id}`)
            .setLabel("Apply")
            .setStyle(ButtonStyle.Primary),
        ),
      ],
      allowedMentions: { parse: [] },
    });

    await db
      .update(applicationFormsTable)
      .set({ panelMessageId: panel.id })
      .where(eq(applicationFormsTable.id, form.id));

    await interaction.reply({
      embeds: [
        successEmbed(
          "Application Form Created",
          `**${form.title}** is live in <#${panelChannel.id}>.\n` +
            `Submissions go to <#${reviewChannel.id}>.\n` +
            `Form ID: **${form.id}**. Use /application list to see your forms; /application disable closes one.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    await db
      .delete(applicationFormsTable)
      .where(eq(applicationFormsTable.id, form.id));
    logger.error(
      { err: error, guildId, formId: form.id },
      "Failed to publish application form panel",
    );
    await interaction.reply({
      embeds: [
        errorEmbed(
          "I couldn't post the application panel. Check that I can view and send messages in the selected panel channel.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function listApplicationForms(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const forms = await db
    .select()
    .from(applicationFormsTable)
    .where(eq(applicationFormsTable.guildId, interaction.guildId!))
    .orderBy(desc(applicationFormsTable.id))
    .limit(20);

  const description = forms.length
    ? forms
        .map(
          (form) =>
            `**#${form.id} — ${form.title}** · ${form.active ? "Open" : "Closed"} · <#${form.panelChannelId}>`,
        )
        .join("\n")
    : "No application forms have been created yet.";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("Application Forms")
        .setDescription(description.slice(0, 4000))
        .setColor(0x5865f2),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function disableApplicationForm(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const formId = interaction.options.getInteger("id", true);
  const [form] = await db
    .select()
    .from(applicationFormsTable)
    .where(
      and(
        eq(applicationFormsTable.id, formId),
        eq(applicationFormsTable.guildId, interaction.guildId!),
      ),
    )
    .limit(1);

  if (!form) {
    await interaction.reply({
      embeds: [errorEmbed("I couldn't find that application form in this server.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!form.active) {
    await interaction.reply({
      content: `Application **${form.title}** is already closed.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db
    .update(applicationFormsTable)
    .set({ active: false })
    .where(eq(applicationFormsTable.id, form.id));

  if (form.panelMessageId) {
    const panelChannel = await interaction.guild!.channels
      .fetch(form.panelChannelId)
      .catch(() => null);
    if (
      panelChannel?.type === ChannelType.GuildText &&
      panelChannel instanceof TextChannel
    ) {
      const panel = await panelChannel.messages
        .fetch(form.panelMessageId)
        .catch(() => null);
      await panel?.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle(form.title)
            .setDescription(`${form.description}\n\nThis application is now closed.`)
            .setColor(0x747f8d)
            .setFooter({ text: `Application form #${form.id} · Closed` }),
        ],
        components: [],
      });
    }
  }

  await interaction.reply({
    content: `🔒 **${form.title}** is closed. People can no longer apply.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleApplicationApplyButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const formId = Number(interaction.customId.split(":")[2]);
  if (!Number.isInteger(formId) || !interaction.guildId) {
    await interaction.reply({
      content: "This application form is invalid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [form] = await db
    .select()
    .from(applicationFormsTable)
    .where(
      and(
        eq(applicationFormsTable.id, formId),
        eq(applicationFormsTable.guildId, interaction.guildId),
      ),
    )
    .limit(1);

  if (!form?.active) {
    await interaction.reply({
      content: "This application is closed or no longer available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`application:submit:${form.id}`)
    .setTitle(form.title.slice(0, 45));

  for (const [index, question] of form.questions.slice(0, 5).entries()) {
    const input = new TextInputBuilder()
      .setCustomId(`answer_${index}`)
      .setLabel(question.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(800)
      .setRequired(true);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
  }

  await interaction.showModal(modal);
}

export async function handleApplicationModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const formId = Number(interaction.customId.split(":")[2]);
  if (!Number.isInteger(formId) || !interaction.guildId) {
    await interaction.reply({
      content: "This application form is invalid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [form] = await db
    .select()
    .from(applicationFormsTable)
    .where(
      and(
        eq(applicationFormsTable.id, formId),
        eq(applicationFormsTable.guildId, interaction.guildId),
      ),
    )
    .limit(1);

  if (!form?.active) {
    await interaction.reply({
      content: "This application is closed, so your answers weren't submitted.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const answers: ApplicationAnswer[] = form.questions
    .slice(0, 5)
    .map((question, index) => ({
      question,
      answer: interaction.fields.getTextInputValue(`answer_${index}`).trim(),
    }));

  const [submission] = await db
    .insert(applicationSubmissionsTable)
    .values({
      formId: form.id,
      guildId: form.guildId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      answers,
    })
    .returning();

  const reviewChannel = await interaction.guild!.channels
    .fetch(form.reviewChannelId)
    .catch(() => null);
  if (!(reviewChannel instanceof TextChannel)) {
    await interaction.editReply(
      "Your application was saved, but the staff review channel is unavailable. Please contact a server admin.",
    );
    return;
  }

  const reviewEmbed = new EmbedBuilder()
    .setTitle(`New Application: ${form.title}`)
    .setDescription(
      `**Applicant:** <@${interaction.user.id}>\n` +
        `**Form:** #${form.id}\n` +
        `**Submission:** #${submission.id}\n` +
        `**Status:** Pending review`,
    )
    .addFields(
      answers.map((entry) => ({
        name: entry.question,
        value: entry.answer.slice(0, 1000) || "*(No answer)*",
      })),
    )
    .setColor(0xf1c40f)
    .setTimestamp();

  try {
    const reviewMessage = await reviewChannel.send({
      embeds: [reviewEmbed],
      allowedMentions: { parse: [] },
    });
    await db
      .update(applicationSubmissionsTable)
      .set({ reviewMessageId: reviewMessage.id })
      .where(eq(applicationSubmissionsTable.id, submission.id));
    await interaction.editReply(
      `✅ Your **${form.title}** application was sent to the staff team.`,
    );
  } catch (error) {
    logger.error(
      { err: error, guildId: form.guildId, formId: form.id },
      "Failed to deliver application submission to staff",
    );
    await interaction.editReply(
      "Your application was saved, but I couldn't send it to the staff channel. Please contact a server admin.",
    );
  }
}
