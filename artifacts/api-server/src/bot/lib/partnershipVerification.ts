import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Message,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { comparePartnershipAdvertisements } from "./ai.js";

const MAX_TEXT_CHANNELS = 60;
const MAX_SCANNED_MESSAGES = 4_000;
const MAX_CANDIDATES = 3;

export type PartnershipVerificationResult = {
  status: "VERIFIED" | "NOT FOUND" | "UNABLE TO VERIFY";
  explanation: string;
  evidence?: {
    channelId: string;
    channelName: string;
    messageUrl: string;
  };
};

type ScannableChannel = TextChannel | ThreadChannel;

function messageText(message: Message): string {
  return [
    message.content,
    ...message.embeds.flatMap((embed) => [
      embed.title ?? "",
      embed.description ?? "",
      ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ]),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
}

const COMMON_WORDS = new Set([
  "about", "after", "also", "been", "being", "come", "from", "have",
  "here", "into", "just", "more", "only", "other", "over", "than",
  "that", "their", "there", "these", "they", "this", "those", "through",
  "with", "would", "your", "server", "discord",
]);

function meaningfulWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-z0-9]{3,}/g)
      ?.filter((word) => !COMMON_WORDS.has(word)) ?? [],
  );
}

function relevanceScore(required: string, candidate: string): number {
  const requiredWords = meaningfulWords(required);
  if (requiredWords.size === 0) return 0;
  const candidateWords = meaningfulWords(candidate);
  let shared = 0;
  for (const word of requiredWords) {
    if (candidateWords.has(word)) shared++;
  }
  return shared / requiredWords.size;
}

function asEvidence(channel: ScannableChannel, message: Message) {
  return {
    channelId: channel.id,
    channelName: channel.name,
    messageUrl: message.url,
  };
}

export async function verifyPartnershipAdvertisement(
  client: Client,
  partnerGuildId: string,
  requiredAdvertisement: string,
): Promise<PartnershipVerificationResult> {
  let guild;
  try {
    guild =
      client.guilds.cache.get(partnerGuildId) ??
      (await client.guilds.fetch(partnerGuildId));
  } catch {
    return {
      status: "UNABLE TO VERIFY",
      explanation:
        "The bot could not access that server. Confirm the bot is a member and try again.",
    };
  }

  const botMember =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botMember) {
    return {
      status: "UNABLE TO VERIFY",
      explanation: "The bot could not resolve its member permissions in that server.",
    };
  }

  let fetchedChannels;
  try {
    fetchedChannels = await guild.channels.fetch();
  } catch {
    return {
      status: "UNABLE TO VERIFY",
      explanation: "The bot could not retrieve the partner server's channels.",
    };
  }

  const channels: ScannableChannel[] = [];
  let scanIncomplete = false;
  for (const channel of fetchedChannels.values()) {
    if (!channel) continue;

    if (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement
    ) {
      channels.push(channel as TextChannel);
      const activeThreads = await (channel as TextChannel).threads
        .fetchActive()
        .catch(() => null);
      if (!activeThreads) {
        scanIncomplete = true;
        continue;
      }
      channels.push(...activeThreads.threads.values());
    } else if (channel.type === ChannelType.GuildForum) {
      const activeThreads = await channel.threads
        .fetchActive()
        .catch(() => null);
      if (!activeThreads) {
        scanIncomplete = true;
        continue;
      }
      channels.push(...activeThreads.threads.values());
    }
  }

  if (channels.length > MAX_TEXT_CHANNELS) scanIncomplete = true;
  const channelsToScan = channels.slice(0, MAX_TEXT_CHANNELS);
  const candidates: Array<{
    channel: ScannableChannel;
    message: Message;
    text: string;
    score: number;
  }> = [];
  let scannedMessages = 0;
  let messagesWithReadableText = 0;

  for (const channel of channelsToScan) {
    const permissions = channel.permissionsFor(botMember);
    if (
      !permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ])
    ) {
      scanIncomplete = true;
      continue;
    }

    let before: string | undefined;
    try {
      while (scannedMessages < MAX_SCANNED_MESSAGES) {
        const requestedLimit = Math.min(
          100,
          MAX_SCANNED_MESSAGES - scannedMessages,
        );
        const batch = await channel.messages.fetch({
          limit: requestedLimit,
          ...(before ? { before } : {}),
        });

        if (batch.size === 0) break;
        scannedMessages += batch.size;

        for (const message of batch.values()) {
          const text = messageText(message);
          if (text) messagesWithReadableText++;
          const score = relevanceScore(requiredAdvertisement, text);
          if (score >= 0.2) {
            candidates.push({ channel, message, text, score });
          }
        }

        if (scannedMessages >= MAX_SCANNED_MESSAGES) {
          if (batch.size === requestedLimit) scanIncomplete = true;
          break;
        }

        before = batch.last()?.id;
        if (batch.size < requestedLimit || !before) break;
      }
    } catch {
      scanIncomplete = true;
      continue;
    }
    if (scanIncomplete && scannedMessages >= MAX_SCANNED_MESSAGES) break;
  }

  if (scannedMessages > 0 && messagesWithReadableText === 0) {
    return {
      status: "UNABLE TO VERIFY",
      explanation:
        "The bot could retrieve messages but could not read their text. Check the Message Content intent and channel permissions.",
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > MAX_CANDIDATES) scanIncomplete = true;
  const selectedCandidates = candidates.slice(0, MAX_CANDIDATES);
  let aiFailed = false;
  let bestMismatch:
    | (typeof selectedCandidates)[number]
    | undefined;
  let mismatchExplanation = "";

  for (const candidate of selectedCandidates) {
    try {
      const comparison = await comparePartnershipAdvertisements(
        requiredAdvertisement,
        candidate.text,
      );
      if (comparison.matches) {
        return {
          status: "VERIFIED",
          explanation:
            `The required advertisement was found in a readable message. ${comparison.explanation}` +
            (scanIncomplete
              ? " Some channels or older messages could not be checked."
              : ""),
          evidence: asEvidence(candidate.channel, candidate.message),
        };
      }

      if (!bestMismatch) {
        bestMismatch = candidate;
        mismatchExplanation = comparison.explanation;
      }
    } catch {
      aiFailed = true;
    }
  }

  if (aiFailed) {
    return {
      status: "UNABLE TO VERIFY",
      explanation:
        "The AI comparison failed or was unavailable. No conclusion was made; please try again later.",
      ...(bestMismatch
        ? { evidence: asEvidence(bestMismatch.channel, bestMismatch.message) }
        : {}),
    };
  }

  if (scanIncomplete) {
    return {
      status: "UNABLE TO VERIFY",
      explanation:
        "The bot could not read every relevant channel or message history, so it cannot confirm whether the advertisement is present.",
      ...(bestMismatch
        ? { evidence: asEvidence(bestMismatch.channel, bestMismatch.message) }
        : {}),
    };
  }

  return {
    status: "NOT FOUND",
    explanation: bestMismatch
      ? `No checked message contained the required advertisement's full material content. The closest text was materially different: ${mismatchExplanation}`
      : "No matching advertisement was found in the readable text channels and active threads.",
    ...(bestMismatch
      ? { evidence: asEvidence(bestMismatch.channel, bestMismatch.message) }
      : {}),
  };
}
