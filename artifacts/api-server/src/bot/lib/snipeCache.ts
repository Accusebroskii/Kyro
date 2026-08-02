export interface SnipedMessage {
  content: string;
  authorTag: string;
  authorAvatar: string | null;
  timestamp: Date;
}

// channelId -> most recently deleted message
export const snipeCache = new Map<string, SnipedMessage>();
