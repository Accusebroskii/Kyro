import { MessageFlags } from "discord.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";
import { checkAdmin } from "../lib/permissions.js";

interface ParsedRole {
  name: string;
  color?: string;
  permissions?: bigint;
}

const PERM_MAP: Record<string, bigint> = {
  admin: PermissionFlagsBits.Administrator,
  administrator: PermissionFlagsBits.Administrator,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  manageroles: PermissionFlagsBits.ManageRoles,
  managechannels: PermissionFlagsBits.ManageChannels,
  managemessages: PermissionFlagsBits.ManageMessages,
  managenicknames: PermissionFlagsBits.ManageNicknames,
  moderatemembers: PermissionFlagsBits.ModerateMembers,
  mentioneveryone: PermissionFlagsBits.MentionEveryone,
  manageguild: PermissionFlagsBits.ManageGuild,
  manageevents: PermissionFlagsBits.ManageEvents,
  managewebhooks: PermissionFlagsBits.ManageWebhooks,
  manageemojis: PermissionFlagsBits.ManageGuildExpressions,
  viewchannel: PermissionFlagsBits.ViewChannel,
  sendmessages: PermissionFlagsBits.SendMessages,
  connect: PermissionFlagsBits.Connect,
  speak: PermissionFlagsBits.Speak,
  mutemembers: PermissionFlagsBits.MuteMembers,
  deafenmembers: PermissionFlagsBits.DeafenMembers,
  movemembers: PermissionFlagsBits.MoveMembers,
  attachfiles: PermissionFlagsBits.AttachFiles,
  embedlinks: PermissionFlagsBits.EmbedLinks,
  addreactions: PermissionFlagsBits.AddReactions,
  useexternalemojis: PermissionFlagsBits.UseExternalEmojis,
  readmessagehistory: PermissionFlagsBits.ReadMessageHistory,
};

function parsePermissions(input: string): bigint {
  const keys = input.split(",").map((p) => p.trim().toLowerCase().replace(/[^a-z]/g, ""));
  let bits = 0n;
  for (const key of keys) {
    if (PERM_MAP[key]) bits |= PERM_MAP[key];
  }
  return bits;
}

function parseRoles(raw: string): ParsedRole[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const roles: ParsedRole[] = [];

  for (const line of lines) {
    // Format: "Name | #HEXCOLOR | perm1,perm2"  (color and perms both optional, any order via |)
    const parts = line.split("|").map((p) => p.trim());
    const name = parts[0];
    let color: string | undefined;
    let permissions: bigint | undefined;

    for (const part of parts.slice(1)) {
      if (/^#?[0-9a-fA-F]{6}$/.test(part)) {
        color = part.startsWith("#") ? part : `#${part}`;
      } else if (part.length > 0) {
        permissions = parsePermissions(part);
      }
    }

    if (name) roles.push({ name, color, permissions });
  }

  return roles;
}

export const createRolesCommand = {
  data: new SlashCommandBuilder()
    .setName("createroles")
    .setDescription("Paste a list of role names to bulk-create them (with optional colors and permissions)")
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
            .setLabel("Name | #HEXCOLOR | perm1,perm2 (all optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
            .setPlaceholder("Admin | #FF5733 | admin\nModerator | #5865F2 | kick,ban,managemessages\nMember"),
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
    await interaction.editReply({ embeds: [errorEmbed("No role names found.")] });
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
        permissions: role.permissions !== undefined ? new PermissionsBitField(role.permissions) : undefined,
      });
      created++;
    } catch (err: any) {
      errors.push(`"${role.name}": ${err.message ?? "failed"}`);
    }
  }

  const summary = `Created **${created}** of **${parsed.length}** role(s).`;

  if (errors.length > 0) {
    await interaction.editReply({ embeds: [infoEmbed("Roles Created (with some errors)", `${summary}\n\n**Errors:**\n${errors.slice(0, 10).join("\n")}`)] });
  } else {
    await interaction.editReply({ embeds: [successEmbed("Roles Created", summary)] });
  }
}