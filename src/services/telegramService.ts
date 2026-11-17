import { showMessageNotification } from './notificationSettingsStore';
import { mergeMessagePage } from '../utils/messageMerge';
import { appFetch as fetch, createAppSocket } from './appTransport';
import {
  AuthSession,
  TelegramChat,
  TelegramMessage,
  ChatFolder,
  TelegramUser,
  VaultItem,
  ChatMemberInfo,
  GlobalSearchResult,
  MessageSearchPage,
  MessageSearchFilter,
  MessageSearchCursor,
  MessageSearchHit,
  ForumTopicItem,
  JoinRequestItem,
  ChatBannedRightsState,
  DeviceSessionItem,
  BlockedUserItem,
  PrivacyKeyName,
  PrivacyRuleLevel,
  PrivacySettingItem,
  StickerSetSummary,
  GifItem,
  BotCommandItem,
  AutoForwardRule,
  BannedMemberItem,
  AdminLogEventItem,
  UserProfileInfo,
} from '../types/telegram';
import { soundEffects } from './soundEffects';
import { ayuGramEngine } from './ayuGramModEngine';
import { AyuGramDeletedMessageLog } from '../types/ayugram';

const STORAGE_KEY_FOLDERS = 'tgplus_folders_v3';
const STORAGE_KEY_CHAT_PREFS = 'tgplus_chat_prefs_v3';
const STORAGE_KEY_SAVED_AUTH = 'tgplus_saved_auth_v1';
const STORAGE_KEY_LOCAL_READ = 'tgplus_local_read_max_id_v1';

export const DEFAULT_FOLDERS: ChatFolder[] = [
  { id: 'f_all', name: 'All', iconName: 'MessageSquare', filter: 'all' },
  { id: 'f_chats', name: 'Chats', iconName: 'User', filter: 'personal' },
  { id: 'f_groups', name: 'Groups', iconName: 'Users', filter: 'groups' },
  { id: 'f_channels', name: 'Channels', iconName: 'Radio', filter: 'channels' },
];

export interface QrAuthChallenge {
  qrUrl: string;
  qrDataUrl: string;
  expires: number;
}

export interface QrStatusResponse {
  status: 'idle' | 'waiting_scan' | 'needs_2fa' | 'authorized' | 'error';
  qrUrl?: string;
  qrDataUrl?: string;
  expires?: number;
  hint?: string;
  error?: string;
  isConnected?: boolean;
  user?: TelegramUser;
  sessionString?: string;
  apiId?: number;
  apiHash?: string;
}

export interface TargetGroupInfo {
  id: string;
  title: string;
  username?: string;
  link: string;
  type: 'group' | 'channel' | 'saved' | 'user';
  memberCount?: number;
  setAt: number;
}

export interface BulkForwardProgress {
  jobId: string;
  current: number;
  total: number;
  forwarded: number;
  failed: number;
  skippedDuplicates?: number;
  phase?: 'scanning' | 'sending';
  statusText?: string;
  targetTitle: string;
  done: boolean;
}

export interface ChatDetailsInfo {
  id: string;
  title: string;
  username?: string;
  about?: string;
  inviteLink?: string;
  memberCount: number;
  isProtected: boolean;
  isCreator: boolean;
  isAdmin: boolean;
  canEditSettings?: boolean;
  canPostMessages?: boolean;
  canSendMedia?: boolean;
  sendRestrictionReason?: string;
  isForum?: boolean;
  historyHidden?: boolean;
  signatures?: boolean;
  linkedChatId?: string;
  ttlPeriod?: number;
  reactionsMode?: 'all' | 'some' | 'none';
  availableReactions?: string[];
  adminsCount?: number;
  kickedCount?: number;
  slowModeSeconds?: number;
  defaultBannedRights?: ChatBannedRightsState;
  isBlocked?: boolean;
  botCommands?: BotCommandItem[];
  members: ChatMemberInfo[];
}

export class TelegramService {
  private static instance: TelegramService | null = null;

  private authSession: AuthSession = {
    isConnected: false,
    isTestMode: false,
    user: { id: '', firstName: 'Guest', status: 'offline' },
    dcId: 2,
    lastSyncTimestamp: Date.now(),
  };

  private chats: TelegramChat[] = [];
  private messages: Record<string, TelegramMessage[]> = {};
  private folders: ChatFolder[] = [];
  private vaultItems: VaultItem[] = [];
  private targetGroup: TargetGroupInfo | null = null;
  private autoForwardRules: Record<string, AutoForwardRule> = {};
  private bulkForwardProgress: BulkForwardProgress | null = null;
  private typingByChat: Record<string, string | null> = {};
  private localPinnedSet: Set<string> = new Set();
  private localMutedSet: Set<string> = new Set();
  private isLoadingDialogs = false;
  private isLoadingMessagesByChat: Record<string, boolean> = {};
  private isLoadingOlderByChat: Record<string, boolean> = {};
  private hasMoreMessagesByChat: Record<string, boolean> = {};
  private sharedMediaErrors: Record<string, string> = {};
  private sharedMediaByChat: Record<
    string,
    { media?: TelegramMessage[]; files?: TelegramMessage[]; voice?: TelegramMessage[]; links?: TelegramMessage[]; music?: TelegramMessage[] }
  > = {};
  private isLoadingSharedMediaByChat: Record<string, boolean> = {};
  private hasMoreSharedMediaByChat: Record<string, boolean> = {};
  private nextOffsetSharedMediaByChat: Record<string, number> = {};
  private isInitialized = false;
  private activeChatId: string | null = null;
  private messageRequests = new Map<string, Promise<TelegramMessage[]>>();
  private messageGeneration = new Map<string, number>();
  private messageContext = new Map<string, number>();
  public getActiveChatId() { return this.activeChatId; }
  private hasConnectedWsOnce = false;
  private localReadMaxIdByChat: Record<string, number> = {};
  private localReadTimestampByChat: Record<string, number> = {};

  private ws: WebSocket | null = null;
  private wsReconnectTimer: number | null = null;
  private wsHeartbeatTimer: number | null = null;
  private restoreSessionPromise: Promise<boolean> | null = null;
  private listeners: Set<() => void> = new Set();
  private qrListeners: Set<
    (event: { type: string; qrDataUrl?: string; qrUrl?: string; hint?: string; error?: string }) => void
  > = new Set();
  private callListeners: Set<(event: Record<string, unknown>) => void> = new Set();

  private constructor() {
    this.folders = this.loadFolders();
    this.loadLocalPrefs();
    this.connectWebSocket();
    void this.bootstrap();
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeQrEvents(
    listener: (event: { type: string; qrDataUrl?: string; qrUrl?: string; hint?: string; error?: string }) => void
  ): () => void {
    this.qrListeners.add(listener);
    return () => {
      this.qrListeners.delete(listener);
    };
  }

  public subscribeCallSignals(listener: (event: Record<string, unknown>) => void): () => void {
    this.callListeners.add(listener);
    return () => {
      this.callListeners.delete(listener);
    };
  }

  public sendCallSignal(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'CALL_SIGNAL', ...payload }));
      } catch {
        // ignore
      }
    }
  }

  private notifyScheduled = false;

  private notify() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      this.listeners.forEach((l) => l());
    });
  }

  private loadFolders(): ChatFolder[] {
    const saved = localStorage.getItem(STORAGE_KEY_FOLDERS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return DEFAULT_FOLDERS;
  }

  private loadLocalPrefs() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHAT_PREFS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.pinned)) this.localPinnedSet = new Set(parsed.pinned);
        if (Array.isArray(parsed.muted)) this.localMutedSet = new Set(parsed.muted);
      }
      const savedRead = localStorage.getItem(STORAGE_KEY_LOCAL_READ);
      if (savedRead) {
        const parsedRead = JSON.parse(savedRead);
        if (parsedRead && typeof parsedRead === 'object') {
          if (parsedRead.maxIds && typeof parsedRead.maxIds === 'object') {
            this.localReadMaxIdByChat = parsedRead.maxIds;
          }
          if (parsedRead.timestamps && typeof parsedRead.timestamps === 'object') {
            this.localReadTimestampByChat = parsedRead.timestamps;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private saveLocalReadState() {
    try {
      localStorage.setItem(
        STORAGE_KEY_LOCAL_READ,
        JSON.stringify({
          maxIds: this.localReadMaxIdByChat,
          timestamps: this.localReadTimestampByChat,
        })
      );
    } catch {
      // ignore
    }
  }

  private recordChatSeenLocally(chatId: string) {
    if (!chatId) return;
    const msgs = this.messages[chatId] || [];
    let maxNumericId = this.localReadMaxIdByChat[chatId] || 0;
    for (const m of msgs) {
      const n = Number(m.id);
      if (Number.isFinite(n) && n > maxNumericId) {
        maxNumericId = n;
      }
    }
    if (maxNumericId > 0) {
      this.localReadMaxIdByChat[chatId] = maxNumericId;
    }
    const chat = this.chats.find((c) => c.id === chatId);
    const latestTs = Math.max(
      Date.now(),
      chat?.lastMessage?.timestamp || 0,
      msgs.length > 0 ? msgs[msgs.length - 1].timestamp : 0
    );
    this.localReadTimestampByChat[chatId] = latestTs;
    this.saveLocalReadState();
  }

  private computeEffectiveUnreadCount(chat: TelegramChat): number {
    if (this.activeChatId === chat.id) return 0;
    const serverUnread = Math.max(0, Number(chat.unreadCount || 0));
    if (serverUnread === 0) return 0;

    const msgs = this.messages[chat.id];
    const seenMaxId = this.localReadMaxIdByChat[chat.id] || 0;
    const seenTs = this.localReadTimestampByChat[chat.id] || 0;

    if (msgs && msgs.length > 0 && seenMaxId > 0) {
      const unseenIncoming = msgs.filter((m) => {
        if (m.isOutgoing) return false;
        const n = Number(m.id);
        return Number.isFinite(n) && n > seenMaxId;
      }).length;
      return Math.min(serverUnread, unseenIncoming);
    }

    if (seenTs > 0 && chat.lastMessage && chat.lastMessage.timestamp <= seenTs) {
      return 0;
    }

    return serverUnread;
  }

  private saveLocalPrefs() {
    try {
      localStorage.setItem(
        STORAGE_KEY_CHAT_PREFS,
        JSON.stringify({
          pinned: Array.from(this.localPinnedSet),
          muted: Array.from(this.localMutedSet),
        })
      );
    } catch {
      // ignore
    }
  }

  private savePersistedAuth(sessionString?: string, apiId?: number, apiHash?: string) {
    if (!sessionString) return;
    try {
      if (localStorage.getItem('tgplus_browser_managed_v1') === '1') {
        localStorage.removeItem(STORAGE_KEY_SAVED_AUTH);
        return;
      }
      localStorage.setItem(
        STORAGE_KEY_SAVED_AUTH,
        JSON.stringify({
          sessionString,
          apiId,
          apiHash,
          savedAt: Date.now(),
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }

  private loadPersistedAuth(): { sessionString: string; apiId?: number; apiHash?: string } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SAVED_AUTH);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.sessionString && typeof parsed.sessionString === 'string') {
        return {
          sessionString: parsed.sessionString,
          apiId: parsed.apiId ? Number(parsed.apiId) : undefined,
          apiHash: parsed.apiHash ? String(parsed.apiHash) : undefined,
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  private clearPersistedAuth() {
    try {
      localStorage.removeItem(STORAGE_KEY_SAVED_AUTH);
    } catch {
      // ignore
    }
  }

  private connectWebSocket() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = createAppSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.wsHeartbeatTimer) clearInterval(this.wsHeartbeatTimer);
        this.wsHeartbeatTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'PING' }));
            } catch {
              // ignore
            }
          }
        }, 25_000);

        if (this.hasConnectedWsOnce) {
          if (!this.authSession.isConnected && this.loadPersistedAuth()) {
            void this.ensureSessionActive(true).then((ok) => {
              if (ok) {
                void this.loadDialogs();
                if (this.activeChatId) void this.loadMessages(this.activeChatId);
              }
            });
          } else if (this.authSession.isConnected) {
            void this.loadDialogs();
            if (this.activeChatId) {
              void this.loadMessages(this.activeChatId);
            }
          }
        }
        this.hasConnectedWsOnce = true;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'PONG') return;
          this.handleWsEvent(data);
        } catch {
          // ignore invalid frame
        }
      };

      socket.onclose = () => {
        this.ws = null;
        if (this.wsHeartbeatTimer) {
          clearInterval(this.wsHeartbeatTimer);
          this.wsHeartbeatTimer = null;
        }
        if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
        this.wsReconnectTimer = window.setTimeout(() => this.connectWebSocket(), 1800);
      };

      socket.onerror = () => {
        // onclose handles reconnect
      };
    } catch {
      // ignore
    }
  }

  private handleWsEvent(data: Record<string, unknown>) {
    const type = String(data.type || '');

    if (type === 'CALL_SIGNAL' || type === 'PHONE_CALL_UPDATE' || type === 'PHONE_CALL_SIGNAL') {
      this.callListeners.forEach((l) => l(data));
      return;
    }

    if (type === 'QR_REFRESH' || type === 'QR_NEEDS_2FA' || type === 'QR_ERROR') {
      this.qrListeners.forEach((l) =>
        l({
          type,
          qrDataUrl: data.qrDataUrl ? String(data.qrDataUrl) : undefined,
          qrUrl: data.qrUrl ? String(data.qrUrl) : undefined,
          hint: data.hint ? String(data.hint) : undefined,
          error: data.error ? String(data.error) : undefined,
        })
      );
      return;
    }

    if (type === 'BULK_FORWARD_PROGRESS') {
      this.bulkForwardProgress = {
        jobId: String(data.jobId || ''),
        current: Number(data.current || 0),
        total: Number(data.total || 0),
        forwarded: Number(data.forwarded || 0),
        failed: Number(data.failed || 0),
        skippedDuplicates:
          data.skippedDuplicates !== undefined ? Number(data.skippedDuplicates) : undefined,
        phase: data.phase === 'scanning' || data.phase === 'sending' ? data.phase : undefined,
        statusText: data.statusText ? String(data.statusText) : undefined,
        targetTitle: String(data.targetTitle || 'Target Group'),
        done: Boolean(data.done),
      };
      this.notify();
      return;
    }

    if (type === 'AUTO_FORWARD_UPDATED') {
      const rule = data.rule as AutoForwardRule | undefined;
      if (rule && rule.chatId) {
        this.autoForwardRules = {
          ...this.autoForwardRules,
          [rule.chatId]: rule,
        };
        this.notify();
      }
      return;
    }

    if (type === 'AUTH_UPDATED') {
      const isConnected = Boolean(data.isConnected);
      const user = data.user as TelegramUser;
      const incomingSession = data.sessionString ? String(data.sessionString) : undefined;
      const incomingApiId = data.apiId ? Number(data.apiId) : undefined;
      const incomingApiHash = data.apiHash ? String(data.apiHash) : undefined;
      const explicitLogout = Boolean(data.explicitLogout || data.invalidSession);

      if (isConnected) {
        if (incomingSession) {
          this.savePersistedAuth(incomingSession, incomingApiId, incomingApiHash);
        }
        this.authSession = {
          ...this.authSession,
          isConnected: true,
          user: user || this.authSession.user,
          sessionString: incomingSession || this.authSession.sessionString,
          lastSyncTimestamp: Date.now(),
        };
        this.qrListeners.forEach((l) => l({ type: 'AUTH_UPDATED' }));
        void this.loadDialogs();
        void this.loadVault();
        void this.loadCloudFolders();
        void this.loadAutoForwardRules();
        this.notify();
        return;
      }

      // Only drop authenticated session state if user explicitly logged out or Telegram revoked the key
      if (explicitLogout || !this.loadPersistedAuth()) {
        if (explicitLogout) {
          this.clearPersistedAuth();
        }
        this.authSession = {
          ...this.authSession,
          isConnected: false,
          user: user || { id: '', firstName: 'Guest', status: 'offline' },
          lastSyncTimestamp: Date.now(),
        };
        this.chats = [];
        this.messages = {};
        this.hasMoreMessagesByChat = {};
        this.sharedMediaByChat = {};
        this.qrListeners.forEach((l) => l({ type: 'AUTH_UPDATED' }));
        this.notify();
      }
      return;
    }

    if (type === 'NEW_MESSAGE') {
      const chatId = String(data.chatId || '');
      const msg = data.message as TelegramMessage;
      if (!chatId || !msg) return;

      const prevMsgs = this.messages[chatId] || [];
      if (!prevMsgs.some((m) => m.id === msg.id)) {
        // Deduplicate optimistic pending outgoing message if WS beats HTTP response
        const pendingIdx = msg.isOutgoing
          ? prevMsgs.findIndex(
              (m) => m.isPending && m.isOutgoing && m.text === msg.text && Math.abs(m.timestamp - msg.timestamp) < 15_000
            )
          : -1;
        if (pendingIdx !== -1) {
          const copy = [...prevMsgs];
          copy[pendingIdx] = msg;
          this.messages[chatId] = copy;
        } else {
          this.messages[chatId] = [...prevMsgs, msg];
        }
      }

      const summaryText =
        msg.text ||
        (msg.media
          ? `[${msg.media.type === 'video' ? 'Video' : msg.media.type === 'photo' ? 'Photo' : msg.media.type === 'voice' ? 'Voice' : 'File'}]`
          : 'Message');

      const chatIdx = this.chats.findIndex((c) => c.id === chatId);
      if (chatIdx !== -1) {
        const existing = this.chats[chatIdx];
        const isViewingNow = this.activeChatId === chatId;
        const nextUnread =
          !msg.isOutgoing && !isViewingNow
            ? (existing.unreadCount || 0) + 1
            : isViewingNow
            ? 0
            : existing.unreadCount;

        const updatedChat: TelegramChat = {
          ...existing,
          unreadCount: nextUnread,
          lastMessage: {
            text: summaryText,
            timestamp: msg.timestamp,
            senderName: msg.senderName,
            isOutgoing: msg.isOutgoing,
            isRead: msg.isOutgoing ? msg.isRead : isViewingNow,
          },
        };
        const nextChats = [...this.chats];
        nextChats[chatIdx] = updatedChat;
        this.chats = nextChats;

        if (!msg.isOutgoing) {
          if (!updatedChat.isMuted) { soundEffects.playReceive(); showMessageNotification(chatId, updatedChat.title, msg.text || summaryText); }
          if (isViewingNow) {
            void this.markChatAsRead(chatId);
          }
        }
      } else {
        void this.loadDialogs();
      }
      this.notify();
      return;
    }

    if (type === 'EDIT_MESSAGE') {
      const chatId = String(data.chatId || '');
      const msg = data.message as TelegramMessage;
      if (!chatId || !msg) return;

      if (this.messages[chatId]) {
        const idx = this.messages[chatId].findIndex((m) => m.id === msg.id);
        if (idx !== -1) {
          const copy = [...this.messages[chatId]];
          copy[idx] = msg;
          this.messages[chatId] = copy;
        }
      }
      const chatIdx = this.chats.findIndex((c) => c.id === chatId);
      if (chatIdx !== -1 && this.chats[chatIdx].lastMessage && msg.text) {
        const nextChats = [...this.chats];
        nextChats[chatIdx] = {
          ...nextChats[chatIdx],
          lastMessage: { ...nextChats[chatIdx].lastMessage!, text: msg.text },
        };
        this.chats = nextChats;
      }
      this.notify();
      return;
    }

    if (type === 'DELETE_MESSAGE') {
      const chatId = String(data.chatId || '');
      const messageId = String(data.messageId || '');
      const deletedAt = Number(data.deletedAt || Date.now());
      const deletedLog = data.deletedLog as AyuGramDeletedMessageLog | undefined;

      if (this.messages[chatId]) {
        const idx = this.messages[chatId].findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          if (ayuGramEngine.getSettings().antiDeleteEnabled) {
            const copy = [...this.messages[chatId]];
            copy[idx] = { ...copy[idx], isDeletedBySender: true, deletedAt };
            this.messages[chatId] = copy;
            ayuGramEngine.logDeletedMessage(copy[idx]);
          } else {
            this.messages[chatId] = this.messages[chatId].filter((m) => m.id !== messageId);
          }
        }
      }
      if (deletedLog) {
        const existing = ayuGramEngine.getDeletedLogs();
        if (!existing.some((l) => l.originalMessageId === deletedLog.originalMessageId)) {
          ayuGramEngine.setDeletedLogsFromServer([deletedLog, ...existing]);
        }
      }
      this.notify();
      return;
    }

    if (type === 'READ_OUTBOX') {
      const chatId = String(data.chatId || '');
      const maxId = Number(data.maxId || 0);
      if (chatId && maxId > 0) {
        if (this.messages[chatId]) {
          this.messages[chatId] = this.messages[chatId].map((m) =>
            m.isOutgoing && Number(m.id) <= maxId ? { ...m, isRead: true } : m
          );
        }
        const chatIdx = this.chats.findIndex((c) => c.id === chatId);
        if (chatIdx !== -1 && this.chats[chatIdx].lastMessage?.isOutgoing) {
          const nextChats = [...this.chats];
          nextChats[chatIdx] = {
            ...nextChats[chatIdx],
            lastMessage: { ...nextChats[chatIdx].lastMessage!, isRead: true },
          };
          this.chats = nextChats;
        }
        this.notify();
      }
      return;
    }

    if (type === 'READ_INBOX') {
      const chatId = String(data.chatId || '');
      const unread = Math.max(0, Number(data.stillUnreadCount ?? 0));
      const chatIdx = this.chats.findIndex((c) => c.id === chatId);
      if (chatIdx !== -1 && this.chats[chatIdx].unreadCount !== unread) {
        const nextChats = [...this.chats];
        nextChats[chatIdx] = { ...nextChats[chatIdx], unreadCount: unread };
        this.chats = nextChats;
        this.notify();
      }
      return;
    }

    if (type === 'USER_STATUS') {
      const userId = String(data.userId || '');
      const status = data.status === 'online' ? 'online' : 'offline';
      const chatIdx = this.chats.findIndex((c) => c.id === userId);
      if (chatIdx !== -1 && this.chats[chatIdx].status !== status) {
        const nextChats = [...this.chats];
        nextChats[chatIdx] = { ...nextChats[chatIdx], status };
        this.chats = nextChats;
        this.notify();
      }
      return;
    }

    if (type === 'REACTIONS_UPDATED') {
      const chatId = String(data.chatId || '');
      const messageId = String(data.messageId || '');
      const reactions = Array.isArray(data.reactions) ? data.reactions : [];
      if (this.messages[chatId]) {
        const idx = this.messages[chatId].findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          const copy = [...this.messages[chatId]];
          copy[idx] = { ...copy[idx], reactions };
          this.messages[chatId] = copy;
          this.notify();
        }
      }
      return;
    }

    if (type === 'TYPING') {
      const chatId = String(data.chatId || '');
      const text = String(data.text || 'typing...');
      this.typingByChat[chatId] = text;
      this.notify();
      setTimeout(() => {
        if (this.typingByChat[chatId] === text) {
          this.typingByChat[chatId] = null;
          this.notify();
        }
      }, 4000);
      return;
    }

    if (type === 'CHAT_UPDATED') {
      const chatId = String(data.chatId || '');
      if (!chatId) return;
      const idx = this.chats.findIndex((c) => c.id === chatId);
      if (idx !== -1) {
        const next = [...this.chats];
        next[idx] = {
          ...next[idx],
          ...(typeof data.isArchived === 'boolean' ? { isArchived: data.isArchived } : {}),
          ...(typeof data.isPinned === 'boolean' ? { isPinned: data.isPinned } : {}),
          ...(typeof data.isMuted === 'boolean' ? { isMuted: data.isMuted } : {}),
        };
        this.chats = next;
        this.notify();
      }
    }
  }

  private async parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
    try {
      const text = await res.text();
      if (!text) return {};
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (res.status === 413) {
        return { error: 'Attachment exceeds 42 MB web upload limit.' };
      }
      return { error: `Server returned status ${res.status}` };
    }
  }

  private isPermanentAuthError(data: Record<string, unknown>): boolean {
    if (data.invalidSession === true) return true;
    const msg = String(data.error || '').toUpperCase();
    return (
      msg.includes('AUTH_KEY_UNREGISTERED') ||
      msg.includes('AUTH_KEY_INVALID') ||
      msg.includes('SESSION_REVOKED') ||
      msg.includes('SESSION_EXPIRED') ||
      msg.includes('USER_DEACTIVATED') ||
      msg.includes('AUTH_KEY_DUPLICATED')
    );
  }

  private async ensureSessionActive(forceRestore = false): Promise<boolean> {
    if (!forceRestore && this.authSession.isConnected) return true;
    if (this.restoreSessionPromise) return this.restoreSessionPromise;

    this.restoreSessionPromise = (async () => {
      try {
        const statusRes = await fetch('/api/tg/status');
        if (statusRes.ok) {
          const statusData = await this.parseJsonSafe(statusRes);
          if (statusData.isConnected && statusData.user) {
            this.authSession = {
              isConnected: true,
              isTestMode: false,
              user: statusData.user as TelegramUser,
              phoneNumber: String(statusData.phoneNumber || ''),
              dcId: Number(statusData.dcId || 2),
              lastSyncTimestamp: Date.now(),
            };
            this.notify();
            return true;
          }
          if (statusData.invalidSession === true) {
            this.clearPersistedAuth();
            return false;
          }
        }
      } catch {
        // try persisted session fallback
      }

      const savedAuth = this.loadPersistedAuth();
      if (!savedAuth) return false;

      try {
        const restoreRes = await fetch('/api/tg/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(savedAuth),
        });
        const restored = await this.parseJsonSafe(restoreRes);
        if (restoreRes.ok && restored.user) {
          const nextSession = String(restored.sessionString || savedAuth.sessionString);
          this.savePersistedAuth(
            nextSession,
            Number(restored.apiId || savedAuth.apiId || 0) || undefined,
            restored.apiHash ? String(restored.apiHash) : savedAuth.apiHash
          );
          this.authSession = {
            isConnected: true,
            isTestMode: false,
            user: restored.user as TelegramUser,
            phoneNumber: String((restored.user as TelegramUser)?.phone || ''),
            dcId: 2,
            sessionString: nextSession,
            lastSyncTimestamp: Date.now(),
          };
          this.notify();
          return true;
        }
        if (this.isPermanentAuthError(restored)) {
          this.clearPersistedAuth();
        }
      } catch {
        // keep savedAuth intact on transient errors
      }
      return false;
    })().finally(() => {
      this.restoreSessionPromise = null;
    });

    return this.restoreSessionPromise;
  }

  public async bootstrap(): Promise<void> {
    try {
      const res = await fetch('/api/tg/status');
      if (res.ok) {
        const data = await this.parseJsonSafe(res);

        if (Array.isArray(data.deletedLogs)) {
          ayuGramEngine.setDeletedLogsFromServer(data.deletedLogs);
        }

        if (data.invalidSession === true) {
          this.clearPersistedAuth();
        }

        this.authSession = {
          isConnected: Boolean(data.isConnected),
          isTestMode: false,
          user: (data.user as TelegramUser) || { id: '', firstName: 'Guest', status: 'offline' },
          phoneNumber: String(data.phoneNumber || ''),
          dcId: Number(data.dcId || 2),
          lastSyncTimestamp: Date.now(),
        };

        // If backend doesn't have an active session yet, auto-restore from local saved session without deleting on transient failures
        if (!this.authSession.isConnected && this.loadPersistedAuth()) {
          await this.ensureSessionActive(true);
        }
      } else if (this.loadPersistedAuth()) {
        await this.ensureSessionActive(true);
      }

      this.isInitialized = true;
      this.notify();

      if (this.authSession.isConnected) {
        await Promise.all([
          this.loadDialogs(),
          this.loadVault(),
          this.loadTargetGroup(),
          this.loadAutoForwardRules(),
          this.loadCloudFolders(),
        ]);
      } else if (this.loadPersistedAuth()) {
        // Retry once after container startup settles
        window.setTimeout(() => {
          if (!this.authSession.isConnected && this.loadPersistedAuth()) {
            void this.ensureSessionActive(true).then((ok) => {
              if (ok) {
                void Promise.all([
                  this.loadDialogs(),
                  this.loadVault(),
                  this.loadTargetGroup(),
                  this.loadAutoForwardRules(),
                  this.loadCloudFolders(),
                ]);
              }
            });
          }
        }, 2500);
      }
    } catch {
      this.isInitialized = true;
      this.notify();
      if (this.loadPersistedAuth()) {
        window.setTimeout(() => {
          void this.ensureSessionActive(true).then((ok) => {
            if (ok) {
              void this.loadDialogs();
              void this.loadVault();
            }
          });
        }, 2500);
      }
    }
  }

  // --- Getters ---

  public setActiveChatId(chatId: string | null) {
    this.activeChatId = chatId;
    if (chatId) {
      this.recordChatSeenLocally(chatId);
      void this.markChatAsRead(chatId);
    }
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getIsLoadingDialogs(): boolean {
    return this.isLoadingDialogs;
  }

  public isLoadingMessages(chatId: string): boolean {
    return Boolean(this.isLoadingMessagesByChat[chatId]);
  }

  public hasMoreMessages(chatId: string): boolean {
    return Boolean(this.hasMoreMessagesByChat[chatId]);
  }

  public isLoadingOlder(chatId: string): boolean {
    return Boolean(this.isLoadingOlderByChat[chatId]);
  }

  public getSharedMediaError(chatId: string, filter: string): string | undefined { return this.sharedMediaErrors[`${chatId}:${filter}`]; }

  public getSharedMedia(chatId: string, filter: 'media' | 'files' | 'voice' | 'links' | 'music'): TelegramMessage[] | undefined {
    return this.sharedMediaByChat[chatId]?.[filter];
  }

  public isLoadingSharedMedia(chatId: string, filter: 'media' | 'files' | 'voice' | 'links' | 'music'): boolean {
    return Boolean(this.isLoadingSharedMediaByChat[`${chatId}:${filter}`]);
  }

  public hasMoreSharedMedia(chatId: string, filter: 'media' | 'files' | 'voice' | 'links' | 'music'): boolean {
    return Boolean(this.hasMoreSharedMediaByChat[`${chatId}:${filter}`]);
  }

  public getAuthSession(): AuthSession {
    return this.authSession;
  }

  public getChats(): TelegramChat[] {
    return this.chats;
  }

  public getChat(chatId: string): TelegramChat | undefined {
    return this.chats.find((c) => c.id === chatId);
  }

  public getMessages(chatId: string): TelegramMessage[] {
    return this.messages[chatId] || [];
  }

  public getFolders(): ChatFolder[] {
    return this.folders;
  }

  public getVaultItems(): VaultItem[] {
    return this.vaultItems;
  }

  public getDeletedChats(): TelegramChat[] {
    return this.chats.filter((c) => c.isDeletedChat);
  }

  public getTypingStatus(chatId: string): string | null {
    return this.typingByChat[chatId] || null;
  }

  // --- Real Telegram Authentication ---

  public async requestPhoneCode(params: {
    apiId?: number;
    apiHash?: string;
    phoneNumber: string;
  }): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> {
    const res = await fetch('/api/tg/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send verification code.');
    }
    return data;
  }

  public async verifyPhoneCode(params: {
    phoneNumber: string;
    code: string;
    phoneCodeHash: string;
    password2FA?: string;
  }): Promise<{ requires2FA?: boolean; user?: TelegramUser; sessionString?: string }> {
    const res = await fetch('/api/tg/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();

    if (res.status === 401 && data.requires2FA) {
      return { requires2FA: true };
    }
    if (!res.ok) {
      throw new Error(data.error || 'Verification failed.');
    }

    if (data.sessionString) {
      this.savePersistedAuth(data.sessionString, data.apiId, data.apiHash);
    }
    this.authSession = {
      isConnected: true,
      isTestMode: false,
      user: data.user,
      phoneNumber: params.phoneNumber,
      dcId: 2,
      sessionString: data.sessionString,
      lastSyncTimestamp: Date.now(),
    };
    this.notify();
    await Promise.all([this.loadDialogs(), this.loadVault()]);
    return { user: data.user, sessionString: data.sessionString };
  }

  public async startQrLogin(apiId?: number, apiHash?: string): Promise<QrAuthChallenge> {
    const res = await fetch('/api/tg/auth/qr-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId, apiHash }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not initialize QR login.');
    }
    return data;
  }

  public async cancelQrLogin(): Promise<void> {
    try {
      await fetch('/api/tg/auth/qr-cancel', { method: 'POST' });
    } catch {
      // ignore
    }
  }

  public async getQrStatus(): Promise<QrStatusResponse> {
    const res = await fetch('/api/tg/auth/qr-status');
    const data = (await res.json()) as QrStatusResponse;
    if (data.isConnected && data.user) {
      if (data.sessionString) {
        this.savePersistedAuth(data.sessionString, data.apiId, data.apiHash);
      }
      if (!this.authSession.isConnected) {
        this.authSession = {
          isConnected: true,
          isTestMode: false,
          user: data.user,
          phoneNumber: data.user.phone || '',
          dcId: 2,
          sessionString: data.sessionString,
          lastSyncTimestamp: Date.now(),
        };
        this.notify();
        void Promise.all([this.loadDialogs(), this.loadVault()]);
      }
    }
    return data;
  }

  public async submitQr2FA(password: string): Promise<void> {
    const res = await fetch('/api/tg/auth/qr-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to verify 2FA password.');
    }
    if (data.sessionString) {
      this.savePersistedAuth(data.sessionString, data.apiId, data.apiHash);
    }
    if (data.isConnected && data.user) {
      this.authSession = {
        isConnected: true,
        isTestMode: false,
        user: data.user,
        phoneNumber: data.user.phone || '',
        dcId: 2,
        sessionString: data.sessionString,
        lastSyncTimestamp: Date.now(),
      };
      this.notify();
      void Promise.all([this.loadDialogs(), this.loadVault()]);
    }
  }

  public async authenticateWithSessionString(params: {
    apiId?: number;
    apiHash?: string;
    sessionString: string;
  }): Promise<TelegramUser> {
    const res = await fetch('/api/tg/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid or expired StringSession.');
    }

    const sessionToSave = data.sessionString || params.sessionString;
    this.savePersistedAuth(sessionToSave, data.apiId || params.apiId, data.apiHash || params.apiHash);

    this.authSession = {
      isConnected: true,
      isTestMode: false,
      user: data.user,
      phoneNumber: data.user?.phone || '',
      dcId: 2,
      sessionString: sessionToSave,
      lastSyncTimestamp: Date.now(),
    };
    this.notify();
    await Promise.all([this.loadDialogs(), this.loadVault()]);
    return data.user;
  }

  public async logout(): Promise<void> {
    this.clearPersistedAuth();
    try {
      await fetch('/api/tg/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    this.authSession = {
      isConnected: false,
      isTestMode: false,
      user: { id: '', firstName: 'Guest', status: 'offline' },
      dcId: 2,
      lastSyncTimestamp: Date.now(),
    };
    this.chats = [];
    this.messages = {};
    this.hasMoreMessagesByChat = {};
    this.sharedMediaByChat = {};
    this.notify();
  }

  // --- Dialogs & Messages ---

  public async loadDialogs(): Promise<TelegramChat[]> {
    if (!this.authSession.isConnected) return [];
    this.isLoadingDialogs = true;
    this.notify();
    try {
      const res = await fetch('/api/tg/dialogs');
      if (!res.ok) return this.chats;
      const data = await res.json();
      if (Array.isArray(data.chats)) {
        this.chats = (data.chats as TelegramChat[]).map((c) => {
          const hydrated: TelegramChat = {
            ...c,
            isPinned: c.isPinned || this.localPinnedSet.has(c.id),
            isMuted: c.isMuted || this.localMutedSet.has(c.id),
          };
          hydrated.unreadCount = this.computeEffectiveUnreadCount(hydrated);
          return hydrated;
        });


      }
      return this.chats;
    } catch {
      return this.chats;
    } finally {
      this.isLoadingDialogs = false;
      this.notify();
    }
  }

  public async openChatByLink(link: string): Promise<TelegramChat> {
    if (!this.authSession.isConnected) {
      await this.ensureSessionActive();
    }
    const doFetch = () =>
      fetch('/api/tg/chats/open-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });

    let res = await doFetch();
    if (res.status === 401 || res.status === 503) {
      const recovered = await this.ensureSessionActive(true);
      if (recovered) res = await doFetch();
    }
    const data = await this.parseJsonSafe(res);
    if (!res.ok || !data.chat) {
      throw new Error(String(data.error || 'Could not open Telegram chat from that link.'));
    }

    const incoming = data.chat as TelegramChat;
    if (incoming.type === 'saved') {
      const existingSaved = this.chats.find((c) => c.type === 'saved');
      if (existingSaved) return existingSaved;
    }

    const hydrated: TelegramChat = {
      ...incoming,
      isPinned: incoming.isPinned || this.localPinnedSet.has(incoming.id),
      isMuted: incoming.isMuted || this.localMutedSet.has(incoming.id),
    };

    const existingIdx = this.chats.findIndex((c) => c.id === hydrated.id);
    if (existingIdx !== -1) {
      this.chats[existingIdx] = {
        ...this.chats[existingIdx],
        ...hydrated,
        lastMessage: hydrated.lastMessage || this.chats[existingIdx].lastMessage,
      };
      this.notify();
      return this.chats[existingIdx];
    }

    this.chats = [hydrated, ...this.chats];
    this.notify();
    return hydrated;
  }

  public loadMessages(chatId: string, topMsgId: number | undefined = this.messageContext.get(chatId)): Promise<TelegramMessage[]> {
    const context = topMsgId || 0;
    const key = chatId + ':' + context;
    const existing = this.messageRequests.get(key);
    if (existing && this.messageContext.get(chatId) === context) return existing;
    if ((this.messageContext.get(chatId) || 0) !== context) {
      this.messages[chatId] = [];
      this.hasMoreMessagesByChat[chatId] = false;
    }
    this.messageContext.set(chatId, context);
    const generation = (this.messageGeneration.get(chatId) || 0) + 1;
    this.messageGeneration.set(chatId, generation);
    const job = this.fetchMessages(chatId, topMsgId, generation).finally(() => {
      if (this.messageRequests.get(key) === job) this.messageRequests.delete(key);
    });
    this.messageRequests.set(key, job);
    return job;
  }

  private async fetchMessages(chatId: string, topMsgId: number | undefined, generation: number): Promise<TelegramMessage[]> {
    if (!this.authSession.isConnected || !chatId) return [];
    const snapshot = [...(this.messages[chatId] || [])];
    const hasCached = (this.messages[chatId] || []).length > 0;
    if (!hasCached || topMsgId) {
      this.isLoadingMessagesByChat[chatId] = true;
      this.notify();
    }

    let didMutate = false;
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (topMsgId && topMsgId > 0) qs.set('topMsgId', String(topMsgId));
      const res = await fetch(`/api/tg/messages/${encodeURIComponent(chatId)}?${qs.toString()}`);
      if (!res.ok) return this.messages[chatId] || [];
      const data = await res.json();
      if (this.messageGeneration.get(chatId) !== generation) return this.messages[chatId] || [];
      if (Array.isArray(data.messages)) {
        const incoming = data.messages as TelegramMessage[];
        if (topMsgId && topMsgId > 0) {
          this.messages[chatId] = mergeMessagePage(this.messages[chatId] || [], incoming, snapshot);
          this.hasMoreMessagesByChat[chatId] = false;
        } else {
          const existing = this.messages[chatId] || [];
          const oldestIncomingTs = incoming.length > 0 ? incoming[0].timestamp : Number.MAX_SAFE_INTEGER;
          const incomingIds = new Set(incoming.map((m) => m.id));
          const olderCached = existing.filter(
            (m) => !m.isPending && !incomingIds.has(m.id) && m.timestamp < oldestIncomingTs
          );
          this.messages[chatId] = mergeMessagePage(existing, incoming, snapshot);
          if (typeof data.hasMore === 'boolean') {
            this.hasMoreMessagesByChat[chatId] =
              olderCached.length > 0 ? Boolean(this.hasMoreMessagesByChat[chatId] ?? data.hasMore) : data.hasMore;
          } else {
            this.hasMoreMessagesByChat[chatId] = incoming.length >= 100;
          }
        }
        didMutate = true;

        if (this.activeChatId === chatId) {
          this.recordChatSeenLocally(chatId);
          void this.markChatAsRead(chatId);
        }


      }
      return this.messages[chatId] || [];
    } catch {
      return this.messages[chatId] || [];
    } finally {
      if (this.messageGeneration.get(chatId) === generation && this.isLoadingMessagesByChat[chatId]) {
        this.isLoadingMessagesByChat[chatId] = false;
        didMutate = true;
      }
      if (didMutate) {
        this.notify();
      }
    }
  }

  public async loadOlderMessages(chatId: string, autoChainRemaining: number = 0): Promise<TelegramMessage[]> {
    if (!this.authSession.isConnected || !chatId) return [];
    if (this.messageContext.get(chatId)) return this.messages[chatId] || [];
    if (this.isLoadingOlderByChat[chatId]) return this.messages[chatId] || [];
    const generation = this.messageGeneration.get(chatId);

    const existing = (this.messages[chatId] || []).filter((m) => !m.isPending);
    const numericIds = existing.map((m) => Number(m.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (numericIds.length === 0) {
      this.hasMoreMessagesByChat[chatId] = false;
      this.notify();
      return existing;
    }

    const oldestId = Math.min(...numericIds);
    this.isLoadingOlderByChat[chatId] = true;
    this.notify();

    let shouldChainMore = false;
    try {
      const res = await fetch(
        `/api/tg/messages/${encodeURIComponent(chatId)}?limit=100&offsetId=${oldestId}`
      );
      if (!res.ok) return this.messages[chatId] || [];
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        const older = data.messages as TelegramMessage[];
        if (this.messageGeneration.get(chatId) !== generation) return this.messages[chatId] || [];
        const current = this.messages[chatId] || [];
        const existingIds = new Set(current.map((m) => m.id));
        const uniqueOlder = older.filter((m) => !existingIds.has(m.id));
        this.messages[chatId] = [...uniqueOlder, ...current];
        const hasMore =
          typeof data.hasMore === 'boolean' ? data.hasMore : older.length >= 100;
        this.hasMoreMessagesByChat[chatId] = hasMore;
        shouldChainMore = hasMore && autoChainRemaining > 0 && uniqueOlder.length > 0;
      } else {
        this.hasMoreMessagesByChat[chatId] = false;
      }
      return this.messages[chatId] || [];
    } catch {
      return this.messages[chatId] || [];
    } finally {
      this.isLoadingOlderByChat[chatId] = false;
      this.notify();
      if (shouldChainMore && this.activeChatId === chatId) {
        window.setTimeout(() => {
          void this.loadOlderMessages(chatId, autoChainRemaining - 1);
        }, 200);
      }
    }
  }

  public async loadChatSharedMedia(
    chatId: string,
    filter: 'media' | 'files' | 'voice' | 'links' | 'music',
    append: boolean = false,
    autoChainRemaining: number = 0
  ): Promise<TelegramMessage[]> {
    if (!this.authSession.isConnected || !chatId) return [];
    const key = `${chatId}:${filter}`;
    if (this.isLoadingSharedMediaByChat[key]) {
      return this.sharedMediaByChat[chatId]?.[filter] || [];
    }
    delete this.sharedMediaErrors[key];
    this.isLoadingSharedMediaByChat[key] = true;
    this.notify();

    let shouldAutoChain = false;
    try {
      const offsetId = append ? this.nextOffsetSharedMediaByChat[key] || 0 : 0;
      const qs = new URLSearchParams({ filter, limit: '60' });
      if (offsetId > 0) qs.set('offsetId', String(offsetId));
      const res = await fetch(
        `/api/tg/chats/${encodeURIComponent(chatId)}/media?${qs.toString()}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load shared media.');
      const incoming = Array.isArray(data.items) ? (data.items as TelegramMessage[]) : [];
      const prev = append ? this.sharedMediaByChat[chatId]?.[filter] || [] : [];
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      this.sharedMediaByChat[chatId] = {
        ...(this.sharedMediaByChat[chatId] || {}),
        [filter]: merged,
      };
      const hasMore = Boolean(data.hasMore && incoming.length > 0);
      this.hasMoreSharedMediaByChat[key] = hasMore;
      if (data.nextOffsetId) {
        this.nextOffsetSharedMediaByChat[key] = Number(data.nextOffsetId);
      }
      shouldAutoChain = hasMore && autoChainRemaining > 0;
      return merged;
    } catch (error) {
      this.sharedMediaErrors[key] = (error as Error).message;
      return this.sharedMediaByChat[chatId]?.[filter] || [];
    } finally {
      this.isLoadingSharedMediaByChat[key] = false;
      this.notify();
      if (shouldAutoChain) {
        window.setTimeout(() => {
          void this.loadChatSharedMedia(chatId, filter, true, autoChainRemaining - 1);
        }, 120);
      }
    }
  }

  public async loadVault(): Promise<VaultItem[]> {
    try {
      const res = await fetch('/api/tg/vault');
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.items)) {
        this.vaultItems = data.items;
      }
      if (Array.isArray(data.deletedLogs)) {
        ayuGramEngine.setDeletedLogsFromServer(data.deletedLogs);
      }
      this.notify();
      return this.vaultItems;
    } catch {
      return [];
    }
  }

  // --- Real Message Actions ---

  public async sendMessage(params: {
    chatId: string;
    text: string;
    replyToId?: string;
    topMsgId?: number;
    scheduleDate?: number;
    parseFormatting?: boolean;
    fileDataUrl?: string;
    fileName?: string;
    mediaType?: 'photo' | 'video' | 'voice' | 'file';
    voiceDuration?: number;
    ttlSeconds?: number;
  }): Promise<TelegramMessage | null> {
    if (!this.authSession.isConnected) {
      const restored = await this.ensureSessionActive();
      if (!restored) {
        throw new Error('Not connected to Telegram. Please check your connection or sign in.');
      }
    }

    const ayu = ayuGramEngine.getSettings();
    if (ayu.markReadOnReply) {
      void this.markChatAsRead(params.chatId, true);
    }

    const isScheduled = Boolean(params.scheduleDate && params.scheduleDate > Math.floor(Date.now() / 1000));
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowTs = Date.now();
    const numericReplyTo =
      params.replyToId && /^\d+$/.test(String(params.replyToId)) ? String(params.replyToId) : undefined;

    if (!isScheduled) {
      const prevList = this.messages[params.chatId] || [];
      const repliedTarget = params.replyToId
        ? prevList.find((m) => String(m.id) === String(params.replyToId))
        : undefined;

      const optimisticMsg: TelegramMessage = {
        id: tempId,
        chatId: params.chatId,
        senderId: this.authSession.user.id || 'me',
        senderName: this.authSession.user.firstName || 'You',
        text: params.text,
        timestamp: nowTs,
        isOutgoing: true,
        isRead: false,
        isPending: true,
        topicId: params.topMsgId,
        ...(repliedTarget
          ? {
              replyTo: {
                id: repliedTarget.id,
                senderName: repliedTarget.senderName || 'User',
                text: repliedTarget.text || (repliedTarget.media ? `[${repliedTarget.media.type}]` : 'Media'),
                mediaType: repliedTarget.media?.type,
              },
            }
          : {}),
        ...(params.mediaType && params.fileDataUrl
          ? {
              media: {
                type: params.mediaType,
                url: params.fileDataUrl,
                fileName: params.fileName,
                duration: params.voiceDuration,
                isDisappearing: Boolean(params.ttlSeconds && params.ttlSeconds > 0),
                expireSeconds: params.ttlSeconds,
              },
            }
          : {}),
      };

      this.messages[params.chatId] = [...prevList, optimisticMsg];

      const chatIdxPre = this.chats.findIndex((c) => c.id === params.chatId);
      if (chatIdxPre !== -1) {
        const nextChats = [...this.chats];
        nextChats[chatIdxPre] = {
          ...nextChats[chatIdxPre],
          draftText: '',
          lastMessage: {
            text: params.text || (params.mediaType ? `[${params.mediaType}]` : 'Sending...'),
            timestamp: nowTs,
            senderName: 'You',
            isOutgoing: true,
            isRead: false,
          },
        };
        this.chats = nextChats;
      }
      soundEffects.playSend();
      this.notify();
    }

    const requestBody = JSON.stringify({
      chatId: params.chatId,
      text: params.text,
      replyToId: numericReplyTo,
      topMsgId: params.topMsgId,
      scheduleDate: params.scheduleDate,
      parseFormatting: params.parseFormatting !== false,
      fileDataUrl: params.fileDataUrl,
      fileName: params.fileName,
      mediaType: params.mediaType,
      duration: params.voiceDuration,
      ttlSeconds: params.ttlSeconds,
      silent: ayu.sendWithoutSound,
    });

    try {
      const postSend = () =>
        fetch('/api/tg/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

      let res = await postSend();
      if (res.status === 401 || res.status === 503) {
        const recovered = await this.ensureSessionActive(true);
        if (recovered) {
          res = await postSend();
        }
      }

      const data = await this.parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(String(data.error || 'Failed to send message'));
      }

      if (isScheduled) {
        soundEffects.playSend();
        this.notify();
        return null;
      }

      const rawSent = data.message as TelegramMessage | undefined;
      if (!rawSent || !rawSent.id) {
        this.messages[params.chatId] = (this.messages[params.chatId] || []).map((m) =>
          m.id === tempId ? { ...m, isPending: false } : m
        );
        void this.loadMessages(params.chatId);
        this.notify();
        return null;
      }

      const curList = this.messages[params.chatId] || [];
      const tempMatch = curList.find((m) => m.id === tempId);
      const sent: TelegramMessage = {
        ...rawSent,
        replyTo: rawSent.replyTo || tempMatch?.replyTo,
      };
      const alreadyReal = curList.some((m) => m.id === sent.id);
      if (alreadyReal) {
        this.messages[params.chatId] = curList.filter((m) => m.id !== tempId);
      } else if (curList.some((m) => m.id === tempId)) {
        this.messages[params.chatId] = curList.map((m) => (m.id === tempId ? sent : m));
      } else {
        this.messages[params.chatId] = [...curList, sent];
      }

      const chatIdxPost = this.chats.findIndex((c) => c.id === params.chatId);
      if (chatIdxPost !== -1) {
        const nextChats = [...this.chats];
        nextChats[chatIdxPost] = {
          ...nextChats[chatIdxPost],
          draftText: '',
          lastMessage: {
            text: params.text || (params.mediaType ? `[${params.mediaType}]` : 'Sent'),
            timestamp: sent.timestamp,
            senderName: 'You',
            isOutgoing: true,
            isRead: Boolean(sent.isRead),
          },
        };
        this.chats = nextChats;
      }

      this.notify();
      return sent;
    } catch (err) {
      if (!isScheduled) {
        this.messages[params.chatId] = (this.messages[params.chatId] || []).filter((m) => m.id !== tempId);
        this.notify();
      }
      throw err;
    }
  }

  public async saveMediaToVault(chatId: string, messageId: string, chatTitle: string): Promise<boolean> {
    try {
      const res = await fetch('/api/tg/messages/save-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, chatTitle }),
      });
      if (!res.ok) return false;

      const msg = this.messages[chatId]?.find((m) => m.id === messageId);
      if (msg) {
        msg.isSavedFromTTL = true;
      }
      await this.loadVault();
      const savedChat = this.chats.find((c) => c.type === 'saved');
      if (savedChat) {
        void this.loadMessages(savedChat.id);
      }
      soundEffects.playReaction();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public getTargetGroup(): TargetGroupInfo | null {
    return this.targetGroup ? { ...this.targetGroup } : null;
  }

  public getBulkForwardProgress(): BulkForwardProgress | null {
    return this.bulkForwardProgress ? { ...this.bulkForwardProgress } : null;
  }

  public clearBulkForwardProgress() {
    this.bulkForwardProgress = null;
    this.notify();
  }

  public async loadTargetGroup(): Promise<TargetGroupInfo | null> {
    try {
      const res = await fetch('/api/tg/target-group');
      if (!res.ok) return this.targetGroup;
      const data = await res.json();
      this.targetGroup = data.targetGroup || null;
      this.notify();
      return this.targetGroup;
    } catch {
      return this.targetGroup;
    }
  }

  public async resolveTargetGroupByLink(link: string): Promise<TargetGroupInfo> {
    const res = await fetch('/api/tg/target-group/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not resolve target group link.');
    }
    this.targetGroup = data.targetGroup;
    soundEffects.playReaction();
    this.notify();
    return data.targetGroup;
  }

  public async clearTargetGroup(): Promise<void> {
    this.targetGroup = null;
    try {
      await fetch('/api/tg/target-group', { method: 'DELETE' });
    } catch {
      // ignore
    }
    this.notify();
  }

  public async markMessageAsSeenToSender(chatId: string, messageId: string): Promise<boolean> {
    try {
      const res = await fetch('/api/tg/messages/mark-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId }),
      });
      if (!res.ok) return false;
      const msg = this.messages[chatId]?.find((m) => m.id === messageId);
      if (msg) {
        msg.isRead = true;
        if (msg.media) {
          msg.media.viewed = true;
        }
      }
      this.recordChatSeenLocally(chatId);
      const chat = this.chats.find((c) => c.id === chatId);
      if (chat) {
        chat.unreadCount = 0;
        if (chat.lastMessage) chat.lastMessage.isRead = true;
      }
      soundEffects.playPop();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public async forwardMessage(
    fromChatId: string,
    messageId: string,
    toChatId: string = 'me',
    hideSenderTag?: boolean,
    targetLink?: string
  ): Promise<{ ok: boolean; bypassed?: boolean; error?: string }> {
    try {
      const omitTag = hideSenderTag ?? ayuGramEngine.getSettings().hideForwardTag;
      const res = await fetch('/api/tg/messages/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChatId,
          toChatId,
          targetLink,
          messageId,
          hideSenderTag: omitTag,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Forward failed' };
      }
      soundEffects.playSend();
      if (toChatId === 'me') {
        const savedChat = this.chats.find((c) => c.type === 'saved');
        if (savedChat) void this.loadMessages(savedChat.id);
      }
      return { ok: true, bypassed: Boolean(data.bypassed) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  public async forwardAllMediaToTargetGroup(params: {
    fromChatId: string;
    targetLink?: string;
    targetChatId?: string;
    includePhotos?: boolean;
    includeVideos?: boolean;
    includeFiles?: boolean;
    limit?: number;
  }): Promise<{
    ok: boolean;
    forwarded: number;
    failed: number;
    skippedDuplicates?: number;
    total: number;
    targetTitle: string;
  }> {
    // Ensure source group's photo & video gallery is rendered first before bulk sending
    if (!this.sharedMediaByChat[params.fromChatId]?.media?.length) {
      await this.loadChatSharedMedia(params.fromChatId, 'media', false, 2).catch(() => {});
    } else {
      void this.loadChatSharedMedia(params.fromChatId, 'media', false, 4);
    }

    const res = await fetch('/api/tg/messages/forward-all-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        includeFiles: false,
        limit: params.limit || 2000,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to forward all media.');
    }
    soundEffects.playReaction();
    void this.loadVault();
    return data;
  }

  public async resetSentMediaHistory(fromChatId?: string): Promise<void> {
    const qs = fromChatId ? `?fromChatId=${encodeURIComponent(fromChatId)}` : '';
    const res = await fetch(`/api/tg/target-group/sent-history${qs}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Could not clear sent media history.');
    }
    this.notify();
  }

  public async markChatAsRead(chatId: string, forceManual: boolean = false) {
    if (!chatId) return;
    this.recordChatSeenLocally(chatId);

    const chatIdx = this.chats.findIndex((c) => c.id === chatId);
    if (chatIdx !== -1) {
      const existing = this.chats[chatIdx];
      if (existing.unreadCount > 0 || (existing.lastMessage && !existing.lastMessage.isRead)) {
        const nextChats = [...this.chats];
        nextChats[chatIdx] = {
          ...existing,
          unreadCount: 0,
          lastMessage: existing.lastMessage
            ? { ...existing.lastMessage, isRead: true }
            : undefined,
        };
        this.chats = nextChats;
        this.notify();
      }
    }

    const ayu = ayuGramEngine.getSettings();
    if (ayu.ghostModeActive && !ayu.sendReadReceipts && !forceManual) {
      return;
    }

    try {
      await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST' });
    } catch {
      // ignore
    }
  }

  public async editMessage(chatId: string, messageId: string, newText: string): Promise<void> {
    if (!this.authSession.isConnected) {
      await this.ensureSessionActive();
    }
    const doEdit = () =>
      fetch('/api/tg/messages/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, text: newText }),
      });

    let res = await doEdit();
    if (res.status === 401 || res.status === 503) {
      const recovered = await this.ensureSessionActive(true);
      if (recovered) res = await doEdit();
    }
    const data = await this.parseJsonSafe(res);
    if (!res.ok) {
      throw new Error(String(data.error || 'Could not edit message.'));
    }
    const updated = data.message as TelegramMessage;
    if (this.messages[chatId] && updated) {
      this.messages[chatId] = this.messages[chatId].map((m) => (m.id === messageId ? updated : m));
    }
    const chat = this.chats.find((c) => c.id === chatId);
    if (chat && chat.lastMessage) chat.lastMessage.text = newText;
    this.notify();
  }

  public async deleteMessage(chatId: string, messageId: string, revoke: boolean = true) {
    try {
      const res = await fetch('/api/tg/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, revoke }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Could not delete message.'); }
      if (this.messages[chatId]) {
        this.messages[chatId] = this.messages[chatId].filter((m) => m.id !== messageId);
      }
      this.notify();
    } catch (error) { throw error; }
  }

  public async togglePinMessage(chatId: string, messageId: string) {
    const chat = this.chats.find((c) => c.id === chatId);
    const msg = this.messages[chatId]?.find((m) => m.id === messageId);
    if (!chat || !msg) return;

    const unpin = chat.pinnedMessageId === messageId;
    try {
      const res = await fetch('/api/tg/messages/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, unpin }),
      });
      if (!res.ok) return;

      if (unpin) {
        chat.pinnedMessageId = undefined;
        msg.isPinned = false;
      } else {
        this.messages[chatId].forEach((m) => (m.isPinned = false));
        chat.pinnedMessageId = messageId;
        msg.isPinned = true;
      }
      this.notify();
    } catch {
      // ignore
    }
  }

  public async toggleReaction(chatId: string, messageId: string, emoji: string) {
    const msg = this.messages[chatId]?.find((m) => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions) msg.reactions = [];
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    const remove = Boolean(existing?.hasReacted);

    if (existing) {
      if (existing.hasReacted) {
        existing.count -= 1;
        existing.hasReacted = false;
        if (existing.count <= 0) {
          msg.reactions = msg.reactions.filter((r) => r.emoji !== emoji);
        }
      } else {
        existing.count += 1;
        existing.hasReacted = true;
      }
    } else {
      msg.reactions.push({ emoji, count: 1, hasReacted: true });
    }

    soundEffects.playReaction();
    this.notify();

    try {
      await fetch('/api/tg/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, emoji, remove }),
      });
    } catch {
      // ignore
    }
  }

  public markMediaAsViewed(chatId: string, messageId: string) {
    const msg = this.messages[chatId]?.find((m) => m.id === messageId);
    if (msg && msg.media && msg.media.isDisappearing && !msg.media.viewed) {
      msg.media.viewed = true;
      msg.media.expiresAt = Date.now() + (msg.media.expireSeconds || 5) * 1000;
      this.notify();
    }
  }

  public markMediaExpired(chatId: string, messageId: string) {
    const msg = this.messages[chatId]?.find((m) => m.id === messageId);
    if (!msg || !msg.media) return;

    const ayuSettings = ayuGramEngine.getSettings();
    if (ayuSettings.preventTTLExpiration) {
      msg.isSavedFromTTL = true;
      if (ayuSettings.autoSaveExpiringToSavedMessages) {
        const chat = this.chats.find((c) => c.id === chatId);
        void this.saveMediaToVault(chatId, messageId, chat?.title || 'Chat');
      }
      this.notify();
      return;
    }

    msg.media.isExpired = true;
    this.notify();
  }

  public addCustomFolder(name: string, iconName: string = 'Folder'): ChatFolder {
    const newFolder: ChatFolder = {
      id: `f_custom_${Date.now()}`,
      name,
      iconName,
      filter: 'custom',
    };
    this.folders = [...this.folders, newFolder];
    localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(this.folders));
    this.notify();
    return newFolder;
  }

  public deleteFolder(folderId: string) {
    this.folders = this.folders.filter((f) => f.id !== folderId);
    localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(this.folders));
    this.notify();
  }

  public toggleMuteChat(chatId: string) {
    const chat = this.chats.find((c) => c.id === chatId);
    if (!chat) return;
    const nextMuted = !chat.isMuted;
    this.chats = this.chats.map((c) => (c.id === chatId ? { ...c, isMuted: nextMuted } : c));
    if (nextMuted) this.localMutedSet.add(chatId);
    else this.localMutedSet.delete(chatId);
    this.saveLocalPrefs();
    this.notify();

    if (this.authSession.isConnected && !chat.isDeletedChat) {
      void fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/mute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: nextMuted }),
      }).catch(() => {});
    }
  }

  public togglePinChat(chatId: string) {
    const chat = this.chats.find((c) => c.id === chatId);
    if (!chat) return;
    const nextPinned = !chat.isPinned;
    this.chats = this.chats.map((c) => (c.id === chatId ? { ...c, isPinned: nextPinned } : c));
    if (nextPinned) this.localPinnedSet.add(chatId);
    else this.localPinnedSet.delete(chatId);
    this.saveLocalPrefs();
    this.notify();

    if (this.authSession.isConnected && !chat.isDeletedChat) {
      void fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: nextPinned }),
      }).catch(() => {});
    }
  }

  public async markChatUnread(chatId: string, unread: boolean = true): Promise<void> {
    this.chats = this.chats.map((c) =>
      c.id === chatId ? { ...c, unreadCount: unread ? Math.max(1, c.unreadCount || 1) : 0 } : c
    );
    if (unread) {
      delete this.localReadMaxIdByChat[chatId];
      delete this.localReadTimestampByChat[chatId];
      this.saveLocalReadState();
    } else {
      this.recordChatSeenLocally(chatId);
    }
    this.notify();

    if (this.authSession.isConnected) {
      await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/unread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unread }),
      }).catch(() => {});
    }
  }

  public async markAllArchivedRead(): Promise<void> {
    this.chats = this.chats.map((c) => (c.isArchived ? { ...c, unreadCount: 0 } : c));
    this.chats.forEach((c) => {
      if (c.isArchived) this.recordChatSeenLocally(c.id);
    });
    soundEffects.playPop();
    this.notify();

    if (this.authSession.isConnected) {
      await fetch('/api/tg/chats/archive/mark-all-read', { method: 'POST' }).catch(() => {});
    }
  }

  // --- Global Search, Group & Channel Management, Member Roles, Profile & Message Links ---

  public async searchGlobal(query: string, signal?: AbortSignal): Promise<GlobalSearchResult[]> {
    if (!this.authSession.isConnected || !query.trim()) return [];
      const res = await fetch(`/api/tg/search?q=${encodeURIComponent(query.trim())}`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not search people and chats.');
      return Array.isArray(data.results) ? (data.results as GlobalSearchResult[]) : [];
  }

  public async searchMessages(query: string, filter: MessageSearchFilter = 'all', options: { chatId?: string; topMsgId?: number; cursor?: MessageSearchCursor; signal?: AbortSignal; minDate?: number; maxDate?: number } = {}): Promise<MessageSearchPage> {
    const params = new URLSearchParams({ q: query.trim(), filter });
    for (const [key, value] of Object.entries({ chatId: options.chatId, topMsgId: options.topMsgId, minDate: options.minDate, maxDate: options.maxDate, ...options.cursor })) if (value !== undefined) params.set(key, String(value));
    const response = await fetch(`/api/tg/search/messages?${params}`, { signal: options.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Telegram search failed. Try again.');
    return data;
  }

  public async loadMessageContext(hit: MessageSearchHit, signal?: AbortSignal): Promise<void> {
    const { chat, message } = hit;
    const accountId = this.authSession.user.id;
    const response = await fetch(`/api/tg/search/context/${encodeURIComponent(chat.id)}/${encodeURIComponent(message.id)}`, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not open this message.');
    signal?.throwIfAborted();
    if (this.authSession.user.id !== accountId) throw new Error('The active account changed. Search again.');
    if (!this.getChat(chat.id)) this.chats = [...this.chats, { ...chat, unreadCount: 0, isPinned: false, isMuted: false }];
    const existing = this.messageContext.get(chat.id) ? [] : this.messages[chat.id] || [];
    this.messageContext.set(chat.id, 0);
    this.messageGeneration.set(chat.id, (this.messageGeneration.get(chat.id) || 0) + 1);
    this.messageRequests.delete(chat.id + ':0');
    this.isLoadingMessagesByChat[chat.id] = false;
    this.hasMoreMessagesByChat[chat.id] = true;
    const merged = new Map<string, TelegramMessage>((data.messages as TelegramMessage[]).map(m => [m.id, m]));
    for (const m of existing) merged.set(m.id, m);
    this.messages[chat.id] = [...merged.values()].sort((a, b) => a.timestamp - b.timestamp || Number(a.id) - Number(b.id));
    this.notify();
  }

  public async checkUsername(
    chatId: string,
    username: string
  ): Promise<{ available: boolean; reason?: string }> {
    const clean = username.replace(/^@/, '').trim();
    if (clean.length < 4) {
      return { available: false, reason: 'Username must be at least 4 characters.' };
    }
    const res = await fetch(
      `/api/tg/chats/${encodeURIComponent(chatId)}/check-username?username=${encodeURIComponent(clean)}`
    );
    const data = await res.json();
    return {
      available: Boolean(data.available),
      reason: data.reason ? String(data.reason) : undefined,
    };
  }

  public async createGroup(params: {
    title: string;
    about?: string;
    supergroup?: boolean;
    members?: string[];
  }): Promise<TelegramChat> {
    const res = await fetch('/api/tg/groups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.chat) {
      throw new Error(data.error || 'Could not create group.');
    }
    const created = data.chat as TelegramChat;
    this.chats = [created, ...this.chats.filter((c) => c.id !== created.id)];
    soundEffects.playReaction();
    this.notify();
    return created;
  }

  public async createChannel(params: {
    title: string;
    about?: string;
    username?: string;
  }): Promise<TelegramChat> {
    const res = await fetch('/api/tg/channels/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.chat) {
      throw new Error(data.error || 'Could not create channel.');
    }
    const created = data.chat as TelegramChat;
    this.chats = [created, ...this.chats.filter((c) => c.id !== created.id)];
    soundEffects.playReaction();
    this.notify();
    return created;
  }

  public async getChatDetails(chatId: string): Promise<ChatDetailsInfo> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/details`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to load chat details.');
    }
    return data as ChatDetailsInfo;
  }

  public async editChat(
    chatId: string,
    params: {
      title?: string;
      about?: string;
      username?: string;
      noforwards?: boolean;
      avatarDataUrl?: string;
      removeAvatar?: boolean;
      historyHidden?: boolean;
      isForum?: boolean;
      signatures?: boolean;
      ttlPeriod?: number;
      linkedChatId?: string;
      reactionsMode?: 'all' | 'some' | 'none';
      availableReactions?: string[];
    }
  ): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not update chat settings.');
    }
    const idx = this.chats.findIndex((c) => c.id === chatId);
    if (idx !== -1) {
      const updated = { ...this.chats[idx] };
      if (params.title) updated.title = params.title.trim();
      if (typeof params.about === 'string') updated.description = params.about;
      if (typeof params.username === 'string') updated.username = params.username.replace(/^@/, '').trim();
      if (typeof params.noforwards === 'boolean') updated.isProtected = params.noforwards;
      if (typeof params.isForum === 'boolean') updated.isForum = params.isForum;
      if (params.removeAvatar) {
        updated.avatarUrl = '';
      } else if (params.avatarDataUrl) {
        updated.avatarUrl = `/api/tg/avatar/${encodeURIComponent(chatId)}?t=${Date.now()}`;
      }
      const next = [...this.chats];
      next[idx] = updated;
      this.chats = next;
    }
    soundEffects.playReaction();
    this.notify();
  }

  public async exportInviteLink(chatId: string, revoke: boolean = false): Promise<string> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/invite-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revoke }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not export invite link.');
    }
    const link = String(data.inviteLink || '');
    const idx = this.chats.findIndex((c) => c.id === chatId);
    if (idx !== -1 && link) {
      const next = [...this.chats];
      next[idx] = { ...next[idx], inviteLink: link };
      this.chats = next;
      this.notify();
    }
    return link;
  }

  public async addChatMember(chatId: string, member: string): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/members/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not add member.');
    }
  }

  public async updateMemberRole(
    chatId: string,
    userId: string,
    action: 'promote' | 'demote' | 'kick' | 'unban',
    rank?: string
  ): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/members/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, rank }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not update member permissions.');
    }
  }

  public async getBannedMembers(chatId: string): Promise<BannedMemberItem[]> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/banned`);
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.banned) ? (data.banned as BannedMemberItem[]) : [];
  }

  public async getAdminLog(chatId: string): Promise<AdminLogEventItem[]> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/admin-log`);
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.events) ? (data.events as AdminLogEventItem[]) : [];
  }

  public getAutoForwardRule(chatId: string): AutoForwardRule | undefined {
    return this.autoForwardRules[chatId];
  }

  public async loadAutoForwardRules(): Promise<Record<string, AutoForwardRule>> {
    try {
      const res = await fetch('/api/tg/auto-forward');
      if (!res.ok) return this.autoForwardRules;
      const data = await res.json();
      if (data.rules && typeof data.rules === 'object') {
        this.autoForwardRules = data.rules as Record<string, AutoForwardRule>;
        this.notify();
      }
      return this.autoForwardRules;
    } catch {
      return this.autoForwardRules;
    }
  }

  public async toggleAutoForward(params: {
    chatId: string;
    chatTitle: string;
    enabled: boolean;
    includePhotos: boolean;
    includeVideos: boolean;
    includeFiles: boolean;
  }): Promise<AutoForwardRule> {
    const res = await fetch('/api/tg/auto-forward/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.rule) {
      throw new Error(data.error || 'Could not update Auto-Forward rule.');
    }
    const rule = data.rule as AutoForwardRule;
    this.autoForwardRules = {
      ...this.autoForwardRules,
      [rule.chatId]: rule,
    };
    soundEffects.playReaction();
    this.notify();
    return rule;
  }

  public async leaveOrDeleteChat(
    chatId: string,
    opts?: { deleteChannel?: boolean; clearHistory?: boolean; revoke?: boolean }
  ): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts || {}),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Action failed.');
    }
    if (ayuGramEngine.getSettings().antiDeleteEnabled) {
      this.chats = this.chats.map((c) =>
        c.id === chatId ? { ...c, isDeletedChat: true, deletedAt: Date.now(), unreadCount: 0 } : c
      );
    } else {
      this.chats = this.chats.filter((c) => c.id !== chatId);
    }
    this.notify();
  }

  public async removeDeletedChatFromArchive(chatId: string): Promise<void> {
    await fetch(`/api/tg/vault/deleted-chats/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    });
    this.chats = this.chats.filter((c) => c.id !== chatId);
    this.notify();
  }

  public async getMessageLink(chatId: string, messageId: string): Promise<string> {
    const res = await fetch(
      `/api/tg/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}/link`
    );
    const data = await res.json();
    if (!res.ok || !data.link) {
      throw new Error(data.error || 'Message link unavailable.');
    }
    return String(data.link);
  }

  public async editProfile(params: {
    firstName?: string;
    lastName?: string;
    bio?: string;
    username?: string;
  }): Promise<TelegramUser> {
    const res = await fetch('/api/tg/profile/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.user) {
      throw new Error(data.error || 'Could not update profile.');
    }
    this.authSession = {
      ...this.authSession,
      user: data.user as TelegramUser,
    };
    soundEffects.playReaction();
    this.notify();
    return data.user as TelegramUser;
  }

  // --- Official Telegram Parity Methods ---

  public async forwardBatchDetailed(params: { fromChatId: string; toChatIds: string[]; messageIds: string[]; requestId: string } & import('../utils/forwardOptions').ForwardOptions): Promise<import('../utils/forwardOptions').ForwardBatchResult> {
    const res = await fetch('/api/tg/messages/forward-batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, messageIds: params.messageIds.map(Number) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not forward selected messages.');
    if (data.targets.some((target: { complete: boolean }) => target.complete)) soundEffects.playSend();
    return data;
  }

  public async forwardBatch(params: { fromChatId: string; toChatIds: string[]; messageIds: string[]; hideSenderTag?: boolean }): Promise<number> {
    const result = await this.forwardBatchDetailed({ ...params, hideSenderTag: params.hideSenderTag ?? ayuGramEngine.getSettings().hideForwardTag, requestId: crypto.randomUUID() });
    if (!result.ok) throw new Error(result.targets.filter(t => !t.complete).map(t => t.error).join('; ') || 'Some messages could not be forwarded.');
    return result.count;
  }

  public async deleteBatch(chatId: string, messageIds: string[], revoke: boolean = true): Promise<void> {
    for (const id of messageIds) {
      await this.deleteMessage(chatId, id, revoke);
    }
  }

  public async sendPoll(params: {
    chatId: string;
    question: string;
    options: string[];
    multipleChoice?: boolean;
    quiz?: boolean;
    publicVoters?: boolean;
    correctOptionIndex?: number;
    solution?: string;
    topMsgId?: number;
    scheduleDate?: number;
  }): Promise<TelegramMessage | null> {
    const res = await fetch('/api/tg/messages/send-poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create poll.');
    soundEffects.playSend();
    if (data.message) {
      const sent = data.message as TelegramMessage;
      const cur = this.messages[params.chatId] || [];
      if (!cur.some((m) => m.id === sent.id)) {
        this.messages[params.chatId] = [...cur, sent];
      }
      this.notify();
      return sent;
    }
    return null;
  }

  public async votePoll(chatId: string, messageId: string, optionHexes: string[]): Promise<void> {
    const res = await fetch('/api/tg/messages/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId: Number(messageId), optionHexes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Vote failed.');
    soundEffects.playReaction();
    if (data.message) {
      const updated = data.message as TelegramMessage;
      const list = this.messages[chatId] || [];
      this.messages[chatId] = list.map((m) => (m.id === updated.id ? updated : m));
      this.notify();
    }
  }

  public async getScheduledMessages(chatId: string): Promise<TelegramMessage[]> {
    const res = await fetch(`/api/tg/scheduled/${encodeURIComponent(chatId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not fetch scheduled messages.');
    return Array.isArray(data.messages) ? (data.messages as TelegramMessage[]) : [];
  }

  public async sendScheduledNow(chatId: string, ids: number[]): Promise<void> {
    const res = await fetch(`/api/tg/scheduled/${encodeURIComponent(chatId)}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send scheduled message.');
    void this.loadMessages(chatId);
  }

  public async deleteScheduledMessages(chatId: string, ids: number[]): Promise<void> {
    const res = await fetch(`/api/tg/scheduled/${encodeURIComponent(chatId)}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete scheduled message.');
  }

  public async saveDraft(chatId: string, text: string, replyToId?: string): Promise<void> {
    const chatIdx = this.chats.findIndex((c) => c.id === chatId);
    if (chatIdx !== -1) {
      const next = [...this.chats];
      next[chatIdx] = { ...next[chatIdx], draftText: text };
      this.chats = next;
    }
    try {
      await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, replyToId: replyToId ? Number(replyToId) : undefined }),
      });
    } catch {
      // ignore transient network errors
    }
  }

  public async getPinnedMessages(chatId: string): Promise<TelegramMessage[]> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/pins`);
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.pins) ? (data.pins as TelegramMessage[]) : [];
  }

  public async archiveChat(chatId: string, archived: boolean): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update archive status.');
    this.chats = this.chats.map((c) => (c.id === chatId ? { ...c, isArchived: archived } : c));
    soundEffects.playPop();
    this.notify();
  }

  public async loadCloudFolders(): Promise<ChatFolder[]> {
    if (!this.authSession.isConnected) return this.folders;
    try {
      const res = await fetch('/api/tg/folders');
      if (!res.ok) return this.folders;
      const data = await res.json();
      if (Array.isArray(data.folders)) {
        const cloud = data.folders as ChatFolder[];
        const localOnly = this.folders.filter((f) => !f.isCloud);
        const merged = [...DEFAULT_FOLDERS, ...localOnly.filter((l) => !DEFAULT_FOLDERS.some((d) => d.id === l.id)), ...cloud];
        this.folders = merged;
        this.notify();
      }
      return this.folders;
    } catch {
      return this.folders;
    }
  }

  public async saveCloudFolder(params: {
    telegramFilterId?: number;
    name: string;
    includeChatIds?: string[];
    includeContacts?: boolean;
    includeNonContacts?: boolean;
    includeGroups?: boolean;
    includeBroadcasts?: boolean;
    includeBots?: boolean;
    excludeMuted?: boolean;
    excludeArchived?: boolean;
  }): Promise<void> {
    const res = await fetch('/api/tg/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save folder to Telegram.');
    await this.loadCloudFolders();
  }

  public async deleteCloudFolder(filterId: number): Promise<void> {
    const res = await fetch(`/api/tg/folders/${encodeURIComponent(String(filterId))}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not delete Telegram folder.');
    this.folders = this.folders.filter((f) => f.telegramFilterId !== filterId);
    this.notify();
  }

  public async getForumTopics(chatId: string): Promise<ForumTopicItem[]> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/topics`);
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.topics) ? (data.topics as ForumTopicItem[]) : [];
  }

  public async createForumTopic(chatId: string, title: string): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create topic.');
  }

  public async getPostComments(
    chatId: string,
    msgId: string
  ): Promise<{ discussionChatId: string; discussionMsgId: number; messages: TelegramMessage[] }> {
    const res = await fetch(
      `/api/tg/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(msgId)}/comments`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Comments unavailable for this post.');
    return {
      discussionChatId: String(data.discussionChatId || ''),
      discussionMsgId: Number(data.discussionMsgId || 0),
      messages: Array.isArray(data.messages) ? (data.messages as TelegramMessage[]) : [],
    };
  }

  public async sendPostComment(chatId: string, msgId: string, text: string): Promise<TelegramMessage> {
    if (!this.authSession.isConnected) {
      await this.ensureSessionActive();
    }
    const doPost = () =>
      fetch(
        `/api/tg/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(msgId)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      );
    let res = await doPost();
    if (res.status === 401 || res.status === 503) {
      const recovered = await this.ensureSessionActive(true);
      if (recovered) res = await doPost();
    }
    const data = await this.parseJsonSafe(res);
    if (!res.ok || !data.message) throw new Error(String(data.error || 'Could not post comment.'));
    soundEffects.playSend();
    return data.message as TelegramMessage;
  }

  public async setSlowMode(chatId: string, seconds: number): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/slow-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update slow mode.');
  }

  public async updateDefaultPermissions(chatId: string, rights: ChatBannedRightsState): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rights }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update default member permissions.');
  }

  public async getJoinRequests(chatId: string): Promise<JoinRequestItem[]> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/join-requests`);
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.requests) ? (data.requests as JoinRequestItem[]) : [];
  }

  public async decideJoinRequest(chatId: string, userId: string, approved: boolean): Promise<void> {
    const res = await fetch(`/api/tg/chats/${encodeURIComponent(chatId)}/join-requests/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, approved }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not process join request.');
  }

  public async getStickerSets(): Promise<StickerSetSummary[]> {
    const res = await fetch('/api/tg/stickers');
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.sets) ? (data.sets as StickerSetSummary[]) : [];
  }

  public async getGifs(query?: string): Promise<GifItem[]> {
    const qs = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    const res = await fetch(`/api/tg/gifs${qs}`);
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.gifs) ? (data.gifs as GifItem[]) : [];
  }

  public async sendStickerOrGif(
    chatId: string,
    docId: string,
    opts?: { replyToId?: string; topMsgId?: number; scheduleDate?: number }
  ): Promise<TelegramMessage | null> {
    if (!this.authSession.isConnected) {
      await this.ensureSessionActive();
    }
    const doSendDoc = () =>
      fetch('/api/tg/messages/send-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          docId,
          replyToId: opts?.replyToId && /^\d+$/.test(opts.replyToId) ? opts.replyToId : undefined,
          topMsgId: opts?.topMsgId,
          scheduleDate: opts?.scheduleDate,
        }),
      });

    let res = await doSendDoc();
    if (res.status === 401 || res.status === 503) {
      const recovered = await this.ensureSessionActive(true);
      if (recovered) res = await doSendDoc();
    }
    const data = await this.parseJsonSafe(res);
    if (!res.ok) throw new Error(String(data.error || 'Could not send sticker or GIF.'));
    soundEffects.playSend();
    if (data.message) {
      const sent = data.message as TelegramMessage;
      const cur = this.messages[chatId] || [];
      if (!cur.some((m) => m.id === sent.id)) {
        this.messages[chatId] = [...cur, sent];
      }
      this.notify();
      return sent;
    }
    return null;
  }

  public async triggerBotCallback(
    chatId: string,
    messageId: string,
    dataHex: string
  ): Promise<{ message: string; alert: boolean; url: string }> {
    const res = await fetch('/api/tg/messages/bot-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId: Number(messageId), dataHex }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bot callback failed.');
    return {
      message: String(data.message || ''),
      alert: Boolean(data.alert),
      url: String(data.url || ''),
    };
  }

  public async getDeviceSessions(): Promise<DeviceSessionItem[]> {
    const res = await fetch('/api/tg/account/sessions');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load active sessions.');
    return Array.isArray(data.sessions) ? (data.sessions as DeviceSessionItem[]) : [];
  }

  public async terminateDeviceSession(hash: string): Promise<void> {
    const res = await fetch('/api/tg/account/sessions/terminate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not terminate session.');
  }

  public async getBlockedUsers(): Promise<BlockedUserItem[]> {
    const res = await fetch('/api/tg/account/blocked');
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.users) ? (data.users as BlockedUserItem[]) : [];
  }

  public async setUserBlocked(chatId: string, blocked: boolean): Promise<void> {
    const res = await fetch(`/api/tg/contacts/${encodeURIComponent(chatId)}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocked }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update block status.');
    this.chats = this.chats.map((c) => (c.id === chatId ? { ...c, isBlocked: blocked } : c));
    this.notify();
  }

  public async blockUser(userId: string, blocked: boolean): Promise<void> {
    return this.setUserBlocked(userId, blocked);
  }

  public async getContacts(signal?: AbortSignal): Promise<UserProfileInfo[]> {
    const res = await fetch('/api/tg/contacts', { signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load contacts.');
    if (!Array.isArray(data.contacts)) throw new Error('Contact list could not be read. Please retry.');
    return data.contacts;
  }

  public async getUserProfile(
    userId: string,
    chatId?: string,
    fallbackName?: string
  ): Promise<UserProfileInfo> {
    const params = new URLSearchParams();
    if (chatId) params.set('chatId', chatId);
    if (fallbackName) params.set('fallbackName', fallbackName);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/tg/users/${encodeURIComponent(userId)}/profile${qs}`);
    const data = await res.json();
    if (!res.ok || !data.profile) {
      throw new Error(data.error || 'Could not load user profile.');
    }
    return data.profile as UserProfileInfo;
  }

  public ensureDirectChatFromProfile(user: UserProfileInfo): TelegramChat {
    const existing = this.chats.find((c) => c.id === user.id);
    if (existing) return existing;

    const created: TelegramChat = {
      id: user.id,
      title: user.title || user.firstName || 'Telegram User',
      type: user.isBot ? 'bot' : 'user',
      avatarUrl: user.avatarUrl || `/api/tg/avatar/${encodeURIComponent(user.id)}`,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      status: user.status || 'last seen recently',
      username: user.username,
      description: user.about,
      isVerified: user.isVerified,
      isBlocked: user.isBlocked,
      canPostMessages: true,
      canSendMedia: true,
    };
    this.chats = [created, ...this.chats];
    this.notify();
    return created;
  }

  public async getPrivacySettings(): Promise<PrivacySettingItem[]> {
    const res = await fetch('/api/tg/account/privacy');
    const data = await res.json();
    if (!res.ok) return [];
    return Array.isArray(data.privacy) ? (data.privacy as PrivacySettingItem[]) : [];
  }

  public async updatePrivacySetting(key: PrivacyKeyName, level: PrivacyRuleLevel): Promise<void> {
    const res = await fetch('/api/tg/account/privacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, level }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update privacy setting.');
  }

  public async startPhoneCall(chatId: string, isVideo: boolean): Promise<{
    ok: boolean;
    mode: 'telegram-mtproto' | 'webrtc-relay';
    callId: string;
    accessHash?: string;
    state: string;
    mtprotoNotice?: string;
  }> {
    const res = await fetch('/api/tg/calls/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, isVideo }),
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || 'Could not start call.');
    return result;
  }

  public async discardPhoneCall(params: {
    callId?: string;
    accessHash?: string;
    duration?: number;
    isVideo?: boolean;
  }): Promise<void> {
    try {
      await fetch('/api/tg/calls/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch {
      // ignore
    }
  }

  public async getGroupCallInfo(chatId: string): Promise<{
    hasActiveCall: boolean;
    callId?: string;
    title?: string;
    participantsCount?: number;
    scheduledStart?: number;
    participants: Array<{
      id: string;
      name: string;
      avatarUrl?: string;
      muted: boolean;
      raiseHandRating?: number;
    }>;
  }> {
    try {
      const res = await fetch('/api/tg/calls/group/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      });
      if (!res.ok) return { hasActiveCall: false, participants: [] };
      return await res.json();
    } catch {
      return { hasActiveCall: false, participants: [] };
    }
  }

  public async createGroupCall(chatId: string, title?: string): Promise<void> {
    const res = await fetch('/api/tg/calls/group/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, title }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start group voice chat.');
  }
}

export const telegramService = TelegramService.getInstance();
