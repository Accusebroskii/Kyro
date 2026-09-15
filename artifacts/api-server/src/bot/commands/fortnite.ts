import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

const API_BASE = "https://prod.api-fortnite.com";

interface FortniteAccount {
  id: string;
  displayName: string;
}

interface FortniteStats {
  [key: string]: unknown;
}

async function fortniteRequest<T>(path: string): Promise<T> {
  const apiKey = process.env.FORTNITE_API_KEY;

  if (!apiKey) {
    throw new Error("FORTNITE_API_KEY is not configured");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Fortnite API returned ${response.status}`);
  }

  return (await response.json()) as T;
}

async function findAccount(displayName: string): Promise<FortniteAccount> {
  return fortniteRequest<FortniteAccount>(
    `/api/v1/account/displayName/${encodeURIComponent(displayName)}`,
  );
}

async function getStats(accountId: string): Promise<FortniteStats> {
  return fortniteRequest<FortniteStats>(
    `/api/v2/stats/${encodeURIComponent(accountId)}`,
  );
}

function getNumber(data: FortniteStats, keys: string[]): number {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "number") return value;

    if (
      typeof value === "object" &&
      value !== null &&
      "value" in value &&
      typeof (value as { value?: unknown }).value === "number"
    ) {
      return (value as { value: number }).value;
    }
  }

  return 0;
}

function getOwnerLabel(displayName: string): string | null {
  const name = displayName.toLowerCase();

  if (name === "nukeyr" || name === "accusezynic") {
    return "👑 Owner of Calyx";
  }

  return null;
}

export const fortniteCommand = {
  data: new SlashCommandBuilder()
    .setName("fortnite")
    .setDescription("Look up a Fortnite player")
    .addStringOption((option) =>
      option
        .setName("player")
        .setDescription("Fortnite / Epic display name")
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const player = interaction.options.getString("player", true);

    try {
      const account = await findAccount(player);
      const stats = await getStats(account.id);

      const wins = getNumber(stats, ["br_wins_total", "wins"]);
      const kills = getNumber(stats, ["br_kills_total", "kills"]);
      const matches = getNumber(stats, [
        "br_matches_total",
        "matches",
        "matchesPlayed",
      ]);

      const kd =
        matches > wins
          ? (kills / Math.max(matches - wins, 1)).toFixed(2)
          : "0.00";

      const winRate =
        matches > 0 ? ((wins / matches) * 100).toFixed(2) : "0.00";

      const owner = getOwnerLabel(account.displayName);

      const embed = new EmbedBuilder()
        .setTitle(`🎮 ${account.displayName}`)
        .setDescription(
          `${owner ? `${owner}\n\n` : ""}**Epic Account ID:** \`${account.id}\``,
        )
        .addFields(
          {
            name: "🏆 Wins",
            value: wins.toLocaleString(),
            inline: true,
          },
          {
            name: "💀 Kills",
            value: kills.toLocaleString(),
            inline: true,
          },
          {
            name: "🎮 Matches",
            value: matches.toLocaleString(),
            inline: true,
          },
          {
            name: "📊 K/D",
            value: kd,
            inline: true,
          },
          {
            name: "📈 Win Rate",
            value: `${winRate}%`,
            inline: true,
          },
          {
            name: "🆔 Account",
            value: `\`${account.id}\``,
            inline: true,
          },
        )
        .setFooter({ text: "Calyx • Fortnite Stats" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Fortnite lookup failed:", error);

      await interaction.editReply({
        content:
          `❌ Couldn't find **${player}** or retrieve their Fortnite stats.`,
      });
    }
  },
};
