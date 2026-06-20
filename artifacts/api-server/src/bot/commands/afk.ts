import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { db, afkStatusTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed } from "../lib/embeds.js";

export const afkCommand = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set yourself as AFK")
    .addStringOption((o) => o.setName("reason").setDescription("Reason for being AFK")),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const reason = interaction.options.getString("reason") ?? "AFK";

    await db.delete(afkStatusTable).where(and(eq(afkStatusTable.guildId, guildId), eq(afkStatusTable.userId, interaction.user.id)));
    await db.insert(afkStatusTable).values({ guildId, userId: interaction.user.id, reason });

    await interaction.reply({ embeds: [successEmbed("AFK Set", `You're now AFK: ${reason}`)] });
  },
};