import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ChannelSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  TextChannel,
} from "discord.js";
import { db, ticketTopicsTable, ticketPanelsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed, errorEmbed } from "./embeds.js";

const MAX_SLOTS = 8;

interface TopicSlot {
  label?: string;
  description?: string;
  emoji?: string;
}

interface PanelDraft {
  guildId: string;
  userId: string;
  panelName: string;
  title: string;
  description: string;
  channelId?: string;
  topics: (TopicSlot | null)[];
}

// In-memory store of in-progress builders, keyed by a short session id
const drafts = new Map<string, PanelDraft>();

function genSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function startPanelBuilder(guildId: string, userId: string, panelName: string) {
  const sessionId = genSessionId();
  const draft: PanelDraft = {
    guildId,
    userId,
    panelName,
    title: panelName,
    description: "To create a ticket use the menu below",
    channelId: undefined,
    topics: Array(MAX_SLOTS).fill(null),
  };
  drafts.set(sessionId, draft);
  return { sessionId, draft };
}

function renderBuilder(sessionId: string, draft: PanelDraft) {
  const embed = new EmbedBuilder()
    .setTitle(`🛠️ Panel Builder — ${draft.panelName}`)
    .setColor(0x5865f2)
    .setDescription(
      `**Title:** ${draft.title}\n**Description:** ${draft.description}\n**Channel:** ${
        draft.channelId ? `<#${draft.channelId}>` : "Not set"
      }`,
    )
    .addFields(
      draft.topics.map((t, i) => ({
        name: `Slot ${i + 1}`,
        value: t?.label ? `${t.emoji ?? "📩"} ${t.label}${t.description ? ` — ${t.description}` : ""}` : "*Empty*",
        inline: true,
      })),
    );

  const slotRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    draft.topics.slice(0, 4).map((t, i) =>
      new ButtonBuilder()
        .setCustomId(`panel_slot:${sessionId}:${i}`)
        .setLabel(t?.label ? `${i + 1}. ${t.label}`.slice(0, 80) : `Slot ${i + 1}`)
        .setStyle(t?.label ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
  const slotRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    draft.topics.slice(4, 8).map((t, i) =>
      new ButtonBuilder()
        .setCustomId(`panel_slot:${sessionId}:${i + 4}`)
        .setLabel(t?.label ? `${i + 5}. ${t.label}`.slice(0, 80) : `Slot ${i + 5}`)
        .setStyle(t?.label ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );

  const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`panel_channel:${sessionId}`)
      .setPlaceholder("Select a channel to send the panel to")
      .addChannelTypes(ChannelType.GuildText),
  );

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`panel_info:${sessionId}`).setLabel("Edit Title/Description").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`panel_send:${sessionId}`).setLabel("Send Panel").setStyle(ButtonStyle.Success).setEmoji("📨"),
    new ButtonBuilder().setCustomId(`panel_cancel:${sessionId}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [slotRow1, slotRow2, channelRow, actionRow] };
}

export function initialBuilderPayload(sessionId: string, draft: PanelDraft) {
  return renderBuilder(sessionId, draft);
}

export async function handlePanelSlotButton(interaction: ButtonInteraction) {
  const [, sessionId, idxStr] = interaction.customId.split(":");
  const draft = drafts.get(sessionId);
  if (!draft) {
    await interaction.reply({ embeds: [errorEmbed("This builder session expired. Run `/setup panel` again.")], ephemeral: true });
    return;
  }
  const index = parseInt(idxStr, 10);
  const existing = draft.topics[index];

  const modal = new ModalBuilder()
    .setCustomId(`panel_slot_modal:${sessionId}:${index}`)
    .setTitle(`Edit Slot ${index + 1}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("label")
          .setLabel("Topic name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setValue(existing?.label ?? ""),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji")
          .setLabel("Emoji (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setValue(existing?.emoji ?? ""),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(100)
          .setValue(existing?.description ?? ""),
      ),
    );

  await interaction.showModal(modal);
}

export async function handlePanelInfoButton(interaction: ButtonInteraction) {
  const [, sessionId] = interaction.customId.split(":");
  const draft = drafts.get(sessionId);
  if (!draft) {
    await interaction.reply({ embeds: [errorEmbed("This builder session expired. Run `/setup panel` again.")], ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`panel_info_modal:${sessionId}`)
    .setTitle("Edit Panel Info")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Panel title")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
          .setValue(draft.title),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Panel description")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(draft.description),
      ),
    );

  await interaction.showModal(modal);
}

export async function handlePanelChannelSelect(interaction: ChannelSelectMenuInteraction) {
  const [, sessionId] = interaction.customId.split(":");
  const draft = drafts.get(sessionId);
  if (!draft) {
    await interaction.reply({ embeds: [errorEmbed("This builder session expired. Run `/setup panel` again.")], ephemeral: true });
    return;
  }
  draft.channelId = interaction.values[0];
  await interaction.update(renderBuilder(sessionId, draft));
}

export async function handlePanelModalSubmit(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":");
  const kind = parts[0];

  if (kind === "panel_slot_modal") {
    const sessionId = parts[1];
    const index = parseInt(parts[2], 10);
    const draft = drafts.get(sessionId);
    if (!draft) {
      await interaction.reply({ embeds: [errorEmbed("This builder session expired. Run `/setup panel` again.")], ephemeral: true });
      return;
    }
    const label = interaction.fields.getTextInputValue("label").trim();
    const emoji = interaction.fields.getTextInputValue("emoji").trim() || undefined;
    const description = interaction.fields.getTextInputValue("description").trim() || undefined;
    draft.topics[index] = { label, emoji, description };
    await interaction.update(renderBuilder(sessionId, draft));
    return;
  }

  if (kind === "panel_info_modal") {
    const sessionId = parts[1];
    const draft = drafts.get(sessionId);
    if (!draft) {
      await interaction.reply({ embeds: [errorEmbed("This builder session expired. Run `/setup panel` again.")], ephemeral: true });
      return;
    }
    draft.title = interaction.fields.getTextInputValue("title").trim();
    draft.description = interaction.fields.getTextInputValue("description").trim() || "To create a ticket use the menu below";
    await interaction.update(renderBuilder(sessionId, draft));
    return;
  }
}

export async function handlePanelSend(interaction: ButtonInteraction) {
  const [, sessionId] = interaction.customId.split(":");
  const draft = drafts.get(sessionId);
  if (!draft) {
    await interaction.reply({ embeds: [errorEmbed("This builder session expired. Run `/setup panel` again.")], ephemeral: true });
    return;
  }

  const filledTopics = draft.topics.filter((t): t is TopicSlot => !!t?.label);

  if (!draft.channelId) {
    await interaction.reply({ embeds: [errorEmbed("Please select a channel before sending.")], ephemeral: true });
    return;
  }
  if (filledTopics.length === 0) {
    await interaction.reply({ embeds: [errorEmbed("Please fill in at least one topic slot before sending.")], ephemeral: true });
    return;
  }

  const channel = interaction.guild!.channels.cache.get(draft.channelId) as TextChannel;
  if (!channel) {
    await interaction.reply({ embeds: [errorEmbed("Selected channel no longer exists.")], ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setTitle(draft.title).setColor(0x5865f2).setDescription(draft.description);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_panel_select:${draft.panelName}`)
      .setPlaceholder("Select a topic...")
      .addOptions(
        filledTopics.map((t) => ({
          label: t.label!,
          value: t.label!,
          description: t.description ?? undefined,
          emoji: t.emoji ?? "📩",
        })),
      ),
  );

  await channel.send({ embeds: [embed], components: [row] });

  // Persist: clear old topics for this panel name, then insert fresh ones
  await db.delete(ticketTopicsTable).where(and(eq(ticketTopicsTable.guildId, draft.guildId), eq(ticketTopicsTable.panelName, draft.panelName)));
  for (const t of filledTopics) {
    await db.insert(ticketTopicsTable).values({
      guildId: draft.guildId,
      panelName: draft.panelName,
      label: t.label!,
      description: t.description,
      emoji: t.emoji ?? "📩",
    });
  }
  await db
    .insert(ticketPanelsTable)
    .values({ guildId: draft.guildId, panelName: draft.panelName, title: draft.title, description: draft.description, channelId: draft.channelId })
    .catch(() => {});

  drafts.delete(sessionId);
  await interaction.update({
    embeds: [successEmbed("Panel Sent", `Panel **${draft.panelName}** sent to <#${draft.channelId}> with ${filledTopics.length} topic(s).`)],
    components: [],
  });
}

export async function handlePanelCancel(interaction: ButtonInteraction) {
  const [, sessionId] = interaction.customId.split(":");
  drafts.delete(sessionId);
  await interaction.update({ embeds: [errorEmbed("Panel builder cancelled.")], components: [] });
}