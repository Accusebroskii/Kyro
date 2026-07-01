import {
  ButtonInteraction,
  GuildMember,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

interface PendingCaptcha {
  code: string;
  createdAt: number;
}

export const pendingCaptchas = new Map<string, PendingCaptcha>();

const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CAPTCHA_LENGTH = 6;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CAPTCHA_LENGTH; i++) {
    code += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  return code;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingCaptchas) {
    if (now - value.createdAt > CAPTCHA_TTL_MS) {
      pendingCaptchas.delete(key);
    }
  }
}, 60_000).unref?.();

export async function startCaptchaVerification(
  interaction: ButtonInteraction,
  member: GuildMember,
): Promise<void> {
  const code = generateCode();
  const key = `${interaction.guildId}:${member.id}`;
  pendingCaptchas.set(key, { code, createdAt: Date.now() });

  const modal = new ModalBuilder()
    .setCustomId("verify_captcha_modal")
    .setTitle("Enter Verification Code")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("captcha_code")
          .setLabel(`Type this code: ${code}`)
          .setStyle(TextInputStyle.Short)
          .setMinLength(CAPTCHA_LENGTH)
          .setMaxLength(CAPTCHA_LENGTH)
          .setRequired(true)
          .setPlaceholder(code),
      ),
    );

  await interaction.showModal(modal);
}
