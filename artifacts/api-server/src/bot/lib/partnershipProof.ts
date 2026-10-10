import {
  EmbedBuilder,
  Attachment,
  ChannelType,
  Message,
  TextChannel,
} from "discord.js";
import {
  db,
  guildConfigTable,
  ticketsTable,
  type PartnershipApplicationData,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  getOpenRouterConfigStatus,
  verifyPartnershipScreenshot,
} from "./ai.js";
import { grantPartnershipPostingRole } from "./partnershipAccess.js";
import { logger } from "../../lib/logger.js";

const MAX_PROOF_IMAGE_BYTES = 5 * 1024 * 1024;

function proofImageType(attachment: Attachment): string | null {
  const declaredType = attachment.contentType?.split(";")[0].toLowerCase();
  if (
    declaredType === "image/png" ||
    declaredType === "image/jpeg" ||
    declaredType === "image/webp"
  ) {
    return declaredType;
  }

  const name = attachment.name ?? "";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.webp$/i.test(name)) return "image/webp";
  return null;
}

async function downloadProofImage(attachment: Attachment): Promise<string> {
  const type = proofImageType(attachment);
  if (!type) throw new Error("Upload a PNG, JPEG, or WebP screenshot.");
  if (attachment.size > MAX_PROOF_IMAGE_BYTES) {
    throw new Error("The screenshot must be 5 MB or smaller.");
  }

  const url = new URL(attachment.url);
  if (
    url.protocol !== "https:" ||
    !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)
  ) {
    throw new Error("The screenshot URL is not a supported Discord attachment.");
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("The screenshot could not be downloaded.");

  const responseType = response.headers
    .get("content-type")
    ?.split(";")[0]
    .toLowerCase();
  if (responseType && responseType !== type) {
    throw new Error("The screenshot file type did not match its upload.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PROOF_IMAGE_BYTES) {
    throw new Error("The screenshot must contain an image and be 5 MB or smaller.");
  }

  return `data:${type};base64,${bytes.toString("base64")}`;
}

function emptyApplicationData(): PartnershipApplicationData {
  return {
    server: "",
    invite: "",
    members: "",
    contact: "",
    advertisement: "",
  };
}

async function sendReviewResult(
  message: Message,
  reviewChannelId: string | null,
  proofStatus: string,
  explanation: string,
  attachment: Attachment,
  accessResult: string,
) {
  if (!message.guild || !reviewChannelId) return false;
  const channel = await message.guild.channels.fetch(reviewChannelId).catch(() => null);
  if (!(channel instanceof TextChannel)) return false;

  const embed = new EmbedBuilder()
    .setTitle(`📸 Partnership Proof: ${proofStatus}`)
    .setDescription(
      `**Applicant:** <@${message.author.id}>\n` +
      `**Ticket:** <#${message.channelId}>\n` +
      `**AI result:** ${explanation}\n` +
      `**Access:** ${accessResult}`,
    )
    .setTimestamp();

  await channel.send({
    embeds: [embed],
    files: [{ attachment: attachment.url, name: attachment.name ?? "partnership-proof" }],
  });
  return true;
}

export async function handlePartnershipProof(message: Message) {
  if (!message.guildId || message.author.bot) return;
  if (!message.channel.isTextBased()) return;
  if (!message.guild) return;

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        eq(ticketsTable.guildId, message.guildId),
        eq(ticketsTable.channelId, message.channelId),
        eq(ticketsTable.subject, "Partnership Application"),
      ),
    )
    .limit(1);

  if (!ticket || ticket.userId !== message.author.id) return;
  if (message.attachments.size === 0) return;

  const imageAttachments = [...message.attachments.values()].filter(
    (attachment) => proofImageType(attachment) !== null,
  );
  if (imageAttachments.length === 0) {
    await message.reply("Please upload a PNG, JPEG, or WebP screenshot of the posted ad.");
    return;
  }
  if (imageAttachments.length > 1) {
    await message.reply("Please send one screenshot per message so I can check each image reliably.");
    return;
  }

  const attachment = imageAttachments[0];
  const savedData = ticket.partnershipApplicationData;
  if (savedData?.postingRoleGranted) {
    await message.reply("✅ Your screenshot was already verified and your partner posting role is active.");
    return;
  }

  const [config] = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, message.guildId))
    .limit(1);

  if (
    !config?.partnershipAd?.trim() ||
    !config.partnershipChannelId ||
    !config.partnershipRoleId
  ) {
    await message.reply(
      "⚠️ Partnership verification is not fully configured. Ask an administrator to run `/setup partnership`.",
    );
    return;
  }
  if (!savedData?.server?.trim()) {
    await message.reply(
      "⚠️ I couldn't find the applicant server name for this ticket. Ask staff to review the application or submit a new one.",
    );
    return;
  }

  const destination = await message.guild.channels
    .fetch(config.partnershipChannelId)
    .catch(() => null);
  if (
    !destination ||
    (destination.type !== ChannelType.GuildText &&
      destination.type !== ChannelType.GuildForum)
  ) {
    await message.reply(
      "⚠️ The configured posting destination is missing or is not a text channel/forum. Ask an administrator to update `/setup partnership`.",
    );
    return;
  }

  if (savedData?.proofStatus === "VERIFIED" && !savedData.postingRoleGranted) {
    const grant = await grantPartnershipPostingRole(
      message.guild!,
      ticket.userId,
      config.partnershipRoleId,
    );
    if (!grant.ok) {
      await message.reply(
        `✅ The screenshot was already verified, but I couldn't grant posting access: ${grant.error}`,
      );
      return;
    }
    await db
      .update(ticketsTable)
      .set({
        partnershipApplicationData: {
          ...(savedData ?? emptyApplicationData()),
          postingRoleGranted: true,
        },
      })
      .where(eq(ticketsTable.id, ticket.id));
    await message.reply(
      `✅ Your screenshot was already verified. I gave you <@&${grant.role.id}>; you can post your ad in <#${config.partnershipChannelId}>.`,
    );
    return;
  }

  if (savedData?.proofMessageId === message.id) return;
  const retryAfterMs = 30_000 - (Date.now() - (savedData?.proofCheckedAt ?? 0));
  if (retryAfterMs > 0) {
    await message.reply(
      `Please wait ${Math.ceil(retryAfterMs / 1000)} seconds before sending another proof image.`,
    );
    return;
  }

  const baseData = savedData ?? emptyApplicationData();
  const checkedAt = Date.now();
  await db
    .update(ticketsTable)
    .set({
      partnershipApplicationData: {
        ...baseData,
        proofStatus: "UNABLE TO VERIFY",
        proofMessageId: message.id,
        proofCheckedAt: checkedAt,
        proofExplanation: "Screenshot check is in progress.",
        postingRoleGranted: false,
      },
    })
    .where(eq(ticketsTable.id, ticket.id));

  let proofStatus: "VERIFIED" | "NOT VERIFIED" | "UNABLE TO VERIFY";
  let explanation: string;
  try {
    const imageDataUrl = await downloadProofImage(attachment);
    const result = await verifyPartnershipScreenshot(
      config.partnershipAd,
      savedData.server,
      imageDataUrl,
    );
    proofStatus = result.status;
    explanation = result.explanation;
  } catch (error) {
    proofStatus = "UNABLE TO VERIFY";
    explanation =
      error instanceof Error ? error.message : "The screenshot check failed.";
    logger.warn(
      {
        guildId: message.guildId,
        userId: message.author.id,
        error: explanation,
        ...getOpenRouterConfigStatus(),
      },
      "Partnership screenshot could not be verified",
    );
  }

  await db
    .update(ticketsTable)
    .set({
      partnershipApplicationData: {
        ...baseData,
        proofStatus,
        proofMessageId: message.id,
        proofCheckedAt: checkedAt,
        proofExplanation: explanation,
        postingRoleGranted: false,
      },
    })
    .where(eq(ticketsTable.id, ticket.id));

  let accessResult = "No role granted.";
  let applicantReply: string;
  if (proofStatus === "VERIFIED") {
    const grant = await grantPartnershipPostingRole(
      message.guild!,
      ticket.userId,
      config.partnershipRoleId,
    );
    if (grant.ok) {
      accessResult = `Assigned <@&${grant.role.id}>.`;
      applicantReply =
        `✅ AI verified the screenshot and assigned you <@&${grant.role.id}>. ` +
        `You can now post your own ad in <#${config.partnershipChannelId}>.`;
      await db
        .update(ticketsTable)
        .set({
          partnershipApplicationData: {
            ...baseData,
            proofStatus,
            proofMessageId: message.id,
            proofCheckedAt: checkedAt,
            proofExplanation: explanation,
            postingRoleGranted: true,
          },
        })
        .where(eq(ticketsTable.id, ticket.id));
    } else {
      accessResult = `Role assignment failed: ${grant.error}`;
      applicantReply =
        `✅ The screenshot was verified, but I couldn't grant posting access: ${grant.error} ` +
        "Please ask an administrator to check `/setup partnership`.";
    }
  } else if (proofStatus === "NOT VERIFIED") {
    applicantReply =
      `❌ The screenshot did not clearly show our required advertisement posted in your server. ` +
      `No role was given. Please post the ad and send a new, uncropped screenshot.`;
  } else {
    applicantReply =
      `⚠️ I couldn't verify that screenshot: ${explanation} No role was given. ` +
      `Please try again with a clearer screenshot.`;
  }

  const reviewSent = await sendReviewResult(
    message,
    config.partnershipReviewChannelId,
    proofStatus,
    explanation,
    attachment,
    accessResult,
  ).catch(() => false);
  if (!reviewSent) {
    applicantReply += "\n⚠️ I couldn't send this result to the configured review channel.";
  }

  await message.reply(applicantReply);
}
