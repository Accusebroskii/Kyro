import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { errorEmbed, successEmbed, infoEmbed } from "../lib/embeds.js";

function isOwner(interaction: ChatInputCommandInteraction | ModalSubmitInteraction): boolean {
  return interaction.guild!.ownerId === interaction.user.id;
}

interface ParsedChannel {
  name: string;
}

interface ParsedCategory {
  name: string;
  channels: ParsedChannel[];
}

function parseLayout(raw: string): ParsedCategory[] {
  // Insert a newline before every emoji — handles pastes that lose their line breaks
  const normalized = raw.replace(/(\p{Emoji}\uFE0F?)/gu, "\n$1");
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const categories: ParsedCategory[] = [];
  let current: ParsedCategory | null = null;

  for (const line of lines) {
    // Optional emoji, then any/no separator symbol, then the actual text.
    // Separator set includes "・" (katakana middle dot, U+30FB) since that's
    // commonly used in Discord channel-list templates (e.g. "👋・welcome")
    // and was previously missing, causing it to be captured as part of the
    // channel name instead of being stripped.
    const match = line.match(/^(\p{Emoji}\uFE0F?)?\s*[|｜\-–:⟡✦◆●→»・]*\s*(.+)$/u);
    if (!match) continue;
    const emoji = match[1] ?? "";
    const text = match[2]?.trim();
    if (!text) continue;

    const isCategory = text === text.toUpperCase() && /[A-Za-z]/.test(text);

    if (isCategory) {
      current = { name: emoji ? `${emoji} ${text}` : text, channels: [] };
      categories.push(current);
    } else {
      if (!current) {
        current = { name: "General", channels: [] };
        categories.push(current);
      }
      const channelName = text.toLowerCase().replace(/\s+/g, "-");
      current.channels.push({ name: emoji ? `${emoji}｜${channelName}` : channelName });
    }
  }

  return categories;
}

export const templateCommand = {
  data: new SlashCommandBuilder()
    .setName("template")
    .setDescription("Paste a category/channel layout to auto-build it (server owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isOwner(interaction)) {
      await interaction.reply({ embeds: [errorEmbed("Only the server owner can use this command.")], ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("template_create_modal")
      .setTitle("Paste Server Layout")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
          .setCustomId("layout")
          .setLabel("CAPS = category, lowercase = channel")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
          .setPlaceholder("Example:\nINFORMATION\nannouncements\nupdates\n\nCOMMUNITY\ngeneral\nchat"),
        ),
      );

    await interaction.showModal(modal);
  },
};

export async function handleTemplateModalSubmit(interaction: ModalSubmitInteraction) {
  if (!isOwner(interaction)) {
    await interaction.reply({ embeds: [errorEmbed("Only the server owner can use this command.")], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raw = interaction.fields.getTextInputValue("layout");
  const categories = parseLayout(raw);

  if (categories.length === 0) {
    await interaction.editReply({ embeds: [errorEmbed("Couldn't parse any categories/channels from that text. Make sure category lines contain ⟡ and channel lines contain ｜.")] });
    return;
  }

  const guild = interaction.guild!;
  let categoriesCreated = 0;
  let channelsCreated = 0;
  const errors: string[] = [];

  for (const cat of categories) {
    try {
      const category = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: guild.ownerId, allow: [PermissionFlagsBits.ViewChannel] },
        ],
      });
      categoriesCreated++;

      for (const ch of cat.channels) {
        try {
          await guild.channels.create({
            name: ch.name,
            type: ChannelType.GuildText,
            parent: category.id,
          });
          channelsCreated++;
        } catch (err: any) {
          errors.push(`Channel "${ch.name}": ${err.message ?? "failed"}`);
        }
      }
    } catch (err: any) {
      errors.push(`Category "${cat.name}": ${err.message ?? "failed"}`);
    }
  }

  const summary = `Created **${categoriesCreated}** categor${categoriesCreated === 1 ? "y" : "ies"} and **${channelsCreated}** channel(s).\n\nAll new channels are hidden from everyone except you (the owner) — adjust permissions for staff/members when ready.`;

  if (errors.length > 0) {
    await interaction.editReply({
      embeds: [infoEmbed("Template Applied (with some errors)", `${summary}\n\n**Errors:**\n${errors.slice(0, 10).join("\n")}`)],
    });
  } else {
    await interaction.editReply({ embeds: [successEmbed("Template Applied", summary)] });
  }
}