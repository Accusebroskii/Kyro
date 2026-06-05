import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { infoEmbed } from "../lib/embeds.js";

const EIGHT_BALL = ["It is certain.", "It is decidedly so.", "Without a doubt.", "Yes, definitely.", "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.", "Signs point to yes.", "Reply hazy, try again.", "Ask again later.", "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.", "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful."];
const JOKES = ["Why don't scientists trust atoms? Because they make up everything.", "I told my wife she was drawing her eyebrows too high. She looked surprised.", "Why can't you give Elsa a balloon? Because she'll let it go.", "I'm reading a book about anti-gravity. It's impossible to put down.", "Why did the scarecrow win an award? He was outstanding in his field.", "I only know 25 letters of the alphabet. I don't know y.", "What do you call a fake noodle? An impasta.", "Why did the bicycle fall over? Because it was two-tired."];

export const eightballCommand = {
  data: new SlashCommandBuilder().setName("8ball").setDescription("Ask the magic 8-ball a question").addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("question", true);
    const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)]!;
    const embed = new EmbedBuilder().setTitle("🎱 Magic 8-Ball").setColor(0x2f3136)
      .addFields({ name: "Question", value: question }, { name: "Answer", value: answer }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

export const coinflipCommand = {
  data: new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
  async execute(interaction: ChatInputCommandInteraction) {
    const result = Math.random() < 0.5 ? "Heads 🪙" : "Tails 🪙";
    await interaction.reply({ embeds: [infoEmbed("Coin Flip", `The coin landed on **${result}**!`)] });
  },
};

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
    await interaction.reply({ embeds: [infoEmbed(`🎲 Dice Roll (${count}d${sides})`, `Rolls: **${rolls.join(", ")}**${count > 1 ? `\nTotal: **${total}**` : ""}`)] });
  },
};

export const jokeCommand = {
  data: new SlashCommandBuilder().setName("joke").setDescription("Get a random joke"),
  async execute(interaction: ChatInputCommandInteraction) {
    const joke = JOKES[Math.floor(Math.random() * JOKES.length)]!;
    await interaction.reply({ embeds: [infoEmbed("😄 Random Joke", joke)] });
  },
};

export const pollCommand = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a simple yes/no poll")
    .addStringOption((o) => o.setName("question").setDescription("Poll question").setRequired(true))
    .addStringOption((o) => o.setName("option1").setDescription("Option 1 (default: Yes)"))
    .addStringOption((o) => o.setName("option2").setDescription("Option 2 (default: No)")),
  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("question", true);
    const opt1 = interaction.options.getString("option1") ?? "Yes";
    const opt2 = interaction.options.getString("option2") ?? "No";
    const embed = new EmbedBuilder().setTitle("📊 Poll").setDescription(`**${question}**\n\n👍 ${opt1}\n👎 ${opt2}`).setColor(0x5865f2).setFooter({ text: `Poll by ${interaction.user.tag}` }).setTimestamp();
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    await msg.react("👍");
    await msg.react("👎");
  },
};

export const serverinfoCommand = {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("View information about this server"),
  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    await guild.members.fetch();
    const embed = new EmbedBuilder().setTitle(guild.name).setColor(0x5865f2)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Members", value: String(guild.memberCount), inline: true },
        { name: "Channels", value: String(guild.channels.cache.size), inline: true },
        { name: "Roles", value: String(guild.roles.cache.size), inline: true },
        { name: "Boosts", value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
        { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
      ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

export const userinfoCommand = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View information about a user")
    .addUserOption((o) => o.setName("user").setDescription("User to inspect (default: yourself)")),
  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = interaction.guild?.members.cache.get(user.id);
    const embed = new EmbedBuilder().setTitle(user.tag).setColor(0x5865f2)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        ...(member ? [{ name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>`, inline: true }, { name: "Roles", value: member.roles.cache.filter((r) => r.id !== interaction.guildId).map((r) => `<@&${r.id}>`).join(" ") || "None", inline: false }] : []),
      ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
