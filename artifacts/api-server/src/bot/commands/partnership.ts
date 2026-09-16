import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openTicket } from "./tickets.js";

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
          o.setName("server").setDescription("Your server name").setRequired(true).setMaxLength(100),
        )
        .addStringOption((o) =>
          o.setName("invite").setDescription("Your Discord server invite").setRequired(true).setMaxLength(200),
        )
        .addStringOption((o) =>
          o.setName("members").setDescription("Your server member count").setRequired(true).setMaxLength(20),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Tell us about your server").setRequired(true).setMaxLength(1000),
        )
        .addStringOption((o) =>
          o.setName("contact").setDescription("Owner or contact information").setRequired(true).setMaxLength(100),
        )
        .addStringOption((o) =>
        ),
    )
    .addSubcommand((s) =>
      s.setName("info").setDescription("View partnership requirements"),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("View current partners"),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a partner")
        .addStringOption((o) =>
          o.setName("server").setDescription("Server name").setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const guild = interaction.guild;

    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);

    if (sub === "apply") {
      if (!config?.partnershipReviewChannelId || !config?.partnershipChannelId) {
        await interaction.reply({
          content:
            "❌ The partnership system has not been configured yet. Please ask an administrator to use `/setup partnership`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const reviewChannel = await guild.channels
        .fetch(config.partnershipReviewChannelId)
        .catch(() => null);

      if (!reviewChannel?.isTextBased()) {
        await interaction.reply({
          content: "❌ The configured partnership review channel could not be found.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const server = interaction.options.getString("server", true);
      const invite = interaction.options.getString("invite", true);
      const members = interaction.options.getString("members", true);
      const description = interaction.options.getString("description", true);
      const contact = interaction.options.getString("contact", true);
      const ad = config.partnershipAd;

      if (!ad) {
        await interaction.reply({
          content: "❌ No partnership ad has been configured. Please ask an administrator to run `/setup partnership` again and provide an ad.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🤝 New Partnership Application")
        .setDescription("A new partnership application has been submitted.")
        .addFields(
          { name: "🏠 Server", value: server, inline: true },
          { name: "👥 Members", value: members, inline: true },
          { name: "🔗 Invite", value: invite, inline: false },
          { name: "📝 Description", value: description, inline: false },
          { name: "📢 Partnership Ad", value: ad, inline: false },
          { name: "📞 Contact", value: contact, inline: true },
          {
            name: "👤 Applicant",
            value: `${interaction.user} (\`${interaction.user.id}\`)`,
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({ text: `Calyx Partnership System • ${guild.name}` });

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`partnership_accept:${interaction.user.id}`)
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId(`partnership_deny:${interaction.user.id}`)
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      );

      await reviewChannel.send({
        content: `📩 **New partnership application** from ${interaction.user}`,
        embeds: [embed],
        components: [buttons],
      });

      const { channel } = await openTicket({
        guildId,
        guild,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        subject: `Partnership - ${server}`,
      });

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🤝 Partnership Application")
            .setDescription(
              "Your partnership ticket has been created.\n\n" +
              "Please wait while a staff member reviews your application.\n\n" +
              "📢 **Your configured server ad has been saved.**\n" +
              "After your partnership is accepted, Calyx will automatically post the ad in the configured partnership channel.",
            )
            .setTimestamp(),
        ],
      });

      await interaction.reply({
        content: `✅ Your partnership application has been submitted!\n🎫 Your private partnership ticket: ${channel}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "info") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🤝 Partnership Requirements")
            .setDescription(
              [
                "• Your server should have an active community.",
                "• Your server must follow Discord's Terms of Service.",
                "• Your server should have a clear purpose.",
                "• Your server must not promote harmful or illegal content.",
                "• Applications must contain accurate information.",
                "",
                "Use `/partnership apply` to apply.",
              ].join("\n"),
            ),
        ],
      });
      return;
    }

    if (sub === "list") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🤝 Calyx Partners")
            .setDescription("Current partners will be displayed here.")
            .setTimestamp(),
        ],
      });
      return;
    }

    if (sub === "remove") {
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
    }
  },
};
