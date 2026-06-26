import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  TextChannel,
} from "discord.js";
import { db, guildConfigTable, autoRolesTable, ticketTopicsTable, levelRoleRewardsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { checkAdmin } from "../lib/permissions.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";
import { startPanelBuilder, initialBuilderPayload } from "../lib/panelBuilder.js";

const BOT_OWNER_ID = "1375707337104429088";

const VERIFICATION_METHOD_LABELS: Record<string, string> = {
  button: "Button Click",
  reaction: "Reaction",
  word: "Type a Word/Phrase",
  captcha: "Captcha Code",
};

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
      s.setName("panel").setDescription("Open the interactive ticket panel builder"),
    )
    .addSubcommand((s) =>
      s.setName("modmail").setDescription("Set the ModMail forum channel")
        .addChannelOption((o) => o.setName("forum").setDescription("Forum channel for ModMail threads").setRequired(true).addChannelTypes(ChannelType.GuildForum)),
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
    .addSubcommand((s) =>
      s.setName("levels").setDescription("Manage level role rewards")
        .addStringOption((o) => o.setName("action").setDescription("add, remove, or list").setRequired(true).addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" },
          { name: "List", value: "list" },
        ))
        .addIntegerOption((o) => o.setName("level").setDescription("Level required").setMinValue(1))
        .addRoleOption((o) => o.setName("role").setDescription("Role to grant")),
    )
    .addSubcommand((s) =>
      s.setName("verification").setDescription("Configure member verification")
        .addStringOption((o) => o.setName("method").setDescription("Verification method").setRequired(true).addChoices(
          { name: "Button Click", value: "button" },
          { name: "Reaction", value: "reaction" },
          { name: "Type a Word/Phrase", value: "word" },
          { name: "Captcha Code", value: "captcha" },
          { name: "Disable Verification", value: "disable" },
        ))
        .addChannelOption((o) => o.setName("channel").setDescription("Channel where verification happens").addChannelTypes(ChannelType.GuildText))
        .addRoleOption((o) => o.setName("unverifiedrole").setDescription("Role given on join, restricted from seeing the server"))
        .addRoleOption((o) => o.setName("verifiedrole").setDescription("Role given once verified, unlocks the server"))
        .addStringOption((o) => o.setName("word").setDescription("Required word/phrase (only for 'Type a Word/Phrase' method)")),
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
        const { sessionId, draft } = await startPanelBuilder(guildId, interaction.user.id);
      interaction.user.id;
      await interaction.reply({ ...initialBuilderPayload(sessionId, draft), ephemeral: true });

    } else if (sub === "modmail") {
      if (interaction.user.id !== BOT_OWNER_ID) {
        await interaction.reply({ embeds: [errorEmbed("Only the bot owner can configure the ModMail forum.")], ephemeral: true });
        return;
      }
      const forum = interaction.options.getChannel("forum", true);
      await db.update(guildConfigTable).set({ modmailForumId: forum.id }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("ModMail Configured", `ModMail forum set to <#${forum.id}>.`)] });

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
          {
            name: "Verification",
            value: cfg.verificationEnabled
              ? `✅ ${VERIFICATION_METHOD_LABELS[cfg.verificationMethod ?? ""] ?? cfg.verificationMethod} in ${cfg.verificationChannelId ? `<#${cfg.verificationChannelId}>` : "(no channel set)"}`
              : "❌ Disabled",
            inline: true,
          },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });

    } else if (sub === "maxwarnings") {
      const count = interaction.options.getInteger("count", true);
      await db.update(guildConfigTable).set({ maxWarnings: count }).where(eq(guildConfigTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Max Warnings Set", `Auto-action will trigger at **${count}** warnings.`)] });

    } else if (sub === "levels") {
      const action = interaction.options.getString("action", true);
      if (action === "list") {
        const rewards = await db.select().from(levelRoleRewardsTable).where(eq(levelRoleRewardsTable.guildId, guildId));
        await interaction.reply({
          embeds: [infoEmbed("Level Role Rewards", rewards.length
            ? rewards.map((r) => `Level ${r.level} → <@&${r.roleId}>`).join("\n")
            : "No level role rewards configured.")],
          ephemeral: true,
        });
      } else {
        const level = interaction.options.getInteger("level");
        const role = interaction.options.getRole("role");
        if (!level || !role) {
          await interaction.reply({ embeds: [errorEmbed("Please specify both a level and a role.")], ephemeral: true });
          return;
        }
        if (action === "add") {
          await db.insert(levelRoleRewardsTable).values({ guildId, level, roleId: role.id });
          await interaction.reply({ embeds: [successEmbed("Reward Added", `Reaching **Level ${level}** now grants <@&${role.id}>.`)] });
        } else {
          await db.delete(levelRoleRewardsTable).where(and(eq(levelRoleRewardsTable.guildId, guildId), eq(levelRoleRewardsTable.level, level), eq(levelRoleRewardsTable.roleId, role.id)));
          await interaction.reply({ embeds: [successEmbed("Reward Removed", `Removed the Level ${level} → <@&${role.id}> reward.`)] });
        }
      }

    } else if (sub === "verification") {
      const method = interaction.options.getString("method", true);

      if (method === "disable") {
        await db.update(guildConfigTable).set({ verificationEnabled: false }).where(eq(guildConfigTable.guildId, guildId));
        await interaction.reply({ embeds: [successEmbed("Verification Disabled", "Member verification has been turned off. Existing unverified/verified roles are untouched.")] });
        return;
      }

      const channel = interaction.options.getChannel("channel") as TextChannel | null;
      const unverifiedRole = interaction.options.getRole("unverifiedrole");
      const verifiedRole = interaction.options.getRole("verifiedrole");
      const word = interaction.options.getString("word");

      if (!channel || !unverifiedRole || !verifiedRole) {
        await interaction.reply({
          embeds: [errorEmbed("Setting up verification requires `channel`, `unverifiedrole`, and `verifiedrole` to all be provided.")],
          ephemeral: true,
        });
        return;
      }

      if (method === "word" && !word) {
        await interaction.reply({
          embeds: [errorEmbed("The 'Type a Word/Phrase' method requires the `word` option to be set.")],
          ephemeral: true,
        });
        return;
      }

      const botMember = interaction.guild!.members.me;
      if (botMember && botMember.roles.highest.comparePositionTo(unverifiedRole) <= 0) {
        await interaction.reply({
          embeds: [errorEmbed(`I can't manage <@&${unverifiedRole.id}> because it's positioned above (or equal to) my own highest role. Move my role above it in Server Settings → Roles.`)],
          ephemeral: true,
        });
        return;
      }
      if (botMember && botMember.roles.highest.comparePositionTo(verifiedRole) <= 0) {
        await interaction.reply({
          embeds: [errorEmbed(`I can't manage <@&${verifiedRole.id}> because it's positioned above (or equal to) my own highest role. Move my role above it in Server Settings → Roles.`)],
          ephemeral: true,
        });
        return;
      }

      // Lock the verification channel down to only the unverified role + deny @everyone,
      // so unverified members land somewhere they can actually see and act on.
      await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, { ViewChannel: false });
      await channel.permissionOverwrites.edit(unverifiedRole.id, { ViewChannel: true, SendMessages: method === "word" });

      let messageId: string | undefined;

      if (method === "button") {
        const button = new ButtonBuilder()
          .setCustomId("verify_button")
          .setLabel("Verify")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅");
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
        const embed = new EmbedBuilder()
          .setTitle("✅ Verification Required")
          .setDescription("Click the button below to verify and gain access to the rest of the server.")
          .setColor(0x57f287);
        const sent = await channel.send({ embeds: [embed], components: [row] });
        messageId = sent.id;
      } else if (method === "reaction") {
        const embed = new EmbedBuilder()
          .setTitle("✅ Verification Required")
          .setDescription("React with ✅ below to verify and gain access to the rest of the server.")
          .setColor(0x57f287);
        const sent = await channel.send({ embeds: [embed] });
        await sent.react("✅");
        messageId = sent.id;
      } else if (method === "word") {
        const embed = new EmbedBuilder()
          .setTitle("✅ Verification Required")
          .setDescription(`Type **${word}** in this channel to verify and gain access to the rest of the server.`)
          .setColor(0x57f287);
        const sent = await channel.send({ embeds: [embed] });
        messageId = sent.id;
      } else if (method === "captcha") {
        const button = new ButtonBuilder()
          .setCustomId("verify_captcha_start")
          .setLabel("Start Verification")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔐");
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
        const embed = new EmbedBuilder()
          .setTitle("🔐 Verification Required")
          .setDescription("Click the button below — you'll be sent a short code to type back to verify you're human.")
          .setColor(0x57f287);
        const sent = await channel.send({ embeds: [embed], components: [row] });
        messageId = sent.id;
      }

      await db.update(guildConfigTable).set({
        verificationEnabled: true,
        verificationMethod: method,
        verificationChannelId: channel.id,
        verificationMessageId: messageId,
        unverifiedRoleId: unverifiedRole.id,
        verifiedRoleId: verifiedRole.id,
        ...(word ? { verificationWord: word } : {}),
      }).where(eq(guildConfigTable.guildId, guildId));

      await interaction.reply({
        embeds: [successEmbed(
          "Verification Configured",
          `Method: **${VERIFICATION_METHOD_LABELS[method]}**\nChannel: <#${channel.id}>\nUnverified role: <@&${unverifiedRole.id}>\nVerified role: <@&${verifiedRole.id}>\n\nNew members will now be locked to <#${channel.id}> until they verify.`,
        )],
      });
    }
  },
};