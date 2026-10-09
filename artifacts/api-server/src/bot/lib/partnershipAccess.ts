import {
  Guild,
  GuildMember,
  PermissionFlagsBits,
  Role,
} from "discord.js";

export type PartnershipRoleGrantResult =
  | {
      ok: true;
      member: GuildMember;
      role: Role;
      alreadyAssigned: boolean;
    }
  | { ok: false; error: string };

export async function grantPartnershipPostingRole(
  guild: Guild,
  userId: string,
  roleId: string,
): Promise<PartnershipRoleGrantResult> {
  const botMember =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botMember) {
    return { ok: false, error: "I couldn't confirm my server permissions." };
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, error: "I need the Manage Roles permission." };
  }

  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.id === guild.id || role.managed) {
    return { ok: false, error: "The configured partnership role is unavailable or cannot be assigned." };
  }
  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return {
      ok: false,
      error: "My highest role must be above the configured partnership role.",
    };
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return { ok: false, error: "The applicant is no longer a member of this server." };
  }

  if (member.roles.cache.has(role.id)) {
    return { ok: true, member, role, alreadyAssigned: true };
  }

  try {
    await member.roles.add(role, "AI verified partnership advertisement screenshot");
  } catch {
    return {
      ok: false,
      error: "Discord rejected the role assignment. Check the bot's role hierarchy and permissions.",
    };
  }

  return { ok: true, member, role, alreadyAssigned: false };
}
