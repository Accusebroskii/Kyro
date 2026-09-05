import { MessageFlags } from "discord.js";
import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  PermissionResolvable,
} from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function checkPermission(
  interaction: ChatInputCommandInteraction,
  perm: PermissionResolvable,
): Promise<boolean> {
  if (!interaction.memberPermissions?.has(perm)) {
    await interaction.reply({
      content: "You don't have permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

export async function checkModerator(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const member = interaction.member as GuildMember;
  if (!member) {
    await interaction.reply({ content: "This command must be used in a server.", flags: MessageFlags.Ephemeral });
    return false;
  }

  const config = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, interaction.guildId!))
    .limit(1);

  const cfg = config[0];
  if (cfg?.modRoleId && member.roles.cache.has(cfg.modRoleId)) return true;
  if (cfg?.adminRoleId && member.roles.cache.has(cfg.adminRoleId)) return true;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  await interaction.reply({ content: "You need Moderator or Administrator permissions.", flags: MessageFlags.Ephemeral });
  return false;
}

export async function checkAdmin(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const member = interaction.member as GuildMember;
  if (!member) {
    await interaction.reply({ content: "This command must be used in a server.", flags: MessageFlags.Ephemeral });
    return false;
  }

  const config = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, interaction.guildId!))
    .limit(1);

  const cfg = config[0];
  if (cfg?.adminRoleId && member.roles.cache.has(cfg.adminRoleId)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  await interaction.reply({ content: "You need Administrator permissions.", flags: MessageFlags.Ephemeral });
  return false;
}

export function isOwner(interaction: ChatInputCommandInteraction): boolean {
  return interaction.user.id === process.env["OWNER_ID"];
}
