import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  TextChannel,
} from "discord.js";
import { getCommand } from "../commands/index.js";
import { db, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { successEmbed } from "../lib/embeds.js";
import { handleTicketPanelSelect } from "../commands/tickets.js";

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const cmd = getCommand(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction as ChatInputCommandInteraction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Error executing command");
      const errMsg = { content: "An error occurred while running this command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
    return;
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    const select = interaction as StringSelectMenuInteraction;
    if (select.customId === "ticket_panel_select") {
      await handleTicketPanelSelect(select);
      return;
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const btn = interaction as ButtonInteraction;
    if (btn.customId.startsWith("ticket_close_")) {
      const ticketId = parseInt(btn.customId.replace("ticket_close_", ""), 10);
      const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId)).limit(1);
      if (!ticket || ticket.status === "closed") {
        await btn.reply({ content: "This ticket is already closed.", ephemeral: true });
        return;
      }
      await db.update(ticketsTable).set({ status: "closed", closedBy: btn.user.id, closedReason: "Closed via button", closedAt: new Date() }).where(eq(ticketsTable.id, ticketId));
      await btn.reply({ embeds: [successEmbed("Ticket Closed", "This ticket has been closed. The channel will be deleted shortly.")] });
      const channel = btn.channel as TextChannel;
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    }
  }
}