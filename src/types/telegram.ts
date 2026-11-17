export type ChatType = 'user' | 'group' | 'channel' | 'bot' | 'saved';

export interface TelegramUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
  avatarUrl?: string;
  isPremium?: boolean;
  status: 'online' | 'offline' | 'last_seen_recently';
  lastSeenTime?: string;
  bio?: string;
}

export interface ReactionCount {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

export interface MessageEntityItem {
  type: 'bold' | 'italic' | 'code' | 'pre' | 'spoiler' | 'blockquote' | 'textUrl' | 'url' | 'mention';
  offset: number;
  length: number;
  url?: string;
}

export interface PollOptionItem {
  text: string;
  optionHex: string;
  voters: number;
  chosen: boolean;
  correct?: boolean;
}

export interface PollData {
  id: string;
  question: string;
  options: PollOptionItem[];
  totalVoters: number;
  closed?: boolean;
  multipleChoice?: boolean;
  quiz?: boolean;
  solution?: string;
  publicVoters?: boolean;
}

export interface InlineButton {
  text: string;
  url?: string;
  callbackDataHex?: string;
  switchInline?: string;
}

export interface BotCommandItem {
  command: string;
  description: string;
}

export interface ForumTopicItem {
  id: number;
  title: string;
  iconColor?: number;
  topMessage?: number;
  unreadCount?: number;
  closed?: boolean;
  pinned?: boolean;
}

export interface JoinRequestItem {
  userId: string;
  name: string;
  username?: string;
  about?: string;
  date: number;
  avatarUrl?: string;
}

export interface ChatBannedRightsState {
  sendMessages: boolean;
  sendMedia: boolean;
  sendStickers: boolean;
  sendPolls: boolean;
  embedLinks: boolean;
  inviteUsers: boolean;
  pinMessages: boolean;
  changeInfo: boolean;
}

export interface DeviceSessionItem {
  hash: string;
  deviceModel: string;
  platform: string;
  systemVersion: string;
  appName: string;
  appVersion: string;
  dateActive: number;
  ip: string;
  country: string;
  current: boolean;
}

export interface BlockedUserItem {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
}

export type PrivacyRuleLevel = 'everybody' | 'contacts' | 'nobody';
export type PrivacyKeyName =
  | 'statusTimestamp'
  | 'profilePhoto'
  | 'phoneNumber'
  | 'phoneCall'
  | 'chatInvite';

export interface PrivacySettingItem {
  key: PrivacyKeyName;
  label: string;
  level: PrivacyRuleLevel;
}

export interface StickerSetSummary {
  id: string;
  shortName: string;
  title: string;
  count: number;
  stickers: StickerItem[];
}

export interface StickerItem {
  docId: string;
  emoji?: string;
  mimeType: string;
  url: string;
  thumbnailUrl: string;
  isAnimated?: boolean;
  isVideo?: boolean;
}

export interface GifItem {
  docId: string;
  url: string;
  thumbnailUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  botQueryId?: string;
  resultId?: string;
}

export interface MediaAttachment {
  isRoundVideo?: boolean;
  type: 'photo' | 'video' | 'voice' | 'file' | 'sticker' | 'gif';
  url: string;
  thumbnailUrl?: string;
  inlineThumb?: string;
  width?: number;
  height?: number;
  fileName?: string;
  fileSize?: string;
  duration?: number;
  waveform?: number[];
  isDisappearing?: boolean;
  expireSeconds?: number;
  expiresAt?: number;
  isExpired?: boolean;
  viewed?: boolean;
  mimeType?: string;
  isAnimated?: boolean;
}

export interface TelegramMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  entities?: MessageEntityItem[];
  timestamp: number;
  isOutgoing: boolean;
  isRead: boolean;
  isPending?: boolean;
  isEdited?: boolean;
  isPinned?: boolean;
  isDeletedBySender?: boolean;
  deletedAt?: number;
  editHistory?: { text: string; timestamp: number }[];
  isSavedFromTTL?: boolean;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
    mediaType?: string;
  };
  forwardFrom?: {
    name: string;
    channelTitle?: string;
  };
  media?: MediaAttachment;
  poll?: PollData;
  replyMarkup?: InlineButton[][];
  repliesCount?: number;
  canComment?: boolean;
  views?: number;
  forwards?: number;
  postAuthor?: string;
  groupedId?: string;
  topicId?: number;
  reactions?: ReactionCount[];
  voiceChangerPresetUsed?: string;
}

export interface UserProfileInfo {
  id: string;
  firstName: string;
  lastName?: string;
  title: string;
  username?: string;
  phone?: string;
  about?: string;
  avatarUrl?: string;
  status: string;
  isBot?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  isBlocked?: boolean;
  commonChatsCount?: number;
}

export interface TelegramChat {
  id: string;
  type: ChatType;
  title: string;
  username?: string;
  avatarUrl?: string;
  unreadCount: number;
  lastMessage?: {
    text: string;
    timestamp: number;
    senderName?: string;
    isOutgoing?: boolean;
    isRead?: boolean;
  };
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  folderIds?: string[];
  isProtected?: boolean;
  isVerified?: boolean;
  isCreator?: boolean;
  isAdmin?: boolean;
  canPostMessages?: boolean;
  canSendMedia?: boolean;
  sendRestrictionReason?: string;
  isForum?: boolean;
  slowModeSeconds?: number;
  defaultBannedRights?: ChatBannedRightsState;
  inviteLink?: string;
  isDeletedChat?: boolean;
  deletedAt?: number;
  isBlocked?: boolean;
  draftText?: string;
  hasScheduled?: boolean;
  botCommands?: BotCommandItem[];
  status?: string;
  memberCount?: number;
  description?: string;
  onlineCount?: number;
  pinnedMessageId?: string;
}

export interface ChatFolder {
  id: string;
  name: string;
  iconName: string;
  filter: 'all' | 'personal' | 'groups' | 'channels' | 'bots' | 'unread' | 'archived' | 'custom';
  customFilterIncludeTypes?: ChatType[];
  telegramFilterId?: number;
  isCloud?: boolean;
  includeChatIds?: string[];
  excludeChatIds?: string[];
  includeContacts?: boolean;
  includeNonContacts?: boolean;
  includeGroups?: boolean;
  includeBroadcasts?: boolean;
  includeBots?: boolean;
  excludeMuted?: boolean;
  excludeArchived?: boolean;
}

export interface AuthSession {
  isConnected: boolean;
  isTestMode: boolean;
  user: TelegramUser;
  phoneNumber?: string;
  dcId: number;
  sessionString?: string;
  lastSyncTimestamp: number;
}

export interface ChatMemberInfo {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  role: 'creator' | 'admin' | 'member';
  rank?: string;
}

export interface BannedMemberItem {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  kickedBy?: string;
}

export interface AdminLogEventItem {
  id: string;
  date: number;
  userId: string;
  userName: string;
  action: string;
  details?: string;
}

export interface AutoForwardRule {
  chatId: string;
  chatTitle: string;
  enabled: boolean;
  includePhotos: boolean;
  includeVideos: boolean;
  includeFiles: boolean;
  lastMsgId: number;
  forwardedCount: number;
  lastForwardedAt?: number;
}

export interface GlobalSearchResult {
  id: string;
  type: ChatType;
  title: string;
  username?: string;
  avatarUrl?: string;
  memberCount?: number;
  isVerified?: boolean;
}

export type MessageSearchFilter = 'all' | 'messages' | 'media' | 'files' | 'links' | 'music' | 'voice';
export interface MessageSearchCursor { offsetId: number; offsetPeer: string; offsetRate: number; }
export interface MessageSearchHit { chat: GlobalSearchResult; message: TelegramMessage; }
export interface MessageSearchPage { results: MessageSearchHit[]; count?: number; hasMore: boolean; nextCursor?: MessageSearchCursor; }

export interface VaultItem {
  key: string;
  chatId: string;
  chatTitle: string;
  messageId: number;
  mediaType: 'photo' | 'video' | 'voice' | 'file';
  fileName: string;
  mimeType: string;
  fileSize: number;
  isDisappearing: boolean;
  ttlSeconds?: number;
  savedAt: number;
}
