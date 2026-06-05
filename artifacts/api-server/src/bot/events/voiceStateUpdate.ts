import { VoiceState, ChannelType, PermissionFlagsBits } from "discord.js";
import { db, guildConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

// Track temp channels: voiceChannelId -> ownerId
const tempChannels = new Map<string, string>();

export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;

  try {
    const [config] = await db
      .select()
      .from(guildConfigTable)
      .where(eq(guildConfigTable.guildId, guildId))
      .limit(1);

    if (!config?.joinToCreateChannelId) return;

    // User joined the "Join to Create" channel
    if (
      newState.channelId === config.joinToCreateChannelId &&
      newState.member
    ) {
      const guild = newState.guild;
      const member = newState.member;
      const category = config.joinToCreateCategoryId
        ? guild.channels.cache.get(config.joinToCreateCategoryId)
        : newState.channel?.parent;

      const tempChannel = await guild.channels.create({
        name: `${member.user.username}'s Channel`,
        type: ChannelType.GuildVoice,
        parent: category?.id,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
          },
        ],
      });

      await member.voice.setChannel(tempChannel);
      tempChannels.set(tempChannel.id, member.id);
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
