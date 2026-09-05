import { MessageFlags } from "discord.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { checkAdmin } from "../lib/permissions.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";

interface SavedEmbed {
  title?: string;
  description?: string;
  color?: string;
  footer?: string;
  imageUrl?: string;
  authorTag: string;
  createdAt: number;
}

const savedEmbeds = new Map<string, SavedEmbed>();

function key(guildId: string, name: string): string {
  return `${guildId}:${name.toLowerCase()}`;
}

function parseColor(input?: string): number | undefined {
  if (!input) return undefined;
  const hex = input.trim().replace(/^#/, "");
  const num = parseInt(hex, 16);
  return Number.isNaN(num) ? undefined : num;
}

export const embedCommand = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Create and send custom embeds")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create a new embed (opens a form)")
        .addStringOption((o) =>
          o.setName("name").setDescription("A short name to reference this embed later").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("send")
        .setDescription("Send a previously created embed")
        .addStringOption((o) => o.setName("name").setDescription("The embed's name").setRequired(true))
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to send to (defaults to this channel)")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List saved embeds for this server"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === "create") {
      const name = interaction.options.getString("name", true);

      const modal = new ModalBuilder()
        .setCustomId(`embed_create_modal:${encodeURIComponent(name)}`)
        .setTitle(`Create Embed: ${name}`.slice(0, 45));

      const titleInput = new TextInputBuilder()
        .setCustomId("embed_title")
        .setLabel("Title")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256);

      const descInput = new TextInputBuilder()
        .setCustomId("embed_description")
        .setLabel("Description (supports # __ ** markdown)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000);

      const colorInput = new TextInputBuilder()
        .setCustomId("embed_color")
        .setLabel("Color (hex, e.g. 5865F2)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(7);

      const footerInput = new TextInputBuilder()
        .setCustomId("embed_footer")
        .setLabel("Footer text")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048);

      const imageInput = new TextInputBuilder()
        .setCustomId("embed_image")
        .setLabel("Image URL")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
      );

      await interaction.showModal(modal);
      return;
    }

    if (sub === "send") {
      const name = interaction.options.getString("name", true);
      const saved = savedEmbeds.get(key(guildId, name));
      if (!saved) {
        await interaction.reply({
          embeds: [errorEmbed(`No embed named "${name}" found. Use \`/embed list\` to see saved embeds.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel =
        (interaction.options.getChannel("channel") as import("discord.js").TextChannel | null) ??
        (interaction.channel as import("discord.js").TextChannel);

      if (!channel || !("send" in channel)) {
        await interaction.reply({ embeds: [errorEmbed("Couldn't resolve a valid text channel.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder();
      if (saved.title) embed.setTitle(saved.title);
      if (saved.description) embed.setDescription(saved.description);
      const color = parseColor(saved.color);
      if (color !== undefined) embed.setColor(color);
      if (saved.footer) embed.setFooter({ text: saved.footer });
      if (saved.imageUrl) embed.setImage(saved.imageUrl);
      embed.setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
        await interaction.reply({
          embeds: [successEmbed("Embed Sent", `Sent "${name}" to ${channel}.`)],
          flags: MessageFlags.Ephemeral,
        });
      } catch (err: any) {
        await interaction.reply({
          embeds: [errorEmbed(`Failed to send embed: ${err?.message ?? "unknown error"}`)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (sub === "list") {
      const prefix = `${guildId}:`;
      const names = [...savedEmbeds.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));

      await interaction.reply({
        embeds: [
          infoEmbed(
            "Saved Embeds",
            names.length ? names.map((n) => `• ${n}`).join("\n") : "No embeds saved yet. Use `/embed create` to make one.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};

export async function handleEmbedModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const [, encodedName] = interaction.customId.split(":");
  const name = decodeURIComponent(encodedName ?? "untitled");
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ embeds: [errorEmbed("This can only be used in a server.")], flags: MessageFlags.Ephemeral });
    return;
  }

  const title = interaction.fields.getTextInputValue("embed_title").trim();
  const description = interaction.fields.getTextInputValue("embed_description").trim();
  const color = interaction.fields.getTextInputValue("embed_color").trim();
  const footer = interaction.fields.getTextInputValue("embed_footer").trim();
  const imageUrl = interaction.fields.getTextInputValue("embed_image").trim();

  savedEmbeds.set(key(guildId, name), {
    title: title || undefined,
    description: description || undefined,
    color: color || undefined,
    footer: footer || undefined,
    imageUrl: imageUrl || undefined,
    authorTag: interaction.user.tag,
    createdAt: Date.now(),
  });

  await interaction.reply({
    embeds: [successEmbed("Embed Saved", `Saved as "${name}". Use \`/embed send name:${name}\` to post it.`)],
    flags: MessageFlags.Ephemeral,
  });
}
