import { AyuGramSettings, AyuGramDeletedMessageLog } from '../types/ayugram';
import { MediaAttachment, TelegramMessage } from '../types/telegram';

const STORAGE_KEY_AYUGRAM = 'tgplus_ayugram_settings_v4';
const STORAGE_KEY_DELETED_LOGS = 'tgplus_ayugram_deleted_logs_v3';

export const DEFAULT_AYUGRAM_SETTINGS: AyuGramSettings = {
  ghostModeActive: true,
  sendOnlineStatus: false,
  sendReadReceipts: true,
  sendTypingIndicators: false,
  invisibleStories: true,
  markReadOnReply: true,
  sendOfflineAfterAction: true,
  sendWithoutSound: false,

  antiDeleteEnabled: true,
  saveDeletedMedia: true,
  antiEditEnabled: true,
  showDeletedBadge: true,
  showEditedBadge: true,
  deletedMarkText: '🧹 deleted',

  saveDisappearingMedia: true,
  preventTTLExpiration: true,
  autoSaveExpiringToSavedMessages: true,
  markSeenOnTimerClick: false,
  bypassContentRestrictions: true,
  allowScreenshotsSecretChat: true,
  hideForwardTag: true,

  infinitePinnedChats: true,
  speedAccelerator: true,
  localTranslateEnabled: true,
  showMessageSeconds: false,
  hideStoriesStrip: false,
  confirmBeforeCall: true,
  hideSponsoredMessages: true,

  streamerMode: false,

  regexFilterEnabled: false,
  blockedKeywords: ['crypto giveaway', 'free nitro', 'spam link'],
};

export class AyuGramModEngine {
  private static instance: AyuGramModEngine | null = null;
  private settings: AyuGramSettings;
  private deletedLogs: AyuGramDeletedMessageLog[] = [];
  private listeners: Set<(settings: AyuGramSettings) => void> = new Set();

  private constructor() {
    this.settings = this.loadSettings();
    this.deletedLogs = this.loadDeletedLogs();
    void this.syncWithBackend();
  }

  public static getInstance(): AyuGramModEngine {
    if (!AyuGramModEngine.instance) {
      AyuGramModEngine.instance = new AyuGramModEngine();
    }
    return AyuGramModEngine.instance;
  }

  private loadSettings(): AyuGramSettings {
    const saved = localStorage.getItem(STORAGE_KEY_AYUGRAM);
    if (saved) {
      try {
        return { ...DEFAULT_AYUGRAM_SETTINGS, ...JSON.parse(saved) };
      } catch {
        // fallback
      }
    }
    return { ...DEFAULT_AYUGRAM_SETTINGS };
  }

  private loadDeletedLogs(): AyuGramDeletedMessageLog[] {
    const saved = localStorage.getItem(STORAGE_KEY_DELETED_LOGS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return [];
  }

  public getSettings(): AyuGramSettings {
    return this.settings;
  }

  public subscribe(listener: (settings: AyuGramSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async syncWithBackend() {
    try {
      await fetch('/api/tg/ayugram/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          antiDeleteEnabled: this.settings.antiDeleteEnabled,
          saveDeletedMedia: this.settings.saveDeletedMedia,
          antiEditEnabled: this.settings.antiEditEnabled,
          saveDisappearingMedia: this.settings.saveDisappearingMedia,
          preventTTLExpiration: this.settings.preventTTLExpiration,
          autoSaveExpiringToSavedMessages: this.settings.autoSaveExpiringToSavedMessages,
          bypassContentRestrictions: this.settings.bypassContentRestrictions,
          hideForwardTag: this.settings.hideForwardTag,
          ghostModeActive: this.settings.ghostModeActive,
          sendOnlineStatus: this.settings.sendOnlineStatus,
          sendReadReceipts: this.settings.sendReadReceipts,
          sendTypingIndicators: this.settings.sendTypingIndicators,
          invisibleStories: this.settings.invisibleStories,
        }),
      });
    } catch {
      // Offline / server starting
    }
  }

  private notify() {
    localStorage.setItem(STORAGE_KEY_AYUGRAM, JSON.stringify(this.settings));
    localStorage.setItem(STORAGE_KEY_DELETED_LOGS, JSON.stringify(this.deletedLogs));
    this.listeners.forEach((l) => l(this.settings));
    void this.syncWithBackend();
  }

  public updateSetting<K extends keyof AyuGramSettings>(key: K, value: AyuGramSettings[K]) {
    this.settings = { ...this.settings, [key]: value };
    this.notify();
  }

  public resetToDefaults() {
    this.settings = { ...DEFAULT_AYUGRAM_SETTINGS, blockedKeywords: [...DEFAULT_AYUGRAM_SETTINGS.blockedKeywords] };
    this.notify();
  }

  public addBlockedKeyword(word: string) {
    const clean = word.trim().toLowerCase();
    if (!clean || this.settings.blockedKeywords.includes(clean)) return;
    this.settings = {
      ...this.settings,
      blockedKeywords: [...this.settings.blockedKeywords, clean],
    };
    this.notify();
  }

  public removeBlockedKeyword(word: string) {
    this.settings.blockedKeywords = this.settings.blockedKeywords.filter((k) => k !== word);
    this.notify();
  }

  public isMessageFiltered(text: string): boolean {
    if (!this.settings.regexFilterEnabled || !text) return false;
    const lower = text.toLowerCase();
    return this.settings.blockedKeywords.some((kw) => kw && lower.includes(kw.toLowerCase()));
  }

  public maskForStreamer(value: string, type: 'phone' | 'handle' = 'phone'): string {
    if (!this.settings.streamerMode || !value) return value;
    if (type === 'phone') {
      return value.length > 6 ? `${value.slice(0, 4)} ••••• ${value.slice(-2)}` : '••• ••••';
    }
    return value.startsWith('@') ? '@hidden_user' : 'Hidden';
  }

  public translateMessageText(text: string): string {
    if (!text.trim()) return text;
    if (/\b(kya|hai|bhai|kaise|aaya|karo|gaya|nahi|yaar|sunn|acha|theek)\b/i.test(text)) {
      return text
        .replace(/\bbhai\b/gi, 'bro')
        .replace(/\bkya\b/gi, 'what')
        .replace(/\bkaise\b/gi, 'how')
        .replace(/\bkaro\b/gi, 'do')
        .replace(/\bhai\b/gi, 'is')
        .replace(/\bnahi\b/gi, 'no')
        .replace(/\bacha\b/gi, 'good')
        .replace(/\btheek\b/gi, 'okay');
    }
    return text;
  }

  public setDeletedLogsFromServer(logs: AyuGramDeletedMessageLog[]) {
    if (!Array.isArray(logs)) return;
    this.deletedLogs = logs;
    localStorage.setItem(STORAGE_KEY_DELETED_LOGS, JSON.stringify(this.deletedLogs));
    this.listeners.forEach((l) => l(this.getSettings()));
  }

  public logDeletedMessage(msg: TelegramMessage) {
    if (!this.settings.antiDeleteEnabled) return;
    if (this.deletedLogs.some((l) => l.originalMessageId === msg.id && l.chatId === msg.chatId)) return;

    const log: AyuGramDeletedMessageLog = {
      id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      chatId: msg.chatId,
      originalMessageId: msg.id,
      senderName: msg.senderName,
      text: msg.text,
      mediaUrl: msg.media?.url,
      mediaType: msg.media?.type,
      deletedAt: Date.now(),
    };
    this.deletedLogs.unshift(log);
    if (this.deletedLogs.length > 100) {
      this.deletedLogs = this.deletedLogs.slice(0, 100);
    }
    this.notify();
  }

  public getDeletedLogs(): AyuGramDeletedMessageLog[] {
    return [...this.deletedLogs];
  }

  public async clearDeletedLogs() {
    this.deletedLogs = [];
    localStorage.setItem(STORAGE_KEY_DELETED_LOGS, '[]');
    try {
      await fetch('/api/tg/vault/clear-deleted', { method: 'POST' });
    } catch {
      // ignore
    }
    this.listeners.forEach((l) => l(this.getSettings()));
  }

  public exportDeletedLogsAsJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      deletedMessages: this.deletedLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ayugram_vault_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public downloadMedia(media: MediaAttachment, customFileName?: string): boolean {
    try {
      const ext =
        media.type === 'video' ? '.mp4' : media.type === 'voice' ? '.ogg' : '.jpg';
      const fallbackName = `tgplus_${media.type}_${Date.now()}${ext}`;
      const downloadUrl = media.url.startsWith('/api/tg/media/')
        ? `${media.url}${media.url.includes('?') ? '&' : '?'}download=1`
        : media.url;

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = customFileName || media.fileName || fallbackName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (err) {
      console.warn('Download error:', err);
      return false;
    }
  }
}

export const ayuGramEngine = AyuGramModEngine.getInstance();
import { appFetch as fetch } from './appTransport';
