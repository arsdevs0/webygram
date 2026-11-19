import type {AttachmentUpload} from './types/telegram';
import { scrollToEnd } from './utils/scrollToEnd';
import { GroupVoiceBanner } from './components/chat/GroupVoiceBanner';
import { groupTimelineMessages, albumForwardSelection } from './utils/messageAlbums';
import type { NativeCallInfo } from './services/nativeTelegramCall';
import { CallRecordingPanel, CallRecordingIndicator } from './components/call/CallRecordingPanel';
/**
 * TG Plus — Real-Time MTProto Telegram Web Client
 * Midnight Navy 4-Column Desktop & Responsive Mobile UI,
 * Instant QR Scan Login, Voice Changer DSP, AyuGram & Media Vault.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, useLayoutEffect } from 'react';
import { deferredPanel } from './components/common/DeferredPanel';
import { useEscapeDismiss, useAppBack } from './components/common/useEscapeDismiss';
import { ChatList, BottomNavTab } from './components/layout/ChatList';
import { ContactsView } from './components/contacts/ContactsView';
import { SelfProfileView } from './components/profile/SelfProfileView';
import { ChatFoldersView } from './components/layout/ChatFoldersView';
import { WelcomeView } from './components/auth/WelcomeView';
const DataSettingsPanel = deferredPanel(() => import('./components/settings/DataSettingsPanel').then(m => ({ default: m.DataSettingsPanel })));
import { SettingsHome } from './components/settings/SettingsHome';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import type { SettingsCategory } from './components/settings/SettingsModal';
import { ChatHeader } from './components/chat/ChatHeader';
import { MessageItem } from './components/chat/MessageItem';
import { SearchResults } from './components/chat/SearchResults';
import type { MessageSearchHit } from './types/telegram';
import { ChatInput } from './components/chat/ChatInput';
const ChatInfoPanel = deferredPanel(() => import('./components/chat/ChatInfoPanel').then(m => ({ default: m.ChatInfoPanel })));
const FloatingVoiceChanger = deferredPanel(() => import('./components/voice/FloatingVoiceChanger').then(m => ({ default: m.FloatingVoiceChanger })));
const VoiceChangerStudio = deferredPanel(() => import('./components/voice/VoiceChangerStudio').then(m => ({ default: m.VoiceChangerStudio })));
const ModSettingsView = deferredPanel(() => import('./components/mod/ModSettingsView').then(m => ({ default: m.ModSettingsView })));
const AyuGramSettingsModal = deferredPanel(() => import('./components/mod/AyuGramSettingsModal').then(m => ({ default: m.AyuGramSettingsModal })));
const SettingsModal = deferredPanel(() => import('./components/settings/SettingsModal').then(m => ({ default: m.SettingsModal })));
const TelegramLoginModal = deferredPanel(() => import('./components/auth/TelegramLoginModal').then(m => ({ default: m.TelegramLoginModal })));
const DisappearingMediaModal = deferredPanel(() => import('./components/chat/DisappearingMediaModal').then(m => ({ default: m.DisappearingMediaModal })));
const MediaViewerModal = deferredPanel(() => import('./components/chat/MediaViewerModal').then(m => ({ default: m.MediaViewerModal })));
const VoiceCallModal = deferredPanel(() => import('./components/call/VoiceCallModal').then(m => ({ default: m.VoiceCallModal })));
const CreateChatModal = deferredPanel(() => import('./components/channels/CreateChatModal').then(m => ({ default: m.CreateChatModal })));
const ChannelsHubView = deferredPanel(() => import('./components/channels/ChannelsHubView').then(m => ({ default: m.ChannelsHubView })));
const VaultView = deferredPanel(() => import('./components/vault/VaultView').then(m => ({ default: m.VaultView })));
const DeletedLogsView = deferredPanel(() => import('./components/deleted/DeletedLogsView').then(m => ({ default: m.DeletedLogsView })));
const ForwardPickerModal = deferredPanel(() => import('./components/chat/ForwardPickerModal').then(m => ({ default: m.ForwardPickerModal })), true);
const PollComposerModal = deferredPanel(() => import('./components/chat/PollComposerModal').then(m => ({ default: m.PollComposerModal })), true);
const ScheduledQueueModal = deferredPanel(() => import('./components/chat/ScheduledQueueModal').then(m => ({ default: m.ScheduledQueueModal })));
const CommentsDrawer = deferredPanel(() => import('./components/chat/CommentsDrawer').then(m => ({ default: m.CommentsDrawer })));
const FolderManagerModal = deferredPanel(() => import('./components/layout/FolderManagerModal').then(m => ({ default: m.FolderManagerModal })));
import { PasscodeLockScreen } from './components/security/PasscodeLockScreen';
const UserProfileModal = deferredPanel(() => import('./components/chat/UserProfileModal').then(m => ({ default: m.UserProfileModal })));

import { telegramService, ChatDetailsInfo } from './services/telegramService';
import { voiceChanger } from './services/voiceChangerEngine';
import { modSettingsStore } from './services/modSettingsStore';
import { ayuGramEngine } from './services/ayuGramModEngine';
import { passcodeService } from './services/passcodeService';
import { soundEffects } from './services/soundEffects';
import {
  TelegramChat,
  TelegramMessage,
  ChatFolder,
  MediaAttachment,
  AuthSession,
  ForumTopicItem,
  BotCommandItem,
  UserProfileInfo,
} from './types/telegram';
import { ModSettings } from './types/modSettings';
import { AyuGramSettings } from './types/ayugram';
import { Avatar } from './components/common/Avatar';
import {
  Lock,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Shield,
  Volume2,
  Palette,
  Sliders,
  EyeOff,
  QrCode,
  ShieldCheck,
  Check,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Video,
  Radio,
  FolderArchive,
  Trash2,
  Bookmark,
  Settings,
  Star,
  Moon,
  Sun,
  X,
  Plus,
  Forward,
  Copy,
  RotateCcw,
} from 'lucide-react';

export default function App() {
  const [, refreshService] = useState(0);
  const [authSession, setAuthSession] = useState<AuthSession>(telegramService.getAuthSession());
  const [chats, setChats] = useState<TelegramChat[]>(telegramService.getChats());
  const [folders, setFolders] = useState<ChatFolder[]>(telegramService.getFolders());
  const [isLoadingDialogs, setIsLoadingDialogs] = useState<boolean>(
    telegramService.getIsLoadingDialogs()
  );
  const [activeFolderId, setActiveFolderId] = useState<string>('f_all');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [modSettings, setModSettings] = useState<ModSettings>(modSettingsStore.getSettings());
  const [ayuSettings, setAyuSettings] = useState<AyuGramSettings>(ayuGramEngine.getSettings());
  const [deletedLogsCount, setDeletedLogsCount] = useState<number>(
    ayuGramEngine.getDeletedLogs().length
  );

  const [activeNavItem, setActiveNavItem] = useState<
    'chats' | 'channels' | 'vault' | 'deleted' | 'calls' | 'saved' | 'settings' | 'mods' | 'contacts' | 'you'
  >('chats');

  const [activeView, setActiveView] = useState<
    'chats' | 'chat_room' | 'channels' | 'vault' | 'deleted' | 'settings' | 'mod_features' | 'contacts' | 'you' | 'folders'
  >('chats');
  const [activeBottomTab, setActiveBottomTab] = useState<BottomNavTab>('chats');

  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false);
  const [isModSettingsOpen, setIsModSettingsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('general');
  const openSettings = (category: SettingsCategory = 'general') => { setSettingsCategory(category); setIsSettingsOpen(true); };
  const [isDataSettingsOpen, setIsDataSettingsOpen] = useState(false);
  const [loginInitialTab, setLoginInitialTab] = useState<'qr' | 'phone'>('qr');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDisappearingModalOpen, setIsDisappearingModalOpen] = useState(false);
  const [isAyuGramModalOpen, setIsAyuGramModalOpen] = useState(false);
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const [callInitialVideo, setCallInitialVideo] = useState(false);
  const [isConfirmCallOpen, setIsConfirmCallOpen] = useState(false);
  const [isCallsHubOpen, setIsCallsHubOpen] = useState(false);
  useEscapeDismiss(isCallsHubOpen, () => setIsCallsHubOpen(false));
  const [callTargetChat, setCallTargetChat] = useState<TelegramChat | null>(null);
  const [activeIncomingOffer, setActiveIncomingOffer] = useState<{
    nativeCall?: NativeCallInfo;
    callId?: string;
    sdp?: RTCSessionDescriptionInit;
    isVideo?: boolean;
  } | null>(null);
  const [incomingCallPrompt, setIncomingCallPrompt] = useState<{
    chat: TelegramChat;
    nativeCall?: NativeCallInfo;
    callId?: string;
    isVideo: boolean;
    sdp?: RTCSessionDescriptionInit;
  } | null>(null);
  const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
  const [createModalMode, setCreateModalMode] = useState<'group' | 'channel'>('group');
  const [bypassProtectedView, setBypassProtectedView] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const [activeViewerMedia, setActiveViewerMedia] = useState<{
    media: MediaAttachment;
    messageId: string;
    chatId?: string;
  } | null>(null);

  const [replyingTo, setReplyingTo] = useState<TelegramMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<TelegramMessage | null>(null);

  // Official Telegram Parity State
  const [isLocked, setIsLocked] = useState<boolean>(passcodeService.isLocked());
  const [hasPasscode, setHasPasscode] = useState<boolean>(passcodeService.hasPasscode());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [forwardPickerState, setForwardPickerState] = useState<{
    isOpen: boolean;
    messageIds: string[];
    fromChatId?: string;
    messages?: TelegramMessage[];
  }>({ isOpen: false, messageIds: [] });
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isScheduledModalOpen, setIsScheduledModalOpen] = useState(false);
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false);
  const [commentsPost, setCommentsPost] = useState<TelegramMessage | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<TelegramMessage[]>([]);
  const [topics, setTopics] = useState<ForumTopicItem[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<number | null>(null);
  const [chatBotCommands, setChatBotCommands] = useState<BotCommandItem[]>([]);
  const [composerPrefillText, setComposerPrefillText] = useState<string | undefined>(undefined);
  const [activeChatDetails, setActiveChatDetails] = useState<ChatDetailsInfo | null>(null);
  const [sendErrorReason, setSendErrorReason] = useState<string | null>(null);
  const [activeUserProfileId, setActiveUserProfileId] = useState<string | null>(null);
  const [activeUserProfileFallbackName, setActiveUserProfileFallbackName] = useState<string | undefined>(
    undefined
  );

  const backToChats = useCallback(() => {
    setActiveChatId(null); setActiveView('chats'); setActiveNavItem('chats'); setActiveBottomTab('chats'); setShowInfoPanel(false);
  }, []);
  useEscapeDismiss(isConfirmCallOpen, () => { setIsConfirmCallOpen(false); setCallTargetChat(null); });
  useAppBack(activeView !== 'chats' || selectionMode || Boolean(chatSearchQuery) || Boolean(editingMessage) || Boolean(replyingTo) || activeTopicId !== null, () => {
    if (selectionMode) { setSelectionMode(false); setSelectedMsgIds(new Set()); }
    else if (chatSearchQuery) setChatSearchQuery('');
    else if (editingMessage) setEditingMessage(null);
    else if (replyingTo) setReplyingTo(null);
    else if (activeTopicId !== null) { setActiveTopicId(null); if (activeChatId) void telegramService.loadMessages(activeChatId, 0); }
    else backToChats();
  }, remaining => setToastNotice(`Press Back ${remaining} more times quickly to leave`));

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastNotice(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastNotice(null), 2800);
  }, []);

  useEffect(() => {
    const warn = () => showToast('Browser storage could not save your data. Free some device space and reload.');
    window.addEventListener('webygram-storage-error', warn);
    return () => window.removeEventListener('webygram-storage-error', warn);
  }, [showToast]);

  const handleOpenUserProfile = useCallback((uid: string, fallbackName?: string) => {
    if (!uid) return;
    setActiveUserProfileFallbackName(fallbackName);
    setActiveUserProfileId(uid);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);
  const pendingSearchJump = useRef<{ chatId: string; messageId: string } | null>(null);
  const prevScrolledChatIdRef = useRef<string | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const showScrollBottomRef = useRef<boolean>(false);
  const lastAutoReadTriggerRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const syncState = () => {
      refreshService(revision => revision + 1);
      const nextSession = telegramService.getAuthSession();
      const nextChats = telegramService.getChats();
      setAuthSession(nextSession);
      setChats(nextChats);
      setFolders(telegramService.getFolders());
      setIsLoadingDialogs(telegramService.getIsLoadingDialogs());

      if (nextSession.isConnected && nextChats.length > 0) {
        setActiveChatId((prev) => {
          if (prev && nextChats.some((c) => c.id === prev)) return prev;
          const saved = nextChats.find((c) => c.type === 'saved');
          return saved ? saved.id : nextChats[0].id;
        });
      } else if (!nextSession.isConnected) {
        setActiveChatId(null);
      }
    };

    const unsubTelegram = telegramService.subscribe(syncState);
    const unsubMods = modSettingsStore.subscribe((s) => setModSettings(s));
    const unsubAyu = ayuGramEngine.subscribe((s) => {
      setAyuSettings(s);
      setDeletedLogsCount(ayuGramEngine.getDeletedLogs().length);
    });
    const unsubPasscode = passcodeService.subscribe(() => {
      setIsLocked(passcodeService.isLocked());
      setHasPasscode(passcodeService.hasPasscode());
    });

    const unsubCalls = telegramService.subscribeCallSignals((ev) => {
      if (ev.type === 'CALL_SIGNAL' && ev.action === 'offer') {
        const cid = String(ev.chatId || '');
        const allChats = telegramService.getChats();
        const foundChat = allChats.find((c) => c.id === cid) || {
          id: cid || 'incoming_peer',
          title: 'Telegram Contact',
          type: 'user' as const,
          unreadCount: 0,
          isPinned: false,
          isMuted: false,
        };
        soundEffects.startIncomingRing();
        setIncomingCallPrompt({
          chat: foundChat,
          callId: ev.callId ? String(ev.callId) : undefined,
          isVideo: Boolean(ev.isVideo),
          sdp: ev.sdp as RTCSessionDescriptionInit | undefined,
        });
      } else if (ev.type === 'CALL_SIGNAL' && ev.action === 'hangup') {
        soundEffects.stopIncomingRing();
        setIncomingCallPrompt(null);
      } else if (ev.type === 'PHONE_CALL_UPDATE' && ev.state === 'PhoneCallDiscarded') {
        setIncomingCallPrompt(current => {
          if (!current || current.callId !== String(ev.callId)) return current;
          soundEffects.stopIncomingRing(); return null;
        });
      } else if (ev.type === 'PHONE_CALL_UPDATE' && ev.state === 'PhoneCallRequested') {
        const nativeCall=ev.nativeCall as NativeCallInfo | undefined;
        if (nativeCall?.accessHash) void import('./services/nativeTelegramCall').then(({nativeCallRequest}) => nativeCallRequest('received',{callId:nativeCall.id,accessHash:nativeCall.accessHash})).catch(() => {});
        const adminId = ev.adminId ? String(ev.adminId) : '';
        const allChats = telegramService.getChats();
        const foundChat = allChats.find((c) => c.id === adminId) || {
          id: adminId || 'tg_call',
          title: 'Incoming Telegram Call',
          type: 'user' as const,
          unreadCount: 0,
          isPinned: false,
          isMuted: false,
        };
        soundEffects.startIncomingRing();
        setIncomingCallPrompt({
          chat: foundChat,
          callId: ev.callId ? String(ev.callId) : undefined,
          isVideo: Boolean(ev.video),
          nativeCall: ev.nativeCall as NativeCallInfo,
        });
      }
    });

    syncState();

    return () => {
      unsubTelegram();
      unsubMods();
      unsubAyu();
      unsubPasscode();
      unsubCalls();
    };
  }, []);

  useEffect(() => {
    if (!hasPasscode || isLocked) return;
    const mins = passcodeService.getAutoLockMinutes();
    if (!mins || mins <= 0) return;

    let timer: number | undefined;
    const resetTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        passcodeService.lockNow();
      }, mins * 60_000);
    };

    resetTimer();
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [hasPasscode, isLocked]);

  useEffect(() => {
    telegramService.setActiveChatId(activeChatId);
    if (authSession.isConnected && activeChatId) {
      void telegramService.loadMessages(activeChatId, 0);
    }
  }, [authSession.isConnected, activeChatId]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId),
    [chats, activeChatId]
  );
  const currentMessages = activeChatId ? telegramService.getMessages(activeChatId) : [];
  const trimmedChatSearch = useDeferredValue(chatSearchQuery).trim().toLowerCase();
  const displayedMessages = useMemo(
    () =>
      trimmedChatSearch
        ? currentMessages.filter(
            (m) =>
              m.text?.toLowerCase().includes(trimmedChatSearch) ||
              m.senderName?.toLowerCase().includes(trimmedChatSearch) ||
              m.media?.fileName?.toLowerCase().includes(trimmedChatSearch)
          )
        : currentMessages,
    [currentMessages, trimmedChatSearch]
  );
  const timelineGroups = useMemo(() => groupTimelineMessages(displayedMessages), [displayedMessages]);
  const viewerChatId = activeViewerMedia?.chatId || activeChatId || '';
  const viewerGallery = activeViewerMedia ? [...new Map([...telegramService.getMessages(viewerChatId),...(telegramService.getSharedMedia(viewerChatId,'media') || [])].filter(item=>item.media && ['photo','video','gif'].includes(item.media.type) && !item.media.isDisappearing).map(item=>[item.id,item])).values()].sort((a,b)=>a.timestamp-b.timestamp).map(item=>({media:item.media!,messageId:item.id})) : [];
  const isLoadingChatMessages = activeChatId ? telegramService.isLoadingMessages(activeChatId) : false;
  const totalUnread = useMemo(
    () =>
      chats
        .filter((c) => !c.isDeletedChat && !c.isArchived)
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [chats]
  );
  const totalDeletedItems = useMemo(
    () => chats.filter((c) => c.isDeletedChat).length + deletedLogsCount,
    [chats, deletedLogsCount]
  );

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setActiveViewerMedia(null);
    setCommentsPost(null);
    setChatSearchQuery('');
    showScrollBottomRef.current = false;
    setShowScrollBottom(false);
    setSelectionMode(false);
    setSelectedMsgIds(new Set());
    setActiveTopicId(null);
    setTopics([]);
    setPinnedMessages([]);
    setChatBotCommands([]);
    setActiveChatDetails(null);
    setSendErrorReason(null);
    setComposerPrefillText(undefined);

    if (!authSession.isConnected || !activeChatId) return;
    const targetChat = chats.find((c) => c.id === activeChatId);
    if (!targetChat || targetChat.isDeletedChat) return;

    let cancelled = false;
    if (targetChat.isForum) {
      void telegramService.getForumTopics(activeChatId).then(value => { if (!cancelled) setTopics(value); }).catch(() => {});
    }
    if (targetChat.type !== 'saved') {
      void telegramService
        .getChatDetails(activeChatId)
        .then((d) => {
          if (cancelled) return;
          setActiveChatDetails(d);
          if (d.botCommands) setChatBotCommands(d.botCommands);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [activeChatId, authSession.isConnected]);

  useEffect(() => {
    if (!authSession.isConnected || !activeChatId || activeChat?.isDeletedChat) return;
    let cancelled = false;
    void telegramService.getPinnedMessages(activeChatId).then(value => { if (!cancelled) setPinnedMessages(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeChatId, authSession.isConnected, activeChat?.pinnedMessageId, activeChat?.isDeletedChat]);

  const lastMsgIdRef = useRef<string | null>(null);
  const skipNextAutoScrollRef = useRef<boolean>(false);

  const handleLoadOlderMessages = async () => {
    if (!activeChatId) return;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
    const prevScrollTop = container?.scrollTop || 0;
    skipNextAutoScrollRef.current = true;
    await telegramService.loadOlderMessages(activeChatId);
    requestAnimationFrame(() => {
      if (container && container === messagesContainerRef.current && telegramService.getActiveChatId() === activeChatId) {
        const delta = container.scrollHeight - prevScrollHeight;
        if (delta > 0) {
          container.scrollTop = prevScrollTop + delta;
        }
      }
    });
  };

  useLayoutEffect(() => {
    if (!trimmedChatSearch && activeChatId) {
      if (pendingSearchJump.current?.chatId === activeChatId) return;
      const container=messagesContainerRef.current;
      if(!container || container.clientHeight===0)return;
      const switchedChat = prevScrolledChatIdRef.current !== activeChatId;
      const latestId = currentMessages.length > 0 ? currentMessages[currentMessages.length - 1].id : null;
      const latestChanged = latestId !== lastMsgIdRef.current;
      if (!currentMessages.length) return;
      prevScrolledChatIdRef.current = activeChatId;
      lastMsgIdRef.current = latestId;

      if (skipNextAutoScrollRef.current && !switchedChat) {
        skipNextAutoScrollRef.current = false;
        return;
      }
      const latest = currentMessages[currentMessages.length - 1];
      if (switchedChat || (latestChanged && (!showScrollBottomRef.current || latest?.isPending))) {
        followLatestRef.current = true;
        scrollToEnd(container);
      }
    }
  }, [activeChatId, currentMessages, activeView, trimmedChatSearch]);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current, content = messagesContentRef.current;
    if (!container || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (followLatestRef.current && container.clientHeight) scrollToEnd(container); });
    observer.observe(container); observer.observe(content);
    return () => observer.disconnect();
  }, [activeChatId, activeTopicId, activeView, trimmedChatSearch]);

  const handleSelectChat = useCallback((chatId: string, openInfo = false) => {
    setActiveChatId(chatId);
    setActiveNavItem('chats');
    setActiveBottomTab('chats');
    setActiveView('chat_room');
    setBypassProtectedView(false);
    if (openInfo) {
      setShowInfoPanel(true);
    } else if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowInfoPanel(false);
    }
  }, []);

  const handleOpenChatByLink = useCallback(
    async (link: string) => {
      try {
        const opened = await telegramService.openChatByLink(link);
        setActiveChatId(opened.id);
        setActiveNavItem('chats');
        setActiveBottomTab('chats');
        setActiveView('chat_room');
        setBypassProtectedView(false);
        void telegramService.loadMessages(opened.id);
        showToast(`Opened ${opened.title}`);
      } catch (err) {
        showToast((err as Error).message || 'Could not open Telegram link');
        throw err;
      }
    },
    [showToast]
  );

  const handleSendMessage = async (
    text: string,
    voiceMedia?: { fileDataUrl: string; fileName: string; duration: number; presetUsed?: string },
    attachmentMedia?: AttachmentUpload,
    scheduleDate?: number
  ): Promise<boolean> => {
    if (!activeChatId) return false;
    setSendErrorReason(null);
    try {
      if (voiceMedia) {
        await telegramService.sendMessage({
          chatId: activeChatId,
          text: '',
          replyToId: replyingTo?.id,
          topMsgId: activeTopicId || undefined,
          scheduleDate,
          fileDataUrl: voiceMedia.fileDataUrl,
          fileName: voiceMedia.fileName,
          mediaType: 'voice',
          voiceDuration: voiceMedia.duration,
        });
      } else if (attachmentMedia) {
        await telegramService.sendMessage({
          chatId: activeChatId,
          text,
          replyToId: replyingTo?.id,
          topMsgId: activeTopicId || undefined,
          scheduleDate,
          fileDataUrl: attachmentMedia.fileDataUrl,
          fileName: attachmentMedia.fileName,
          mediaType: attachmentMedia.mediaType,
          width:attachmentMedia.width,height:attachmentMedia.height,voiceDuration:attachmentMedia.duration,
          ttlSeconds:attachmentMedia.ttlSeconds,spoiler:attachmentMedia.spoiler,silent:attachmentMedia.silent,
        });
      } else {
        await telegramService.sendMessage({
          chatId: activeChatId,
          text,
          replyToId: replyingTo?.id,
          topMsgId: activeTopicId || undefined,
          scheduleDate,
          parseFormatting: true,
        });
      }
      setReplyingTo(null);
      if (scheduleDate) {
        showToast('Message scheduled');
      }
      return true;
    } catch (err) {
      const reason = (err as Error).message || 'Failed to send message in this chat.';
      setSendErrorReason(reason);
      showToast(reason);
      return false;
    }
  };

  const handleJumpToMessage = useCallback(
    (msgId: string) => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        followLatestRef.current = false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'bg-primary/15', 'rounded-xl');
        window.setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary', 'bg-primary/15', 'rounded-xl');
        }, 1800);
      } else {
        showToast('Original message is older; load older messages to view');
      }
    },
    [showToast]
  );

  const handleOpenSearchMessage = useCallback(async (hit: MessageSearchHit, signal?: AbortSignal) => {
    await telegramService.loadMessageContext(hit, signal);
    signal?.throwIfAborted();
    pendingSearchJump.current = { chatId: hit.chat.id, messageId: hit.message.id };
    setActiveChatId(hit.chat.id);
    setActiveTopicId(null);
    setActiveNavItem('chats'); setActiveBottomTab('chats'); setActiveView('chat_room');
    setShowInfoPanel(false); setChatSearchQuery('');
  }, []);

  useLayoutEffect(() => {
    const target = pendingSearchJump.current;
    if (!target || target.chatId !== activeChatId || trimmedChatSearch) return;
    const element = document.getElementById('msg-' + target.messageId);
    if (!element) return;
    pendingSearchJump.current = null;
    prevScrolledChatIdRef.current = activeChatId;
    lastMsgIdRef.current = currentMessages.at(-1)?.id || null;
    followLatestRef.current = false;
    const scroller = messagesContainerRef.current;
    if (scroller) { const previous=scroller.style.scrollBehavior;scroller.style.scrollBehavior='auto';scroller.scrollTop += element.getBoundingClientRect().top-scroller.getBoundingClientRect().top-(scroller.clientHeight-element.clientHeight)/2;scroller.style.scrollBehavior=previous; }
    element.classList.add('tg-search-highlight');
    showScrollBottomRef.current = true; setShowScrollBottom(true);
    const timer = window.setTimeout(() => element.classList.remove('tg-search-highlight'), 2200);
    return () => { clearTimeout(timer); element.classList.remove('tg-search-highlight'); };
  }, [activeChatId, currentMessages, activeView, trimmedChatSearch]);

  const handleSelectTopic = (topicId: number | null) => {
    setActiveTopicId(topicId);
    if (activeChatId) {
      prevScrolledChatIdRef.current = null;
      setReplyingTo(null);
      setEditingMessage(null);
      void telegramService.loadMessages(activeChatId, topicId || 0);
    }
  };

  const handleCreateTopic = async (title: string) => {
    if (!activeChatId) return;
    try {
      await telegramService.createForumTopic(activeChatId, title);
      const updated = await telegramService.getForumTopics(activeChatId);
      setTopics(updated);
      showToast(`Topic "${title}" created`);
    } catch (err) {
      showToast((err as Error).message || 'Could not create topic');
    }
  };

  const toggleSelectMessage = useCallback((id: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const startSelectionWith = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedMsgIds(new Set([id]));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMsgIds(new Set());
  }, []);

  // Stable callbacks for MessageItem & ChatList so React.memo prevents 60fps jank
  const handleOpenViewerMedia = useCallback((media: MediaAttachment, messageId: string) => {
    setActiveViewerMedia({ media, messageId });
  }, []);
  const handleReplyMsg = useCallback((m: TelegramMessage) => {
    setReplyingTo(m); setEditingMessage(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.tg-composer textarea')?.focus({preventScroll:true}));
  }, []);
  const handleEditMsg = useCallback((m: TelegramMessage) => setEditingMessage(m), []);
  const handleOpenForwardMsg = useCallback((msgId: string) => {
    if (!activeChatId) return;
    const message = telegramService.getMessages(activeChatId).find(m => m.id === msgId);
    if (!message || message.isPending || message.isDeletedBySender || !/^\d+$/.test(msgId)) { showToast('This message is not available for forwarding.'); return; }
    setForwardPickerState({ isOpen: true, fromChatId: activeChatId, messageIds: albumForwardSelection(telegramService.getMessages(activeChatId), message).map(item => item.id), messages: albumForwardSelection(telegramService.getMessages(activeChatId), message) });
  }, [activeChatId, showToast]);
  const handleOpenCommentsMsg = useCallback((m: TelegramMessage) => setCommentsPost(m), []);
  const handleBotSwitchInlineText = useCallback((txt: string) => setComposerPrefillText(txt), []);
  useEffect(() => { const open = (event: Event) => handleSelectChat((event as CustomEvent<string>).detail); window.addEventListener('webygram-open-chat', open); return () => window.removeEventListener('webygram-open-chat', open); }, [handleSelectChat]);
  const handleSelectChatFromList = useCallback(
    (id: string) => handleSelectChat(id, false),
    [handleSelectChat]
  );
  const handleCreateChatFromList = useCallback((mode?: 'group' | 'channel') => {
    setCreateModalMode(mode || 'group');
    setIsCreateChatOpen(true);
  }, []);
  const handleOpenFolderManager = useCallback(() => setActiveView('folders'), []);
  const handleOpenModSettings = useCallback(() => setIsModSettingsOpen(true), []);
  const handleOpenAyuGramSettings = useCallback(() => setIsAyuGramModalOpen(true), []);
  const handleOpenLoginModal = useCallback(() => setIsLoginModalOpen(true), []);
  const handleSelectBottomTab = useCallback((tab: BottomNavTab) => {
    setActiveBottomTab(tab);
    setActiveNavItem(tab);
    setActiveView(tab);
  }, []);
  const handleMessagesScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = messagesContainerRef.current;
      const curChat = activeChat;
      if (!el || !curChat) return;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      followLatestRef.current = distFromBottom < 80;
      const shouldShow = distFromBottom > 220;
      if (shouldShow !== showScrollBottomRef.current) {
        showScrollBottomRef.current = shouldShow;
        setShowScrollBottom(shouldShow);
      }
      if (distFromBottom < 80 && curChat.unreadCount > 0) {
        const now = Date.now();
        const last = lastAutoReadTriggerRef.current[curChat.id] || 0;
        if (now - last > 1200) {
          lastAutoReadTriggerRef.current[curChat.id] = now;
          void telegramService.markChatAsRead(curChat.id);
        }
      }
      if (
        el.scrollTop < 220 &&
        !trimmedChatSearch &&
        telegramService.hasMoreMessages(curChat.id) &&
        !telegramService.isLoadingOlder(curChat.id)
      ) {
        void handleLoadOlderMessages();
      }
    });
  }, [activeChat, trimmedChatSearch]);

  const handleBatchCopy = async () => {
    const selectedText = displayedMessages
      .filter((m) => selectedMsgIds.has(m.id) && m.text)
      .map((m) => m.text)
      .join('\n\n');
    if (selectedText) {
      try { await navigator.clipboard.writeText(selectedText); }
      catch { showToast('Could not copy messages. Check clipboard permission.'); return; }
      showToast(`Copied ${selectedMsgIds.size} message(s)`);
    }
    exitSelectionMode();
  };

  const handleBatchDelete = async () => {
    if (!activeChatId || selectedMsgIds.size === 0) return;
    const ids = Array.from(selectedMsgIds);
    try {
      await telegramService.deleteBatch(activeChatId, ids, true);
      showToast(`Deleted ${ids.length} message(s)`); exitSelectionMode();
    } catch (error) { showToast((error as Error).message || 'Could not delete messages.'); }
  };

  const handleSendDisappearingMedia = async (params: {
    fileDataUrl: string;
    fileName: string;
    mediaType: 'photo' | 'video';
    caption: string;
    expireSeconds: number;
  }) => {
    if (!activeChatId) return false;
    try {
      await telegramService.sendMessage({
        chatId: activeChatId,
        text: params.caption,
        fileDataUrl: params.fileDataUrl,
        fileName: params.fileName,
        mediaType: params.mediaType,
        ttlSeconds: params.expireSeconds,
      });
      showToast(`Sent timed ${params.mediaType}`); return true;
    } catch (err) {
      showToast((err as Error).message || 'Failed to send timed media'); return false;
    }
  };

  const handleSaveEdit = async (newText: string) => {
    if (!activeChatId || !editingMessage) return false;
    const targetMsg = editingMessage;
    try {
      await telegramService.editMessage(activeChatId, targetMsg.id, newText);
      setEditingMessage(current => current?.id === targetMsg.id && current?.chatId === targetMsg.chatId ? null : current);
      return true;
    } catch (err) { showToast((err as Error).message || 'Could not edit message'); return false; }
  };

  const getWallpaperClass = () => {
    switch (modSettings.chatWallpaper) {
      case 'pattern-tg':
        return 'chat-pattern-tg';
      case 'starry-night':
        return 'chat-wallpaper-starry';
      case 'aurora-mesh':
        return 'chat-wallpaper-aurora';
      case 'pattern-grid':
        return 'chat-pattern-grid';
      case 'minimal-dots':
        return 'chat-wallpaper-dots';
      case 'plain':
      default:
        return 'chat-wallpaper-plain';
    }
  };

  const isProtectedLocked = Boolean(
    activeChat?.isProtected && !ayuSettings.bypassContentRestrictions && !bypassProtectedView
  );

  const startVoiceCallWithChat = (target: TelegramChat, isVideo = false) => {
    setActiveIncomingOffer(null);
    setCallInitialVideo(isVideo);
    setCallTargetChat(target);
    if (ayuSettings.confirmBeforeCall) setIsConfirmCallOpen(true);
    else setIsVoiceCallOpen(true);
  };

  const handleLeftNavClick = (
    item: 'chats' | 'channels' | 'vault' | 'deleted' | 'calls' | 'saved' | 'settings' | 'mods'
  ) => {
    setActiveNavItem(item);
    if (item === 'chats') {
      setActiveBottomTab('chats');
      setActiveView('chats');
    } else if (item === 'channels') {
      setActiveBottomTab('channels');
      setActiveView('channels');
    } else if (item === 'vault') {
      setActiveBottomTab('vault');
      setActiveView('vault');
    } else if (item === 'deleted') {
      setActiveBottomTab('deleted');
      setActiveView('deleted');
    } else if (item === 'calls') {
      setIsCallsHubOpen(true);
    } else if (item === 'saved') {
      const savedChat = chats.find((c) => c.type === 'saved');
      if (savedChat) {
        handleSelectChat(savedChat.id);
      } else if (authSession.isConnected) {
        void handleOpenChatByLink('me').catch(() => setIsAyuGramModalOpen(true));
      } else {
        setIsLoginModalOpen(true);
      }
    } else if (item === 'settings') {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setActiveView('settings');
      } else {
        openSettings();
      }
    } else if (item === 'mods') {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setActiveView('mod_features');
      } else {
        setIsAyuGramModalOpen(true);
      }
    }
  };

  const renderConnectScreen = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-5 bg-canvas dark:bg-canvas chat-pattern-tg">
      <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg">
        <svg className="w-8 h-8 fill-current ml-0.5" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.63 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 4-1.74 6.72-2.92 8.16-3.55 3.88-1.7 4.69-1.99 5.22-2 .12 0 .38.03.55.17.14.12.18.28.2.45-.02.07-.02.24-.04.4z" />
        </svg>
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h2 className="text-lg font-bold text-ink dark:text-ink">
          Connect Your Telegram Account
        </h2>
        <p className="text-xs text-muted dark:text-muted leading-relaxed">
          Sign in with your phone number or scan a QR code to see your Telegram chats. Your login stays saved in this browser.
        </p>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap justify-center">
        <button
          type="button"
          onClick={() => setIsLoginModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
        >
          <QrCode className="w-4 h-4" />
          <span>Sign In via QR Code</span>
        </button>
        <button
          type="button"
          onClick={() => setIsVoiceStudioOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-surface dark:bg-elevated border border-outline dark:border-outline text-ink dark:text-ink text-xs font-medium flex items-center gap-2 cursor-pointer hover:bg-hover dark:hover:bg-hover"
        >
          <Volume2 className="w-4 h-4 text-primary" />
          <span>Test Voice Changer</span>
        </button>
      </div>
    </div>
  );

  const [isContactFinderOpen, setIsContactFinderOpen] = useState(false);
  const [contactLink, setContactLink] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  useEscapeDismiss(isContactFinderOpen, () => setIsContactFinderOpen(false));
  const powerSaving = !modSettings.enableSmoothAnimations && !modSettings.autoPlayGifs;
  const togglePowerSaving = () => { modSettingsStore.updateSetting("enableSmoothAnimations", powerSaving); modSettingsStore.updateSetting("autoPlayGifs", powerSaving); };
  const renderMobileSubView = () => {
    if (activeView === "contacts") return <ContactsView accountId={authSession.user.id} connected={authSession.isConnected} onBack={backToChats} onLogin={handleOpenLoginModal} onOpenContact={contact => handleOpenUserProfile(contact.id, contact.title)} onAddContact={() => setIsContactFinderOpen(true)} onCalls={() => setIsCallsHubOpen(true)} />;
    if (activeView === "you") return <SelfProfileView session={authSession} onBack={backToChats} onEdit={() => openSettings("general")} onSettings={() => handleSelectBottomTab("settings")} onPrivacy={() => openSettings("privacy")} onNotifications={() => openSettings("notifications")} onData={() => setIsDataSettingsOpen(true)} onAppearance={() => setIsModSettingsOpen(true)} onNotify={showToast} />;
    if (activeView === "folders") return <ChatFoldersView folders={folders} chats={chats} activeId={activeFolderId} onBack={() => handleSelectBottomTab("settings")} onManage={() => setIsFolderManagerOpen(true)} onSelect={id => { setActiveFolderId(id); backToChats(); }} />;
    if (activeView === 'settings') {
      return <SettingsHome
        session={authSession}
        phone={ayuSettings.streamerMode ? ayuGramEngine.maskForStreamer(authSession.user.phone || '', 'phone') : authSession.user.phone ? '+' + authSession.user.phone.replace(/^\++/, '') : '@' + (authSession.user.username || 'telegram')}
        palette={modSettingsStore.getActivePaletteTokens().name}
        deletedCount={totalDeletedItems}
        onBack={() => { setActiveView('chats'); setActiveBottomTab('chats'); setActiveNavItem('chats'); }}
        onProfile={() => handleSelectBottomTab('you')}
        onSaved={() => handleLeftNavClick('saved')}
        onFolders={handleOpenFolderManager}
        onData={() => setIsDataSettingsOpen(true)}
        powerSaving={powerSaving} onPowerSaving={togglePowerSaving}
        onLogin={() => setIsLoginModalOpen(true)}
        onSettings={openSettings}
        onDeleted={() => handleLeftNavClick('deleted')}
        onVault={() => handleLeftNavClick('vault')}
        onAyu={() => setIsAyuGramModalOpen(true)}
        onVoice={() => setIsVoiceStudioOpen(true)}
        onAppearance={() => setIsModSettingsOpen(true)}
        onCalls={() => setIsCallsHubOpen(true)}
        onResetStyle={() => { modSettingsStore.resetStyleDefaults(); showToast('Original Telegram restored'); }}
      />;
    }

    if (activeView === 'mod_features') {
      return (
        <div className="flex-1 flex flex-col bg-surface dark:bg-surface text-ink dark:text-ink overflow-y-auto">
          <div className="px-4 py-3 flex items-center gap-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas">
            <button
              type="button"
              onClick={() => {
                setActiveView('chats');
                setActiveBottomTab('chats');
                setActiveNavItem('chats');
              }}
              className="p-1 text-muted hover:text-ink cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold">TG Plus Tools</h2>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setIsAyuGramModalOpen(true)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <div>
                    <span className="font-medium block">AyuGram &amp; Vault</span>
                    <span className="text-[11px] text-muted">TTL Saver, Anti-Delete, Ghost Mode</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted" />
              </button>

              <button
                type="button"
                onClick={() => setIsModSettingsOpen(true)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Sliders className="w-4 h-4 text-primary" />
                  <span className="font-medium">Themes &amp; Wallpapers</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted" />
              </button>

              <button
                type="button"
                onClick={() => setIsAyuGramModalOpen(true)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <EyeOff className="w-4 h-4 text-primary" />
                  <span className="font-medium">Ghost &amp; Streamer Mode</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted" />
              </button>

              <button
                type="button"
                onClick={() => setIsVoiceStudioOpen(true)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <span className="font-medium">Voice Changer Studio</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderActiveChatWorkspace = () => {
    if (!authSession.isConnected) return <WelcomeView onLogin={() => { setLoginInitialTab('qr'); setIsLoginModalOpen(true); }} onPhone={() => { setLoginInitialTab('phone'); setIsLoginModalOpen(true); }} />;
    if (!activeChat) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-muted dark:text-muted text-sm chat-pattern-tg p-6 text-center space-y-2">
          <MessageSquare className="w-8 h-8 text-primary opacity-80" />
          <span>Select a chat to start messaging</span>
        </div>
      );
    }

    if (isProtectedLocked) {
      return (
        <div className="flex-1 flex flex-col bg-canvas dark:bg-canvas">
          <div className="px-4 py-3 flex items-center gap-3 border-b border-outline dark:border-outline bg-surface dark:bg-surface">
            <button
              type="button"
              onClick={() => setActiveView('chats')}
              className="p-1 text-muted lg:hidden cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-sm font-semibold">{activeChat.title}</h3>
              <span className="text-[11px] text-muted">Protected Channel</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-full max-w-xs p-6 rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline space-y-2">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center text-primary mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold">Protected Channel</h3>
              <p className="text-xs text-muted dark:text-muted">
                Media saving and forwarding are restricted by the channel owner.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                ayuGramEngine.updateSetting('bypassContentRestrictions', true);
                setBypassProtectedView(true);
                showToast('AyuGram Bypass enabled');
              }}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold cursor-pointer"
            >
              Enable AyuGram Bypass
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <ChatHeader
          chat={activeChat}
          pinnedMessages={pinnedMessages}
          onJumpToMessage={handleJumpToMessage}
          onOpenScheduled={() => setIsScheduledModalOpen(true)}
          topics={topics}
          activeTopicId={activeTopicId}
          onSelectTopic={handleSelectTopic}
          onCreateTopic={handleCreateTopic}
          searchQuery={chatSearchQuery}
          onSearchChange={setChatSearchQuery}
          matchCount={trimmedChatSearch ? displayedMessages.length : 0}
          onBackMobile={backToChats}
          onToggleInfoPanel={() => setShowInfoPanel(!showInfoPanel)}
          onOpenVoiceStudio={() => setIsVoiceStudioOpen(true)}
          onStartVoiceCall={() => startVoiceCallWithChat(activeChat, false)}
          onStartVideoCall={() => startVoiceCallWithChat(activeChat, true)}
          onOpenDisappearingModal={() => setIsDisappearingModalOpen(true)}
          onOpenUserProfile={(uid) => handleOpenUserProfile(uid, activeChat.title)}
          voiceEnabled={voiceChanger.getState().enabled}
        />

        {(activeChat.type === 'group' || activeChat.type === 'channel') && <GroupVoiceBanner key={activeChat.id} chat={activeChat} />}

        {selectionMode && (
          <div className="px-4 py-2 bg-primary/10 dark:bg-elevated border-b border-primary/25 flex items-center justify-between gap-2 text-xs z-20">
            <div className="flex items-center gap-2 font-semibold text-primary tabular-nums">
              <button
                type="button"
                onClick={exitSelectionMode}
                className="p-1 text-muted hover:text-ink dark:hover:text-white cursor-pointer"
                title="Cancel Selection"
              >
                <X className="w-4 h-4" />
              </button>
              <span>{selectedMsgIds.size} Selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setForwardPickerState({
                    isOpen: true,
                    fromChatId: activeChatId!,
                    messages: currentMessages.filter(m => selectedMsgIds.has(m.id) || currentMessages.some(selected => selectedMsgIds.has(selected.id) && selected.groupedId && selected.groupedId===m.groupedId)),
                    messageIds: currentMessages.filter(m => selectedMsgIds.has(m.id) || currentMessages.some(selected => selectedMsgIds.has(selected.id) && selected.groupedId && selected.groupedId===m.groupedId)).map(m=>m.id),
                  })
                }
                disabled={selectedMsgIds.size === 0}
                className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Forward className="w-3.5 h-3.5" />
                <span>Forward</span>
              </button>
              <button
                type="button"
                onClick={() => void handleBatchCopy()}
                disabled={selectedMsgIds.size === 0}
                className="px-2.5 py-1 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </button>
              <button
                type="button"
                onClick={() => void handleBatchDelete()}
                disabled={selectedMsgIds.size === 0}
                className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}

        {activeChat.isDeletedChat && (
          <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-2 text-xs opacity-70">
            <span className="font-medium text-rose-600 dark:text-rose-400">
              Deleted / Removed Chat · Locally archived history (70% opacity)
            </span>
            <button
              type="button"
              onClick={() => void telegramService.removeDeletedChatFromArchive(activeChat.id)}
              className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
            >
              Remove Archive
            </button>
          </div>
        )}

        {trimmedChatSearch && <SearchResults key={activeChat.id} query={chatSearchQuery} chats={chats} chatId={activeChat.id} topMsgId={activeTopicId || undefined} accountId={authSession.user.id} onSelectChat={handleSelectChatFromList} onOpenPeer={() => {}} onOpenMessage={handleOpenSearchMessage} />}
        <div className="tg-timeline-viewport relative flex flex-1 min-h-0 min-w-0">
        <div
          key={`timeline:${activeChat.id}:${activeTopicId || 0}`}
          ref={messagesContainerRef}
          hidden={Boolean(trimmedChatSearch)}
          role="region"
          aria-label="Messages"
          onScroll={handleMessagesScroll}
          className={`tg-scroll-smooth tg-timeline flex-1 min-h-0 overflow-y-auto py-3 px-2 sm:px-4 relative ${getWallpaperClass()} ${
            activeChat.isDeletedChat ? 'opacity-70' : ''
          }`}
        >
          <div ref={messagesContentRef}>
          {!trimmedChatSearch && telegramService.hasMoreMessages(activeChat.id) && currentMessages.length > 0 && (
            <div className="flex justify-center mb-3">
              <button
                type="button"
                onClick={() => void handleLoadOlderMessages()}
                disabled={telegramService.isLoadingOlder(activeChat.id)}
                className="px-3 py-1 rounded-full bg-white/95 dark:bg-elevated/85 border border-outline dark:border-outline text-[11px] font-semibold text-primary dark:text-primary hover:bg-white dark:hover:bg-hover cursor-pointer disabled:opacity-60 shadow-xs"
              >
                {telegramService.isLoadingOlder(activeChat.id) ? 'Loading older messages...' : '↑ Scroll or tap for older messages'}
              </button>
            </div>
          )}

          {isLoadingChatMessages && currentMessages.length === 0 ? (
            <div className="space-y-3 py-4 px-2 animate-pulse select-none">
              <div className="flex items-end gap-2">
                <div className="w-8 h-8 rounded-full bg-elevated/80 dark:bg-white/10 shrink-0" />
                <div className="w-56 h-14 rounded-2xl rounded-bl-xs bg-white/95 dark:bg-elevated/85 border border-outline/70 dark:border-outline" />
              </div>
              <div className="flex justify-end">
                <div className="w-48 h-11 rounded-2xl rounded-br-xs bg-[#EFFDDE] dark:bg-elevated/80 border border-emerald-200/70 dark:border-outline" />
              </div>
              <div className="flex items-end gap-2">
                <div className="w-8 h-8 rounded-full bg-elevated/80 dark:bg-white/10 shrink-0" />
                <div className="w-64 h-36 rounded-2xl rounded-bl-xs bg-white/95 dark:bg-elevated/85 border border-outline/70 dark:border-outline" />
              </div>
              <div className="flex justify-end">
                <div className="w-52 h-12 rounded-2xl rounded-br-xs bg-[#EFFDDE] dark:bg-elevated/80 border border-emerald-200/70 dark:border-outline" />
              </div>
            </div>
          ) : displayedMessages.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted dark:text-muted">
              {trimmedChatSearch
                ? `No messages matching "${chatSearchQuery.trim()}".`
                : 'No messages in this conversation yet.'}
            </div>
          ) : (
            timelineGroups.map((album, idx) => {
              const msg = album[0];
              const prevMsg = idx > 0 ? timelineGroups[idx - 1].at(-1)! : null;
              const msgDate = new Date(msg.timestamp);
              const prevDate = prevMsg ? new Date(prevMsg.timestamp) : null;
              const isNewDay =
                !prevDate ||
                msgDate.getFullYear() !== prevDate.getFullYear() ||
                msgDate.getMonth() !== prevDate.getMonth() ||
                msgDate.getDate() !== prevDate.getDate();

              let datePillLabel = '';
              if (isNewDay) {
                const now = new Date();
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                const msgDayStart = new Date(
                  msgDate.getFullYear(),
                  msgDate.getMonth(),
                  msgDate.getDate()
                ).getTime();
                const diffDays = Math.round((todayStart - msgDayStart) / 86_400_000);
                if (diffDays === 0) datePillLabel = 'Today';
                else if (diffDays === 1) datePillLabel = 'Yesterday';
                else {
                  datePillLabel = msgDate.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    ...(msgDate.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
                  });
                }
              }

              return (
                <React.Fragment key={msg.id}>
                  {isNewDay && datePillLabel && (
                    <div className="flex justify-center my-2.5 select-none">
                      <span className="px-3 py-0.5 rounded-full tg-message-date text-[11.5px] font-semibold shadow-xs border border-white/10 dark:border-white/[0.06]">
                        {datePillLabel}
                      </span>
                    </div>
                  )}
                  <MessageItem
                    message={msg}
                    albumMessages={album.length > 1 ? album : undefined}
                    chatId={activeChat.id}
                    chatTitle={activeChat.title}
                    isChannel={activeChat.type === 'channel'}
                    isProtected={activeChat.isProtected}
                    highlightQuery={chatSearchQuery}
                    selectionMode={selectionMode}
                    isSelected={album.some(item=>selectedMsgIds.has(item.id))}
                    onToggleSelect={toggleSelectMessage}
                    onStartSelection={startSelectionWith}
                    onOpenMedia={handleOpenViewerMedia}
                    onReply={handleReplyMsg}
                    onEdit={handleEditMsg}
                    onOpenForwardPicker={handleOpenForwardMsg}
                    onOpenComments={handleOpenCommentsMsg}
                    onBotSwitchInline={handleBotSwitchInlineText}
                    onOpenChatByLink={handleOpenChatByLink}
                    onOpenUserProfile={handleOpenUserProfile}
                    onJumpToMessage={handleJumpToMessage}
                    onNotify={showToast}
                  />
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
          </div>


        </div>
          {showScrollBottom && (
            <button
              type="button"
              onClick={() => { const container=messagesContainerRef.current; if (!container) return; followLatestRef.current = true; scrollToEnd(container, modSettingsStore.getSettings().enableSmoothAnimations && container.scrollHeight-container.scrollTop-container.clientHeight<2500); }}
              aria-label="Scroll to latest messages"
              className="absolute bottom-4 right-4 z-20 w-11 h-11 rounded-full bg-surface dark:bg-elevated border border-outline dark:border-outline shadow-lg flex items-center justify-center text-muted dark:text-ink hover:text-primary cursor-pointer"
              title="Scroll to Latest Messages"
            >
              <ChevronDown className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        {activeChat.isDeletedChat ? (
          <div className="px-4 py-3 border-t border-outline dark:border-outline bg-surface dark:bg-surface text-center text-xs text-muted dark:text-muted opacity-70">
            This conversation was deleted or left on Telegram. Archived messages remain readable locally.
          </div>
        ) : (
          <ChatInput
            key={`composer:${activeChat.id}`}
            chatId={activeChat.id}
            isChannel={activeChat.type === 'channel'}
            canPostMessages={
              activeChat.type === 'user' || activeChat.type === 'bot' || activeChat.type === 'saved'
                ? true
                : (activeChatDetails?.canPostMessages ?? activeChat.canPostMessages ?? true)
            }
            canSendMedia={
              activeChat.type === 'user' || activeChat.type === 'bot' || activeChat.type === 'saved'
                ? true
                : (activeChatDetails?.canSendMedia ?? activeChat.canSendMedia ?? true)
            }
            sendRestrictionReason={
              activeChatDetails?.sendRestrictionReason || activeChat.sendRestrictionReason
            }
            sendErrorReason={sendErrorReason}
            onDismissSendError={() => setSendErrorReason(null)}
            isMuted={Boolean(activeChat.isMuted)}
            onToggleMute={() => telegramService.toggleMuteChat(activeChat.id)}
            isProtected={activeChat.isProtected}
            isBotChat={activeChat.type === 'bot'}
            botCommands={chatBotCommands}
            draftText={activeChat.draftText}
            topMsgId={activeTopicId || undefined}
            prefillText={composerPrefillText}
            onConsumePrefill={() => setComposerPrefillText(undefined)}
            replyingTo={replyingTo}
            editingMessage={editingMessage}
            onSendMessage={(text, voice, att, sched) => handleSendMessage(text, voice, att, sched)}
            onSaveEdit={handleSaveEdit}
            onCancelReply={() => setReplyingTo(null)}
            onCancelEdit={() => setEditingMessage(null)}
            onOpenDisappearingModal={() => setIsDisappearingModalOpen(true)}
            onOpenPollModal={() => setIsPollModalOpen(true)}
            onNotify={showToast}
          />
        )}
      </>
    );
  };

  const telegramNavigation = modSettings.navigationStyle === 'telegram' || (modSettings.navigationStyle === 'auto' && !modSettingsStore.getActivePaletteTokens().id.startsWith('flow-'));
  return (
    <div className={`tg-app ${activeView !== 'chat_room' && authSession.isConnected ? 'tg-root-tabs' : ''} h-[100dvh] w-full max-w-[100vw] bg-canvas dark:bg-canvas text-ink dark:text-ink flex font-sans select-none overflow-hidden`}>
      {activeView !== 'chat_room' && authSession.isConnected && <MobileBottomNav modern={telegramNavigation} user={authSession.user} active={activeBottomTab === 'deleted' ? 'settings' : activeBottomTab} unread={totalUnread} onSelect={handleSelectBottomTab} />}
      <CallRecordingIndicator onOpen={() => setIsCallsHubOpen(true)} />
      {/* Toast Notice */}
      {toastNotice && (
        <div role="status" aria-live="polite" className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-xl bg-surface dark:bg-elevated border border-outline dark:border-outline text-xs font-medium shadow-xl flex items-center gap-2">
          <span>{toastNotice}</span>
        </div>
      )}

      {/* Incoming Telegram Voice / Video Call Banner */}
      {incomingCallPrompt && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-24px)] max-w-sm rounded-2xl bg-surface/95 backdrop-blur-xl border border-white/15 shadow-2xl p-3.5 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <Avatar
                src={incomingCallPrompt.chat.avatarUrl}
                title={incomingCallPrompt.chat.title}
                id={incomingCallPrompt.chat.id}
                size="md"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center animate-bounce shadow-md">
                {incomingCallPrompt.isVideo ? (
                  <Video className="w-3 h-3" />
                ) : (
                  <PhoneIncoming className="w-3 h-3" />
                )}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{incomingCallPrompt.chat.title}</p>
              <p className="text-[11px] text-[#78B9FF]">
                Incoming Telegram {incomingCallPrompt.isVideo ? 'Video' : 'Voice'} Call...
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEffects.stopIncomingRing();
                if (incomingCallPrompt.nativeCall) void telegramService.discardPhoneCall({callId:incomingCallPrompt.nativeCall.id,accessHash:incomingCallPrompt.nativeCall.accessHash,isVideo:incomingCallPrompt.isVideo});
                telegramService.sendCallSignal({
                  action: 'hangup',
                  chatId: incomingCallPrompt.chat.id,
                  callId: incomingCallPrompt.callId,
                });
                setIncomingCallPrompt(null);
              }}
              className="w-9 h-9 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md cursor-pointer"
              title="Decline Call"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                soundEffects.stopIncomingRing();
                const prompt = incomingCallPrompt;
                setIncomingCallPrompt(null);
                setCallTargetChat(prompt.chat);
                setCallInitialVideo(prompt.isVideo);
                setActiveIncomingOffer({
                  callId: prompt.callId,
                  nativeCall: prompt.nativeCall,
                  sdp: prompt.sdp,
                  isVideo: prompt.isVideo,
                });
                setIsVoiceCallOpen(true);
              }}
              className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md cursor-pointer"
              title="Accept Call"
            >
              {incomingCallPrompt.isVideo ? (
                <Video className="w-4 h-4" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* COLUMN 1: Compact Vertical Navigation Rail (Desktop >= lg) */}
      <aside
        aria-label="Primary navigation"
        className="tg-desktop-nav hidden lg:flex w-[72px] shrink-0 flex-col items-center justify-between py-3 px-1.5 bg-surface-low/95 dark:bg-canvas border-r border-outline dark:border-outline z-20"
      >
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={() => handleLeftNavClick('chats')}
            className="w-11 h-11 rounded-2xl bg-primary hover:bg-primary-hover active:scale-95 text-white flex items-center justify-center shadow-sm cursor-pointer transition-all duration-150"
            title="Webygram — All Chats"
          >
            <svg className="w-5.5 h-5.5 fill-current mr-0.5" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.63 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 4-1.74 6.72-2.92 8.16-3.55 3.88-1.7 4.69-1.99 5.22-2 .12 0 .38.03.55.17.14.12.18.28.2.45-.02.07-.02.24-.04.4z" />
            </svg>
          </button>

          <div className="w-8 h-px bg-elevated/80 dark:bg-white/[0.07]" />

          {/* Primary Navigation Items */}
          <nav className="flex flex-col items-center gap-1 w-full">
            {(
              [
                {
                  id: 'chats' as const,
                  label: 'Chats',
                  icon: MessageSquare,
                  badge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : String(totalUnread)) : undefined,
                  badgeTone: 'accent',
                },
                {
                  id: 'channels' as const,
                  label: 'Channels',
                  icon: Radio,
                },
                {
                  id: 'calls' as const,
                  label: 'Calls',
                  icon: Phone,
                },
                {
                  id: 'saved' as const,
                  label: 'Saved',
                  icon: Bookmark,
                },
                {
                  id: 'vault' as const,
                  label: 'Vault',
                  icon: FolderArchive,
                },
                {
                  id: 'deleted' as const,
                  label: 'Deleted',
                  icon: Trash2,
                  badge: totalDeletedItems > 0 ? (totalDeletedItems > 99 ? '99+' : String(totalDeletedItems)) : undefined,
                  badgeTone: 'rose',
                },
                {
                  id: 'mods' as const,
                  label: 'Mods',
                  icon: ShieldCheck,
                  dotActive: ayuSettings.ghostModeActive,
                },
              ] as const
            ).map((item) => {
              const IconComp = item.icon;
              const isActive = activeNavItem === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleLeftNavClick(item.id)}
                  title={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative w-full py-2 rounded-xl flex flex-col items-center gap-0.5 active:scale-95 transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-primary/14 text-primary'
                      : 'text-muted dark:text-muted hover:bg-hover/60 dark:hover:bg-white/[0.05] hover:text-ink dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-primary" />
                  )}
                  <div className="relative">
                    <IconComp className="w-[19px] h-[19px] transition-transform duration-150 group-hover:scale-105" />
                    {'badge' in item && item.badge && (
                      <span
                        className={`absolute -top-1.5 -right-3 px-1.5 py-0.2 text-[9px] font-bold rounded-full tabular-nums leading-3.5 ${
                          item.badgeTone === 'rose'
                            ? 'bg-rose-500 text-white'
                            : 'bg-primary text-white'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {'dotActive' in item && item.dotActive && (
                      <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-outline dark:ring-[#0E1621]" />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Utility Dock: Create/Login, Lock, Appearance, Theme, Settings */}
        <div className="flex flex-col items-center gap-1.5 w-full pt-2 border-t border-outline/70 dark:border-white/[0.06]">
          {authSession.isConnected ? (
            <button
              type="button"
              onClick={() => {
                setCreateModalMode('group');
                setIsCreateChatOpen(true);
              }}
              className="w-10 h-10 rounded-xl bg-primary/12 hover:bg-primary text-primary hover:text-white active:scale-95 flex items-center justify-center cursor-pointer transition-all duration-150"
              title="New Group or Channel"
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsLoginModalOpen(true)}
              className="w-10 h-10 rounded-xl bg-primary hover:bg-primary-hover active:scale-95 text-white flex items-center justify-center cursor-pointer transition-all duration-150 shadow-xs"
              title="QR Code Sign In"
            >
              <QrCode className="w-[18px] h-[18px]" />
            </button>
          )}

          {hasPasscode && (
            <button
              type="button"
              onClick={() => passcodeService.lockNow()}
              className="w-10 h-10 rounded-xl text-muted dark:text-muted hover:bg-hover/60 dark:hover:bg-white/[0.06] hover:text-primary active:scale-95 flex items-center justify-center cursor-pointer transition-all duration-150"
              title="Lock App"
            >
              <Lock className="w-[18px] h-[18px]" />
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              modSettingsStore.updateSetting(
                'themeMode',
                modSettings.themeMode === 'dark' ? 'light' : 'dark'
              )
            }
            className="w-10 h-10 rounded-xl text-muted dark:text-muted hover:bg-hover/60 dark:hover:bg-white/[0.06] hover:text-primary active:scale-95 flex items-center justify-center cursor-pointer transition-all duration-150"
            title={modSettings.themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Night Mode'}
          >
            {modSettings.themeMode === 'dark' ? (
              <Sun className="w-[18px] h-[18px]" />
            ) : (
              <Moon className="w-[18px] h-[18px]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleLeftNavClick('settings')}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 cursor-pointer transition-all duration-150 ${
              activeNavItem === 'settings' || isSettingsOpen
                ? 'bg-primary/14 text-primary'
                : 'text-muted dark:text-muted hover:bg-hover/60 dark:hover:bg-white/[0.06] hover:text-ink dark:hover:text-white'
            }`}
            title="Settings"
          >
            <Settings className="w-[19px] h-[19px]" />
          </button>
        </div>
      </aside>

      {/* COLUMN 2: Chat List / Mobile Subviews */}
      <div
        className={`${
          activeView === 'chat_room' ||
          activeView === 'channels' ||
          activeView === 'vault' ||
          activeView === 'deleted'
            ? 'hidden lg:flex'
            : 'flex'
        } tg-sidebar w-full lg:w-80 xl:w-84 shrink-0 flex-col h-full`}
      >
        {activeView === 'settings' || activeView === 'mod_features' || activeView === 'contacts' || activeView === 'you' || activeView === 'folders' ? (
          <div className={telegramNavigation ? "flex-1 flex flex-col h-full" : "flex-1 flex flex-col h-full lg:hidden"}>{renderMobileSubView()}</div>
        ) : null}

        <div className={`${activeView === 'settings' || activeView === 'mod_features' || activeView === 'contacts' || activeView === 'you' || activeView === 'folders' ? telegramNavigation ? 'hidden' : 'hidden lg:flex' : 'flex'} flex-1 flex-col h-full overflow-hidden`}>
          {!authSession.isConnected && <div className="flex flex-1 flex-col lg:hidden"><WelcomeView onLogin={() => { setLoginInitialTab('qr'); setIsLoginModalOpen(true); }} onPhone={() => { setLoginInitialTab('phone'); setIsLoginModalOpen(true); }} /></div>}
          <div className={authSession.isConnected ? 'contents' : 'hidden lg:contents'}>
          <ChatList
            chats={chats}
            currentUser={authSession.user}
            isConnected={authSession.isConnected}
            isLoadingDialogs={isLoadingDialogs}
            selectedChatId={activeChatId}
            onSelectChat={handleSelectChatFromList}
            onOpenSearchMessage={handleOpenSearchMessage}
            onOpenChatByLink={handleOpenChatByLink}
            onCreateChat={handleCreateChatFromList}
            folders={folders}
            activeFolderId={activeFolderId}
            onSelectFolder={setActiveFolderId}
            onOpenFolderManager={handleOpenFolderManager}
            onOpenModSettings={handleOpenModSettings}
            onOpenAyuGramSettings={handleOpenAyuGramSettings}
            onOpenLoginModal={handleOpenLoginModal}
            onOpenMyProfile={() => handleSelectBottomTab("you")}
            onOpenData={() => setIsDataSettingsOpen(true)}
            onOpenCategory={openSettings} powerSaving={powerSaving} onPowerSaving={togglePowerSaving}
            onLogout={async () => { await telegramService.logout(); backToChats(); }}
            onOpenCallsHub={() => setIsCallsHubOpen(true)}
            onOpenVoiceStudio={() => setIsVoiceStudioOpen(true)}
            activeBottomTab={activeBottomTab}
            onSelectBottomTab={handleSelectBottomTab}
          />
          </div>
        </div>
      </div>

      {/* COLUMN 3: Active Workspace (Chat / Channels Hub / Vault / Deleted Logs) */}
      <main
        className={`${
          activeView === 'chat_room' ||
          activeView === 'channels' ||
          activeView === 'vault' ||
          activeView === 'deleted'
            ? 'flex'
            : 'hidden lg:flex'
        } flex-1 flex-col h-full min-w-0 overflow-hidden relative bg-canvas dark:bg-canvas`}
      >
        {activeNavItem === 'channels' || activeView === 'channels' ? (
          <ChannelsHubView
            chats={chats}
            isConnected={authSession.isConnected}
            onSelectChat={(chatId, openInfo) => handleSelectChat(chatId, Boolean(openInfo))}
            onOpenChatByLink={handleOpenChatByLink}
            onOpenCreateModal={(mode) => {
              setCreateModalMode(mode);
              setIsCreateChatOpen(true);
            }}
            onOpenLoginModal={() => setIsLoginModalOpen(true)}
            onBackMobile={() => {
              setActiveView('chats');
              setActiveBottomTab('chats');
              setActiveNavItem('chats');
            }}
          />
        ) : activeNavItem === 'vault' || activeView === 'vault' ? (
          <VaultView
            chats={chats}
            onNotify={showToast}
            onBackMobile={() => {
              setActiveView('chats');
              setActiveBottomTab('chats');
              setActiveNavItem('chats');
            }}
          />
        ) : activeNavItem === 'deleted' || activeView === 'deleted' ? (
          <DeletedLogsView
            chats={chats}
            onSelectChat={(chatId) => handleSelectChat(chatId, false)}
            onBackMobile={() => {
              setActiveView('chats');
              setActiveBottomTab('chats');
              setActiveNavItem('chats');
            }}
          />
        ) : (
          renderActiveChatWorkspace()
        )}
      </main>

      {/* COLUMN 4: Right Profile & Details Sidebar (Desktop docked >= md, slide-over drawer < md) */}
      {activeChat &&
        showInfoPanel &&
        activeNavItem !== 'channels' &&
        activeNavItem !== 'vault' &&
        activeNavItem !== 'deleted' && (
        <div
          onClick={() => {
            if (typeof window !== 'undefined' && window.innerWidth < 1280) {
              setShowInfoPanel(false);
            }
          }}
          className="fixed inset-0 z-40 xl:static xl:z-auto flex justify-end bg-black/50 xl:bg-transparent h-full shrink-0"
        >
          <div onClick={(e) => e.stopPropagation()} className="h-full flex">
            <ChatInfoPanel
              onOpenSharedMessage={message=>{if(!activeChat)return;if(document.getElementById("msg-"+message.id))handleJumpToMessage(message.id);else void handleOpenSearchMessage({chat:activeChat,message}).catch(error=>showToast(error.message));}}
              key={activeChat.id}
              chat={activeChat}
              onJumpToMessage={handleJumpToMessage}
          messages={currentMessages}
              isOpen={showInfoPanel}
              onClose={() => setShowInfoPanel(false)}
              onOpenMedia={(media, messageId) => setActiveViewerMedia({ media, messageId })}
              onOpenDisappearingModal={() => setIsDisappearingModalOpen(true)}
              onOpenScheduled={() => setIsScheduledModalOpen(true)}
              onOpenAyuGram={() => setIsAyuGramModalOpen(true)}
              onOpenChatByLink={(link) => void handleOpenChatByLink(link)}
              onOpenUserProfile={handleOpenUserProfile}
              onNotify={showToast}
            />
          </div>
        </div>
      )}

      {/* Draggable Floating Voice Changer */}
      {modSettings.showVoiceFloatingButton && (
        <FloatingVoiceChanger onOpenFullStudio={() => setIsVoiceStudioOpen(true)} />
      )}

      {/* Modals */}
      <VoiceChangerStudio
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
      />

      <ModSettingsView
        isOpen={isModSettingsOpen}
        onClose={() => setIsModSettingsOpen(false)}
        onNotify={showToast}
      />

      <AyuGramSettingsModal
        isOpen={isAyuGramModalOpen}
        onClose={() => setIsAyuGramModalOpen(false)}
        chats={chats}
        activeChatId={activeChatId}
      />

      <SettingsModal
        initialCategory={settingsCategory}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isConnected={authSession.isConnected}
        currentUser={authSession.user}
        folders={folders}
        onOpenVoiceStudio={() => setIsVoiceStudioOpen(true)}
        onOpenModSettings={() => setIsModSettingsOpen(true)}
        onOpenAyuGramSettings={() => setIsAyuGramModalOpen(true)}
        onOpenDeletedLogs={() => handleLeftNavClick('deleted')}
        onOpenFolderManager={() => setIsFolderManagerOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onNotify={showToast}
      />

      {isContactFinderOpen && <div role="dialog" aria-modal="true" aria-label="Find a contact" className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4" onClick={() => setIsContactFinderOpen(false)}><form className="tg-next-card w-full max-w-sm p-5" onClick={e => e.stopPropagation()} onSubmit={async e => { e.preventDefault(); if (!contactLink.trim() || contactBusy) return; setContactBusy(true); try { await handleOpenChatByLink(contactLink.trim()); setIsContactFinderOpen(false); setContactLink(""); } catch (error) { showToast((error as Error).message || "Could not find contact"); } finally { setContactBusy(false); } }}><h2 className="font-semibold text-lg mb-4">Find a contact</h2><input className="tg-search-field w-full" aria-label="Telegram username or link" placeholder="@username or t.me link" autoFocus value={contactLink} onChange={e => setContactLink(e.target.value)} /><div className="flex justify-end gap-3 mt-4"><button type="button" onClick={() => setIsContactFinderOpen(false)}>Cancel</button><button type="submit" className="tg-next-primary" disabled={contactBusy || !contactLink.trim()}>{contactBusy ? "Opening…" : "Open"}</button></div></form></div>}
      <DataSettingsPanel isOpen={isDataSettingsOpen} onClose={() => setIsDataSettingsOpen(false)} />
      <TelegramLoginModal
        key={loginInitialTab}
        initialTab={loginInitialTab}
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={() => {
          setAuthSession(telegramService.getAuthSession());
          showToast('Telegram account connected');
        }}
      />

      <DisappearingMediaModal
        isOpen={isDisappearingModalOpen}
        onClose={() => setIsDisappearingModalOpen(false)}
        onSend={handleSendDisappearingMedia}
      />

      {activeViewerMedia && (
        <MediaViewerModal
          key={`${viewerChatId}:${activeViewerMedia.messageId}`}
          media={telegramService.getMessages(viewerChatId).find(message => message.id === activeViewerMedia.messageId)?.media || telegramService.getSharedMedia(viewerChatId, 'media')?.find(message => message.id === activeViewerMedia.messageId)?.media || activeViewerMedia.media}
          chatId={viewerChatId}
          chatTitle={chats.find(chat=>chat.id===viewerChatId)?.title || activeChat?.title || 'Chat'}
          gallery={viewerGallery}
          onForward={(chatId,messageId)=>{const source=[...telegramService.getMessages(chatId),...(telegramService.getSharedMedia(chatId,'media') || [])];const message=source.find(item=>item.id===messageId);if(!message || !/^\d+$/.test(messageId)){showToast('This item cannot be forwarded as a message.');return;}const selected=albumForwardSelection([...new Map(source.map(item=>[item.id,item])).values()],message);setActiveViewerMedia(null);setForwardPickerState({isOpen:true,fromChatId:chatId,messageIds:selected.map(item=>item.id),messages:selected});}}
          onNavigate={(media,messageId)=>setActiveViewerMedia({media,messageId,chatId:viewerChatId})}
          messageId={activeViewerMedia.messageId}
          isProtected={chats.find(chat=>chat.id===viewerChatId)?.isProtected || false}
          onClose={() => setActiveViewerMedia(null)}
        />
      )}

      {isCallsHubOpen && (
        <div role="dialog" aria-modal="true" aria-label="Calls" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl overflow-hidden text-ink dark:text-ink flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b border-outline dark:border-outline flex items-center justify-between bg-surface-low dark:bg-canvas">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Calls &amp; Recordings</h3>
                  <p className="text-[11px] text-muted dark:text-muted">
                    Voice calls, recordings and voice effects
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCallsHubOpen(false)}
                aria-label="Close calls"
                className="p-1.5 rounded-lg text-muted hover:text-ink dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-outline dark:border-outline flex items-center justify-between gap-2 bg-surface-low/50 dark:bg-elevated/60">
              <div className="text-xs">
                <span className="font-medium block">Real-Time Voice Changer</span>
                <span className="text-[11px] text-muted dark:text-muted">
                  Preview and adjust your voice effects
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCallsHubOpen(false);
                  setIsVoiceStudioOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Voice Studio</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-outline dark:divide-outline">
              <div className="p-3"><CallRecordingPanel /></div>
              {!authSession.isConnected ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-xs text-muted dark:text-muted">
                    Connect your Telegram account to view contacts for calling.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCallsHubOpen(false);
                      setIsLoginModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
                  >
                    Sign In via QR Code
                  </button>
                </div>
              ) : (
                (() => {
                  const callableContacts = chats.filter((c) => c.type === 'user');
                  if (callableContacts.length === 0) {
                    return (
                      <div className="p-6 text-center text-xs text-muted dark:text-muted">
                        No direct user contacts loaded yet. Select a user chat to start a call.
                      </div>
                    );
                  }
                  return callableContacts.slice(0, 25).map((contact) => (
                    <div
                      key={contact.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-2.5 hover:bg-hover dark:hover:bg-hover"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsCallsHubOpen(false);
                          handleSelectChat(contact.id);
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <Avatar
                          src={contact.avatarUrl}
                          title={contact.title}
                          id={contact.id}
                          size="sm"
                          isOnline={contact.status === 'online'}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{contact.title}</p>
                          <p className="text-[11px] text-muted dark:text-muted truncate">
                            {contact.status === 'online'
                              ? 'online'
                              : contact.username
                              ? `@${contact.username}`
                              : 'last seen recently'}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCallsHubOpen(false);
                            startVoiceCallWithChat(contact, false);
                          }}
                          className="p-2 rounded-xl bg-primary/15 hover:bg-primary text-primary hover:text-white transition-colors cursor-pointer"
                          title={`Voice Call ${contact.title}`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCallsHubOpen(false);
                            startVoiceCallWithChat(contact, true);
                          }}
                          className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-600 dark:text-emerald-400 hover:text-white transition-colors cursor-pointer"
                          title={`Video Call ${contact.title}`}
                        >
                          <Video className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {isConfirmCallOpen && (callTargetChat || activeChat) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
          <div className="w-full max-w-xs rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline p-5 space-y-4 text-ink dark:text-ink shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                {callInitialVideo ? <Video className="w-4.5 h-4.5" /> : <Phone className="w-4.5 h-4.5" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold">
                  {callInitialVideo ? 'Start Video Call?' : 'Start Voice Call?'}
                </h3>
                <p className="text-[11px] text-muted dark:text-muted">
                  Call {(callTargetChat || activeChat)?.title} with Voice Changer DSP
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmCallOpen(false);
                  setCallTargetChat(null);
                  setCallInitialVideo(false);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-elevated dark:bg-elevated text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmCallOpen(false);
                  setIsVoiceCallOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold cursor-pointer"
              >
                Call Now
              </button>
            </div>
          </div>
        </div>
      )}

      <VoiceCallModal
        chat={callTargetChat || activeChat || null}
        isOpen={isVoiceCallOpen}
        initialVideo={callInitialVideo}
        incomingOffer={activeIncomingOffer}
        onClose={() => {
          setIsVoiceCallOpen(false);
          setCallTargetChat(null);
          setCallInitialVideo(false);
          setActiveIncomingOffer(null);
        }}
      />

      <CreateChatModal
        isOpen={isCreateChatOpen}
        initialMode={createModalMode}
        chats={chats}
        onClose={() => setIsCreateChatOpen(false)}
        onCreated={(created) => {
          handleSelectChat(created.id, false);
          showToast(`Created ${created.title}`);
        }}
      />

      {forwardPickerState.fromChatId && (
        <ForwardPickerModal
          isOpen={forwardPickerState.isOpen}
          fromChatId={forwardPickerState.fromChatId}
          messages={forwardPickerState.messages || []}
          messageIds={forwardPickerState.messageIds}
          chats={chats}
          onClose={() => setForwardPickerState({ isOpen: false, messageIds: [] })}
          onForwarded={(count, targetTitles, scheduled) => {
            showToast(
              `${scheduled ? 'Scheduled' : 'Forwarded'} ${count} item(s) to ${targetTitles.slice(0, 2).join(', ')}${
                targetTitles.length > 2 ? ` +${targetTitles.length - 2}` : ''
              }`
            );
            exitSelectionMode();
          }}
          onNotify={showToast}
        />
      )}

      {activeChat && (
        <PollComposerModal
          isOpen={isPollModalOpen}
          chatId={activeChat.id}
          topMsgId={activeTopicId || undefined}
          onClose={() => setIsPollModalOpen(false)}
          onCreated={(scheduled) => showToast(scheduled ? 'Poll scheduled' : 'Poll posted')}
          onNotify={showToast}
        />
      )}

      {activeChat && (
        <ScheduledQueueModal
          isOpen={isScheduledModalOpen}
          chatId={activeChat.id}
          chatTitle={activeChat.title}
          onClose={() => setIsScheduledModalOpen(false)}
          onNotify={showToast}
        />
      )}

      {activeChat && (
        <CommentsDrawer
          isOpen={Boolean(commentsPost)}
          chatId={activeChat.id}
          postMessage={commentsPost}
          onClose={() => setCommentsPost(null)}
          onNotify={showToast}
        />
      )}

      <FolderManagerModal
        isOpen={isFolderManagerOpen}
        folders={folders}
        chats={chats}
        onClose={() => setIsFolderManagerOpen(false)}
        onNotify={showToast}
      />

      <UserProfileModal
        onOpenChatByLink={handleOpenChatByLink}
        isOpen={Boolean(activeUserProfileId)}
        userId={activeUserProfileId}
        contextChatId={activeChatId}
        fallbackName={activeUserProfileFallbackName}
        onClose={() => {
          setActiveUserProfileId(null);
          setActiveUserProfileFallbackName(undefined);
        }}
        onOpenDirectChat={(user: UserProfileInfo) => {
          const directChat = telegramService.ensureDirectChatFromProfile(user);
          handleSelectChat(directChat.id, false);
        }}
        onStartVoiceCall={(user: UserProfileInfo) => {
          const existing = chats.find((c) => c.id === user.id) || {
            id: user.id,
            title: user.title,
            type: 'user' as const,
            avatarUrl: user.avatarUrl,
            unreadCount: 0,
            isPinned: false,
            isMuted: false,
          };
          startVoiceCallWithChat(existing, false);
        }}
        onStartVideoCall={(user: UserProfileInfo) => {
          const existing = chats.find((c) => c.id === user.id) || {
            id: user.id,
            title: user.title,
            type: 'user' as const,
            avatarUrl: user.avatarUrl,
            unreadCount: 0,
            isPinned: false,
            isMuted: false,
          };
          startVoiceCallWithChat(existing, true);
        }}
        onOpenMedia={(media, messageId) => setActiveViewerMedia({ media, messageId, chatId: activeUserProfileId || undefined })}
        onNotify={showToast}
      />

      {isLocked && <PasscodeLockScreen onUnlocked={() => setIsLocked(false)} />}
    </div>
  );
}
