import sharp, { type OverlayOptions } from "sharp";
import type { GuildMember } from "discord.js";
import type { GuildConfig } from "@workspace/db";
import { logger } from "../../lib/logger.js";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 400;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type WelcomeConfig = Pick<
  GuildConfig,
  | "welcomeMessage"
  | "welcomeBackgroundUrl"
  | "welcomeAccentColor"
  | "welcomeShowAvatar"
  | "welcomeShowServerIcon"
  | "welcomeShowMemberCount"
>;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1]!.slice(0, maxChars - 3)}...`;
  }
  return lines;
}

function getAccentColor(config: WelcomeConfig): string {
  const value = config.welcomeAccentColor ?? "#9b59b6";
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#9b59b6";
}

function defaultBackground(): Buffer {
  return Buffer.from(`
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#160d29"/>
          <stop offset="0.55" stop-color="#241046"/>
          <stop offset="1" stop-color="#080810"/>
        </linearGradient>
        <radialGradient id="glow" cx="82%" cy="18%" r="70%">
          <stop offset="0" stop-color="#9b59b6" stop-opacity="0.75"/>
          <stop offset="1" stop-color="#9b59b6" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#glow)"/>
    </svg>
  `);
}

async function fetchImage(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "image/*" },
    });
    if (!response.ok) return null;

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    await sharp(bytes).metadata();
    return bytes;
  } catch (err) {
    logger.warn({ err, url }, "Welcome card image could not be loaded");
    return null;
  }
}

async function circleImage(input: Buffer, size: number): Promise<Buffer> {
  const mask = Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>
  `);
  return sharp(input)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

export function renderWelcomeMessage(member: GuildMember, template: string | null): string {
  const message = template ?? "Welcome {user} to {server}!";
  const values: Record<string, string> = {
    user: `<@${member.id}>`,
    username: member.displayName || member.user.username,
    server: member.guild.name,
    membercount: String(member.guild.memberCount),
    member: String(member.guild.memberCount),
    userid: member.id,
  };

  return message.replace(/\{(user|username|server|membercount|member|userid)\}/gi, (_, key: string) => {
    return values[key.toLowerCase()] ?? `{${key}}`;
  });
}

export async function generateWelcomeCard(
  member: GuildMember,
  config: WelcomeConfig,
): Promise<Buffer> {
  const accent = getAccentColor(config);
  const message = renderWelcomeMessage(member, config.welcomeMessage);
  const messageLines = wrapText(message, 58, 2);
  const displayName = member.displayName || member.user.username;
  const background = (await fetchImage(config.welcomeBackgroundUrl)) ?? defaultBackground();

  const base = await sharp(background)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover" })
    .composite([
      {
        input: Buffer.from(`
          <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#05050a" fill-opacity="0.38"/>
            <rect x="44" y="42" width="${CARD_WIDTH - 88}" height="${CARD_HEIGHT - 84}" rx="28"
              fill="#080810" fill-opacity="0.54" stroke="${accent}" stroke-opacity="0.8" stroke-width="2"/>
            <rect x="44" y="42" width="10" height="${CARD_HEIGHT - 84}" rx="5" fill="${accent}"/>
          </svg>
        `),
      },
    ])
    .png()
    .toBuffer();

  const composites: OverlayOptions[] = [];
  const avatar = config.welcomeShowAvatar === false ? null : await fetchImage(
    member.user.displayAvatarURL({ extension: "png", size: 256 }),
  );
  if (avatar) {
    composites.push({ input: await circleImage(avatar, 190), left: 92, top: 105 });
  }

  const serverIcon = config.welcomeShowServerIcon === false
    ? null
    : await fetchImage(member.guild.iconURL({ extension: "png", size: 128 }) ?? undefined);
  if (serverIcon) {
    composites.push({ input: await circleImage(serverIcon, 74), left: 1050, top: 70 });
  }

  const left = avatar ? 330 : 100;
  const memberCountLine = config.welcomeShowMemberCount === false
    ? ""
    : `${member.guild.memberCount.toLocaleString()} members • Member #${member.guild.memberCount.toLocaleString()}`;
  const messageSvg = messageLines
    .map((line, index) => `<tspan x="${left}" dy="${index === 0 ? 0 : 36}">${escapeXml(line)}</tspan>`)
    .join("");

  composites.push({
    input: Buffer.from(`
      <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <text x="${left}" y="116" fill="#ffffff" font-family="Arial, sans-serif" font-size="25" font-weight="700">
          Welcome to ${escapeXml(member.guild.name)}
        </text>
        <text x="${left}" y="166" fill="${accent}" font-family="Arial, sans-serif" font-size="42" font-weight="700">
          ${escapeXml(displayName)}
        </text>
        <text x="${left}" y="230" fill="#f5f5f7" font-family="Arial, sans-serif" font-size="22">
          ${messageSvg}
        </text>
        <text x="${left}" y="326" fill="#c9c9d2" font-family="Arial, sans-serif" font-size="18">
          ${escapeXml(memberCountLine)}
        </text>
        <text x="${left}" y="356" fill="#9a9aa6" font-family="Arial, sans-serif" font-size="15">
          ID: ${escapeXml(member.id)}
        </text>
      </svg>
    `),
  });

  return sharp(base).composite(composites).png().toBuffer();
}