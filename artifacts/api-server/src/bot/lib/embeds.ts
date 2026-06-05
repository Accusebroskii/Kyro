import { EmbedBuilder, ColorResolvable } from "discord.js";

const COLORS = {
  success: 0x57f287 as ColorResolvable,
  error: 0xed4245 as ColorResolvable,
  warning: 0xfee75c as ColorResolvable,
  info: 0x5865f2 as ColorResolvable,
  mod: 0xff6b35 as ColorResolvable,
  music: 0x1db954 as ColorResolvable,
  neutral: 0x2f3136 as ColorResolvable,
};

export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle("❌ Error")
    .setDescription(description)
    .setTimestamp();
}

export function modEmbed(
  action: string,
  target: string,
  moderator: string,
  reason?: string | null,
  extra?: Record<string, string>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.mod)
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: "Target", value: target, inline: true },
      { name: "Moderator", value: moderator, inline: true },
      { name: "Reason", value: reason ?? "No reason provided", inline: false },
    )
    .setTimestamp();

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      embed.addFields({ name: k, value: v, inline: true });
    }
  }
  return embed;
}

export function musicEmbed(title: string, description: string, thumbnail?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.music)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

export function warningEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}
