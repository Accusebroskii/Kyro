import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  TextChannel,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { checkAdmin, checkModerator } from "../lib/permissions.js";
import { successEmbed, errorEmbed } from "../lib/embeds.js";
import { db, modLogsTable } from "@workspace/db";

export const roleCommand = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a member")
    .addSubcommand((s) =>
      s.setName("add").setDescription("Add a role to a member")
        .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role to add").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Remove a role from a member")
        .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getMember("user") as GuildMember;
    const role = interaction.options.getRole("role", true);
    if (!target) { await interaction.reply({ embeds: [errorEmbed("Member not found.")], ephemeral: true }); return; }
    try {
      if (sub === "add") {
        await target.roles.add(role.id);
        await interaction.reply({ embeds: [successEmbed("Role Added", `Added <@&${role.id}> to ${target.user.tag}.`)] });
      } else {
        await target.roles.remove(role.id);
        await interaction.reply({ embeds: [successEmbed("Role Removed", `Removed <@&${role.id}> from ${target.user.tag}.`)] });
      }
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(String(err))], ephemeral: true });
    }
  },
};

export const roleAllCommand = {
  data: new SlashCommandBuilder()
    .setName("role-all")
    .setDescription("Give a role to every member in the server")
    .addRoleOption((o) =>
      o.setName("role").setDescription("Role to give to everyone").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkAdmin(interaction))) return;

    const role = interaction.options.getRole("role", true);
    const guild = interaction.guild!;

    // The bot's own highest role must sit above the target role in the
    // hierarchy, or every single assignment below will fail. Catch this
    // up front with a clear message instead of grinding through hundreds
    // of failures.
    const botMember = guild.members.me;
    if (!botMember) {
      await interaction.reply({
        embeds: [errorEmbed("Couldn't resolve the bot's own member object in this server.")],
        ephemeral: true,
      });
      return;
    }
    if (botMember.roles.highest.comparePositionTo(role as import("discord.js").Role) <= 0) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            `I can't assign <@&${role.id}> because it's positioned above (or equal to) my own highest role in the role list. Move my role above it in Server Settings → Roles, then try again.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    // Make sure the member cache is fully populated — on larger servers
    // Discord.js may not have every member cached yet.
    const members = await guild.members.fetch();

    const targets = members.filter((m) => !m.roles.cache.has(role.id));
    const total = targets.size;

    if (total === 0) {
      await interaction.editReply({
        embeds: [successEmbed("Nothing to Do", `Everyone already has <@&${role.id}>.`)],
      });
      return;
    }

    let succeeded = 0;
    const failed: string[] = [];

    // Process sequentially with a small delay between requests rather than
    // firing everything at once. Discord rate-limits role-modification
    // requests per-guild; going in order (and awaiting each one) lets the
    // discord.js REST manager handle rate-limit backoff automatically
    // instead of flooding it with hundreds of simultaneous requests.
    let processed = 0;
    const progressEvery = 25;

    for (const member of targets.values()) {
      try {
        await member.roles.add(role.id);
        succeeded++;
      } catch (err: any) {
        failed.push(`${member.user.tag}: ${err.message ?? "failed"}`);
      }

      processed++;
      if (processed % progressEvery === 0 && processed < total) {
        await interaction.editReply({
          embeds: [
            successEmbed(
              "Adding Role...",
              `Progress: **${processed}/${total}** members processed.`,
            ),
          ],
        }).catch(() => {});
      }
    }

    const summaryLines = [
      `Gave <@&${role.id}> to **${succeeded}** member(s).`,
    ];
    if (failed.length > 0) {
      summaryLines.push(`Failed for **${failed.length}** member(s).`);
    }

    if (failed.length > 0) {
      await interaction.editReply({
        embeds: [
          {
            title: "Role Added (with some errors)",
            color: 0xf1c40f,
            description: `${summaryLines.join("\n")}\n\n**Errors (first 10):**\n${failed
              .slice(0, 10)
              .join("\n")}`,
          },
        ],
      });
    } else {
      await interaction.editReply({
        embeds: [successEmbed("Role Added to Everyone", summaryLines.join("\n"))],
      });
    }
  },
};

export const slowmodeCommand = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode for the current channel")
    .addIntegerOption((o) => o.setName("seconds").setDescription("Slowmode in seconds (0 to disable)").setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const secs = interaction.options.getInteger("seconds", true);
    const channel = interaction.channel as TextChannel;
    await channel.setRateLimitPerUser(secs);
    await interaction.reply({ embeds: [successEmbed("Slowmode Set", secs === 0 ? "Slowmode disabled." : `Slowmode set to ${secs} seconds.`)] });
  },
};

export const lockCommand = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel")
    .addStringOption((o) => o.setName("reason").setDescription("Reason"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const channel = interaction.channel as TextChannel;
    const reason = interaction.options.getString("reason") ?? "Channel locked by moderator";
    await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: false });
    await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "lock", targetId: channel.id, targetTag: `#${channel.name}`, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason });
    await interaction.reply({ embeds: [successEmbed("Channel Locked", `🔒 ${channel} has been locked.\n**Reason:** ${reason}`)] });
  },
};

export const unlockCommand = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const channel = interaction.channel as TextChannel;
    await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: null });
    await db.insert(modLogsTable).values({ guildId: interaction.guildId!, action: "unlock", targetId: channel.id, targetTag: `#${channel.name}`, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag });
    await interaction.reply({ embeds: [successEmbed("Channel Unlocked", `🔓 ${channel} has been unlocked.`)] });
  },
};

export const announceCommand = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement embed to a channel")
    .addStringOption((o) => o.setName("message").setDescription("Announcement content").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Target channel (defaults to current)").addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName("title").setDescription("Embed title"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const msg = interaction.options.getString("message", true);
    const title = interaction.options.getString("title") ?? "📢 Announcement";
    const target = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
    const embed = new EmbedBuilder().setTitle(title).setDescription(msg).setColor(0x5865f2).setTimestamp().setFooter({ text: `Posted by ${interaction.user.tag}` });
    await target.send({ embeds: [embed] });
    await interaction.reply({ content: `Announcement sent to ${target}.`, ephemeral: true });
  },
};

export const nickCommand = {
  data: new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Change a member's nickname")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption((o) => o.setName("nickname").setDescription("New nickname (leave blank to reset)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkModerator(interaction))) return;
    const target = interaction.options.getMember("user") as GuildMember;
    const nick = interaction.options.getString("nickname") ?? null;
    if (!target) { await interaction.reply({ embeds: [errorEmbed("Member not found.")], ephemeral: true }); return; }
    await target.setNickname(nick);
    await interaction.reply({ embeds: [successEmbed("Nickname Changed", nick ? `Set ${target.user.tag}'s nickname to **${nick}**.` : `Reset ${target.user.tag}'s nickname.`)] });
  },
};