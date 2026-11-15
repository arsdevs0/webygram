export interface MessageEditRevision {
  text: string;
  timestamp: number;
}

export interface AyuGramSettings {
  // Ghost Essentials
  ghostModeActive: boolean;
  sendOnlineStatus: boolean;
  sendReadReceipts: boolean;
  sendTypingIndicators: boolean;
  invisibleStories: boolean;
  markReadOnReply: boolean;
  sendOfflineAfterAction: boolean;
  sendWithoutSound: boolean;

  // Message History & Anti-Delete
  antiDeleteEnabled: boolean;
  saveDeletedMedia: boolean;
  antiEditEnabled: boolean;
  showDeletedBadge: boolean;
  showEditedBadge: boolean;
  deletedMarkText: string;

  // Disappearing Media, TTL Vault & Bypass
  saveDisappearingMedia: boolean;
  preventTTLExpiration: boolean;
  autoSaveExpiringToSavedMessages: boolean;
  markSeenOnTimerClick: boolean;
  bypassContentRestrictions: boolean;
  allowScreenshotsSecretChat: boolean;
  hideForwardTag: boolean;

  // Chats & Appearance UX
  infinitePinnedChats: boolean;
  speedAccelerator: boolean;
  localTranslateEnabled: boolean;
  showMessageSeconds: boolean;
  hideStoriesStrip: boolean;
  confirmBeforeCall: boolean;
  hideSponsoredMessages: boolean;

  // Streamer Privacy
  streamerMode: boolean;

  // Keyword Filter
  regexFilterEnabled: boolean;
  blockedKeywords: string[];
}

export interface AyuGramDeletedMessageLog {
  id: string;
  chatId: string;
  originalMessageId: string;
  senderName: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video' | 'voice' | 'file' | 'sticker' | 'gif';
  deletedAt: number;
}
