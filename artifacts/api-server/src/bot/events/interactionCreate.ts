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
import { handleTicketPanelSelect, handleTicketCreate, closeTicketWithTranscript } from "../commands/tickets.js";

import {
  handlePanelSlotButton,
  handlePanelInfoButton,
  handlePanelChannelSelect,
  handlePanelModalSubmit,
  handlePanelSend,
  handlePanelCancel,
} from "../lib/panelBuilder.js";

import { handleBackupRestoreConfirm, handleBackupRestoreCancel } from "../commands/backup.js";
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
        logger.error(
          { err, command: interaction.commandName },
          "Slash command crashed"
        );

        const payload = {
          content: "An error occurred while running this command.",
          flags: 64,
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
    // STRING SELECT MENUS
    // =========================
    if (interaction.isStringSelectMenu()) {
      const select = interaction as StringSelectMenuInteraction;

      if (select.customId.startsWith("ticket_panel_select")) {
        await handleTicketPanelSelect(select);
        return;
      }
    }

    // =========================
    // CHANNEL SELECT MENUS
    // =========================
    if (interaction.isChannelSelectMenu()) {
      const select = interaction as ChannelSelectMenuInteraction;

      if (select.customId.startsWith("panel_channel:")) {
        await handlePanelChannelSelect(select);
        return;
      }
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

      // Giveaway
      if (btn.customId.startsWith("giveaway_enter:")) {
        await handleGiveawayEnter(btn);
        return;
      }

      // Panel builder
      if (btn.customId.startsWith("panel_slot:")) {
        await handlePanelSlotButton(btn);
        return;
      }

      if (btn.customId.startsWith("panel_info:")) {
        await handlePanelInfoButton(btn);
        return;
      }

      if (btn.customId.startsWith("panel_send:")) {
        await handlePanelSend(btn);
        return;
      }

      if (btn.customId.startsWith("panel_cancel:")) {
        await handlePanelCancel(btn);
        return;
      }

      // Backup
      if (btn.customId.startsWith("backup_restore_confirm:")) {
        await handleBackupRestoreConfirm(btn);
        return;
      }

      if (btn.customId === "backup_restore_cancel") {
        await handleBackupRestoreCancel(btn);
        return;
      }

      // Tickets
      if (btn.customId.startsWith("ticket_create:")) {
        await handleTicketCreate(btn);
        return;
      }

      if (btn.customId.startsWith("ticket_close_")) {
        const ticketId = parseInt(btn.customId.replace("ticket_close_", ""), 10);

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
              "This ticket has been closed. The channel will be deleted shortly."
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
    // GLOBAL SAFETY NET (prevents silent crashes)
    logger.error({ err }, "Unhandled interaction error");
  }
}