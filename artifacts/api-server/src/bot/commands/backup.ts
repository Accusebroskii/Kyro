import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  OverwriteType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from "discord.js";
import { db, serverBackupsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";

interface BackupRole {
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string;
  position: number;
}

interface BackupOverwrite {
  idType: "role" | "member";
  roleName?: string;
  memberId?: string;
  allow: string;
  deny: string;
}

interface BackupChannel {
  name: string;
  type: number;
  topic?: string | null;
  nsfw?: boolean;
  position: number;
  parentName?: string | null;
  isCategory: boolean;
  overwrites: BackupOverwrite[];
}

interface BackupData {
  roles: BackupRole[];
  channels: BackupChannel[];
}

function isOwner(interaction: ChatInputCommandInteraction | ButtonInteraction): boolean {
  return interaction.guild!.ownerId === interaction.user.id;
}

export const backupCommand = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Snapshot or restore your server's structure (server owner only)")
    .addSubcommand((s) => s.setName("create").setDescription("Create a backup of all roles and channels"))
    .addSubcommand((s) => s.setName("restore").setDescription("Restore missing roles/channels from the latest backup"))
    .addSubcommand((s) => s.setName("list").setDescription("List available backups")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isOwner(interaction)) {
      await interaction.reply({ embeds: [errorEmbed("Only the server owner can use backup commands.")], ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;
    const guildId = guild.id;

    if (sub === "create") {
      await interaction.deferReply();

      const roles: BackupRole[] = guild.roles.cache
        .filter((r) => r.id !== guild.id && !r.managed)
        .map((r) => ({
          name: r.name,
          color: r.color,
          hoist: r.hoist,
          mentionable: r.mentionable,
          permissions: r.permissions.bitfield.toString(),
          position: r.position,
        }));

      const channels: BackupChannel[] = guild.channels.cache.map((ch) => {
        const overwrites: BackupOverwrite[] = ch.permissionOverwrites.cache.map((ow) => {
          if (ow.type === OverwriteType.Role) {
            const role = guild.roles.cache.get(ow.id);
            return {
              idType: "role" as const,
              roleName: role?.name ?? "@everyone",
              allow: ow.allow.bitfield.toString(),
              deny: ow.deny.bitfield.toString(),
            };
          }
          return {
            idType: "member" as const,
            memberId: ow.id,
            allow: ow.allow.bitfield.toString(),
            deny: ow.deny.bitfield.toString(),
          };
        });

        return {
          name: ch.name,
          type: ch.type,
          topic: "topic" in ch ? (ch as any).topic : null,
          nsfw: "nsfw" in ch ? (ch as any).nsfw : false,
          position: ch.position,
          parentName: ch.parent?.name ?? null,
          isCategory: ch.type === ChannelType.GuildCategory,
          overwrites,
        };
      });

      const data: BackupData = { roles, channels };

      await db.insert(serverBackupsTable).values({ guildId, createdBy: interaction.user.id, data: data as any });

      await interaction.editReply({
        embeds: [successEmbed("Backup Created", `Saved **${roles.length}** roles and **${channels.length}** channels.`)],
      });

    } else if (sub === "restore") {
      const [latest] = await db.select().from(serverBackupsTable).where(eq(serverBackupsTable.guildId, guildId)).orderBy(desc(serverBackupsTable.createdAt)).limit(1);
      if (!latest) {
        await interaction.reply({ embeds: [errorEmbed("No backups found for this server. Run `/backup create` first.")], ephemeral: true });
        return;
      }

      const data = latest.data as unknown as BackupData;
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`backup_restore_confirm:${latest.id}`).setLabel("Confirm Restore").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("backup_restore_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      );

      await interaction.reply({
        embeds: [
          infoEmbed(
            "⚠️ Confirm Restore",
            `This will recreate any **missing** roles and channels from the backup taken <t:${Math.floor(new Date(latest.createdAt).getTime() / 1000)}:R>.\n\n**Roles:** ${data.roles.length}\n**Channels:** ${data.channels.length}\n\nExisting roles/channels with the same name will NOT be touched. This only fills in what's missing.`,
          ),
        ],
        components: [row],
        ephemeral: true,
      });

    } else if (sub === "list") {
      const backups = await db.select().from(serverBackupsTable).where(eq(serverBackupsTable.guildId, guildId)).orderBy(desc(serverBackupsTable.createdAt)).limit(10);
      if (!backups.length) {
        await interaction.reply({ embeds: [infoEmbed("Backups", "No backups found.")], ephemeral: true });
        return;
      }
      const list = backups
        .map((b) => {
          const d = b.data as unknown as BackupData;
          return `**#${b.id}** — <t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:f> — ${d.roles.length} roles, ${d.channels.length} channels`;
        })
        .join("\n");
      await interaction.reply({ embeds: [infoEmbed("Backups", list)], ephemeral: true });
    }
  },
};

export async function handleBackupRestoreConfirm(interaction: ButtonInteraction) {
  if (!isOwner(interaction)) {
    await interaction.reply({ embeds: [errorEmbed("Only the server owner can do this.")], ephemeral: true });
    return;
  }

  const backupId = parseInt(interaction.customId.split(":")[1], 10);
  await interaction.update({ embeds: [infoEmbed("Restoring...", "Please wait, this may take a moment.")], components: [] });

  const [backup] = await db.select().from(serverBackupsTable).where(eq(serverBackupsTable.id, backupId)).limit(1);
  if (!backup) {
    await interaction.editReply({ embeds: [errorEmbed("Backup not found.")] });
    return;
  }

  const guild = interaction.guild!;
  const data = backup.data as unknown as BackupData;

  let rolesCreated = 0;
  let channelsCreated = 0;

  // Restore roles that don't currently exist (matched by name)
  for (const r of data.roles) {
    const exists = guild.roles.cache.some((existing) => existing.name === r.name);
    if (exists) continue;
    try {
      await guild.roles.create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: BigInt(r.permissions),
      });
      rolesCreated++;
    } catch {
      // skip on failure (e.g. role limit hit)
    }
  }

  // Restore categories first
  const categoryMap = new Map<string, string>(); // name -> new category id
  for (const ch of data.channels.filter((c) => c.isCategory)) {
    const exists = guild.channels.cache.find((existing) => existing.name === ch.name && existing.type === ChannelType.GuildCategory);
    if (exists) {
      categoryMap.set(ch.name, exists.id);
      continue;
    }
    try {
      const created = await guild.channels.create({ name: ch.name, type: ChannelType.GuildCategory });
      categoryMap.set(ch.name, created.id);
      channelsCreated++;
    } catch {
      // skip
    }
  }

  // Restore non-category channels
  for (const ch of data.channels.filter((c) => !c.isCategory)) {
    const exists = guild.channels.cache.some((existing) => existing.name === ch.name && existing.type === ch.type);
    if (exists) continue;
    try {
      const parentId = ch.parentName ? categoryMap.get(ch.parentName) : undefined;
      const overwrites = ch.overwrites
        .map((ow) => {
          if (ow.idType === "role") {
            const role = guild.roles.cache.find((r) => r.name === ow.roleName) ?? (ow.roleName === "@everyone" ? guild.roles.everyone : undefined);
            if (!role) return null;
            return { id: role.id, allow: BigInt(ow.allow), deny: BigInt(ow.deny) };
          }
          return { id: ow.memberId!, allow: BigInt(ow.allow), deny: BigInt(ow.deny) };
        })
        .filter((o): o is { id: string; allow: bigint; deny: bigint } => o !== null);

      await guild.channels.create({
        name: ch.name,
        type: ch.type as any,
        parent: parentId,
        topic: ch.topic ?? undefined,
        nsfw: ch.nsfw ?? false,
        permissionOverwrites: overwrites,
      });
      channelsCreated++;
    } catch {
      // skip on failure
    }
  }

  await interaction.editReply({
    embeds: [successEmbed("Restore Complete", `Recreated **${rolesCreated}** missing role(s) and **${channelsCreated}** missing channel(s).`)],
  });
}

export async function handleBackupRestoreCancel(interaction: ButtonInteraction) {
  await interaction.update({ embeds: [errorEmbed("Restore cancelled.")], components: [] });
}
