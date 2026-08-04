import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { infoEmbed } from "../lib/embeds.js";
import { logger } from "../../lib/logger.js";

const EIGHT_BALL = [
  "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes, definitely.",
  "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.",
  "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
  "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
  "Don't count on it.", "My reply is no.", "My sources say no.",
  "Outlook not so good.", "Very doubtful.",
];

const JOKES = [
  "Why don't scientists trust atoms? Because they make up everything.",
  "I told my wife she was drawing her eyebrows too high. She looked surprised.",
  "Why can't you give Elsa a balloon? Because she'll let it go.",
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "Why did the scarecrow win an award? He was outstanding in his field.",
  "I only know 25 letters of the alphabet. I don't know y.",
  "What do you call a fake noodle? An impasta.",
  "Why did the bicycle fall over? Because it was two-tired.",
  "I asked the librarian if they had books about paranoia. She whispered: 'They're right behind you!'",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "What's a skeleton's least favorite room? The living room.",
  "I told my doctor I broke my arm in two places. He told me to stop going to those places.",
];

const ROASTS = [
  "I'd agree with you, but then we'd both be wrong.",
  "I'm not saying you're stupid, I'm just saying you have bad luck when you think.",
  "You're not completely useless — you can always serve as a bad example.",
  "Some people bring happiness wherever they go. You bring it whenever you leave.",
  "If laughter is the best medicine, your face must be curing diseases.",
  "You're the reason the gene pool needs a lifeguard.",
  "I'd call you a fool, but that would be an insult to all the fools out there.",
  "Somewhere out there, someone is thinking of you and smiling. Then they trip and fall.",
  "You have your entire life to be an idiot. Why not take today off?",
  "You're like a cloud — when you disappear, it's a beautiful day.",
  "I'd explain it to you, but I left my crayons at home.",
  "You're not the dumbest person alive, but you'd better hope they don't die.",
];

const WYR_QUESTIONS: [string, string][] = [
  ["fight 1 horse-sized duck", "fight 100 duck-sized horses"],
  ["never use the internet again", "never watch TV or movies again"],
  ["always have to speak in rhymes", "always have to speak in song"],
  ["know when you're going to die", "know how you're going to die"],
  ["be able to fly", "be invisible"],
  ["live 200 years in the past", "live 200 years in the future"],
  ["have unlimited money but no friends", "have unlimited friends but no money"],
  ["only eat pizza every meal forever", "never eat pizza again"],
  ["always be 10 minutes late", "always be 2 hours early"],
  ["have a pause button for your life", "have a rewind button for your life"],
  ["lose all your memories", "never be able to make new memories"],
  ["be the smartest person in any room", "be the funniest person in any room"],
  ["speak every language", "play every instrument"],
  ["always feel too hot", "always feel too cold"],
  ["have free Nitro forever", "have free server boosts forever"],
];

const TRIVIA: { q: string; a: string; wrong: string[] }[] = [
  { q: "What is the capital of France?", a: "Paris", wrong: ["London", "Berlin", "Madrid"] },
  { q: "How many sides does a hexagon have?", a: "6", wrong: ["5", "7", "8"] },
  { q: "Which planet is closest to the Sun?", a: "Mercury", wrong: ["Venus", "Earth", "Mars"] },
  { q: "Who wrote Romeo and Juliet?", a: "Shakespeare", wrong: ["Dickens", "Austen", "Hemingway"] },
  { q: "What is 7 × 8?", a: "56", wrong: ["48", "54", "64"] },
  { q: "What is the largest ocean?", a: "Pacific", wrong: ["Atlantic", "Indian", "Arctic"] },
  { q: "What color do you get mixing red and blue?", a: "Purple", wrong: ["Orange", "Green", "Brown"] },
  { q: "How many legs does a spider have?", a: "8", wrong: ["6", "10", "12"] },
  { q: "What is the chemical symbol for gold?", a: "Au", wrong: ["Go", "Gd", "Ag"] },
  { q: "Which planet has the most prominent ring system?", a: "Saturn", wrong: ["Jupiter", "Uranus", "Neptune"] },
  { q: "How many players are on a standard soccer team?", a: "11", wrong: ["9", "10", "12"] },
  { q: "What is the largest country by area?", a: "Russia", wrong: ["Canada", "USA", "China"] },
  { q: "How many minutes in a full day?", a: "1440", wrong: ["1200", "1800", "2400"] },
  { q: "What is the smallest prime number?", a: "2", wrong: ["1", "3", "0"] },
  { q: "What year did Minecraft release?", a: "2011", wrong: ["2009", "2012", "2010"] },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── /8ball ───────────────────────────────────────────────────────────────────
export const eightballCommand = {
  data: new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question")
    .addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("question", true);
    const answer = pick(EIGHT_BALL);
    const embed = new EmbedBuilder()
      .setTitle("🎱 Magic 8-Ball")
      .setColor(0x2f3136)
      .addFields({ name: "Question", value: question }, { name: "Answer", value: answer })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /coinflip ────────────────────────────────────────────────────────────────
export const coinflipCommand = {
  data: new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
  async execute(interaction: ChatInputCommandInteraction) {
    const result = Math.random() < 0.5 ? "Heads 🪙" : "Tails 🪙";
    await interaction.reply({ embeds: [infoEmbed("Coin Flip", `The coin landed on **${result}**!`)] });
  },
};

// ─── /dice ────────────────────────────────────────────────────────────────────
export const diceCommand = {
  data: new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll dice")
    .addIntegerOption((o) => o.setName("sides").setDescription("Number of sides (default: 6)").setMinValue(2).setMaxValue(1000))
    .addIntegerOption((o) => o.setName("count").setDescription("Number of dice (default: 1)").setMinValue(1).setMaxValue(10)),
  async execute(interaction: ChatInputCommandInteraction) {
    const sides = interaction.options.getInteger("sides") ?? 6;
    const count = interaction.options.getInteger("count") ?? 1;
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    await interaction.reply({
      embeds: [
        infoEmbed(
          `🎲 Dice Roll (${count}d${sides})`,
          `Rolls: **${rolls.join(", ")}**${count > 1 ? `\nTotal: **${total}**` : ""}`,
        ),
      ],
    });
  },
};

// ─── /joke ────────────────────────────────────────────────────────────────────
export const jokeCommand = {
  data: new SlashCommandBuilder().setName("joke").setDescription("Get a random joke"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ embeds: [infoEmbed("😄 Random Joke", pick(JOKES))] });
  },
};

// ─── /poll ────────────────────────────────────────────────────────────────────
export const pollCommand = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .addStringOption((o) => o.setName("question").setDescription("Poll question").setRequired(true))
    .addStringOption((o) => o.setName("option1").setDescription("Option 1 (default: Yes)"))
    .addStringOption((o) => o.setName("option2").setDescription("Option 2 (default: No)")),
  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("question", true);
    const opt1 = interaction.options.getString("option1") ?? "Yes";
    const opt2 = interaction.options.getString("option2") ?? "No";
    const embed = new EmbedBuilder()
      .setTitle("📊 Poll")
      .setDescription(`**${question}**\n\n👍 ${opt1}\n👎 ${opt2}`)
      .setColor(0x5865f2)
      .setFooter({ text: `Poll by ${interaction.user.username}` })
      .setTimestamp();
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    await msg.react("👍");
    await msg.react("👎");
  },
};

// ─── /serverinfo ──────────────────────────────────────────────────────────────
export const serverinfoCommand = {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("View information about this server"),
  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    await guild.members.fetch();
    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setColor(0x5865f2)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Members", value: String(guild.memberCount), inline: true },
        { name: "Channels", value: String(guild.channels.cache.size), inline: true },
        { name: "Roles", value: String(guild.roles.cache.size), inline: true },
        { name: "Boosts", value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
        { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /userinfo ────────────────────────────────────────────────────────────────
export const userinfoCommand = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View information about a user")
    .addUserOption((o) => o.setName("user").setDescription("User to inspect (default: yourself)")),
  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = interaction.guild?.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setTitle(user.tag)
      .setColor(0x5865f2)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        ...(member
          ? [
              { name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>`, inline: true },
              {
                name: "Roles",
                value:
                  member.roles.cache
                    .filter((r) => r.id !== interaction.guildId)
                    .map((r) => `<@&${r.id}>`)
                    .join(" ") || "None",
                inline: false,
              },
            ]
          : []),
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /ship ────────────────────────────────────────────────────────────────────
export const shipCommand = {
  data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Ship two people together and get their love score 💕")
    .addUserOption((o) => o.setName("user1").setDescription("First person").setRequired(true))
    .addUserOption((o) => o.setName("user2").setDescription("Second person (default: you)")),
  async execute(interaction: ChatInputCommandInteraction) {
    const user1 = interaction.options.getUser("user1", true);
    const user2 = interaction.options.getUser("user2") ?? interaction.user;
    // Deterministic score based on user IDs so same pair = same result
    const seed = (BigInt(user1.id) + BigInt(user2.id)) % 101n;
    const score = Number(seed);
    const filled = Math.round(score / 10);
    const meter = `${"❤️".repeat(filled)}${"🖤".repeat(10 - filled)}`;
    let label = "";
    if (score < 20) label = "💔 Not meant to be...";
    else if (score < 40) label = "😐 It's complicated.";
    else if (score < 60) label = "🙂 There's potential!";
    else if (score < 80) label = "😍 Great match!";
    else label = "💞 SOULMATES!";

    const combined = user1.username.slice(0, Math.ceil(user1.username.length / 2)) + user2.username.slice(Math.floor(user2.username.length / 2));

    const embed = new EmbedBuilder()
      .setTitle(`💕 ${user1.username} + ${user2.username} = ${combined}`)
      .setColor(0xff73a1)
      .setDescription(`${user1} ❤️ ${user2}\n\n${meter}\n\n**${score}%** — ${label}`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /rps ─────────────────────────────────────────────────────────────────────
export const rpsCommand = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play Rock Paper Scissors against Kyro")
    .addStringOption((o) =>
      o
        .setName("choice")
        .setDescription("Your choice")
        .setRequired(true)
        .addChoices(
          { name: "🪨 Rock", value: "rock" },
          { name: "📄 Paper", value: "paper" },
          { name: "✂️ Scissors", value: "scissors" },
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const choices = ["rock", "paper", "scissors"] as const;
    const emojis: Record<string, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
    const player = interaction.options.getString("choice", true) as "rock" | "paper" | "scissors";
    const bot = pick([...choices]);

    let result = "";
    if (player === bot) result = "It's a tie! 🤝";
    else if (
      (player === "rock" && bot === "scissors") ||
      (player === "paper" && bot === "rock") ||
      (player === "scissors" && bot === "paper")
    )
      result = "You win! 🎉";
    else result = "Kyro wins! 🤖";

    const embed = new EmbedBuilder()
      .setTitle("✂️ Rock Paper Scissors")
      .setColor(0x5865f2)
      .addFields(
        { name: "You chose", value: `${emojis[player]} ${player}`, inline: true },
        { name: "Kyro chose", value: `${emojis[bot]} ${bot}`, inline: true },
        { name: "Result", value: result, inline: false },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /wyr ─────────────────────────────────────────────────────────────────────
export const wyrCommand = {
  data: new SlashCommandBuilder()
    .setName("wyr")
    .setDescription("Would you rather...? (random question)"),
  async execute(interaction: ChatInputCommandInteraction) {
    const [a, b] = pick(WYR_QUESTIONS);
    const embed = new EmbedBuilder()
      .setTitle("🤔 Would You Rather...")
      .setColor(0xfee75c)
      .setDescription(`**A)** ${a}\n\n— or —\n\n**B)** ${b}\n\n*React below!*`)
      .setTimestamp();
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    await msg.react("🅰️").catch(() => {});
    await msg.react("🅱️").catch(() => {});
  },
};

// ─── /hack ────────────────────────────────────────────────────────────────────
export const hackCommand = {
  data: new SlashCommandBuilder()
    .setName("hack")
    .setDescription("'Hack' a user (totally real, not fake at all)")
    .addUserOption((o) => o.setName("user").setDescription("Target to hack").setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user", true);
    await interaction.deferReply();

    const steps = [
      `🔍 Locating ${target.username}'s IP address...`,
      `📡 Bypassing firewall...`,
      `💾 Accessing Discord database...`,
      `🔐 Cracking password hash...`,
      `📂 Downloading files...`,
      `✅ Hack complete! You now have full access to ${target.username}'s account.\n*(this is a joke, nothing actually happened)*`,
    ];

    let current = steps[0]!;
    await interaction.editReply(current);

    for (let i = 1; i < steps.length; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      current += `\n${steps[i]}`;
      await interaction.editReply(current).catch(() => {});
    }
  },
};

// ─── /roast ───────────────────────────────────────────────────────────────────
export const roastCommand = {
  data: new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Roast a user (all in good fun!)")
    .addUserOption((o) => o.setName("user").setDescription("User to roast").setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user", true);
    const roast = pick(ROASTS);
    const embed = new EmbedBuilder()
      .setTitle(`🔥 ${target.username} got roasted!`)
      .setDescription(roast)
      .setColor(0xff6b35)
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: "All in good fun 😄" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /pp ──────────────────────────────────────────────────────────────────────
export const ppCommand = {
  data: new SlashCommandBuilder()
    .setName("pp")
    .setDescription("Check someone's pp size (totally scientific)")
    .addUserOption((o) => o.setName("user").setDescription("User to check (default: you)")),
  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const seed = BigInt(user.id) % 21n;
    const size = Number(seed);
    const bar = "8" + "=".repeat(size) + "D";
    const embed = new EmbedBuilder()
      .setTitle(`📏 ${user.username}'s PP Size`)
      .setDescription(`\`${bar}\`\n\n**${size} inches** — totally accurate, fully scientific.`)
      .setColor(0xff73a1)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /meme ────────────────────────────────────────────────────────────────────
export const memeCommand = {
  data: new SlashCommandBuilder().setName("meme").setDescription("Get a random meme"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const res = await fetch("https://meme-api.com/gimme/dankmemes");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json() as { title: string; url: string; author: string; subreddit: string; postLink: string };
      const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setImage(data.url)
        .setColor(0x5865f2)
        .setFooter({ text: `r/${data.subreddit} • u/${data.author}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.warn({ err }, "Failed to fetch meme");
      await interaction.editReply({ embeds: [infoEmbed("😵 Meme Failed", "Could not fetch a meme right now. Try again!")] });
    }
  },
};

// ─── /trivia ──────────────────────────────────────────────────────────────────
export const triviaCommand = {
  data: new SlashCommandBuilder().setName("trivia").setDescription("Answer a random trivia question"),
  async execute(interaction: ChatInputCommandInteraction) {
    const q = pick(TRIVIA);
    const options = [...q.wrong, q.a].sort(() => Math.random() - 0.5);
    const letters = ["🇦", "🇧", "🇨", "🇩"];

    const description = options.map((o, i) => `${letters[i]} ${o}`).join("\n");
    const answerIndex = options.indexOf(q.a);

    const embed = new EmbedBuilder()
      .setTitle("🧠 Trivia Question")
      .setColor(0x5865f2)
      .setDescription(`**${q.q}**\n\n${description}\n\n||✅ Answer: **${letters[answerIndex]} ${q.a}**||`)
      .setFooter({ text: "Click the spoiler to reveal the answer" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
