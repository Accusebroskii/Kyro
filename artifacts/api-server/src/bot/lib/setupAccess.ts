import { GuildMember, MessageFlags, PermissionFlagsBits } from "discord.js";
import { and, eq } from "drizzle-orm";
import {
  db,
  guildConfigTable,
  setupAccessRolesTable,
} from "@workspace/db";

export async function canUseSetup(member: GuildMember): Promise<boolean> {
  if (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  const [config] = await db
    .select({ adminRoleId: guildConfigTable.adminRoleId })
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, member.guild.id))
    .limit(1);
  if (config?.adminRoleId && member.roles.cache.has(config.adminRoleId)) {
    return true;
  }

  const allowedRoles = await db
    .select({ roleId: setupAccessRolesTable.roleId })
    .from(setupAccessRolesTable)
    .where(eq(setupAccessRolesTable.guildId, member.guild.id));
  return allowedRoles.some(({ roleId }) => member.roles.cache.has(roleId));
}

export async function canManageApplications(
  member: GuildMember,
): Promise<boolean> {
  if (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers)
  ) {
    return true;
  }

  const [config] = await db
    .select({
      modRoleId: guildConfigTable.modRoleId,
      adminRoleId: guildConfigTable.adminRoleId,
    })
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, member.guild.id))
    .limit(1);

  if (
    (config?.modRoleId && member.roles.cache.has(config.modRoleId)) ||
    (config?.adminRoleId && member.roles.cache.has(config.adminRoleId))
  ) {
    return true;
  }

  const setupRoles = await db
    .select({ roleId: setupAccessRolesTable.roleId })
    .from(setupAccessRolesTable)
    .where(eq(setupAccessRolesTable.guildId, member.guild.id));
  return setupRoles.some(({ roleId }) => member.roles.cache.has(roleId));
}

export async function requireApplicationStaff(
  interaction: import("discord.js").ChatInputCommandInteraction,
): Promise<boolean> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (member && (await canManageApplications(member))) return true;

  await interaction.reply({
    content:
      "You need a staff role, a configured setup role, or server management permissions to manage applications.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

export async function addSetupAccessRole(
  guildId: string,
  roleId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(setupAccessRolesTable)
    .values({ guildId, roleId, createdBy: userId })
    .onConflictDoNothing();
}

export async function removeSetupAccessRole(
  guildId: string,
  roleId: string,
): Promise<void> {
  await db
    .delete(setupAccessRolesTable)
    .where(
      and(
        eq(setupAccessRolesTable.guildId, guildId),
        eq(setupAccessRolesTable.roleId, roleId),
      ),
    );
}

export async function listSetupAccessRoles(guildId: string) {
  return db
    .select()
    .from(setupAccessRolesTable)
    .where(eq(setupAccessRolesTable.guildId, guildId));
}
