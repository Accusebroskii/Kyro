import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";
import { checkAdmin } from "../lib/permissions.js";

interface ParsedRole {
  name: string;
  color?: string;
}

function parseRoles(raw: string): ParsedRole[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const roles: ParsedRole[] = [];

  for (const line of lines) {
    // "Role Name #FF5733" or "Role Name, #FF5733" or just "Role Name"
    const match = line.match(/^(.+?)[\s,]+(#?[0-9a-fA-F]{6})$/);
    if (match) {
      const name = match[1].trim();
      let color = match[2].trim();
      if (!color.startsWith("#")) color = `#${color}`;
      roles.push({ name, color });
    } else {
      roles.push({ name: line });
    }
  }

  return roles;
}

export const createRolesCommand = {
  data: new SlashCommandBuilder()
    .setName("createroles")
    .setDescription("Paste a list of role names to bulk-create them (optionally with hex colors)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkAdmin(interaction))) return;

    const modal = new ModalBuilder()
      .setCustomId("createroles_modal")
      .setTitle("Bulk Create Roles")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("roles")
            .setLabel("One role per line. Optional: Name #HEXCOLOR")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
            .setPlaceholder("Admin #FF5733\nModerator #5865F2\nMember\nMuted #2F3136"),
        ),
      );

    await interaction.showModal(modal);
  },
};

export async function handleCreateRolesModalSubmit(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raw = interaction.fields.getTextInputValue("roles");
  const parsed = parseRoles(raw);

  if (parsed.length === 0) {
    await interaction.editReply({ embeds: [errorEmbed("No role names found. Make sure you put one role per line.")] });
    return;
  }

  const guild = interaction.guild!;
  let created = 0;
  const errors: string[] = [];

  for (const role of parsed) {
    try {
      await guild.roles.create({
        name: role.name,
        color: (role.color as any) ?? undefined,
      });
      created++;
    } catch (err: any) {
      errors.push(`"${role.name}": ${err.message ?? "failed"}`);
    }
  }

  const summary = `Created **${created}** of **${parsed.length}** role(s).`;

  if (errors.length > 0) {
    await interaction.editReply({
      embeds: [infoEmbed("Roles Created (with some errors)", `${summary}\n\n**Errors:**\n${errors.slice(0, 10).join("\n")}`)],
    });
  } else {
    await interaction.editReply({ embeds: [successEmbed("Roles Created", summary)] });
  }
}