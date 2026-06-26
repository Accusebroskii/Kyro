import { VoiceState, ChannelType, PermissionFlagsBits, TextChannel, EmbedBuilder } from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

// Track temp channels: voiceChannelId -> ownerId
const tempChannels = new Map<string, string>();

async function sendVoiceLog(
  newState: VoiceState,
  embed: EmbedBuilder,
  logChannelId: string | null | undefined,
): Promise<void> {
  if (!logChannelId) return;
  const logChannel = newState.guild.channels.cache.get(
    logChannelId,
  ) as TextChannel | undefined;
  if (!logChannel) return;
  logChannel.send({ embeds: [embed] }).catch((err) =>
    logger.warn({ err }, "Failed to send voice log"),
  );
}

export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;
  const member = newState.member ?? oldState.member;

  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);

    // --- Voice logging (join / leave / move) ---
    // Runs independently of the join-to-create config below, so voice
    // logs work even on servers that don't use join-to-create channels.
    if (config?.logChannelId && member) {
      if (!oldState.channelId && newState.channelId) {
        // Joined a voice channel
        const embed = new EmbedBuilder()
          .setTitle("🔊 Voice Channel Joined")
          .setColor(0x57f287)
          .setDescription(`<@${member.id}> joined <#${newState.channelId}>`)
          .setFooter({ text: `User ID: ${member.id}` })
          .setTimestamp();
        await sendVoiceLog(newState, embed, config.logChannelId);
      } else if (oldState.channelId && !newState.channelId) {
        // Left a voice channel
        const embed = new EmbedBuilder()
          .setTitle("🔇 Voice Channel Left")
          .setColor(0xed4245)
          .setDescription(`<@${member.id}> left <#${oldState.channelId}>`)
          .setFooter({ text: `User ID: ${member.id}` })
          .setTimestamp();
        await sendVoiceLog(newState, embed, config.logChannelId);
      } else if (
        oldState.channelId &&
        newState.channelId &&
        oldState.channelId !== newState.channelId
      ) {
        // Moved between voice channels
        const embed = new EmbedBuilder()
          .setTitle("🔀 Voice Channel Switched")
          .setColor(0x5865f2)
          .setDescription(
            `<@${member.id}> moved from <#${oldState.channelId}> to <#${newState.channelId}>`,
          )
          .setFooter({ text: `User ID: ${member.id}` })
          .setTimestamp();
        await sendVoiceLog(newState, embed, config.logChannelId);
      }
    }

    // --- Join-to-create temp channels (existing logic, unchanged) ---
    if (!config?.joinToCreateChannelId) return;

    // User joined the "Join to Create" channel
    if (
      newState.channelId === config.joinToCreateChannelId &&
      newState.member
    ) {
      const guild = newState.guild;
      const voiceMember = newState.member;
      const category = config.joinToCreateCategoryId
        ? guild.channels.cache.get(config.joinToCreateCategoryId)
        : newState.channel?.parent;

      const tempChannel = await guild.channels.create({
        name: `${voiceMember.user.username}'s Channel`,
        type: ChannelType.GuildVoice,
        parent: category?.id,
        permissionOverwrites: [
          {
            id: voiceMember.id,
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
          },
        ],
      });

      await voiceMember.voice.setChannel(tempChannel);
      tempChannels.set(tempChannel.id, voiceMember.id);
    }

    // User left a temp channel — delete if empty
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
      const channel = oldState.channel;
      if (channel && channel.members.size === 0) {
        await channel.delete().catch(() => {});
        tempChannels.delete(oldState.channelId);
      }
    }
  } catch (err) {
    logger.error({ err }, "Error in voiceStateUpdate");
  }
}