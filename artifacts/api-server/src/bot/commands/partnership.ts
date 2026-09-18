import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const STAFF_PERMISSIONS = PermissionFlagsBits.ManageGuild;

export const partnershipCommand = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Manage and apply for server partnerships")
    .addSubcommand((sub) =>
      sub
        .setName("apply")
        .setDescription("Apply for a partnership")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Your server name")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("invite")
            .setDescription("Your Discord invite")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("members")
            .setDescription("Approximate member count")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("Tell us about your server")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("contact")
            .setDescription("How can we contact you?")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("View partnership requirements"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View partnered servers"),
    )
    .addSubcommand((sub) =>
      sub
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
            .setDescription("Discord invite")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("deny")
        .setDescription("Deny a partnership application")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Server name")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a partnered server")
        .addStringOption((o) =>
          o
            .setName("server")
            .setDescription("Server name")
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "❌ This command can only be used inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ─────────────────────────────
    // APPLY
    // ─────────────────────────────
    if (subcommand === "apply") {
      const server = interaction.options.getString("server", true);
      const invite = interaction.options.getString("invite", true);
      const members = interaction.options.getString("members", true);
      const description = interaction.options.getString("description", true);
      const contact = interaction.options.getString("contact", true);

      const config = await db
        .select()
        .from(guildConfigTable)
        .where(eq(guildConfigTable.guildId, guildId))
        .limit(1);

      const partnershipChannelId = config[0]?.partnershipChannelId;

      if (!partnershipChannelId) {
        await interaction.reply({
          content:
            "❌ The partnership system has not been configured yet. An administrator needs to run `/setup partnership` first.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel = await interaction.guild.channels
        .fetch(partnershipChannelId)
        .catch(() => null);

      if (!channel || !(channel instanceof TextChannel)) {
        await interaction.reply({
          content:
            "❌ The configured partnership channel could not be found. Please ask an administrator to run `/setup partnership` again.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🤝 New Partnership Application")
        .setDescription(
          `A new partnership application has been submitted by ${interaction.user}.`,
        )
        .addFields(
          {
            name: "Server",
            value: server,
            inline: true,
          },
          {
            name: "Members",
            value: members,
            inline: true,
          },
          {
            name: "Invite",
            value: invite,
            inline: false,
          },
          {
            name: "Description",
            value: description,
            inline: false,
          },
          {
            name: "Contact",
            value: contact,
            inline: false,
          },
        )
        .setFooter({
          text: `Applicant ID: ${interaction.user.id}`,
        })
        .setTimestamp();

      await channel.send({
        embeds: [embed],
      });

      await interaction.reply({
        content:
          `✅ Your partnership application for **${server}** has been submitted!`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    // ─────────────────────────────
    // INFO
    // ─────────────────────────────
    if (subcommand === "info") {
      const embed = new EmbedBuilder()
        .setTitle("🤝 Partnership Information")
        .setDescription(
          "Interested in partnering with us? Submit an application using `/partnership apply`.",
        )
        .addFields(
          {
            name: "📌 How to Apply",
            value:
              "Use `/partnership apply` and provide your server information.",
            inline: false,
          },
          {
            name: "📋 Requirements",
            value:
              "• Real and active Discord server\n• Valid Discord invite\n• Accurate server information\n• Professional partnership proposal",
            inline: false,
          },
          {
            name: "📨 What Happens Next?",
            value:
              "Our staff team will review your application and decide whether to accept or deny it.",
            inline: false,
          },
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
      });

      return;
    }

    // ─────────────────────────────
    // LIST
    // ─────────────────────────────
    if (subcommand === "list") {
      const embed = new EmbedBuilder()
        .setTitle("🤝 Partnered Servers")
        .setDescription(
          "Our partnered server list will appear here once partnerships are added.",
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
      });

      return;
    }

    // ─────────────────────────────
    // STAFF COMMANDS
    // ─────────────────────────────
    if (!interaction.memberPermissions?.has(STAFF_PERMISSIONS)) {
      await interaction.reply({
        content:
          "❌ You need the **Manage Server** permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "accept") {
      const server = interaction.options.getString("server", true);
      const invite = interaction.options.getString("invite", true);

      await interaction.reply({
        content: `✅ Partnership for **${server}** has been accepted.\n${invite}`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (subcommand === "deny") {
      const server = interaction.options.getString("server", true);

      await interaction.reply({
        content: `❌ Partnership application for **${server}** has been denied.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (subcommand === "remove") {
      const server = interaction.options.getString("server", true);

      await interaction.reply({
        content: `🗑️ Partnership with **${server}** has been removed.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
  },
};
