import { NewMessageDialog } from './NewMessageDialog';
import { TelegramNavigationMenu } from './TelegramNavigationMenu';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
  Search,
  X,
  Pin,
  Check,
  CheckCheck,
  Shield,
  CheckCircle2,
  MessageSquare,
  Radio,
  FolderArchive,
  Trash2,
  EyeOff,
  Eye,
  VolumeX,
  Volume2,
  QrCode,
  ShieldCheck,
  Link2,
  Loader2,
  Globe,
  Archive,
  ArchiveRestore,
  FolderCog,
  ChevronDown,
  Menu,
  Edit2,
  Users,
  User,
  Bookmark,
  Settings,
  Moon,
  ArrowLeft,
  Mail,
  MailOpen,
  MoreVertical,
  Phone,
  Palette,
  Sun,
  Copy,
  UserPlus,
} from 'lucide-react';
import { TelegramChat, ChatFolder, GlobalSearchResult, TelegramUser } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { modSettingsStore } from '../../services/modSettingsStore';
import { voiceChanger } from '../../services/voiceChangerEngine';
import { AyuGramSettings } from '../../types/ayugram';
import { SearchResults } from '../chat/SearchResults';
import type { MessageSearchHit } from '../../types/telegram';
import { Avatar } from '../common/Avatar';

export type BottomNavTab = 'chats' | 'channels' | 'vault' | 'settings' | 'deleted' | 'contacts' | 'you';

interface Props {
  chats: TelegramChat[];
  currentUser?: TelegramUser;
  isConnected: boolean;
  isLoadingDialogs?: boolean;
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onOpenSearchMessage: (hit: MessageSearchHit) => Promise<void>;
  onOpenChatByLink?: (link: string) => Promise<void> | void;
  onCreateChat?: (initialMode?: 'group' | 'channel') => void;
  folders: ChatFolder[];
  activeFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onOpenFolderManager?: () => void;
  onOpenModSettings: () => void;
  onOpenAyuGramSettings: () => void;
  onOpenLoginModal: () => void;
  onOpenMyProfile?: () => void;
  onOpenCallsHub?: () => void;
  onOpenData?: () => void;
  onOpenCategory?: (category: "privacy" | "devices" | "notifications") => void;
  onPowerSaving?: () => void;
  powerSaving?: boolean;
  onLogout?: () => Promise<void>;
  onOpenVoiceStudio?: () => void;
  activeBottomTab: BottomNavTab;
  onSelectBottomTab: (tab: BottomNavTab) => void;
}

const HIDE_ARCHIVED_KEY = 'webygram_hide_archived_bar';

export const ChatList: React.FC<Props> = React.memo(({
  chats,
  currentUser,
  isConnected,
  isLoadingDialogs = false,
  selectedChatId,
  onSelectChat,
  onOpenSearchMessage,
  onOpenChatByLink,
  onCreateChat,
  folders,
  activeFolderId,
  onSelectFolder,
  onOpenFolderManager,
  onOpenModSettings,
  onOpenAyuGramSettings,
  onOpenLoginModal,
  onOpenMyProfile,
  onOpenCallsHub,
  onOpenData, onOpenCategory, onPowerSaving, powerSaving, onLogout,
  onOpenVoiceStudio,
  activeBottomTab,
  onSelectBottomTab,
}) => {
  const preferences = modSettingsStore.getSettings();
  const telegramNavigation = preferences.navigationStyle === 'telegram' || (preferences.navigationStyle === 'auto' && !modSettingsStore.getActivePaletteTokens().id.startsWith('flow-'));
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [contextMenuChatId, setContextMenuChatId] = useState<string | null>(null);
  const [isArchiveViewOpen, setIsArchiveViewOpen] = useState(false);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [showArchiveSearch, setShowArchiveSearch] = useState(false);
  const [showArchiveHeaderMenu, setShowArchiveHeaderMenu] = useState(false);
  const [hideArchivedAboveList, setHideArchivedAboveList] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_ARCHIVED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showHamburgerDrawer, setShowHamburgerDrawer] = useState(false);
  const [drawerAccountExpanded, setDrawerAccountExpanded] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [showPencilMenu, setShowPencilMenu] = useState(false);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [newMessageQuery, setNewMessageQuery] = useState('');
  const [isOpeningDirect, setIsOpeningDirect] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(voiceChanger.getState().enabled);

  const [ayuSettings, setAyuSettings] = useState<AyuGramSettings>(ayuGramEngine.getSettings());
  const [isDarkTheme, setIsDarkTheme] = useState(modSettingsStore.getSettings().themeMode !== 'light');
  const [vaultCount, setVaultCount] = useState(telegramService.getVaultItems().length);
  const [deletedCount, setDeletedCount] = useState(
    ayuGramEngine.getDeletedLogs().length + telegramService.getDeletedChats().length
  );

  useEffect(() => {
    const syncCounts = () => {
      setVaultCount(telegramService.getVaultItems().length);
      setDeletedCount(
        ayuGramEngine.getDeletedLogs().length + telegramService.getDeletedChats().length
      );
    };
    const unsubAyu = ayuGramEngine.subscribe((s) => {
      setAyuSettings(s);
      syncCounts();
    });
    const unsubTg = telegramService.subscribe(syncCounts);
    const unsubMod = modSettingsStore.subscribe((m) => setIsDarkTheme(m.themeMode !== 'light'));
    const unsubVoice = voiceChanger.subscribe((v) => setVoiceEnabled(v.enabled));
    return () => {
      unsubAyu();
      unsubTg();
      unsubMod();
      unsubVoice();
    };
  }, []);

  useEscapeDismiss(showSearchBar || Boolean(searchQuery), () => { setSearchQuery(''); setShowSearchBar(false); });
  useEscapeDismiss(isArchiveViewOpen, () => { setIsArchiveViewOpen(false); setShowArchiveSearch(false); setArchiveSearchQuery(''); });
  useEscapeDismiss(showNewMessageModal, () => setShowNewMessageModal(false));
  useEscapeDismiss(Boolean(contextMenuChatId || showPencilMenu || showArchiveHeaderMenu || showHamburgerDrawer), () => {
    setContextMenuChatId(null); setShowPencilMenu(false); setShowArchiveHeaderMenu(false); setShowHamburgerDrawer(false);
  });
  useEffect(() => {
    if (!contextMenuChatId && !showPencilMenu && !showArchiveHeaderMenu && !showHamburgerDrawer) return;
    const close = () => {
      setContextMenuChatId(null);
      setShowPencilMenu(false);
      setShowArchiveHeaderMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuChatId(null);
        setShowPencilMenu(false);
        setShowArchiveHeaderMenu(false);
        setShowHamburgerDrawer(false);
      }
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenuChatId, showPencilMenu, showArchiveHeaderMenu, showHamburgerDrawer]);

  const toggleHideArchivedAboveList = useCallback(() => {
    setHideArchivedAboveList((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HIDE_ARCHIVED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) || folders[0],
    [folders, activeFolderId]
  );

  const totalUnread = useMemo(
    () =>
      chats
        .filter((c) => !c.isDeletedChat && !c.isArchived)
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [chats]
  );

  const archivedChats = useMemo(
    () =>
      chats
        .filter((c) => c.isArchived && !c.isDeletedChat)
        .sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0);
        }),
    [chats]
  );

  const archivedUnread = useMemo(
    () => archivedChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [archivedChats]
  );

  const archivedUnmutedUnread = useMemo(
    () => archivedChats.filter((c) => !c.isMuted).reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [archivedChats]
  );

  const archivedPreviewNames = useMemo(() => {
    if (archivedChats.length === 0) return '';
    return archivedChats
      .slice(0, 6)
      .map((c) =>
        ayuSettings.streamerMode && c.type === 'user'
          ? ayuGramEngine.maskForStreamer(c.title, 'handle')
          : c.title
      )
      .join(', ');
  }, [archivedChats, ayuSettings.streamerMode]);

  const filteredArchivedChats = useMemo(() => {
    const q = archiveSearchQuery.trim().toLowerCase();
    if (!q) return archivedChats;
    return archivedChats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.lastMessage?.text?.toLowerCase().includes(q)
    );
  }, [archivedChats, archiveSearchQuery]);

  const matchesFolder = useCallback((chat: TelegramChat, folder?: ChatFolder): boolean => {
    if (!folder || folder.filter === 'all') return !chat.isArchived;
    if (folder.filter === 'personal') {
      return !chat.isArchived && (chat.type === 'user' || chat.type === 'saved');
    }
    if (folder.filter === 'groups') return !chat.isArchived && chat.type === 'group';
    if (folder.filter === 'channels') return !chat.isArchived && chat.type === 'channel';

    if (folder.excludeChatIds?.includes(chat.id)) return false;
    if (folder.excludeMuted && chat.isMuted) return false;
    if (folder.excludeArchived !== false && chat.isArchived) return false;
    if (folder.includeChatIds?.includes(chat.id)) return true;

    const hasTypeFlags = Boolean(
      folder.includeContacts ||
        folder.includeNonContacts ||
        folder.includeGroups ||
        folder.includeBroadcasts ||
        folder.includeBots
    );
    if (!hasTypeFlags) {
      return (folder.includeChatIds?.length || 0) === 0 ? !chat.isArchived : false;
    }
    if (chat.type === 'user' && (folder.includeContacts || folder.includeNonContacts)) return true;
    if (chat.type === 'group' && folder.includeGroups) return true;
    if (chat.type === 'channel' && folder.includeBroadcasts) return true;
    if (chat.type === 'bot' && folder.includeBots) return true;
    return false;
  }, []);

  const sortedChats = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const filtered = q
      ? chats.filter(
          (chat) =>
            chat.title.toLowerCase().includes(q) ||
            chat.username?.toLowerCase().includes(q) ||
            chat.lastMessage?.text.toLowerCase().includes(q)
        )
      : chats.filter((chat) => matchesFolder(chat, activeFolder));

    return [...filtered].sort((a, b) => {
      if (a.type === 'saved' && b.type !== 'saved') return -1;
      if (b.type === 'saved' && a.type !== 'saved') return 1;
      if (!a.isDeletedChat && b.isDeletedChat) return -1;
      if (a.isDeletedChat && !b.isDeletedChat) return 1;
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0);
    });
  }, [chats, deferredSearch, activeFolder, matchesFolder]);

  const folderStats = useMemo(() => {
    const map: Record<string, { unread: number; hasUnmutedUnread: boolean }> = {};
    for (const f of folders) {
      let unread = 0;
      let hasUnmutedUnread = false;
      for (const c of chats) {
        if (c.isDeletedChat) continue;
        if (!matchesFolder(c, f)) continue;
        const cUnread = c.unreadCount || 0;
        if (cUnread > 0) {
          unread += cUnread;
          if (!c.isMuted) hasUnmutedUnread = true;
        }
      }
      map[f.id] = { unread, hasUnmutedUnread };
    }
    return map;
  }, [folders, chats, matchesFolder]);

  const formatTimestamp = useCallback((ts?: number) => {
    if (!ts) return '';
    const now = new Date();
    const date = new Date(ts);
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, []);

  const externalGlobalResults = useMemo(() => {
    const localChatIds = new Set(chats.map((c) => c.id));
    return globalResults.filter((r) => !localChatIds.has(r.id));
  }, [chats, globalResults]);

  const userSession = currentUser || telegramService.getAuthSession().user;
  const userFullName =
    [userSession?.firstName, userSession?.lastName].filter(Boolean).join(' ') || 'Telegram User';
  const personalUsers = useMemo(
    () => chats.filter((c) => c.type === 'user' && !c.isDeletedChat),
    [chats]
  );

  const toggleNightMode = () => {
    const nextTheme = isDarkTheme ? 'light' : 'dark';
    modSettingsStore.updateSetting('themeMode', nextTheme);
    setIsDarkTheme(nextTheme === 'dark');
  };

  const renderChatRow = (chat: TelegramChat, inArchive = false) => {
    const isSelected = selectedChatId === chat.id;
    const typingText = telegramService.getTypingStatus(chat.id);
    const displayTitle =
      ayuSettings.streamerMode && chat.type === 'user'
        ? ayuGramEngine.maskForStreamer(chat.title, 'handle')
        : chat.title;

    const showGroupSender =
      chat.type === 'group' &&
      chat.lastMessage?.senderName &&
      !chat.lastMessage.isOutgoing;

    return (
      <div
        key={chat.id}
        onClick={() => {
          onSelectChat(chat.id);
          if (!chat.isDeletedChat) {
            void telegramService.markChatAsRead(chat.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenuChatId(contextMenuChatId === chat.id ? null : chat.id);
        }}
        aria-current={isSelected ? 'true' : undefined}
        role="button"
        tabIndex={0}
        onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectChat(chat.id); } }}
        className={`tg-chat-row group relative px-3.5 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
          chat.isDeletedChat ? 'opacity-70' : ''
        } ${
          isSelected
            ? 'bg-blue-50 dark:bg-elevated/55'
            : 'hover:bg-hover dark:hover:bg-hover'
        }`}
      >
        {/* Avatar */}
        <Avatar
          src={chat.avatarUrl}
          title={displayTitle}
          id={chat.id}
          size="md"
          isSaved={chat.type === 'saved'}
          isOnline={!chat.isDeletedChat && chat.type === 'user' && chat.status === 'online'}
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5 gap-2">
            <div className="flex items-center gap-1 truncate">
              <span className="text-[14px] font-semibold text-ink dark:text-ink truncate">
                {displayTitle}
              </span>
              {chat.isVerified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-primary fill-primary/20 shrink-0" />
              )}
              {chat.isProtected && <Shield className="w-3 h-3 text-amber-500 shrink-0" />}
              {chat.isMuted && <VolumeX className="w-3 h-3 text-muted dark:text-muted shrink-0" />}
            </div>
            <div className="flex items-center gap-1 shrink-0 tabular-nums">
              {chat.lastMessage?.isOutgoing && !chat.isDeletedChat && (
                <span className="shrink-0">
                  {chat.lastMessage.isRead ? (
                    <CheckCheck className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-muted dark:text-muted" />
                  )}
                </span>
              )}
              {chat.isDeletedChat && (
                <span className="text-[10.5px] font-medium text-rose-500 dark:text-rose-400">
                  Deleted ·
                </span>
              )}
              <span className="text-[11px] text-muted dark:text-muted">
                {formatTimestamp(chat.deletedAt || chat.lastMessage?.timestamp)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1 text-muted dark:text-muted truncate">
              {typingText && !chat.isDeletedChat ? (
                <span className="text-primary font-semibold truncate">{typingText}</span>
              ) : chat.draftText && !chat.isDeletedChat ? (
                <span className="truncate text-[12.5px]">
                  <span className="text-rose-500 font-semibold mr-1">Draft:</span>
                  <span>{chat.draftText}</span>
                </span>
              ) : (
                <span className="truncate text-[12.5px]">
                  {showGroupSender && (
                    <span className="text-ink dark:text-ink font-medium mr-1">
                      {chat.lastMessage?.senderName}:
                    </span>
                  )}
                  {chat.lastMessage?.isOutgoing && chat.type === 'group' && (
                    <span className="text-primary font-medium mr-1">You:</span>
                  )}
                  <span>{chat.lastMessage?.text || 'No messages'}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {inArchive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void telegramService.archiveChat(chat.id, false);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted hover:text-primary hover:bg-hover/70 dark:hover:bg-hover transition-opacity cursor-pointer"
                  title="Unarchive Chat"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" />
                </button>
              )}
              {chat.isPinned && !chat.isDeletedChat && (!chat.unreadCount || chat.unreadCount === 0) && (
                <Pin className="w-3.5 h-3.5 text-muted dark:text-muted rotate-45" />
              )}
              {!chat.isDeletedChat && chat.unreadCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-white font-bold text-[10.5px] rounded-full min-w-5 text-center tabular-nums ${
                    chat.isMuted ? 'bg-surface dark:bg-elevated' : 'bg-primary'
                  }`}
                >
                  {chat.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Context Menu */}
        {contextMenuChatId === chat.id && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-tg-pop-in absolute right-3 top-10 z-40 w-48 bg-surface dark:bg-surface border border-outline dark:border-outline rounded-xl shadow-2xl py-1 text-xs text-ink dark:text-ink"
          >
            {chat.isDeletedChat ? (
              <button
                type="button"
                onClick={() => {
                  void telegramService.removeDeletedChatFromArchive(chat.id);
                  setContextMenuChatId(null);
                }}
                className="w-full px-3 py-1.5 text-left text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove from Archive</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    telegramService.togglePinChat(chat.id);
                    setContextMenuChatId(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2.5 cursor-pointer"
                >
                  <Pin className="w-3.5 h-3.5 text-primary" />
                  <span>{chat.isPinned ? 'Unpin' : 'Pin to Top'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    telegramService.toggleMuteChat(chat.id);
                    setContextMenuChatId(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2.5 cursor-pointer"
                >
                  {chat.isMuted ? (
                    <Volume2 className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-muted" />
                  )}
                  <span>{chat.isMuted ? 'Unmute' : 'Mute Notifications'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if ((chat.unreadCount || 0) > 0) {
                      void telegramService.markChatAsRead(chat.id, true);
                    } else {
                      void telegramService.markChatUnread(chat.id, true);
                    }
                    setContextMenuChatId(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2.5 cursor-pointer"
                >
                  {(chat.unreadCount || 0) > 0 ? (
                    <>
                      <MailOpen className="w-3.5 h-3.5 text-primary" />
                      <span>Mark as Read</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      <span>Mark as Unread</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void telegramService.archiveChat(chat.id, !chat.isArchived);
                    setContextMenuChatId(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2.5 cursor-pointer"
                >
                  {chat.isArchived ? (
                    <ArchiveRestore className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Archive className="w-3.5 h-3.5 text-muted" />
                  )}
                  <span>{chat.isArchived ? 'Unarchive Chat' : 'Archive Chat'}</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-surface dark:bg-surface border-r border-outline dark:border-outline flex flex-col select-none relative z-10 shrink-0 text-ink dark:text-ink">
      {isArchiveViewOpen ? (
        <div className="flex-1 flex flex-col min-h-0 animate-tg-slide-right">
          {/* Dedicated Official Telegram Archived Chats Slide-In Panel */}
          <div className="px-3.5 pt-3 pb-2.5 flex items-center justify-between gap-2 bg-surface dark:bg-surface border-b border-outline dark:border-outline">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setIsArchiveViewOpen(false);
                  setShowArchiveSearch(false);
                  setArchiveSearchQuery('');
                }}
                className="p-1.5 -ml-1 rounded-full text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                title="Back to All Chats"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="font-bold text-[16px] leading-tight text-ink dark:text-ink truncate">
                  Archived Chats
                </h2>
                <p className="text-[11px] text-muted dark:text-muted tabular-nums">
                  {archivedChats.length} {archivedChats.length === 1 ? 'chat' : 'chats'}
                  {archivedUnread > 0 ? ` · ${archivedUnread} unread` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowArchiveSearch((prev) => !prev)}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  showArchiveSearch || archiveSearchQuery
                    ? 'text-primary bg-primary/10'
                    : 'text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-hover dark:hover:bg-hover'
                }`}
                title="Search archived chats"
              >
                <Search className="w-4.5 h-4.5" />
              </button>
              {archivedUnread > 0 && (
                <button
                  type="button"
                  onClick={() => void telegramService.markAllArchivedRead()}
                  className="p-1.5 rounded-full text-muted dark:text-muted hover:text-primary hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                  title="Mark all archived chats as read"
                >
                  <CheckCheck className="w-4.5 h-4.5" />
                </button>
              )}

            </div>
          </div>

          {(showArchiveSearch || archiveSearchQuery) && (
            <div className="px-3.5 py-2 bg-surface dark:bg-surface border-b border-outline dark:border-outline">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated dark:bg-elevated border border-outline/80 dark:border-outline">
                <Search className="w-4 h-4 text-muted dark:text-muted shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search archived chats..."
                  value={archiveSearchQuery}
                  onChange={(e) => setArchiveSearchQuery(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-xs text-ink dark:text-ink placeholder-muted dark:placeholder-muted focus:outline-none"
                />
                {archiveSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setArchiveSearchQuery('')}
                    className="text-muted hover:text-ink dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="tg-dialog-list tg-scroll-smooth flex-1 min-h-0 overflow-y-auto divide-y divide-outline dark:divide-outline/70 bg-surface dark:bg-surface">
            {filteredArchivedChats.length === 0 ? (
              <div className="p-8 text-center space-y-2.5 text-muted dark:text-muted">
                <div className="w-14 h-14 rounded-full bg-elevated dark:bg-elevated flex items-center justify-center mx-auto text-muted dark:text-muted">
                  <Archive className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-ink dark:text-ink">
                  {archiveSearchQuery ? 'No archived chats match search' : 'No Archived Chats'}
                </p>
                <p className="text-[11px] max-w-[220px] mx-auto leading-relaxed">
                  Right-click any chat and choose Archive Chat to move it out of your main list.
                </p>
              </div>
            ) : (
              filteredArchivedChats.map((arch) => renderChatRow(arch, true))
            )}
          </div>
        </div>
      ) : (
        <>
          {telegramNavigation && <header className="tg-telegram-list-header tg-next-header">
            <button type="button" aria-label={searchQuery || showSearchBar ? "Back to chats" : "Open account menu"} aria-expanded={showHamburgerDrawer} className="tg-icon-button tg-header-avatar" onClick={() => { if (searchQuery || showSearchBar) { setSearchQuery(""); setShowSearchBar(false); } else setShowHamburgerDrawer(true); }}>
              {searchQuery || showSearchBar ? <ArrowLeft /> : <Avatar src={currentUser?.avatarUrl} title={currentUser?.firstName || "You"} id={currentUser?.id || "me"} size="sm" />}
            </button>
            {showSearchBar || searchQuery ? <label className="tg-telegram-search"><Search className="w-5 h-5 shrink-0" /><input autoFocus type="search" aria-label="Search Telegram" placeholder="Search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></label> : <h1>Webygram</h1>}
            {isLoadingDialogs && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            {!showSearchBar && !searchQuery && <><button type="button" aria-label="Search Telegram" className="tg-icon-button" onClick={() => setShowSearchBar(true)}><Search /></button><button type="button" aria-label="Change appearance" className="tg-icon-button" onClick={onOpenModSettings}><Palette /></button></>}
          </header>}
          {!telegramNavigation && <>
          {/* Optional Flow header */}
          <div className="tg-list-header px-3.5 pt-3 pb-2 flex items-center justify-between gap-2 bg-surface dark:bg-surface">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setShowHamburgerDrawer(true)}
                className="p-2 -ml-1.5 rounded-full text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-hover dark:hover:bg-hover active:scale-90 cursor-pointer transition-all duration-150"
                title="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-bold text-[18px] tracking-tight text-ink dark:text-ink truncate">
                Webygram
              </span>
              {isLoadingDialogs && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => ayuGramEngine.updateSetting('ghostModeActive', !ayuSettings.ghostModeActive)}
                className={`p-1.5 rounded-full active:scale-90 transition-all duration-150 cursor-pointer ${
                  ayuSettings.ghostModeActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-hover dark:hover:bg-hover'
                }`}
                title={ayuSettings.ghostModeActive ? 'Ghost Mode Active' : 'Toggle Ghost Mode'}
              >
                {ayuSettings.ghostModeActive ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>

              {!isConnected && (
                <button
                  type="button"
                  onClick={onOpenLoginModal}
                  className="px-2.5 py-1 rounded-full bg-primary hover:bg-primary-hover active:scale-95 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all duration-150"
                >
                  <QrCode className="w-3 h-3" />
                  <span>Sign In</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowSearchBar((prev) => !prev)}
                className={`p-1.5 rounded-full active:scale-90 transition-all duration-150 cursor-pointer ${
                  showSearchBar || searchQuery
                    ? 'text-primary bg-primary/10'
                    : 'text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-hover dark:hover:bg-hover'
                }`}
                title="Search Telegram"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Expandable or Active Search Input Bar */}
          {(showSearchBar || searchQuery) && (
            <div className="px-3.5 pb-2 bg-surface dark:bg-surface animate-tg-pop-in">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated dark:bg-elevated border border-outline/80 dark:border-outline focus-within:border-primary/60 transition-colors">
                <Search className="w-4 h-4 text-muted dark:text-muted shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search messages, people and chats"
                  aria-label="Search Telegram"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-xs text-ink dark:text-ink placeholder-muted dark:placeholder-muted focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-muted hover:text-ink dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          </>}
          {/* Telegram folder tabs */}
          <div className={`tg-folder-tabs px-3 py-2 bg-canvas items-center gap-2 overflow-x-auto no-scrollbar ${showSearchBar || searchQuery ? 'hidden' : 'flex'}`}>
            {folders.map((f) => {
              const isActive = activeFolderId === f.id;
              const stats = folderStats[f.id] || { unread: 0, hasUnmutedUnread: false };
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onSelectFolder(f.id)}
                  aria-pressed={isActive}
                  className={`relative px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap shrink-0 transition-all duration-150 active:scale-96 cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'text-primary'
                      : 'text-muted dark:text-muted hover:text-ink dark:hover:text-white'
                  }`}
                >
                  <span>{f.name === 'Chats' ? 'Personal' : f.name}</span>
                  {stats.unread > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-bold tabular-nums leading-4 ${
                        isActive || stats.hasUnmutedUnread
                          ? 'bg-primary text-white'
                          : 'bg-elevated dark:bg-elevated text-muted dark:text-muted'
                      }`}
                    >
                      {stats.unread > 99 ? '99+' : stats.unread}
                    </span>
                  )}
                </button>
              );
            })}
            {isConnected && onOpenFolderManager && (
              <button
                type="button"
                onClick={onOpenFolderManager}
                className="p-2 ml-auto text-muted hover:text-primary rounded-lg hover:bg-hover dark:hover:bg-hover shrink-0 cursor-pointer transition-colors"
                title="Manage Cloud Folders"
              >
                <FolderCog className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Chat List Rows + Skeleton Shimmer + Global Search */}
          {(showSearchBar || searchQuery.trim()) && isConnected ? <SearchResults query={searchQuery} chats={chats} accountId={currentUser?.id || ''} onSelectChat={onSelectChat} onOpenPeer={peer => onOpenChatByLink?.(peer.username ? '@' + peer.username : peer.id)} onOpenMessage={onOpenSearchMessage} /> : (
          <div className="tg-dialog-list tg-scroll-smooth flex-1 min-h-0 overflow-y-auto divide-y divide-outline dark:divide-outline/70 bg-surface dark:bg-surface">
            {isConnected &&
              onOpenChatByLink &&
              /^(?:@|https?:\/\/(?:t\.me|telegram\.me)\/|t\.me\/|telegram\.me\/)/i.test(searchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => void onOpenChatByLink(searchQuery.trim())}
                  className="w-full px-3.5 py-2.5 flex items-center gap-3 bg-primary/10 hover:bg-primary/15 text-left cursor-pointer transition-colors"
                >
                  <div className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-primary truncate">
                      Open / Join {searchQuery.trim()}
                    </p>
                    <p className="text-[11px] text-muted dark:text-muted truncate">
                      Resolve Telegram username, group, or invite link
                    </p>
                  </div>
                </button>
              )}

            {!isConnected ? (
              <div className="p-6 text-center space-y-3 mt-6">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center mx-auto shadow-lg">
                  <svg className="w-9 h-9 fill-current mr-0.5" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.63 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 4-1.74 6.72-2.92 8.16-3.55 3.88-1.7 4.69-1.99 5.22-2 .12 0 .38.03.55.17.14.12.18.28.2.45-.02.07-.02.24-.04.4z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-ink dark:text-ink">Webygram</h3>
                <p className="text-xs text-muted dark:text-muted leading-relaxed max-w-[240px] mx-auto">
                  The world&apos;s fastest messaging app. Scan a QR code with your phone to start messaging.
                </p>
                <button
                  type="button"
                  onClick={onOpenLoginModal}
                  className="px-5 py-2.5 rounded-full bg-primary hover:bg-primary-hover text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 shadow-md"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Start Messaging</span>
                </button>
              </div>
            ) : isLoadingDialogs && sortedChats.length === 0 ? (
              <div className="divide-y divide-outline dark:divide-outline/60">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <div key={n} className="px-3.5 py-3 flex items-center gap-3 animate-pulse">
                    <div className="w-12 h-12 rounded-full bg-elevated dark:bg-elevated shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-3.5 w-28 rounded bg-elevated dark:bg-elevated" />
                        <div className="h-2.5 w-10 rounded bg-elevated dark:bg-elevated" />
                      </div>
                      <div className="h-3 w-44 rounded bg-elevated dark:bg-elevated" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedChats.length === 0 && archivedChats.length === 0 && externalGlobalResults.length === 0 && !isSearchingGlobal ? (
              <div className="p-6 text-center text-xs text-muted dark:text-muted">
                No conversations match this filter.
              </div>
            ) : (
              <>
                {/* Official Telegram Pinned Archived Chats Entry Row */}
                {!searchQuery.trim() &&
                  archivedChats.length > 0 && (
                    <div
                      onClick={() => setIsArchiveViewOpen(true)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowArchiveHeaderMenu((prev) => !prev);
                      }}
                      role="button" tabIndex={0} aria-label="Open archived chats" onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsArchiveViewOpen(true); } }}
                      className="tg-chat-row tg-archive-entry group relative px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            archivedUnmutedUnread > 0
                              ? 'bg-primary text-white'
                              : 'bg-surface/90 dark:bg-elevated text-ink dark:text-muted'
                          }`}
                        >
                          <Archive className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[14px] font-semibold text-ink dark:text-ink truncate">
                              Archived Chats
                            </p>
                            <span className="text-[11px] text-muted dark:text-muted shrink-0 tabular-nums">
                              {archivedChats.length}
                            </span>
                          </div>
                          <p className="text-[12.5px] text-muted dark:text-muted truncate mt-0.5">
                            {archivedPreviewNames || `${archivedChats.length} archived chats`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowArchiveHeaderMenu((prev) => !prev);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-full text-muted hover:text-ink dark:hover:text-white hover:bg-hover/70 dark:hover:bg-hover transition-opacity cursor-pointer"
                          title="Archive Options"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {archivedUnread > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-white text-[10.5px] font-bold min-w-5 text-center tabular-nums ${
                              archivedUnmutedUnread > 0
                                ? 'bg-primary'
                                : 'bg-surface dark:bg-elevated'
                            }`}
                          >
                            {archivedUnread}
                          </span>
                        )}
                      </div>

                      {showArchiveHeaderMenu && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-3 top-11 z-40 w-48 bg-surface dark:bg-surface border border-outline dark:border-outline rounded-xl shadow-2xl py-1 text-xs text-ink dark:text-ink"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setShowArchiveHeaderMenu(false);
                              setIsArchiveViewOpen(true);
                            }}
                            className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2.5 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5 text-primary" />
                            <span>Open Archive</span>
                          </button>
                          {archivedUnread > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowArchiveHeaderMenu(false);
                                void telegramService.markAllArchivedRead();
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2.5 cursor-pointer"
                            >
                              <CheckCheck className="w-3.5 h-3.5 text-primary" />
                              <span>Mark All as Read</span>
                            </button>
                          )}

                        </div>
                      )}
                    </div>
                  )}

                {sortedChats.map((chat) => renderChatRow(chat, false))}

                {/* Global Telegram Search Matches */}
                {searchQuery.trim().length >= 2 && (isSearchingGlobal || externalGlobalResults.length > 0) && (
                  <div className="bg-surface-low/70 dark:bg-canvas">
                    <div className="px-3.5 py-2 flex items-center justify-between text-[11px] font-semibold text-muted dark:text-muted">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-primary" />
                        <span>Global Telegram Search</span>
                      </span>
                      {isSearchingGlobal && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    </div>
                    {externalGlobalResults.map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => {
                          if (onOpenChatByLink) {
                            void onOpenChatByLink(res.username ? `@${res.username}` : res.id);
                          }
                        }}
                        className="tg-chat-row w-full px-3.5 py-2.5 flex items-center gap-3 hover:bg-hover dark:hover:bg-hover text-left cursor-pointer transition-colors"
                      >
                        <Avatar src={res.avatarUrl} title={res.title} id={res.id} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[13px] font-semibold truncate">{res.title}</span>
                            {res.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </div>
                          <p className="text-[11px] text-muted dark:text-muted truncate tabular-nums">
                            {res.username ? `@${res.username}` : res.type}
                            {res.memberCount ? ` · ${res.memberCount.toLocaleString()} members` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>)}
        </>
      )}

      {isConnected && <div className="tg-new-message-fab absolute bottom-5 right-4 z-30">
        <button type="button" aria-label="New message" title="New message" className="tg-compose-fab" onClick={() => { setNewMessageQuery(''); setDirectError(null); setShowNewMessageModal(true); }}><Edit2 /></button>
      </div>}

      {showHamburgerDrawer && telegramNavigation && <TelegramNavigationMenu
        user={userSession} name={userFullName} isConnected={isConnected} night={isDarkTheme}
        onClose={() => setShowHamburgerDrawer(false)} onProfile={() => onOpenMyProfile?.()}
        onNewGroup={() => onCreateChat?.('group')} onNewChannel={() => onCreateChat?.('channel')}
        onContacts={() => onSelectBottomTab('contacts')}
        onCalls={() => onOpenCallsHub?.()} onSaved={() => { const saved = chats.find(c => c.type === 'saved'); if (saved) onSelectChat(saved.id); else onOpenChatByLink?.('me'); }}
        onArchive={() => setIsArchiveViewOpen(true)} onSettings={() => onSelectBottomTab('settings')}
        onNight={toggleNightMode} onLogin={onOpenLoginModal} onVault={() => onSelectBottomTab('vault')}
        onDeleted={() => onSelectBottomTab('deleted')} onMods={onOpenAyuGramSettings}
        onVoice={() => onOpenVoiceStudio?.()} onAppearance={onOpenModSettings}
        onDevices={() => onOpenCategory?.("devices")} onPrivacy={() => onOpenCategory?.("privacy")} onNotifications={() => onOpenCategory?.("notifications")} onData={onOpenData} onPowerSaving={onPowerSaving} powerSaving={powerSaving} onLogout={onLogout}
        onFolders={() => onOpenFolderManager?.()} onChannels={() => onSelectBottomTab('channels')}
      />}
      {/* Optional Flow navigation drawer */}
      {showHamburgerDrawer && !telegramNavigation && (
        <div
          role="dialog" aria-modal="true" aria-label="Navigation menu"
          className="tg-navigation-drawer animate-fade-in fixed inset-0 z-[90] bg-black/55 backdrop-blur-[2px] flex"
          onClick={() => setShowHamburgerDrawer(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-tg-drawer-in w-[290px] sm:w-[312px] max-w-[85vw] h-[100dvh] bg-surface dark:bg-surface flex flex-col justify-between shadow-2xl border-r border-outline dark:border-outline overflow-hidden"
          >
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
              {/* Drawer Account Header */}
              <div className="p-4 bg-elevated dark:from-[#22303F] dark:via-[#1C2836] dark:to-[#17212B] border-b border-outline/80 dark:border-white/[0.07]">
                <div className="flex items-start justify-between mb-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onOpenMyProfile?.();
                    }}
                    className="cursor-pointer rounded-full ring-2 ring-primary/30 hover:ring-primary transition-all active:scale-95"
                    title="View Profile"
                  >
                    <Avatar
                      src={userSession?.avatarUrl}
                      title={userFullName}
                      id={userSession?.id || 'me'}
                      size="lg"
                    />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleNightMode}
                      className="p-2 rounded-full text-muted dark:text-muted hover:text-primary hover:bg-hover/60 dark:hover:bg-hover active:scale-90 transition-all duration-150 cursor-pointer"
                      title={isDarkTheme ? 'Switch to Light Mode' : 'Switch to Night Mode'}
                    >
                      {isDarkTheme ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHamburgerDrawer(false)}
                      className="p-2 rounded-full text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-hover/60 dark:hover:bg-hover active:scale-90 transition-all duration-150 cursor-pointer"
                      title="Close Menu"
                    >
                      <X className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDrawerAccountExpanded((prev) => !prev)}
                  aria-expanded={drawerAccountExpanded}
                  className="w-full flex items-center justify-between gap-2 text-left rounded-xl px-1.5 py-1 -mx-1.5 hover:bg-hover/50 dark:hover:bg-hover transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-ink dark:text-ink truncate">
                      {userFullName}
                    </h3>
                    <p className="text-xs text-muted dark:text-muted truncate">
                      {userSession?.phone
                        ? `+${userSession.phone.replace(/^\++/, '')}`
                        : userSession?.username
                        ? `@${userSession.username}`
                        : isConnected
                        ? 'Telegram Account Connected'
                        : 'Not Signed In'}
                    </p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 ${
                      drawerAccountExpanded ? 'rotate-180 text-primary' : ''
                    }`}
                  />
                </button>

                {/* Functional Expandable Account Quick Bar */}
                {drawerAccountExpanded && (
                  <div className="animate-tg-pop-in mt-3 pt-2.5 border-t border-outline/80 dark:border-outline space-y-1.5">
                    {userSession?.username && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(`@${userSession.username}`).catch(() => {});
                          setCopiedHandle(true);
                          window.setTimeout(() => setCopiedHandle(false), 1500);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-white/5 hover:bg-white dark:hover:bg-hover text-xs flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <span className="font-medium text-ink dark:text-ink truncate">
                          @{userSession.username}
                        </span>
                        <span className="text-[11px] text-primary flex items-center gap-1 shrink-0">
                          {copiedHandle ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedHandle ? 'Copied' : 'Copy'}</span>
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowHamburgerDrawer(false);
                        onOpenLoginModal();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-primary/12 hover:bg-primary/20 text-primary text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isConnected ? 'Switch / Re-link Account' : 'Sign In via QR Code'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Grouped Drawer Navigation Items */}
              <div className="tg-drawer-links p-2 space-y-3 text-[13.5px]">
                {/* Primary Workspace */}
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onOpenMyProfile?.();
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <User className="w-[18px] h-[18px] text-muted dark:text-muted" />
                    <span>My Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      const saved = chats.find((c) => c.type === 'saved');
                      if (saved) {
                        onSelectChat(saved.id);
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <Bookmark className="w-[18px] h-[18px] text-primary" />
                    <span>Saved Messages</span>
                  </button>

                  {onOpenCallsHub && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowHamburgerDrawer(false);
                        onOpenCallsHub();
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                    >
                      <Phone className="w-[18px] h-[18px] text-emerald-500" />
                      <span>Calls</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onSelectBottomTab('chats');
                      setIsArchiveViewOpen(true);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <span className="flex items-center gap-3.5">
                      <Archive className="w-[18px] h-[18px] text-muted dark:text-muted" />
                      <span>Archived Chats</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {archivedUnread > 0 ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-white text-[11px] font-bold tabular-nums ${
                            archivedUnmutedUnread > 0
                              ? 'bg-primary'
                              : 'bg-surface dark:bg-elevated'
                          }`}
                        >
                          {archivedUnread}
                        </span>
                      ) : archivedChats.length > 0 ? (
                        <span className="text-[11px] font-semibold text-muted dark:text-muted tabular-nums">
                          {archivedChats.length}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </div>

                <div className="border-t border-outline dark:border-white/[0.06]" />

                {/* Create & People */}
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      setShowNewMessageModal(true);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <Search className="w-[18px] h-[18px] text-muted dark:text-muted" />
                    <span>Contacts</span>
                  </button>
                  <button type="button" onClick={() => { setShowHamburgerDrawer(false); onSelectBottomTab('channels'); }} className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover text-left font-medium cursor-pointer">
                    <Radio className="w-[18px] h-[18px] text-muted" /><span>Channels</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onCreateChat?.('group');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <Users className="w-[18px] h-[18px] text-muted dark:text-muted" />
                    <span>New Group</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onCreateChat?.('channel');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <Radio className="w-[18px] h-[18px] text-muted dark:text-muted" />
                    <span>New Channel</span>
                  </button>
                </div>

                <div className="border-t border-outline dark:border-white/[0.06]" />

                {/* Vault, Deleted & Tools */}
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onSelectBottomTab('vault');
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150 ${
                      activeBottomTab === 'vault'
                        ? 'bg-primary/12 text-primary'
                        : 'hover:bg-hover dark:hover:bg-hover'
                    }`}
                  >
                    <span className="flex items-center gap-3.5">
                      <FolderArchive className={`w-[18px] h-[18px] ${activeBottomTab === 'vault' ? 'text-primary' : 'text-muted dark:text-muted'}`} />
                      <span>Media Vault</span>
                    </span>
                    {vaultCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold tabular-nums">
                        {vaultCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onSelectBottomTab('deleted');
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150 ${
                      activeBottomTab === 'deleted'
                        ? 'bg-rose-500/12 text-rose-500 dark:text-rose-400'
                        : 'hover:bg-hover dark:hover:bg-hover'
                    }`}
                  >
                    <span className="flex items-center gap-3.5">
                      <Trash2 className="w-[18px] h-[18px] text-rose-500 dark:text-rose-400" />
                      <span>Deleted Messages</span>
                    </span>
                    {deletedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 dark:text-rose-400 text-[11px] font-bold tabular-nums">
                        {deletedCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onOpenAyuGramSettings();
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <span className="flex items-center gap-3.5">
                      <ShieldCheck className="w-[18px] h-[18px] text-primary" />
                      <span>Stealth &amp; Ghost Mode</span>
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        ayuSettings.ghostModeActive
                          ? 'text-primary'
                          : 'text-muted dark:text-muted'
                      }`}
                    >
                      {ayuSettings.ghostModeActive ? 'On' : 'Off'}
                    </span>
                  </button>

                  {onOpenVoiceStudio && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowHamburgerDrawer(false);
                        onOpenVoiceStudio();
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                    >
                      <span className="flex items-center gap-3.5">
                        <Volume2 className="w-[18px] h-[18px] text-amber-500" />
                        <span>Voice Changer</span>
                      </span>
                      {voiceEnabled && (
                        <span className="text-[11px] font-semibold text-amber-500">Active</span>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onOpenModSettings();
                    }}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150"
                  >
                    <Palette className="w-[18px] h-[18px] text-indigo-500 dark:text-indigo-400" />
                    <span>Appearance &amp; Themes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerDrawer(false);
                      onSelectBottomTab('settings');
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 active:scale-[0.98] text-left font-medium cursor-pointer transition-all duration-150 ${
                      activeBottomTab === 'settings'
                        ? 'bg-primary/12 text-primary'
                        : 'hover:bg-hover dark:hover:bg-hover'
                    }`}
                  >
                    <Settings className={`w-[18px] h-[18px] ${activeBottomTab === 'settings' ? 'text-primary' : 'text-muted dark:text-muted'}`} />
                    <span>Settings</span>
                  </button>
                </div>

                <div className="border-t border-outline dark:border-white/[0.06]" />

                {/* Night Mode Toggle */}
                <button
                  type="button"
                  onClick={toggleNightMode}
                  className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-3.5 font-medium">
                    <Moon className="w-[18px] h-[18px] text-muted dark:text-muted" />
                    <span>Night Mode</span>
                  </span>
                  <div
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      isDarkTheme ? 'bg-primary' : 'bg-surface'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                        isDarkTheme ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>
              </div>
            </div>

            <div className="px-4 py-3 text-[11px] text-muted dark:text-muted border-t border-outline dark:border-white/[0.06] flex items-center justify-between">
              <span className="font-semibold text-muted dark:text-muted">Webygram</span>
              <span>Telegram Web</span>
            </div>
          </div>
        </div>
      )}

      {showNewMessageModal && <NewMessageDialog accountId={currentUser?.id || ''} chats={personalUsers} onClose={() => setShowNewMessageModal(false)} onSelectChat={onSelectChat} onOpenPeer={onOpenChatByLink} onCreateChat={onCreateChat} />}


    </div>
  );
});
