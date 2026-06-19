import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { db, guildConfigTable, autoRolesTable, ticketTopicsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { checkAdmin } from "../lib/permissions.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";
import { startPanelBuilder, initialBuilderPayload } from "../lib/panelBuilder.js";

export const setupCommand = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure bot features for this server")
    .addSubcommand((s) =>
      s.setName("welcome").setDescription("Configure the welcome system")
        .addChannelOption((o) => o.setName("channel").setDescription("Welcome channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName("message").setDescription("Welcome message. Use {user}, {username}, {server}, {membercount}")),
    )
    .addSubcommand((s) =>
      s.setName("logs").setDescription("Configure logging channels")
        .addChannelOption((o) => o.setName("modlog").setDescription("Moderation log channel").addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName("general").setDescription("General log channel").addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((s) =>
      s.setName("tickets").setDescription("Configure the ticket system")
        .addChannelOption((o) => o.setName("category").setDescription("Category for ticket channels").addChannelTypes(ChannelType.GuildCategory))
        .addChannelOption((o) => o.setName("logchannel").setDescription("Ticket log channel").addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((s) =>
      s.setName("panel").setDescription("Open the interactive ticket panel builder")
        .addStringOption((o) => o.setName("name").setDescription("Internal panel name e.g. support").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("addtopic").setDescription("Add a topic to a ticket panel")
        .addStringOption((o) => o.setName("panel").setDescription("Panel name to add topic to").setRequired(true))
        .addStringOption((o) => o.setName("name").setDescription("Topic name e.g. Staff Report").setRequired(true))
        .addStringOption((o) => o.setName("description").setDescription("Short description shown in the panel"))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji for this topic e.g. 📩")),
    )
    .addSubcommand((s) =>
      s.setName("removetopic").setDescription("Remove a topic from a panel")
        .addStringOption((o) => o.setName("panel").setDescription("Panel name").setRequired(true))
        .addStringOption((o) => o.setName("name").setDescription("Exact topic name to remove").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("listtopics").setDescription("List all ticket topics for a panel")
        .addStringOption((o) => o.setName("panel").setDescription("Panel name (leave empty for all)") ),
    )
    .addSubcommand((s) =>
      s.setName("automod").setDescription("Toggle auto-moderation features")
        .addBooleanOption((o) => o.setName("antispam").setDescription("Enable/disable anti-spam"))
        .addBooleanOption((o) => o.setName("antiraid").setDescription("Enable/disable anti-raid"))
        .addBooleanOption((o) => o.setName("automod").setDescription("Enable/disable general auto-mod")),
    )
    .addSubcommand((s) =>
      s.setName("roles").setDescription("Set moderator and admin roles")
        .addRoleOption((o) => o.setName("modrole").setDescription("Moderator role"))
        .addRoleOption((o) => o.setName("adminrole").setDescription("Admin role"))
        .addRoleOption((o) => o.setName("muterole").setDescription("Mute role (for non-timeout mutes)")),
    )
    .addSubcommand((s) =>
      s.setName("jointovoice").setDescription("Configure join-to-create voice system")
        .addChannelOption((o) => o.setName("channel").setDescription("Voice channel users join to create").setRequired(true).addChannelTypes(ChannelType.GuildVoice))
        .addChannelOption((o) => o.setName("category").setDescription("Category for created channels").addChannelTypes(ChannelType.GuildCategory)),
    )
    .addSubcommand((s) =>
      s.setName("autorole").setDescription("Manage auto-roles assigned to new members")
        .addStringOption((o) => o.setName("action").setDescription("add or remove").setRequired(true).addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" },
          { name: "List", value: "list" },
        ))
        .addRoleOption((o) => o.setName("role").setDescription("Role to add/remove")),
    )
    .addSubcommand((s) => s.setName("view").setDescription("View current bot configuration"))
    .addSubcommand((s) =>
      s.setName("maxwarnings").setDescription("Set max warnings before auto-action")
        .addIntegerOption((o) => o.setName("count").setDescription("Max warnings (default: 3)").setRequired(true).setMinValue(1).setMaxValue(20)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await checkAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    const existing = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
    if (!existing[0]) {
      await db.insert(guildConfigTable).values({ guildId, guildName: interaction.guild!.name, ownerId: interaction.guild!.ownerId });
    }

    if (sub === "welcome") {
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message");
      await db.update(guildConfigTable).set({ welcomeChannelId: channel.id, ...(message ? { welcomeMessage: message } : {}) }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Welcome System", `Welcome channel set to <#${channel.id}>.${message ? `\nMessage: ${message}` : ""}`)] });

    } else if (sub === "logs") {
      const modlog = interaction.options.getChannel("modlog");
      const general = interaction.options.getChannel("general");
      await db.update(guildConfigTable).set({ ...(modlog ? { modLogChannelId: modlog.id } : {}), ...(general ? { logChannelId: general.id } : {}) }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Logging Configured", `${modlog ? `Mod log: <#${modlog.id}>` : ""}\n${general ? `General log: <#${general.id}>` : ""}`)] });

    } else if (sub === "tickets") {
      const cat = interaction.options.getChannel("category");
      const log = interaction.options.getChannel("logchannel");
      await db.update(guildConfigTable).set({
        ...(cat ? { ticketCategoryId: cat.id } : {}),
        ...(log ? { ticketLogChannelId: log.id } : {}),
      }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Tickets Configured", "Ticket system updated.")] });

    } else if (sub === "panel") {
      const panelName = interaction.options.getString("name", true);
      const { sessionId, draft } = startPanelBuilder(guildId, interaction.user.id, panelName);
      await interaction.reply({ ...initialBuilderPayload(sessionId, draft), ephemeral: true });

    } else if (sub === "addtopic") {
      const panelName = interaction.options.getString("panel", true);
      const label = interaction.options.getString("name", true);
      const description = interaction.options.getString("description") ?? undefined;
      const emoji = interaction.options.getString("emoji") ?? "📩";

      const existingTopics = await db.select().from(ticketTopicsTable).where(
        and(eq(ticketTopicsTable.guildId, guildId), eq(ticketTopicsTable.panelName, panelName))
      );
      if (existingTopics.length >= 25) {
        await interaction.reply({ embeds: [errorEmbed("You can have a maximum of 25 topics per panel.")], ephemeral: true });
        return;
      }

      await db.insert(ticketTopicsTable).values({ guildId, panelName, label, description, emoji });
      await interaction.reply({ embeds: [successEmbed("Topic Added", `Topic **${label}** added to panel **${panelName}**.`)] });

    } else if (sub === "removetopic") {
      const panelName = interaction.options.getString("panel", true);
      const label = interaction.options.getString("name", true);
      await db.delete(ticketTopicsTable).where(
        and(eq(ticketTopicsTable.guildId, guildId), eq(ticketTopicsTable.panelName, panelName), eq(ticketTopicsTable.label, label))
      );
      await interaction.reply({ embeds: [successEmbed("Topic Removed", `Topic **${label}** removed from panel **${panelName}**.`)] });

    } else if (sub === "listtopics") {
      const panelName = interaction.options.getString("panel");
      const topics = panelName
        ? await db.select().from(ticketTopicsTable).where(and(eq(ticketTopicsTable.guildId, guildId), eq(ticketTopicsTable.panelName, panelName)))
        : await db.select().from(ticketTopicsTable).where(eq(ticketTopicsTable.guildId, guildId));
      await interaction.reply({
        embeds: [infoEmbed("Ticket Topics", topics.length
          ? topics.map((t) => `${t.emoji} **[${t.panelName}]** ${t.label}${t.description ? ` — ${t.description}` : ""}`).join("\n")
          : "No topics found.")],
        ephemeral: true,
      });

    } else if (sub === "automod") {
      const antispam = interaction.options.getBoolean("antispam");
      const antiraid = interaction.options.getBoolean("antiraid");
      const automod = interaction.options.getBoolean("automod");
      await db.update(guildConfigTable).set({
        ...(antispam !== null ? { antispamEnabled: antispam } : {}),
        ...(antiraid !== null ? { antiRaidEnabled: antiraid } : {}),
        ...(automod !== null ? { automodEnabled: automod } : {}),
      }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("AutoMod Updated", `Anti-spam: ${antispam ?? "unchanged"}\nAnti-raid: ${antiraid ?? "unchanged"}\nAuto-mod: ${automod ?? "unchanged"}`)] });

    } else if (sub === "roles") {
      const mod = interaction.options.getRole("modrole");
      const admin = interaction.options.getRole("adminrole");
      const mute = interaction.options.getRole("muterole");
      await db.update(guildConfigTable).set({
        ...(mod ? { modRoleId: mod.id } : {}),
        ...(admin ? { adminRoleId: admin.id } : {}),
        ...(mute ? { muteRoleId: mute.id } : {}),
      }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Roles Configured", "Role settings updated.")] });

    } else if (sub === "jointovoice") {
      const ch = interaction.options.getChannel("channel", true);
      const cat = interaction.options.getChannel("category");
      await db.update(guildConfigTable).set({ joinToCreateChannelId: ch.id, ...(cat ? { joinToCreateCategoryId: cat.id } : {}) }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Join-to-Create Configured", `Voice channel set to <#${ch.id}>.\nUsers joining this channel will get a private voice channel.`)] });

    } else if (sub === "autorole") {
      const action = interaction.options.getString("action", true);
      if (action === "list") {
        const roles = await db.select().from(autoRolesTable).where(eq(autoRolesTable.guildId, guildId));
        await interaction.reply({ embeds: [infoEmbed("Auto-Roles", roles.length ? roles.map((r) => `<@&${r.roleId}>`).join("\n") : "No auto-roles configured.")] });
      } else {
        const role = interaction.options.getRole("role");
        if (!role) { await interaction.reply({ embeds: [errorEmbed("Please specify a role.")], ephemeral: true }); return; }
        if (action === "add") {
          await db.insert(autoRolesTable).values({ guildId, roleId: role.id, roleName: role.name });
          await interaction.reply({ embeds: [successEmbed("Auto-Role Added", `<@&${role.id}> will now be given to new members.`)] });
        } else {
          await db.delete(autoRolesTable).where(and(eq(autoRolesTable.guildId, guildId), eq(autoRolesTable.roleId, role.id)));
          await interaction.reply({ embeds: [successEmbed("Auto-Role Removed", `<@&${role.id}> removed from auto-roles.`)] });
        }
      }

    } else if (sub === "view") {
      const [cfg] = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
      if (!cfg) { await interaction.reply({ embeds: [errorEmbed("No configuration found. Run a setup command first.")], ephemeral: true }); return; }
      const embed = new EmbedBuilder()
        .setTitle("⚙️ Bot Configuration")
        .setColor(0x5865f2)
        .addFields(
          { name: "Welcome Channel", value: cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : "Not set", inline: true },
          { name: "Mod Log", value: cfg.modLogChannelId ? `<#${cfg.modLogChannelId}>` : "Not set", inline: true },
          { name: "ModMail Forum", value: cfg.modmailForumId ? `<#${cfg.modmailForumId}>` : "Not set", inline: true },
          { name: "Mod Role", value: cfg.modRoleId ? `<@&${cfg.modRoleId}>` : "Not set", inline: true },
          { name: "Admin Role", value: cfg.adminRoleId ? `<@&${cfg.adminRoleId}>` : "Not set", inline: true },
          { name: "Anti-Spam", value: cfg.antispamEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Anti-Raid", value: cfg.antiRaidEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Max Warnings", value: String(cfg.maxWarnings), inline: true },
          { name: "Join-to-Create", value: cfg.joinToCreateChannelId ? `<#${cfg.joinToCreateChannelId}>` : "Not set", inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });

    } else if (sub === "maxwarnings") {
      const count = interaction.options.getInteger("count", true);
      await db.update(guildConfigTable).set({ maxWarnings: count }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Max Warnings Set", `Auto-action will trigger at **${count}** warnings.`)] });
    }
  },
};