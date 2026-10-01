
import type { Client } from "discord.js";

const STATS_URL =
  "https://project--9397dd1d-84b8-458e-afbd-d53b9ddd1eeb.lovable.app/api/public/stats";

const CALYX_STATS_SECRET = process.env["CALYX_STATS_SECRET"];

export function startStatsUpdater(client: Client) {
  if (!CALYX_STATS_SECRET) {
    console.warn("[Calyx stats] CALYX_STATS_SECRET is missing from environment");
    return;
  }

  async function updateStats() {
    try {
      const servers = client.guilds.cache.size;
      const users = client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0
      );
      const commands = 0; // replace if you track command usage

      const res = await fetch(STATS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-key": CALYX_STATS_SECRET,
        },
        body: JSON.stringify({
          servers,
          users,
          commands,
        }),
      });

      if (!res.ok) {
        console.error("[Calyx stats] update failed:", res.status, await res.text());
        return;
      }

      const json = await res.json();
      console.log("[Calyx stats] updated:", json);
    } catch (err) {
      console.error("[Calyx stats] update error:", err);
    }
  }

  client.once("ready", () => {
    void updateStats();
    setInterval(() => void updateStats(), 5 * 60 * 1000);
  });
}
