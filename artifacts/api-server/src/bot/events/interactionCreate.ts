import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  TextChannel,
} from "discord.js";

import { getCommand } from "../commands/index.js";
import { db, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { successEmbed } from "../lib/embeds.js";

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
        logger.error({ err, command: interaction.commandName }, "Slash command crashed");

        const payload = {
          content: "❌ Error executing command.",
          flags: 64, // EPHEMERAL (fix deprecated usage)
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      }

      return;
    }

    // =========================
    // STRING SELECT
    // =========================
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

      if (interaction.customId === "template_create_modal") {
        await handleTemplateModalSubmit(interaction);
        return;
      }

      if (interaction.customId === "createroles_modal") {
        await handleCreateRolesModalSubmit(interaction);
        return;
      }
    }

    // =========================
    // BUTTONS
    // =========================
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;

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
          closedByTag: btn.user.tag,
          reason: "Closed via button",
        });

        return;
      }
    }
  } catch (err) {
    logger.error({ err }, "Unhandled interaction error");
  }
}