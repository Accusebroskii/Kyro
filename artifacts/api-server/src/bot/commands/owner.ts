import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  ActivityType,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { setBugMode, isBugModeActive } from "../events/ready.js";
import { successEmbed, errorEmbed, infoEmbed } from "../lib/embeds.js";
import { logger } from "../../lib/logger.js";

const OWNER_ID = "1375707337104429088";

function ownerOnly(interaction: ChatInputCommandInteraction): boolean {
  if (interaction.user.id !== OWNER_ID) {
    interaction.reply({ content: "🔒 Owner only.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return false;
  }
  return true;
}

// ─── /restart ────────────────────────────────────────────────────────────────

export const restartCommand = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Restart the bot"),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;
    await interaction.reply({ content: "♻️ Restarting…", flags: MessageFlags.Ephemeral });
    setTimeout(() => process.exit(0), 1000);
  },
};

// ─── /ping ────────────────────────────────────────────────────────────────────

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),
  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.reply({ content: "Pinging…", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! **${latency}ms** — WS: **${Math.max(0, interaction.client.ws.ping)}ms**`);
  },
};

// ─── /botinfo ────────────────────────────────────────────────────────────────

export const botinfoCommand = {
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Shows information about the bot"),
  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client;
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const uptimeStr = `${d}d ${h}h ${m}m`;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🤖 Bot Information")
          .setColor(0x5865f2)
          .setThumbnail(client.user?.displayAvatarURL() ?? "")
          .addFields(
            { name: "👑 Owner", value: "<@1375707337104429088> (accusebroski_)", inline: true },
            { name: "\u200b", value: "\u200b", inline: true },
            { name: "👥 Cached Users", value: `${client.users.cache.size}`, inline: true },
            { name: "🌐 Servers", value: `${client.guilds.cache.size}`, inline: true },
            { name: "🏓 WS Ping", value: `${Math.max(0, client.ws.ping)}ms`, inline: true },
            { name: "⏱️ Uptime", value: uptimeStr, inline: true },
            { name: "📦 Node.js", value: process.version, inline: true },
            { name: "💾 Memory", value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
          )
          .setFooter({ text: "Kyro • " })
          .setTimestamp(),
      ],
    });
  },
};

// ─── /bug ─────────────────────────────────────────────────────────────────────

export const bugCommand = {
  data: new SlashCommandBuilder()
    .setName("bug")
    .setDescription("Toggle 'Fixing Bugs' status (owner only)"),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;
    const newState = !isBugModeActive();
    setBugMode(newState);
    await interaction.reply({
      content: newState
        ? "🐛 Bug mode **enabled** — status set to \"Watching Fixing Bugs 😭\"."
        : "✅ Bug mode **disabled** — status restored to rotation.",
      flags: MessageFlags.Ephemeral,
    });
  },
};

// ─── /say ─────────────────────────────────────────────────────────────────────

export const sayCommand = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make Kyro say something in a channel (owner only)")
    .addStringOption((o) =>
      o.setName("message").setDescription("What to say").setRequired(true).setMaxLength(2000),
    )
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to post in (defaults to current)").addChannelTypes(ChannelType.GuildText),
    )
    .addBooleanOption((o) =>
      o.setName("embed").setDescription("Wrap the message in an embed?"),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    const text = interaction.options.getString("message", true);
    const target = (interaction.options.getChannel("channel") as TextChannel | null)
      ?? interaction.channel as TextChannel;
    const useEmbed = interaction.options.getBoolean("embed") ?? false;

    if (!target || !("send" in target)) {
      await interaction.reply({ embeds: [errorEmbed("That channel can't receive messages.")], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      if (useEmbed) {
        await target.send({
          embeds: [new EmbedBuilder().setDescription(text).setColor(0x5865f2)],
        });
      } else {
        await target.send(text);
      }
      await interaction.reply({
        embeds: [successEmbed("Sent", `Message posted in <#${target.id}>`)],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({ embeds: [errorEmbed("Couldn't send — missing permissions?")], flags: MessageFlags.Ephemeral });
    }
  },
};

// ─── /dm ──────────────────────────────────────────────────────────────────────

export const dmCommand = {
  data: new SlashCommandBuilder()
    .setName("dm")
    .setDescription("DM any user as Kyro (owner only)")
    .addUserOption((o) => o.setName("user").setDescription("Who to DM").setRequired(true))
    .addStringOption((o) =>
      o.setName("message").setDescription("Message content").setRequired(true).setMaxLength(2000),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    const target = interaction.options.getUser("user", true);
    const text = interaction.options.getString("message", true);

    if (target.bot) {
      await interaction.reply({ embeds: [errorEmbed("Can't DM bots.")], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await target.send(text);
      await interaction.reply({
        embeds: [successEmbed("DM Sent", `Message delivered to **${target.username}** (${target.id})`)],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        embeds: [errorEmbed(`Couldn't DM **${target.username}** — they may have DMs off.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

// ─── /setstatus ───────────────────────────────────────────────────────────────

export const setstatusCommand = {
  data: new SlashCommandBuilder()
    .setName("setstatus")
    .setDescription("Override Kyro's status (owner only)")
    .addStringOption((o) =>
      o.setName("text").setDescription("Status text (leave blank to reset to rotation)").setMaxLength(128),
    )
    .addStringOption((o) =>
      o.setName("type").setDescription("Activity type").addChoices(
        { name: "🎮 Playing", value: "playing" },
        { name: "👁️ Watching", value: "watching" },
        { name: "🎧 Listening to", value: "listening" },
        { name: "🏆 Competing in", value: "competing" },
      ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    const text = interaction.options.getString("text");
    const type = interaction.options.getString("type") ?? "watching";

    if (!text) {
      // Reset to rotation — trigger by temporarily setting then the ready rotation takes over on next cycle
      interaction.client.user?.setPresence({ activities: [], status: "online" });
      await interaction.reply({ content: "🔄 Status reset to rotation.", flags: MessageFlags.Ephemeral });
      return;
    }

    const typeMap: Record<string, ActivityType> = {
      playing: ActivityType.Playing,
      watching: ActivityType.Watching,
      listening: ActivityType.Listening,
      competing: ActivityType.Competing,
    };

    interaction.client.user?.setActivity(text, { type: typeMap[type] ?? ActivityType.Watching });
    await interaction.reply({
      embeds: [successEmbed("Status Updated", `Now showing: **${type.charAt(0).toUpperCase() + type.slice(1)} ${text}**`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

// ─── /guilds ──────────────────────────────────────────────────────────────────

export const guildsCommand = {
  data: new SlashCommandBuilder()
    .setName("guilds")
    .setDescription("List all servers Kyro is in (owner only)"),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guilds = [...interaction.client.guilds.cache.values()].sort(
      (a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0),
    );

    const lines = guilds.map(
      (g, i) => `\`${String(i + 1).padStart(2, "0")}\` **${g.name}** — ${g.memberCount?.toLocaleString() ?? "?"} members \`${g.id}\``,
    );

    // Chunk into pages of 20
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += 20) {
      chunks.push(lines.slice(i, i + 20).join("\n"));
    }

    const embeds = chunks.map((chunk, i) =>
      new EmbedBuilder()
        .setTitle(i === 0 ? `🌐 Servers (${guilds.length} total)` : "\u200b")
        .setDescription(chunk)
        .setColor(0x5865f2),
    );

    // Discord allows up to 10 embeds per message
    await interaction.editReply({ embeds: embeds.slice(0, 10) });
  },
};

// ─── /globalban ───────────────────────────────────────────────────────────────

export const globalbanCommand = {
  data: new SlashCommandBuilder()
    .setName("globalban")
    .setDescription("Ban a user ID from ALL servers Kyro is in (owner only)")
    .addStringOption((o) =>
      o.setName("userid").setDescription("User ID to ban").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(true),
    )
    .addBooleanOption((o) =>
      o.setName("confirm").setDescription("Set to true to confirm — this is irreversible").setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    const userId = interaction.options.getString("userid", true).trim();
    const reason = interaction.options.getString("reason", true);
    const confirmed = interaction.options.getBoolean("confirm", true);

    if (!confirmed) {
      await interaction.reply({ embeds: [errorEmbed("Set `confirm` to **true** to actually run the global ban.")], flags: MessageFlags.Ephemeral });
      return;
    }

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ embeds: [errorEmbed("That doesn't look like a valid Discord user ID.")], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let banned = 0;
    let failed = 0;

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        // skip servers where the user is the owner
        if (guild.ownerId === userId) { failed++; continue; }
        await guild.bans.create(userId, { reason: `[Global Ban] ${reason}` });
        banned++;
      } catch {
        failed++;
      }
    }

    logger.info({ userId, reason, banned, failed }, "globalban executed");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔨 Global Ban Complete")
          .setColor(0xed4245)
          .addFields(
            { name: "User ID", value: `\`${userId}\``, inline: true },
            { name: "✅ Banned from", value: `${banned} server(s)`, inline: true },
            { name: "❌ Failed/Skipped", value: `${failed} server(s)`, inline: true },
            { name: "Reason", value: reason },
          )
          .setTimestamp(),
      ],
    });
  },
};

// ─── /botname ────────────────────────────────────────────────────────────────

export const botnameCommand = {
  data: new SlashCommandBuilder()
    .setName("botname")
    .setDescription("Change Kyro's username (owner only — rate limited by Discord)")
    .addStringOption((o) =>
      o.setName("name").setDescription("New username").setRequired(true).setMinLength(2).setMaxLength(32),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    const name = interaction.options.getString("name", true);

    try {
      await interaction.client.user!.setUsername(name);
      await interaction.reply({
        embeds: [successEmbed("Username Changed", `Bot username is now **${name}**.\n\n⚠️ Discord rate-limits username changes to 2 per hour.`)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err: any) {
      await interaction.reply({
        embeds: [errorEmbed(`Failed to change username: ${err?.message ?? "Unknown error"}. Discord allows 2 changes/hour.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

// ─── /botavatar ───────────────────────────────────────────────────────────────

export const botavatarCommand = {
  data: new SlashCommandBuilder()
    .setName("botavatar")
    .setDescription("Change Kyro's avatar (owner only)")
    .addStringOption((o) =>
      o.setName("url").setDescription("Direct image URL (png/jpg/gif)").setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    const url = interaction.options.getString("url", true);

    if (!/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url)) {
      await interaction.reply({ embeds: [errorEmbed("Provide a direct image URL ending in `.png`, `.jpg`, `.gif`, or `.webp`.")], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await interaction.client.user!.setAvatar(url);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Avatar Updated")
            .setColor(0x57f287)
            .setImage(interaction.client.user!.displayAvatarURL({ size: 256 }))
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err: any) {
      await interaction.reply({
        embeds: [errorEmbed(`Failed to change avatar: ${err?.message ?? "Unknown error"}`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

// ─── /broadcast ───────────────────────────────────────────────────────────────

export const broadcastCommand = {
  data: new SlashCommandBuilder()
    .setName("broadcast")
    .setDescription("Send a message to every server's system/general channel (owner only)")
    .addStringOption((o) =>
      o.setName("message").setDescription("Announcement text").setRequired(true).setMaxLength(2000),
    )
    .addBooleanOption((o) =>
      o.setName("confirm").setDescription("Set to true to actually send").setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!ownerOnly(interaction)) return;

    const text = interaction.options.getString("message", true);
    const confirmed = interaction.options.getBoolean("confirm", true);

    if (!confirmed) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📣 Broadcast Preview")
            .setDescription(text)
            .setColor(0xfee75c)
            .setFooter({ text: `Would be sent to ${interaction.client.guilds.cache.size} servers — set confirm:true to send` }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let sent = 0;
    let failed = 0;

    const embed = new EmbedBuilder()
      .setTitle("📣 Announcement from Kyro")
      .setDescription(text)
      .setColor(0x5865f2)
      .setFooter({ text: "Kyro Bot • Community" })
      .setTimestamp();

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        // Try system channel, then first text channel with send perms
        const channel = guild.systemChannel
          ?? guild.channels.cache
            .filter(
              (c) =>
                c.type === ChannelType.GuildText &&
                c.permissionsFor(guild.members.me!)?.has(PermissionFlagsBits.SendMessages),
            )
            .first() as TextChannel | undefined;

        if (!channel || !("send" in channel)) { failed++; continue; }
        await (channel as TextChannel).send({ embeds: [embed] });
        sent++;
      } catch {
        failed++;
      }
    }

    logger.info({ sent, failed }, "broadcast completed");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📣 Broadcast Complete")
          .setColor(0x57f287)
          .addFields(
            { name: "✅ Delivered", value: `${sent} server(s)`, inline: true },
            { name: "❌ Failed", value: `${failed} server(s)`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};
