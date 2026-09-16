import { MessageFlags } from "discord.js";
import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  TextChannel,
  EmbedBuilder,
} from "discord.js";

import { getCommand } from "../commands/index.js";
import { db, ticketsTable, guildConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { successEmbed, errorEmbed } from "../lib/embeds.js";

import { handleGiveawayEnter } from "../commands/giveaway.js";
import {
  handleTicketPanelSelect,
  handleTicketCreate,
  closeTicketWithTranscript,
} from "../commands/tickets.js";

import {
  handlePanelSlotButton,
  handlePanelInfoButton,
  handlePanelChannelSelect,
  handlePanelModalSubmit,
  handlePanelSend,
  handlePanelCancel,
} from "../lib/panelBuilder.js";

import {
  handleBackupRestoreConfirm,
  handleBackupRestoreCancel,
} from "../commands/backup.js";

import { handleTemplateModalSubmit } from "../commands/template.js";
import { handleCreateRolesModalSubmit } from "../commands/createroles.js";
import { handleEmbedModalSubmit } from "../commands/embed.js";
import { startCaptchaVerification, pendingCaptchas } from "../lib/verification.js";

async function grantVerifiedRole(member: import("discord.js").GuildMember): Promise<{ ok: boolean; reason?: string }> {
  const [config] = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, member.guild.id))
    .limit(1);

  if (!config?.verificationEnabled || !config.verifiedRoleId) {
    return { ok: false, reason: "Verification isn't configured on this server." };
  }

  try {
    if (config.unverifiedRoleId) {
      await member.roles.remove(config.unverifiedRoleId).catch(() => {});
    }
    await member.roles.add(config.verifiedRoleId);
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Failed to grant verified role");
    return { ok: false, reason: "I couldn't assign the verified role — check my role position and permissions." };
  }
}

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  try {
    // =========================
    // SLASH COMMANDS
    // =========================
    if (interaction.isChatInputCommand()) {
  const cmd = getCommand(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction as ChatInputCommandInteraction);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    logger.error(
      `Slash command crashed [${interaction.commandName}]: ${error.stack || error.message}`
    );

    const payload = {
      content: `❌ **Command failed**\n\`${error.message}\``,
      flags: 64,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyError) {
      logger.error(
        {
          command: interaction.commandName,
          errorMessage:
            replyError instanceof Error
              ? replyError.message
              : String(replyError),
          errorStack:
            replyError instanceof Error ? replyError.stack : undefined,
        },
        "Failed to send slash command error response"
      );
    }
  }

  return;
}
    if (interaction.isStringSelectMenu()) {
      const select = interaction as StringSelectMenuInteraction;

      if (select.customId.startsWith("ticket_panel_select")) {
        await handleTicketPanelSelect(select);
      }

      return;
    }

    // =========================
    // CHANNEL SELECT
    // =========================
    if (interaction.isChannelSelectMenu()) {
      const select = interaction as ChannelSelectMenuInteraction;

      if (select.customId.startsWith("panel_channel:")) {
        await handlePanelChannelSelect(select);
      }

      return;
    }

    // =========================
    // MODALS
    // =========================
    if (interaction.isModalSubmit()) {
      if (
        interaction.customId.startsWith("panel_slot_modal:") ||
        interaction.customId.startsWith("panel_info_modal:")
      ) {
        await handlePanelModalSubmit(interaction);
        return;
      }

      if (interaction.customId === "createroles_modal") {
        await handleCreateRolesModalSubmit(interaction);
        return;
      }
      if (interaction.customId.startsWith("embed_create_modal:")) {
        await handleEmbedModalSubmit(interaction);
        return;
      }
      if (interaction.customId === "verify_captcha_modal") {
        const member = interaction.member;
        if (!member || !("roles" in member)) {
          await interaction.reply({ embeds: [errorEmbed("Couldn't resolve your member info.")], flags: 64 });
          return;
        }
        const guildMember = member as import("discord.js").GuildMember;
        const pending = pendingCaptchas.get(`${interaction.guildId}:${guildMember.id}`);
        const submitted = interaction.fields.getTextInputValue("captcha_code").trim().toUpperCase();

        if (!pending) {
          await interaction.reply({ embeds: [errorEmbed("Your verification session expired. Click the verify button again to get a new code.")], flags: 64 });
          return;
        }
        if (submitted !== pending.code) {
          await interaction.reply({ embeds: [errorEmbed("That code doesn't match. Click the verify button again to try with a new code.")], flags: 64 });
          pendingCaptchas.delete(`${interaction.guildId}:${guildMember.id}`);
          return;
        }

        pendingCaptchas.delete(`${interaction.guildId}:${guildMember.id}`);
        const result = await grantVerifiedRole(guildMember);
        await interaction.reply({
          embeds: [
            result.ok
              ? successEmbed("Verified!", "You've been verified and now have access to the server. Welcome!")
              : errorEmbed(result.reason ?? "Verification failed."),
          ],
          flags: 64,
        });
        return;
      }
    }

    // =========================
    // BUTTONS
    // =========================
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;

      if (btn.customId === "verify_button") {
        const member = btn.member as import("discord.js").GuildMember | null;
        if (!member) {
          await btn.reply({ embeds: [errorEmbed("Couldn't resolve your member info.")], flags: 64 });
          return;
        }
        const result = await grantVerifiedRole(member);
        await btn.reply({
          embeds: [
            result.ok
              ? successEmbed("Verified!", "You've been verified and now have access to the server. Welcome!")
              : errorEmbed(result.reason ?? "Verification failed."),
          ],
          flags: 64,
        });
        return;
      }

      if (btn.customId === "verify_captcha_start") {
        const member = btn.member as import("discord.js").GuildMember | null;
        if (!member) {
          await btn.reply({ embeds: [errorEmbed("Couldn't resolve your member info.")], flags: 64 });
          return;
        }
        await startCaptchaVerification(btn, member);
        return;
      }

      if (btn.customId.startsWith("giveaway_enter:")) {
        return await handleGiveawayEnter(btn);
      }

      if (btn.customId.startsWith("panel_slot:")) {
        return await handlePanelSlotButton(btn);
      }

      if (btn.customId.startsWith("panel_info:")) {
        return await handlePanelInfoButton(btn);
      }

      if (btn.customId.startsWith("panel_send:")) {
        return await handlePanelSend(btn);
      }

      if (btn.customId.startsWith("panel_cancel:")) {
        return await handlePanelCancel(btn);
      }

      if (btn.customId.startsWith("backup_restore_confirm:")) {
        return await handleBackupRestoreConfirm(btn);
      }

      if (btn.customId === "backup_restore_cancel") {
        return await handleBackupRestoreCancel(btn);
      }

      if (btn.customId.startsWith("ticket_create:")) {
        return await handleTicketCreate(btn);
      }

      if (btn.customId.startsWith("partnership_accept:")) {
        if (!btn.memberPermissions?.has("ManageGuild")) {
          await btn.reply({ content: "❌ You need **Manage Server** permission.", flags: 64 });
          return;
        }

        const applicantId = btn.customId.split(":")[1];

        const [config] = await db
          .select()
          .from(guildConfigTable)
          .where(eq(guildConfigTable.guildId, btn.guildId!))
          .limit(1);

        if (!config?.partnershipChannelId) {
          await btn.reply({ content: "❌ The partnership channel is not configured.", flags: 64 });
          return;
        }

        const channel = await btn.guild!.channels.fetch(config.partnershipChannelId).catch(() => null);
        if (!channel?.isTextBased()) {
          await btn.reply({ content: "❌ The partnership channel could not be found.", flags: 64 });
          return;
        }

        const applicationMessage = btn.message;
        const applicationEmbed = applicationMessage.embeds[0];

        const adField = applicationEmbed?.fields.find(
          (field) => field.name.includes("Partnership Ad")
        );

        if (!adField) {
          await btn.reply({ content: "❌ No partnership ad was found.", flags: 64 });
          return;
        }

        await channel.send({
          content: `🤝 **New Calyx Partner**
<@${applicantId}>`,
          embeds: [
            new EmbedBuilder()
              .setTitle("🤝 Partnership")
              .setDescription(adField.value)
              .setTimestamp()
              .setFooter({ text: "Calyx Partnerships" }),
          ],
        });

        await btn.update({
          content: "✅ **Partnership accepted**",
          components: [],
        });

        const ticket = await db
          .select()
          .from(ticketsTable)
          .where(
            and(
              eq(ticketsTable.guildId, btn.guildId!),
              eq(ticketsTable.userId, applicantId),
              eq(ticketsTable.status, "open"),
            ),
          )
          .limit(1);

        if (ticket[0]) {
          const ticketChannel = btn.guild!.channels.cache.get(ticket[0].channelId);
          if (ticketChannel?.isTextBased()) {
            await ticketChannel.send(
              "✅ **Your partnership has been accepted!**\n\nYour server ad has been posted in the partnership channel."
            );
          }
        }
        return;
      }

      if (btn.customId.startsWith("partnership_deny:")) {
        if (!btn.memberPermissions?.has("ManageGuild")) {
          await btn.reply({ content: "❌ You need **Manage Server** permission.", flags: 64 });
          return;
        }

        await btn.update({
          content: "❌ **Partnership denied**",
          components: [],
        });

        const applicantId = btn.customId.split(":")[1];

        const ticket = await db
          .select()
          .from(ticketsTable)
          .where(
            and(
              eq(ticketsTable.guildId, btn.guildId!),
              eq(ticketsTable.userId, applicantId),
              eq(ticketsTable.status, "open"),
            ),
          )
          .limit(1);

        if (ticket[0]) {
          const ticketChannel = btn.guild!.channels.cache.get(ticket[0].channelId);
          if (ticketChannel?.isTextBased()) {
            await ticketChannel.send(
              "❌ **Your partnership application was denied.**\n\nThis ticket will be closed by staff."
            );
          }
        }
        return;
      }

      if (btn.customId.startsWith("ticket_close_")) {
        const ticketId = Number(btn.customId.replace("ticket_close_", ""));

        const [ticket] = await db
          .select()
          .from(ticketsTable)
          .where(eq(ticketsTable.id, ticketId))
          .limit(1);

        if (!ticket || ticket.status === "closed") {
          await btn.reply({
            content: "This ticket is already closed.",
            flags: 64,
          });
          return;
        }

        await btn.reply({
          embeds: [
            successEmbed(
              "Ticket Closed",
              "This ticket has been closed. Channel will be deleted shortly."
            ),
          ],
        });

        await closeTicketWithTranscript({
          guild: btn.guild,
          channel: btn.channel as TextChannel,
          ticket,
          closedByUserId: btn.user.id,
          closedByTag: btn.user.username,
          reason: "Closed via button",
        });

        return;
      }
    }
  } catch (err) {
    logger.error({ err }, "Unhandled interaction error");
  }
}
