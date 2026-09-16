import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const STAFF_PERMISSIONS = PermissionFlagsBits.ManageGuild;

export const partnershipCommand = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Manage Calyx partnerships")

    .addSubcommand((s) =>
      s
        .setName("apply")
        .setDescription("Apply for a partnership")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Your server name")
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((o) =>
          o
            .setName("invite")
            .setDescription("Your Discord server invite")
            .setRequired(true)
            .setMaxLength(200),
        )
        .addStringOption((o) =>
          o
            .setName("members")
            .setDescription("Your server member count")
            .setRequired(true)
            .setMaxLength(20),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("Tell us about your server")
            .setRequired(true)
            .setMaxLength(1000),
        )
        .addStringOption((o) =>
          o
            .setName("contact")
            .setDescription("Owner or contact information")
            .setRequired(true)
            .setMaxLength(100),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("info")
        .setDescription("View partnership requirements"),
    )

    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("View current partners"),
    )

    .addSubcommand((s) =>
      s
        .setName("accept")
        .setDescription("Accept a partnership application")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Server name")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("invite")
            .setDescription("Server invite")
            .setRequired(true),
        )
,
    )

    .addSubcommand((s) =>
      s
        .setName("deny")
        .setDescription("Deny a partnership application")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Server name")
            .setRequired(true),
        )
,
    )

    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a partner")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Server name")
            .setRequired(true),
        )
,
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    // ========================================================
    // APPLY
    // ========================================================

    if (subcommand === "apply") {
      const [config] = await db
        .select()
        .from(guildConfigTable)
        .where(eq(guildConfigTable.guildId, interaction.guildId))
        .limit(1);

      if (!config?.partnershipChannelId) {
        await interaction.reply({
          content:
            "❌ The partnership system has not been configured yet. Please ask a server administrator to use `/setup partnership`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel = await interaction.guild.channels
        .fetch(config.partnershipChannelId)
        .catch(() => null);

      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          content:
            "❌ The configured partnership channel could not be found. Please ask an administrator to run `/setup partnership` again.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const server = interaction.options.getString("server", true);
      const invite = interaction.options.getString("invite", true);
      const members = interaction.options.getString("members", true);
      const description = interaction.options.getString("description", true);
      const contact = interaction.options.getString("contact", true);

      const embed = new EmbedBuilder()
        .setTitle("🤝 New Partnership Application")
        .setDescription(
          "A new partnership application has been submitted.",
        )
        .addFields(
          { name: "🏠 Server", value: server, inline: true },
          { name: "👥 Members", value: members, inline: true },
          { name: "🔗 Invite", value: invite, inline: false },
          { name: "📝 Description", value: description, inline: false },
          { name: "📞 Contact", value: contact, inline: true },
          {
            name: "👤 Applicant",
            value: `${interaction.user} (\`${interaction.user.id}\`)`,
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({ text: `Calyx Partnership System • ${interaction.guild.name}` });

      await channel.send({
        content: `📩 **New partnership application** from ${interaction.user}`,
        embeds: [embed],
      });

      await interaction.reply({
        content:
          "✅ Your partnership application has been submitted! Our staff team will review it.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    // ========================================================
    // INFO
    // ========================================================

    if (subcommand === "info") {
      const embed = new EmbedBuilder()
        .setTitle("🤝 Partnership Requirements")
        .setDescription(
          [
            "Want to partner with us? Make sure your server meets our requirements:",
            "",
            "• Your server should have an active community.",
            "• Your server must follow Discord's Terms of Service.",
            "• Your server should have a clear purpose.",
            "• Your server must not promote harmful or illegal content.",
            "• Partnership applications must contain accurate information.",
            "",
            "Use `/partnership apply` to submit your application.",
          ].join("\n"),
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ========================================================
    // LIST
    // ========================================================

    if (subcommand === "list") {
      const embed = new EmbedBuilder()
        .setTitle("🤝 Calyx Partners")
        .setDescription(
          "Our current partners will be displayed here.",
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ========================================================
    // ACCEPT
    // ========================================================

    if (subcommand === "accept") {
      if (!interaction.memberPermissions?.has(STAFF_PERMISSIONS)) {
        await interaction.reply({
          content: "❌ You need **Manage Server** permission to do this.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const server = interaction.options.getString("server", true);
      const invite = interaction.options.getString("invite", true);

      await interaction.reply({
        content: `✅ Partnership accepted for **${server}**.\n🔗 ${invite}`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    // ========================================================
    // DENY
    // ========================================================

    if (subcommand === "deny") {
      if (!interaction.memberPermissions?.has(STAFF_PERMISSIONS)) {
        await interaction.reply({
          content: "❌ You need **Manage Server** permission to do this.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const server = interaction.options.getString("server", true);

      await interaction.reply({
        content: `❌ Partnership application for **${server}** has been denied.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    // ========================================================
    // REMOVE
    // ========================================================

    if (subcommand === "remove") {
      if (!interaction.memberPermissions?.has(STAFF_PERMISSIONS)) {
        await interaction.reply({
          content: "❌ You need **Manage Server** permission to do this.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const server = interaction.options.getString("server", true);

      await interaction.reply({
        content: `🗑️ **${server}** has been removed from the partnership list.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
  },
};
