import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";

const COMMAND_CATEGORIES: Record<
  string,
  { emoji: string; commands: Array<{ name: string; description: string }> }
> = {
  Moderation: {
    emoji: "🔨",
    commands: [
      { name: "/ban", description: "Ban a member from the server" },
      { name: "/kick", description: "Kick a member from the server" },
      { name: "/mute", description: "Mute (timeout) a member for a duration" },
      { name: "/unmute", description: "Remove a mute/timeout from a member" },
      { name: "/warn", description: "Issue a warning to a member" },
      { name: "/warnings", description: "View all warnings for a user" },
      { name: "/clearwarnings", description: "Clear all warnings for a user" },
      { name: "/timeout", description: "Timeout a member for a set duration" },
      { name: "/untimeout", description: "Remove a timeout from a member" },
      { name: "/purge", description: "Bulk delete messages (1-100)" },
    ],
  },
  Administration: {
    emoji: "⚙️",
    commands: [
      { name: "/role add", description: "Add a role to a member" },
      { name: "/role remove", description: "Remove a role from a member" },
      { name: "/slowmode", description: "Set channel slowmode (0 to disable)" },
      { name: "/lock", description: "Lock the current channel" },
      { name: "/unlock", description: "Unlock the current channel" },
      { name: "/announce", description: "Send an announcement embed" },
      { name: "/nick", description: "Change a member's nickname" },
    ],
  },
  "Setup & Configuration": {
    emoji: "🛠️",
    commands: [
      {
        name: "/setup welcome",
        description: "Configure the welcome message and channel",
      },
      {
        name: "/setup logs",
        description: "Configure moderation and general log channels",
      },
      {
        name: "/setup tickets",
        description: "Configure the ticket system category and log",
      },
      {
        name: "/setup automod",
        description: "Toggle anti-spam, anti-raid, and auto-mod",
      },
      { name: "/setup roles", description: "Set mod, admin, and mute roles" },
      {
        name: "/setup autorole",
        description: "Add/remove/list auto-roles for new members",
      },
      {
        name: "/setup jointovoice",
        description: "Configure join-to-create voice channels",
      },
      {
        name: "/setup maxwarnings",
        description: "Set the max warnings before auto-action",
      },
      { name: "/setup view", description: "View current bot configuration" },
    ],
  },
  Tickets: {
    emoji: "🎫",
    commands: [
      { name: "/ticket open", description: "Open a new support ticket" },
      { name: "/ticket close", description: "Close the current ticket" },
      { name: "/ticket add", description: "Add a user to the current ticket" },
      {
        name: "/ticket remove",
        description: "Remove a user from the current ticket",
      },
      { name: "/ticket claim", description: "Claim a ticket as your own" },
    ],
  },
  ModMail: {
    emoji: "📬",
    commands: [
      {
        name: "DM the bot",
        description: "Send a DM to open a ModMail thread with staff",
      },
      {
        name: "/modmail reply",
        description: "Reply to a user in a ModMail thread (staff only)",
      },
      {
        name: "/modmail close",
        description: "Close a ModMail thread (staff only)",
      },
    ],
  },
  Music: {
    emoji: "🎵",
    commands: [
      {
        name: "/play",
        description: "Play a song by name, YouTube URL, or playlist URL",
      },
      { name: "/pause", description: "Pause the current song" },
      { name: "/resume", description: "Resume paused playback" },
      { name: "/skip", description: "Skip the current song" },
      { name: "/stop", description: "Stop playback and clear the queue" },
      { name: "/queue", description: "View the current song queue" },
      { name: "/nowplaying", description: "Show the currently playing song" },
      { name: "/volume", description: "Set playback volume (0-100)" },
      { name: "/loop", description: "Set loop mode: off, song, or queue" },
      { name: "/shuffle", description: "Shuffle the queue" },
      {
        name: "/remove",
        description: "Remove a song from the queue by position",
      },
      {
        name: "/disconnect",
        description: "Disconnect the bot from the voice channel",
      },
      {
        name: "/playlist save",
        description: "Save the current queue as a named playlist",
      },
      { name: "/playlist load", description: "Load and play a saved playlist" },
      { name: "/playlist delete", description: "Delete a saved playlist" },
      { name: "/playlist list", description: "List all saved playlists" },
    ],
  },
  "Bug Support": {
    emoji: "🎮",
    commands: [
      {
        name: "/bugreport",
        description: "Submit a bug report for a server member report",
      },
      {
        name: "/playerreport",
        description: "Report a player for rule violations",
      },
      { name: "/support", description: "Submit a general support request" },
    ],
  },
  Fun: {
    emoji: "🎉",
    commands: [
      { name: "/8ball", description: "Ask the magic 8-ball a yes/no question" },
      { name: "/coinflip", description: "Flip a coin" },
      { name: "/dice", description: "Roll customizable dice" },
      { name: "/joke", description: "Get a random joke" },
      { name: "/poll", description: "Create a quick reaction poll" },
      {
        name: "/serverinfo",
        description: "View information about this server",
      },
      { name: "/userinfo", description: "View information about a user" },
    ],
  },
  Security: {
    emoji: "🛡️",
    commands: [
      {
        name: "/security status",
        description: "View current security settings",
      },
      { name: "/security antispam", description: "Toggle anti-spam detection" },
      { name: "/security antiraid", description: "Toggle anti-raid mode" },
      {
        name: "/security whitelist",
        description: "Manage anti-raid whitelist",
      },
    ],
  },
  Voice: {
    emoji: "🔊",
    commands: [
      {
        name: "Join the configured channel",
        description: "Auto-creates a private voice channel for you",
      },
      {
        name: "/setup jointovoice",
        description: "Configure the join-to-create voice system",
      },
    ],
  },
  General: {
    emoji: "🔗",
    commands: [
      { name: "/invite", description: "Get the link to our support server" },
    ],
  },
};

export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all available commands")
    .addStringOption((o) =>
      o
        .setName("category")
        .setDescription("Filter by category")
        .addChoices(
          { name: "Moderation", value: "Moderation" },
          { name: "Administration", value: "Administration" },
          { name: "Setup & Configuration", value: "Setup & Configuration" },
          { name: "Tickets", value: "Tickets" },
          { name: "ModMail", value: "ModMail" },
          { name: "Music", value: "Music" },
          { name: " Server Support", value: "Server Support" },
          { name: "Fun", value: "Fun" },
          { name: "Utility", value: "Utility" },
          { name: "Security", value: "Security" },
          { name: "Voice", value: "Voice" },
          { name: "General", value: "General" },
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const categoryFilter = interaction.options.getString("category");

    if (categoryFilter && COMMAND_CATEGORIES[categoryFilter]) {
      const cat = COMMAND_CATEGORIES[categoryFilter]!;
      const embed = new EmbedBuilder()
        .setTitle(`${cat.emoji} ${categoryFilter} Commands`)
        .setColor(0x5865f2)
        .setDescription(
          cat.commands
            .map((c) => `\`${c.name}\` — ${c.description}`)
            .join("\n"),
        )
        .setFooter({ text: "Use /help to see all categories" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📖 Bot Help — All Commands")
      .setColor(0x5865f2)
      .setDescription(
        "Use `/help category:<name>` to see commands in a specific category.\n\nAll commands use Discord slash commands — type `/` to see them all in Discord.",
      )
      .setTimestamp();

    for (const [name, cat] of Object.entries(COMMAND_CATEGORIES)) {
      embed.addFields({
        name: `${cat.emoji} ${name}`,
        value:
          cat.commands
            .slice(0, 5)
            .map((c) => `\`${c.name}\``)
            .join(" ") +
          (cat.commands.length > 5 ? ` +${cat.commands.length - 5} more` : ""),
        inline: false,
      });
    }

    const totalCommands = Object.values(COMMAND_CATEGORIES).reduce(
      (sum, c) => sum + c.commands.length,
      0,
    );
    embed.setFooter({
      text: `${totalCommands} total commands across ${Object.keys(COMMAND_CATEGORIES).length} categories`,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};