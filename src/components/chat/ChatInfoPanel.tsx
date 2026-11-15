import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  Bell,
  BellOff,
  Shield,
  FileText,
  Image,
  Mic,
  CheckCircle2,
  Unlock,
  Play,
  Download,
  Clock,
  Lock,
  Pin,
  ChevronRight,
  Forward,
  Link2,
  X,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  MessageSquare,
  Users,
  Edit3,
  Copy,
  RefreshCw,
  UserPlus,
  ShieldAlert,
  LogOut,
  Trash2,
  Camera,
  Ban,
  CalendarClock,
  Sliders,
  Sparkles,
  History,
  Radio,
  Globe,
  Hash,
} from 'lucide-react';
import {
  TelegramChat,
  TelegramMessage,
  MediaAttachment,
  ChatMemberInfo,
  JoinRequestItem,
  ChatBannedRightsState,
  AutoForwardRule,
  BannedMemberItem,
  AdminLogEventItem,
} from '../../types/telegram';
import {
  telegramService,
  TargetGroupInfo,
  BulkForwardProgress,
  ChatDetailsInfo,
} from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { AyuGramSettings } from '../../types/ayugram';
import { Avatar } from '../common/Avatar';
import { extractLinksFromText } from '../../utils/links';

interface Props {
  chat: TelegramChat;
  messages: TelegramMessage[];
  isOpen: boolean;
  onClose: () => void;
  onOpenMedia: (media: MediaAttachment, messageId: string) => void;
  onOpenDisappearingModal?: () => void;
  onOpenScheduled?: () => void;
  onOpenAyuGram?: () => void;
  onOpenChatByLink?: (link: string) => void;
  onOpenUserProfile?: (userId: string, fallbackName?: string) => void;
  onNotify?: (msg: string) => void;
}

export const ChatInfoPanel: React.FC<Props> = ({
  chat,
  messages,
  isOpen,
  onClose,
  onOpenMedia,
  onOpenDisappearingModal,
  onOpenScheduled,
  onOpenAyuGram,
  onOpenChatByLink,
  onOpenUserProfile,
  onNotify,
}) => {
  // Default to 'media' so shared group/channel media is immediately visible like official Telegram
  const [activeMediaTab, setActiveMediaTab] = useState<'media' | 'files' | 'links' | 'voice'>('media');
  const [ayuSettings, setAyuSettings] = useState<AyuGramSettings>(ayuGramEngine.getSettings());
  const [targetGroup, setTargetGroup] = useState<TargetGroupInfo | null>(telegramService.getTargetGroup());
  const [autoForwardRule, setAutoForwardRule] = useState<AutoForwardRule | undefined>(
    telegramService.getAutoForwardRule(chat.id)
  );
  const [togglingAutoForward, setTogglingAutoForward] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkForwardProgress | null>(
    telegramService.getBulkForwardProgress()
  );
  const [linkInput, setLinkInput] = useState('');
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [isResolvingTarget, setIsResolvingTarget] = useState(false);
  const [isForwardingAll, setIsForwardingAll] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [forwardStatus, setForwardStatus] = useState<string | null>(null);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [sharedMediaState, setSharedMediaState] = useState<{
    media?: TelegramMessage[];
    files?: TelegramMessage[];
    voice?: TelegramMessage[];
    loading: boolean;
    hasMore: boolean;
  }>({ loading: false, hasMore: false });

  // Group / Channel Details & Full Official Telegram Management State
  const [details, setDetails] = useState<ChatDetailsInfo | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showEditSection, setShowEditSection] = useState(false);
  const [showMembersSection, setShowMembersSection] = useState(chat.type === 'group');
  const [showPermissionsSection, setShowPermissionsSection] = useState(false);
  const [showJoinRequestsSection, setShowJoinRequestsSection] = useState(false);
  const [showBannedSection, setShowBannedSection] = useState(false);
  const [showAdminLogSection, setShowAdminLogSection] = useState(false);

  // Full Official Edit Fields
  const [editTitle, setEditTitle] = useState(chat.title);
  const [editAbout, setEditAbout] = useState(chat.description || '');
  const [editIsPublic, setEditIsPublic] = useState(Boolean(chat.username));
  const [editUsername, setEditUsername] = useState(chat.username || '');
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available?: boolean;
    reason?: string;
  }>({ checking: false });
  const [editProtected, setEditProtected] = useState(Boolean(chat.isProtected));
  const [editHistoryHidden, setEditHistoryHidden] = useState(false);
  const [editIsForum, setEditIsForum] = useState(Boolean(chat.isForum));
  const [editSignatures, setEditSignatures] = useState(false);
  const [editLinkedChatId, setEditLinkedChatId] = useState('');
  const [editTtlPeriod, setEditTtlPeriod] = useState<number>(0);
  const [editReactionsMode, setEditReactionsMode] = useState<'all' | 'some' | 'none'>('all');
  const [editAvatarDataUrl, setEditAvatarDataUrl] = useState<string | undefined>(undefined);
  const [editRemoveAvatar, setEditRemoveAvatar] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [inviteLink, setInviteLink] = useState(chat.inviteLink || '');
  const [loadingInvite, setLoadingInvite] = useState(false);

  const [newMemberHandle, setNewMemberHandle] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  const [customAdminRank, setCustomAdminRank] = useState('Admin');
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);
  const [confirmDangerAction, setConfirmDangerAction] = useState<'leave' | 'delete' | 'clear' | null>(null);

  // Admin: Slow mode, Default Member Permissions, Join Requests, Banned Users, Admin Log, Block User
  const [slowModeSeconds, setSlowModeSeconds] = useState<number>(0);
  const [savingSlowMode, setSavingSlowMode] = useState(false);
  const [defaultRights, setDefaultRights] = useState<ChatBannedRightsState>({
    sendMessages: true,
    sendMedia: true,
    sendStickers: true,
    sendPolls: true,
    embedLinks: true,
    inviteUsers: true,
    pinMessages: false,
    changeInfo: false,
  });
  const [savingRights, setSavingRights] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [bannedMembers, setBannedMembers] = useState<BannedMemberItem[]>([]);
  const [loadingBanned, setLoadingBanned] = useState(false);
  const [adminLogEvents, setAdminLogEvents] = useState<AdminLogEventItem[]>([]);
  const [loadingAdminLog, setLoadingAdminLog] = useState(false);
  const [blockingBusy, setBlockingBusy] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement | null>(null);

  const loadChatDetails = async () => {
    if (chat.type === 'saved' || chat.isDeletedChat) return;
    setLoadingDetails(true);
    try {
      const info = await telegramService.getChatDetails(chat.id);
      setDetails(info);
      setEditTitle(info.title || chat.title);
      setEditAbout(info.about || '');
      setEditIsPublic(Boolean(info.username));
      setEditUsername(info.username || '');
      setEditProtected(info.isProtected);
      setEditHistoryHidden(Boolean(info.historyHidden));
      setEditIsForum(Boolean(info.isForum));
      setEditSignatures(Boolean(info.signatures));
      setEditLinkedChatId(info.linkedChatId || '');
      setEditTtlPeriod(info.ttlPeriod || 0);
      setEditReactionsMode(info.reactionsMode || 'all');
      setSlowModeSeconds(info.slowModeSeconds || 0);
      if (info.defaultBannedRights) setDefaultRights(info.defaultBannedRights);
      if (info.inviteLink) setInviteLink(info.inviteLink);
    } catch {
      // ignore read-only fallback
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadJoinRequestsList = async () => {
    setLoadingRequests(true);
    try {
      const reqs = await telegramService.getJoinRequests(chat.id);
      setJoinRequests(reqs);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadBannedList = async () => {
    setLoadingBanned(true);
    try {
      const list = await telegramService.getBannedMembers(chat.id);
      setBannedMembers(list);
    } finally {
      setLoadingBanned(false);
    }
  };

  const loadAdminLogList = async () => {
    setLoadingAdminLog(true);
    try {
      const events = await telegramService.getAdminLog(chat.id);
      setAdminLogEvents(events);
    } finally {
      setLoadingAdminLog(false);
    }
  };

  useEffect(() => {
    setDetails(null);
    setShowEditSection(false);
    setShowMembersSection(false);
    setShowPermissionsSection(false);
    setShowJoinRequestsSection(false);
    setShowBannedSection(false);
    setShowAdminLogSection(false);
    setJoinRequests([]);
    setBannedMembers([]);
    setAdminLogEvents([]);
    setEditTitle(chat.title);
    setEditAbout(chat.description || '');
    setEditIsPublic(Boolean(chat.username));
    setEditUsername(chat.username || '');
    setUsernameStatus({ checking: false });
    setEditProtected(Boolean(chat.isProtected));
    setEditHistoryHidden(false);
    setEditIsForum(Boolean(chat.isForum));
    setEditSignatures(false);
    setEditLinkedChatId('');
    setEditTtlPeriod(0);
    setEditReactionsMode('all');
    setEditAvatarDataUrl(undefined);
    setEditRemoveAvatar(false);
    setEditError(null);
    setInviteLink(chat.inviteLink || '');
    setConfirmDangerAction(null);
    setSlowModeSeconds(0);
    setAutoForwardRule(telegramService.getAutoForwardRule(chat.id));
    if (isOpen && chat.type !== 'saved' && !chat.isDeletedChat) {
      void loadChatDetails();
    }
  }, [chat.id, isOpen]);

  useEffect(() => {
    const syncShared = () => {
      const activeFilter = activeMediaTab === 'links' ? 'media' : activeMediaTab;
      setSharedMediaState({
        media: telegramService.getSharedMedia(chat.id, 'media'),
        files: telegramService.getSharedMedia(chat.id, 'files'),
        voice: telegramService.getSharedMedia(chat.id, 'voice'),
        loading: telegramService.isLoadingSharedMedia(chat.id, activeFilter),
        hasMore: telegramService.hasMoreSharedMedia(chat.id, activeFilter),
      });
    };

    const unsubAyu = ayuGramEngine.subscribe(setAyuSettings);
    const unsubTg = telegramService.subscribe(() => {
      setTargetGroup(telegramService.getTargetGroup());
      setBulkProgress(telegramService.getBulkForwardProgress());
      const rule = telegramService.getAutoForwardRule(chat.id);
      setAutoForwardRule(rule);
      if (rule) {
        setIncludePhotos(rule.includePhotos);
        setIncludeVideos(rule.includeVideos);
      }
      syncShared();
    });
    syncShared();
    return () => {
      unsubAyu();
      unsubTg();
    };
  }, [chat.id, activeMediaTab]);

  useEffect(() => {
    if (!isOpen || activeMediaTab === 'links') return;
    if (!telegramService.getSharedMedia(chat.id, activeMediaTab)) {
      void telegramService.loadChatSharedMedia(chat.id, activeMediaTab, false);
    }
  }, [isOpen, chat.id, activeMediaTab]);

  if (!isOpen) return null;

  const isGroupOrChannel = chat.type === 'group' || chat.type === 'channel';
  const isAdmin = Boolean(
    details
      ? details.isAdmin || details.isCreator || details.canEditSettings
      : chat.isAdmin || chat.isCreator
  );
  const canEdit = Boolean(
    details ? details.canEditSettings : chat.isCreator || chat.isAdmin
  );
  const isCreator = Boolean(details ? details.isCreator : chat.isCreator);
  const fallbackSendersFromMsgs: ChatMemberInfo[] = React.useMemo(() => {
    const map = new Map<string, ChatMemberInfo>();
    for (const m of messages) {
      if (m.senderId && m.senderName && !m.senderId.startsWith('-')) {
        if (!map.has(m.senderId)) {
          map.set(m.senderId, {
            id: m.senderId,
            name: m.senderName,
            avatarUrl: m.senderAvatar || `/api/tg/avatar/${encodeURIComponent(m.senderId)}`,
            role: 'member',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [messages]);
  const membersList: ChatMemberInfo[] =
    details?.members && details.members.length > 0 ? details.members : fallbackSendersFromMsgs;
  const effectiveAbout = details?.about ?? chat.description;
  const effectiveMemberCount = details?.memberCount ?? chat.memberCount;

  // Candidate admin groups for linking to a channel
  const adminGroups = telegramService
    .getChats()
    .filter((c) => c.type === 'group' && (c.isAdmin || c.isCreator) && !c.isDeletedChat);

  const handleCheckUsernameLive = async (val: string) => {
    setEditUsername(val);
    const clean = val.replace(/^@/, '').trim();
    if (!clean || clean === (details?.username || chat.username || '')) {
      setUsernameStatus({ checking: false });
      return;
    }
    if (clean.length < 4) {
      setUsernameStatus({ checking: false, available: false, reason: 'Min 4 characters' });
      return;
    }
    setUsernameStatus({ checking: true });
    try {
      const res = await telegramService.checkUsername(chat.id, clean);
      setUsernameStatus({ checking: false, available: res.available, reason: res.reason });
    } catch {
      setUsernameStatus({ checking: false });
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    try {
      await telegramService.editChat(chat.id, {
        title: editTitle.trim() || chat.title,
        about: editAbout,
        username: editIsPublic ? editUsername.replace(/^@/, '').trim() : '',
        noforwards: editProtected,
        avatarDataUrl: editAvatarDataUrl,
        removeAvatar: editRemoveAvatar,
        historyHidden: chat.type === 'group' ? editHistoryHidden : undefined,
        isForum: chat.type === 'group' ? editIsForum : undefined,
        signatures: chat.type === 'channel' ? editSignatures : undefined,
        ttlPeriod: editTtlPeriod,
        linkedChatId: chat.type === 'channel' ? editLinkedChatId : undefined,
        reactionsMode: editReactionsMode,
      });
      setEditAvatarDataUrl(undefined);
      setEditRemoveAvatar(false);
      setShowEditSection(false);
      onNotify?.('Group / Channel settings saved to Telegram');
      void loadChatDetails();
    } catch (err) {
      setEditError((err as Error).message || 'Could not update chat settings');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExportInviteLink = async (revoke: boolean = false) => {
    setLoadingInvite(true);
    try {
      const link = await telegramService.exportInviteLink(chat.id, revoke);
      setInviteLink(link);
      if (link) {
        await navigator.clipboard.writeText(link).catch(() => {});
        onNotify?.(revoke ? 'Invite link revoked & copied' : 'Invite link copied');
      }
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not export invite link');
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberHandle.trim()) return;
    setAddingMember(true);
    try {
      await telegramService.addChatMember(chat.id, newMemberHandle.trim());
      setNewMemberHandle('');
      onNotify?.('Member added');
      void loadChatDetails();
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleMemberRole = async (
    userId: string,
    action: 'promote' | 'demote' | 'kick' | 'unban',
    rank?: string
  ) => {
    setMemberBusyId(userId);
    try {
      await telegramService.updateMemberRole(chat.id, userId, action, rank);
      setPromotingMemberId(null);
      onNotify?.(
        action === 'promote'
          ? `Promoted to Admin (${rank || 'Admin'})`
          : action === 'demote'
          ? 'Admin rights removed'
          : action === 'unban'
          ? 'User unbanned'
          : 'Member removed'
      );
      void loadChatDetails();
      if (action === 'unban') void loadBannedList();
    } catch (err) {
      onNotify?.((err as Error).message || 'Permission update failed');
    } finally {
      setMemberBusyId(null);
    }
  };

  const handleDangerAction = async (kind: 'leave' | 'delete' | 'clear') => {
    if (confirmDangerAction !== kind) {
      setConfirmDangerAction(kind);
      setTimeout(() => setConfirmDangerAction(null), 4000);
      return;
    }
    setConfirmDangerAction(null);
    try {
      await telegramService.leaveOrDeleteChat(chat.id, {
        deleteChannel: kind === 'delete',
        clearHistory: kind === 'clear',
      });
      onNotify?.(
        kind === 'delete'
          ? 'Deleted permanently'
          : kind === 'clear'
          ? 'History cleared'
          : 'Left conversation'
      );
      onClose();
    } catch (err) {
      onNotify?.((err as Error).message || 'Action failed');
    }
  };

  const handleSlowModeChange = async (seconds: number) => {
    setSavingSlowMode(true);
    try {
      await telegramService.setSlowMode(chat.id, seconds);
      setSlowModeSeconds(seconds);
      onNotify?.(seconds > 0 ? `Slow mode set to ${seconds}s` : 'Slow mode disabled');
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not update slow mode');
    } finally {
      setSavingSlowMode(false);
    }
  };

  const handleSaveDefaultRights = async () => {
    setSavingRights(true);
    try {
      await telegramService.updateDefaultPermissions(chat.id, defaultRights);
      onNotify?.('Member permissions updated');
      setShowPermissionsSection(false);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not update permissions');
    } finally {
      setSavingRights(false);
    }
  };

  const handleJoinDecision = async (userId: string, approved: boolean) => {
    setRequestBusyId(userId);
    try {
      await telegramService.decideJoinRequest(chat.id, userId, approved);
      setJoinRequests((prev) => prev.filter((r) => r.userId !== userId));
      onNotify?.(approved ? 'Join request approved' : 'Join request declined');
      void loadChatDetails();
    } catch (err) {
      onNotify?.((err as Error).message || 'Decision failed');
    } finally {
      setRequestBusyId(null);
    }
  };

  const isUserBlocked = Boolean(details?.isBlocked ?? chat.isBlocked);

  const handleToggleBlockUser = async () => {
    setBlockingBusy(true);
    try {
      const next = !isUserBlocked;
      await telegramService.setUserBlocked(chat.id, next);
      setDetails((prev) => (prev ? { ...prev, isBlocked: next } : prev));
      onNotify?.(next ? `Blocked ${chat.title}` : `Unblocked ${chat.title}`);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not update block status');
    } finally {
      setBlockingBusy(false);
    }
  };

  const handleResolveTargetGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) return;
    setIsResolvingTarget(true);
    setForwardError(null);
    setForwardStatus(null);
    try {
      const resolved = await telegramService.resolveTargetGroupByLink(linkInput.trim());
      setTargetGroup(resolved);
      setIsEditingTarget(false);
      setLinkInput('');
      setForwardStatus(`Target set to ${resolved.title}`);
    } catch (err) {
      setForwardError((err as Error).message || 'Could not resolve target group link.');
    } finally {
      setIsResolvingTarget(false);
    }
  };

  const handleForwardAllMedia = async () => {
    if (!targetGroup) {
      setIsEditingTarget(true);
      setForwardError('Set a target group link first.');
      return;
    }
    if (!includePhotos && !includeVideos) {
      setForwardError('Select Photos or Videos to forward.');
      return;
    }
    setIsForwardingAll(true);
    setForwardError(null);
    setForwardStatus('Rendering & scanning all photos & videos first...');
    try {
      await telegramService.loadChatSharedMedia(chat.id, 'media', false, 6);
      const result = await telegramService.forwardAllMediaToTargetGroup({
        fromChatId: chat.id,
        includePhotos,
        includeVideos,
        includeFiles: false,
        limit: 2000,
      });
      const dupMsg =
        result.skippedDuplicates && result.skippedDuplicates > 0
          ? ` (${result.skippedDuplicates} already sent skipped)`
          : '';
      const failMsg = result.failed > 0 ? ` · ${result.failed} failed` : '';
      setForwardStatus(
        result.total === 0
          ? `Nothing new to send — all media already sent to ${result.targetTitle}${dupMsg}`
          : `Sent ${result.forwarded} of ${result.total} photos/videos to ${result.targetTitle}${dupMsg}${failMsg}`
      );
    } catch (err) {
      setForwardError((err as Error).message || 'Bulk forward failed.');
    } finally {
      setIsForwardingAll(false);
    }
  };

  const handleToggleAutoForward = async () => {
    if (!targetGroup) {
      setIsEditingTarget(true);
      setForwardError('Set a Target Group link first to enable Auto-Forward.');
      return;
    }
    setTogglingAutoForward(true);
    setForwardError(null);
    try {
      const nextEnabled = !autoForwardRule?.enabled;
      const updated = await telegramService.toggleAutoForward({
        chatId: chat.id,
        chatTitle: chat.title,
        enabled: nextEnabled,
        includePhotos,
        includeVideos,
        includeFiles: false,
      });
      setAutoForwardRule(updated);
      setForwardStatus(
        nextEnabled
          ? `Auto-Forward ON: Every new photo/video in ${chat.title} will auto-send to ${targetGroup.title} (no GIFs/text, no duplicates)`
          : 'Auto-Forward paused for this chat'
      );
      onNotify?.(
        nextEnabled
          ? `Auto-Forward enabled → ${targetGroup.title}`
          : 'Auto-Forward disabled'
      );
    } catch (err) {
      setForwardError((err as Error).message || 'Failed to toggle Auto-Forward.');
    } finally {
      setTogglingAutoForward(false);
    }
  };

  const mergeUniqueById = (primary: TelegramMessage[], secondary: TelegramMessage[]) => {
    const seen = new Set<string>();
    const out: TelegramMessage[] = [];
    for (const m of [...primary, ...secondary]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  };

  const localMedia = messages.filter(
    (m) => m.media && (m.media.type === 'photo' || m.media.type === 'video' || m.media.type === 'gif')
  );
  const localVoice = messages.filter((m) => m.media && m.media.type === 'voice');
  const localFiles = messages.filter((m) => m.media && m.media.type === 'file');

  const mediaMessages = mergeUniqueById(sharedMediaState.media || [], localMedia);
  const voiceMessages = mergeUniqueById(sharedMediaState.voice || [], localVoice);
  const fileMessages = mergeUniqueById(sharedMediaState.files || [], localFiles);

  const sharedLinks: { id: string; raw: string; href: string; isTelegram: boolean; timestamp: number }[] = [];
  const seenHrefs = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.text) continue;
    for (const l of extractLinksFromText(m.text)) {
      const key = l.href.toLowerCase();
      if (!seenHrefs.has(key)) {
        seenHrefs.add(key);
        sharedLinks.push({
          id: `${m.id}_${sharedLinks.length}`,
          raw: l.raw,
          href: l.href,
          isTelegram: l.isTelegram,
          timestamp: m.timestamp,
        });
      }
    }
  }

  const filteredMembers = memberSearchQuery.trim()
    ? membersList.filter(
        (m) =>
          m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
          m.username?.toLowerCase().includes(memberSearchQuery.toLowerCase())
      )
    : membersList;

  const displayTitle =
    ayuSettings.streamerMode && chat.type === 'user'
      ? ayuGramEngine.maskForStreamer(chat.title, 'handle')
      : details?.title || chat.title;

  const effectiveUsername = details?.username ?? chat.username;
  const displayHandle =
    effectiveUsername && ayuSettings.streamerMode
      ? ayuGramEngine.maskForStreamer(`@${effectiveUsername}`, 'handle')
      : effectiveUsername
      ? `@${effectiveUsername}`
      : null;

  const statusText = chat.isDeletedChat
    ? 'deleted chat · archived'
    : chat.type === 'channel'
    ? effectiveMemberCount
      ? `${effectiveMemberCount.toLocaleString()} subscribers`
      : 'channel'
    : chat.type === 'group'
    ? effectiveMemberCount
      ? `${effectiveMemberCount.toLocaleString()} members`
      : 'group'
    : chat.type === 'saved'
    ? 'cloud storage'
    : chat.status === 'online'
    ? 'online'
    : 'last seen recently';

  return (
    <div className="fixed inset-0 sm:static sm:w-80 xl:w-88 border-l border-outline dark:border-outline bg-surface dark:bg-surface flex flex-col h-[100dvh] sm:h-full z-40 overflow-hidden text-ink dark:text-ink shrink-0">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline dark:border-outline">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-ink dark:text-muted dark:hover:text-white rounded-lg hover:bg-hover dark:hover:bg-hover cursor-pointer"
            title="Close Panel"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <span className="text-xs font-bold tracking-tight">
            {showEditSection && canEdit
              ? `Edit ${chat.type === 'channel' ? 'Channel' : 'Group'}`
              : `${chat.type === 'channel' ? 'Channel' : chat.type === 'group' ? 'Group' : 'User'} Info`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isGroupOrChannel && !chat.isDeletedChat && canEdit && (
            <button
              type="button"
              onClick={() => {
                setShowEditSection(!showEditSection);
                if (!details) void loadChatDetails();
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                showEditSection
                  ? 'bg-primary text-white'
                  : 'text-primary hover:bg-primary/10'
              }`}
              title="Edit & Manage Group / Channel Settings"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{showEditSection ? 'Done' : 'Edit'}</span>
            </button>
          )}
          {onOpenDisappearingModal && !chat.isDeletedChat && (
            <button
              type="button"
              onClick={onOpenDisappearingModal}
              className="p-1.5 text-muted hover:text-primary dark:text-muted dark:hover:text-white rounded-lg hover:bg-hover dark:hover:bg-hover cursor-pointer"
              title="Send Timed Media"
            >
              <Plus className="w-4.5 h-4.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => telegramService.togglePinChat(chat.id)}
            className="p-1.5 text-muted hover:text-primary dark:text-muted dark:hover:text-white rounded-lg hover:bg-hover dark:hover:bg-hover cursor-pointer"
            title={chat.isPinned ? 'Unpin Chat' : 'Pin Chat'}
          >
            <MoreVertical className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Profile & Details Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Centered Profile Hero */}
        <div className={`flex flex-col items-center text-center space-y-2 pt-1 ${chat.isDeletedChat ? 'opacity-70' : ''}`}>
          <div
            className={`relative ${chat.type === 'user' && onOpenUserProfile ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (chat.type === 'user' && onOpenUserProfile) {
                onOpenUserProfile(chat.id);
              }
            }}
          >
            <Avatar
              src={editAvatarDataUrl || (editRemoveAvatar ? '' : chat.avatarUrl)}
              title={displayTitle}
              id={chat.id}
              size="xl"
              isSaved={chat.type === 'saved'}
            />
            {isGroupOrChannel && !chat.isDeletedChat && canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEditSection(true);
                  setTimeout(() => avatarFileRef.current?.click(), 50);
                }}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-primary-hover"
                title="Change Group / Channel Photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-center gap-1.5">
              <h2 className="text-base font-bold">{displayTitle}</h2>
              {chat.isVerified && <CheckCircle2 className="w-4 h-4 text-primary" />}
            </div>
            <p className="text-xs font-medium text-primary mt-0.5 tabular-nums">{statusText}</p>
            {displayHandle && (
              <p className="text-xs text-muted dark:text-muted font-mono mt-0.5">{displayHandle}</p>
            )}
          </div>

          {effectiveAbout && (
            <p className="text-xs text-muted dark:text-muted leading-relaxed text-center max-w-[250px] whitespace-pre-wrap">
              {effectiveAbout}
            </p>
          )}

          {/* Action Row */}
          {!chat.isDeletedChat && (
            <div className="w-full flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => telegramService.togglePinChat(chat.id)}
                className="flex-1 py-2 px-2.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Pin className="w-3.5 h-3.5 text-primary" />
                <span>{chat.isPinned ? 'Unpin' : 'Pin'}</span>
              </button>
              {isGroupOrChannel && canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setShowEditSection(!showEditSection);
                    if (!details) void loadChatDetails();
                  }}
                  className="flex-1 py-2 px-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{showEditSection ? 'Close Settings' : 'Manage & Edit'}</span>
                </button>
              )}
              {(chat.type === 'user' || chat.type === 'bot') && (
                <button
                  type="button"
                  disabled={blockingBusy}
                  onClick={() => void handleToggleBlockUser()}
                  className={`flex-1 py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isUserBlocked
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-500'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{blockingBusy ? '...' : isUserBlocked ? 'Unblock' : 'Block'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* FULL OFFICIAL TELEGRAM EDIT GROUP / CHANNEL SETTINGS PANEL (ADMIN ONLY) */}
        {showEditSection && isGroupOrChannel && canEdit && (
          <form
            onSubmit={(e) => void handleSaveEdit(e)}
            className="p-3.5 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-outline dark:border-outline pb-2">
              <span className="font-bold text-ink dark:text-ink flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span>Official {chat.type === 'channel' ? 'Channel' : 'Group'} Settings</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarFileRef.current?.click()}
                  className="text-[11px] font-semibold text-primary flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <Camera className="w-3 h-3" />
                  <span>{editAvatarDataUrl ? 'Photo Ready' : 'Set Photo'}</span>
                </button>
                {(chat.avatarUrl || editAvatarDataUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditAvatarDataUrl(undefined);
                      setEditRemoveAvatar(true);
                    }}
                    className="text-[11px] text-rose-500 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const r = new FileReader();
                  r.onload = () => {
                    if (typeof r.result === 'string') {
                      setEditAvatarDataUrl(r.result);
                      setEditRemoveAvatar(false);
                    }
                  };
                  r.readAsDataURL(file);
                }}
              />
            </div>

            {!isAdmin && !loadingDetails && (
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-600 dark:text-amber-300">
                Note: Some settings require Administrator rights on Telegram servers.
              </div>
            )}

            {/* Name & Bio */}
            <div className="space-y-2">
              <div>
                <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-1">
                  {chat.type === 'channel' ? 'Channel Name' : 'Group Name'}
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Enter name"
                  className="w-full px-3 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-1">
                  Description (Bio)
                </label>
                <textarea
                  rows={2}
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  placeholder="Optional description shown in profile"
                  className="w-full px-3 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            {/* Group / Channel Type: Public vs Private */}
            <div className="space-y-2 pt-1 border-t border-outline dark:border-outline">
              <div className="flex items-center justify-between">
                <span className="font-medium flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span>{chat.type === 'channel' ? 'Channel Type' : 'Group Type'}</span>
                </span>
                <div className="flex rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setEditIsPublic(false)}
                    className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                      !editIsPublic ? 'bg-primary text-white' : 'text-muted'
                    }`}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsPublic(true)}
                    className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                      editIsPublic ? 'bg-primary text-white' : 'text-muted'
                    }`}
                  >
                    Public
                  </button>
                </div>
              </div>

              {editIsPublic ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs">
                    <span className="text-muted font-mono">t.me/</span>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => void handleCheckUsernameLive(e.target.value)}
                      placeholder="public_username"
                      className="flex-1 min-w-0 bg-transparent font-mono focus:outline-none"
                    />
                  </div>
                  {usernameStatus.checking && (
                    <p className="text-[10.5px] text-muted">Checking username availability...</p>
                  )}
                  {!usernameStatus.checking && usernameStatus.available === true && (
                    <p className="text-[10.5px] text-emerald-500">Username is available</p>
                  )}
                  {!usernameStatus.checking && usernameStatus.available === false && (
                    <p className="text-[10.5px] text-rose-500">
                      {usernameStatus.reason || 'Username is unavailable'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-muted dark:text-muted truncate">
                    {inviteLink || 'Private invite link'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleExportInviteLink(false)}
                    className="text-[11px] font-semibold text-primary hover:underline shrink-0 cursor-pointer"
                  >
                    {inviteLink ? 'Copy' : 'Generate'}
                  </button>
                </div>
              )}
            </div>

            {/* Official Toggles: History for New Members, Topics, Sign Messages, Linked Group, Reactions, Auto-Delete, Protect Content */}
            <div className="space-y-2 pt-1 border-t border-outline dark:border-outline">
              {chat.type === 'group' && (
                <>
                  <div className="flex items-center justify-between py-0.5">
                    <div>
                      <span className="block font-medium">Chat History for New Members</span>
                      <span className="text-[10.5px] text-muted">
                        {editHistoryHidden ? 'Hidden (only new messages)' : 'Visible (can read prior messages)'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditHistoryHidden(!editHistoryHidden)}
                      className="px-2.5 py-1 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px] font-semibold text-primary cursor-pointer"
                    >
                      {editHistoryHidden ? 'Hidden' : 'Visible'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-0.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Hash className="w-3.5 h-3.5 text-primary" />
                      <span>Topics (Forum Mode)</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editIsForum}
                      onClick={() => setEditIsForum(!editIsForum)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        editIsForum ? 'bg-primary' : 'bg-surface dark:bg-elevated'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          editIsForum ? 'translate-x-4.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </>
              )}

              {chat.type === 'channel' && (
                <>
                  <div className="flex items-center justify-between py-0.5">
                    <span>Sign Messages (Show Admin Name)</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editSignatures}
                      onClick={() => setEditSignatures(!editSignatures)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        editSignatures ? 'bg-primary' : 'bg-surface dark:bg-elevated'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          editSignatures ? 'translate-x-4.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-1 py-0.5">
                    <label className="block font-medium">
                      Discussion Group (Enables Post Comments)
                    </label>
                    <select
                      value={editLinkedChatId}
                      onChange={(e) => setEditLinkedChatId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="">No Linked Discussion Group</option>
                      {adminGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title} ({g.id})
                        </option>
                      ))}
                      {editLinkedChatId && !adminGroups.some((g) => g.id === editLinkedChatId) && (
                        <option value={editLinkedChatId}>Linked Group ({editLinkedChatId})</option>
                      )}
                    </select>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between py-0.5">
                <span className="font-medium">Reactions</span>
                <select
                  value={editReactionsMode}
                  onChange={(e) => setEditReactionsMode(e.target.value as 'all' | 'some' | 'none')}
                  className="px-2 py-1 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px] font-medium focus:outline-none cursor-pointer"
                >
                  <option value="all">All Reactions</option>
                  <option value="some">Standard (👍 ❤️ 🔥 🎉 👏)</option>
                  <option value="none">No Reactions</option>
                </select>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span className="font-medium">Auto-Delete Messages</span>
                <select
                  value={editTtlPeriod}
                  onChange={(e) => setEditTtlPeriod(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px] font-medium focus:outline-none cursor-pointer"
                >
                  <option value={0}>Off</option>
                  <option value={86400}>24 Hours</option>
                  <option value={604800}>7 Days</option>
                  <option value={2592000}>1 Month</option>
                </select>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span>Restrict Saving &amp; Forwarding</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editProtected}
                  onClick={() => setEditProtected(!editProtected)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    editProtected ? 'bg-primary' : 'bg-surface dark:bg-elevated'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      editProtected ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {editError && <p className="text-[11px] text-rose-500">{editError}</p>}

            <button
              type="submit"
              disabled={savingEdit}
              className="w-full py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save {chat.type === 'channel' ? 'Channel' : 'Group'} Settings</span>
            </button>
          </form>
        )}

        {/* TARGET GROUP FORWARDER + AUTO-FORWARD NEW MEDIA ENGINE */}
        {!chat.isDeletedChat && (
          <div className="p-3.5 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Forward className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-semibold truncate">Target Group Media Saver</span>
              </div>
              {targetGroup && !isEditingTarget && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkInput(targetGroup.link || '');
                      setIsEditingTarget(true);
                    }}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => void telegramService.clearTargetGroup()}
                    className="text-muted hover:text-rose-500 cursor-pointer"
                    title="Clear target group"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {!targetGroup || isEditingTarget ? (
              <form onSubmit={(e) => void handleResolveTargetGroup(e)} className="space-y-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline">
                  <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
                  <input
                    type="text"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://t.me/+invite or @group"
                    className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none text-ink dark:text-ink placeholder:text-muted"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    disabled={isResolvingTarget || !linkInput.trim()}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    {isResolvingTarget ? 'Resolving...' : 'Set Target Group'}
                  </button>
                  {targetGroup && (
                    <button
                      type="button"
                      onClick={() => setIsEditingTarget(false)}
                      className="py-1.5 px-2.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="space-y-2.5">
                <div className="p-2.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{targetGroup.title}</p>
                    <p className="text-[11px] text-muted dark:text-muted truncate tabular-nums">
                      {targetGroup.username ? `@${targetGroup.username}` : targetGroup.type}
                      {targetGroup.memberCount ? ` · ${targetGroup.memberCount.toLocaleString()} members` : ''}
                    </p>
                  </div>
                  {autoForwardRule?.enabled && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                      Auto ON
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px]">
                    <button
                      type="button"
                      onClick={() => setIncludePhotos(!includePhotos)}
                      className={`py-1 rounded-lg font-medium cursor-pointer transition-colors ${
                        includePhotos
                          ? 'bg-primary text-white'
                          : 'text-muted dark:text-muted'
                      }`}
                    >
                      Photos
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncludeVideos(!includeVideos)}
                      className={`py-1 rounded-lg font-medium cursor-pointer transition-colors ${
                        includeVideos
                          ? 'bg-primary text-white'
                          : 'text-muted dark:text-muted'
                      }`}
                    >
                      Videos
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-1 text-[10px] text-muted dark:text-muted">
                    <span>Photos &amp; Videos only · No GIF/Text · No duplicates</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await telegramService.resetSentMediaHistory(chat.id);
                        setForwardStatus('Cleared sent-history cache for this group');
                      }}
                      className="text-primary hover:underline cursor-pointer shrink-0 ml-1"
                      title="Allow resending previously sent media from this group"
                    >
                      Clear Sent Log
                    </button>
                  </div>
                </div>

                {/* Auto-Forward Live Media Toggle Button */}
                <div className="p-2.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Radio className={`w-3.5 h-3.5 ${autoForwardRule?.enabled ? 'text-emerald-500' : 'text-primary'}`} />
                      <span className="text-xs font-semibold">Auto-Send New Media</span>
                    </div>
                    <p className="text-[10.5px] text-muted dark:text-muted tabular-nums">
                      {autoForwardRule?.enabled
                        ? `Active · ${autoForwardRule.forwardedCount || 0} new pics/videos auto-sent`
                        : 'Automatically send every new photo/video'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={togglingAutoForward}
                    onClick={() => void handleToggleAutoForward()}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0 ${
                      autoForwardRule?.enabled
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        : 'bg-elevated dark:bg-elevated hover:bg-primary hover:text-white text-primary border border-outline dark:border-outline'
                    }`}
                  >
                    {togglingAutoForward ? '...' : autoForwardRule?.enabled ? 'AUTO ON' : 'Enable Auto'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleForwardAllMedia()}
                  disabled={isForwardingAll}
                  className="w-full py-2 px-3 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  {isForwardingAll ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {bulkProgress?.phase === 'scanning'
                          ? 'Rendering All Media First...'
                          : 'Sending Clean Photos & Videos...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Forward className="w-3.5 h-3.5" />
                      <span>Render &amp; Send All Unsent Media</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {bulkProgress && (
              <div className="p-2.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline space-y-1.5">
                <div className="flex items-center justify-between text-[11px] tabular-nums gap-2">
                  <span className="font-medium truncate">
                    {bulkProgress.statusText ||
                      `${bulkProgress.done ? 'Completed' : bulkProgress.phase === 'scanning' ? 'Scanning' : 'Sending'} → ${bulkProgress.targetTitle}`}
                  </span>
                  <span className="font-mono text-primary shrink-0">
                    {bulkProgress.phase === 'scanning'
                      ? `${bulkProgress.total} found`
                      : `${bulkProgress.current}/${bulkProgress.total}`}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-elevated dark:bg-elevated overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      bulkProgress.phase === 'scanning' ? 'bg-amber-400 animate-pulse' : 'bg-primary'
                    }`}
                    style={{
                      width: `${
                        bulkProgress.phase === 'scanning'
                          ? 100
                          : bulkProgress.total > 0
                          ? Math.round((bulkProgress.current / bulkProgress.total) * 100)
                          : 100
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10.5px] text-muted dark:text-muted tabular-nums">
                  <span>
                    Sent: {bulkProgress.forwarded} · Already Sent Skipped: {bulkProgress.skippedDuplicates || 0}
                    {bulkProgress.failed > 0 ? ` · Failed: ${bulkProgress.failed}` : ''}
                  </span>
                  {bulkProgress.done && (
                    <button
                      type="button"
                      onClick={() => telegramService.clearBulkForwardProgress()}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            )}

            {forwardStatus && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="break-words">{forwardStatus}</span>
              </div>
            )}
            {forwardError && (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="break-words">{forwardError}</span>
              </div>
            )}
          </div>
        )}

        {/* OFFICIAL TELEGRAM SHARED MEDIA / FILES / LINKS / VOICE TABS (ALWAYS OPEN) */}
        <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline overflow-hidden">
          <div className="grid grid-cols-4 border-b border-outline dark:border-outline bg-white/60 dark:bg-elevated">
            {(
              [
                ['media', 'Media', mediaMessages.length, Image],
                ['files', 'Files', fileMessages.length, FileText],
                ['links', 'Links', sharedLinks.length, Link2],
                ['voice', 'Voice', voiceMessages.length, Mic],
              ] as const
            ).map(([key, label, count, IconComp]) => {
              const active = activeMediaTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveMediaTab(key)}
                  className={`py-2.5 px-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold border-b-2 transition-colors cursor-pointer ${
                    active
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted dark:text-muted hover:text-ink dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <IconComp className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums opacity-80">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="p-2.5">
            {activeMediaTab === 'media' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-muted dark:text-muted tabular-nums">
                    {mediaMessages.length} photos &amp; videos
                  </span>
                  <button
                    type="button"
                    onClick={() => void telegramService.loadChatSharedMedia(chat.id, 'media', false)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${sharedMediaState.loading ? 'animate-spin' : ''}`} />
                    <span>Sync All</span>
                  </button>
                </div>

                {sharedMediaState.loading && mediaMessages.length === 0 ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted dark:text-muted">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Fetching all group media from Telegram...</span>
                  </div>
                ) : mediaMessages.length > 0 ? (
                  <>
                    <div
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (
                          el.scrollHeight - el.scrollTop - el.clientHeight < 220 &&
                          sharedMediaState.hasMore &&
                          !sharedMediaState.loading
                        ) {
                          void telegramService.loadChatSharedMedia(chat.id, 'media', true, 6);
                        }
                      }}
                      className="grid grid-cols-3 gap-1.5 max-h-[520px] overflow-y-auto pr-0.5"
                    >
                      {mediaMessages.map((msg) => {
                        const hiResThumb =
                          msg.media!.thumbnailUrl ||
                          (msg.media!.type === 'photo'
                            ? msg.media!.url
                            : `${msg.media!.url}${msg.media!.url.includes('?') ? '&' : '?'}thumb=1`);
                        const instantPreview = msg.media!.inlineThumb || hiResThumb;
                        return (
                          <div
                            key={msg.id}
                            onClick={() => onOpenMedia(msg.media!, msg.id)}
                            style={
                              msg.media!.inlineThumb
                                ? {
                                    backgroundImage: `url(${msg.media!.inlineThumb})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                  }
                                : undefined
                            }
                            className="relative aspect-square rounded-lg overflow-hidden bg-surface border border-outline dark:border-outline cursor-pointer group/tile"
                          >
                            <img
                              src={hiResThumb || instantPreview}
                              alt={msg.media!.fileName || 'Shared'}
                              decoding="async"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (!img.dataset.fallback) {
                                  img.dataset.fallback = '1';
                                  img.src = msg.media!.inlineThumb || msg.media!.url;
                                }
                              }}
                              className="w-full h-full object-cover group-hover/tile:scale-105 transition-transform"
                            />
                            {(msg.media!.type === 'video' || msg.media!.type === 'gif') && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                                <span className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                                  <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {sharedMediaState.hasMore && (
                      <button
                        type="button"
                        disabled={sharedMediaState.loading}
                        onClick={() => void telegramService.loadChatSharedMedia(chat.id, 'media', true, 8)}
                        className="w-full py-1.5 rounded-xl bg-surface dark:bg-surface hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-xs font-semibold text-primary flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {sharedMediaState.loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{sharedMediaState.loading ? 'Auto-syncing all group media...' : 'Load More Media'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted dark:text-muted text-center py-4">
                    No shared photos or videos in this chat yet
                  </p>
                )}
              </div>
            )}

            {activeMediaTab === 'files' && (
              <div
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (
                    el.scrollHeight - el.scrollTop - el.clientHeight < 140 &&
                    sharedMediaState.hasMore &&
                    !sharedMediaState.loading
                  ) {
                    void telegramService.loadChatSharedMedia(chat.id, 'files', true, 2);
                  }
                }}
                className="space-y-1.5 max-h-72 overflow-y-auto"
              >
                {fileMessages.length > 0 ? (
                  <>
                    {fileMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="p-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{msg.media?.fileName || 'Document'}</p>
                          {msg.media?.fileSize && (
                            <p className="text-[10px] text-muted tabular-nums">{msg.media.fileSize}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => ayuGramEngine.downloadMedia(msg.media!)}
                          className="p-1.5 rounded-lg bg-primary/10 text-primary cursor-pointer shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {sharedMediaState.hasMore && (
                      <button
                        type="button"
                        disabled={sharedMediaState.loading}
                        onClick={() => void telegramService.loadChatSharedMedia(chat.id, 'files', true, 2)}
                        className="w-full py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs font-semibold text-primary cursor-pointer"
                      >
                        {sharedMediaState.loading ? 'Auto-loading...' : 'Load More Files'}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted dark:text-muted text-center py-4">
                    No shared files found
                  </p>
                )}
              </div>
            )}

            {activeMediaTab === 'links' && (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {sharedLinks.length > 0 ? (
                  sharedLinks.map((lnk) => (
                    <div
                      key={lnk.id}
                      className="p-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline space-y-1.5 text-xs"
                    >
                      <a
                        href={lnk.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 text-primary hover:underline font-medium"
                      >
                        <span className="truncate">{lnk.raw}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {lnk.isTelegram && (
                        <div className="flex items-center gap-1.5">
                          {onOpenChatByLink && (
                            <button
                              type="button"
                              onClick={() => onOpenChatByLink(lnk.raw)}
                              className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer hover:bg-primary/25"
                            >
                              <MessageSquare className="w-2.5 h-2.5" />
                              <span>Open in App</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const resolved = await telegramService.resolveTargetGroupByLink(lnk.raw);
                                setTargetGroup(resolved);
                                onNotify?.(`Target group set: ${resolved.title}`);
                              } catch (err) {
                                onNotify?.((err as Error).message || 'Could not resolve link');
                              }
                            }}
                            className="px-2 py-0.5 rounded-md bg-elevated dark:bg-elevated text-muted dark:text-muted text-[10.5px] font-medium cursor-pointer hover:text-primary"
                          >
                            Set Target
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted dark:text-muted text-center py-4">
                    No links shared in loaded messages
                  </p>
                )}
              </div>
            )}

            {activeMediaTab === 'voice' && (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {voiceMessages.length > 0 ? (
                  voiceMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Mic className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-medium tabular-nums">Voice ({msg.media?.duration || 0}s)</span>
                      </div>
                      <span className="text-[10px] text-muted font-mono tabular-nums">
                        {new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted dark:text-muted text-center py-4">
                    No voice messages
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Invite Link, Members, Permissions, Join Requests, Banned Users & Recent Actions (Groups & Channels) */}
        {isGroupOrChannel && !chat.isDeletedChat && (
          <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
            {/* Invite Link / Share Link Row (Export only shown to Admins) */}
            {(inviteLink || effectiveUsername || isAdmin) && (
              <div className="px-3.5 py-2.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link2 className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium truncate">
                      {effectiveUsername ? 'Public Link' : 'Invite Link'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {inviteLink || effectiveUsername ? (
                      <button
                        type="button"
                        onClick={() => {
                          const urlToCopy = inviteLink || `https://t.me/${effectiveUsername}`;
                          void navigator.clipboard.writeText(urlToCopy);
                          onNotify?.('Link copied to clipboard');
                        }}
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    ) : isAdmin ? (
                      <button
                        type="button"
                        disabled={loadingInvite}
                        onClick={() => void handleExportInviteLink(false)}
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Export</span>
                      </button>
                    ) : null}
                    {isAdmin && inviteLink && (
                      <button
                        type="button"
                        disabled={loadingInvite}
                        onClick={() => void handleExportInviteLink(true)}
                        className="text-muted hover:text-rose-500 cursor-pointer"
                        title="Revoke & Generate New Link"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingInvite ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>
                {(inviteLink || effectiveUsername) && (
                  <p className="text-[11px] font-mono text-muted dark:text-muted truncate">
                    {inviteLink || `https://t.me/${effectiveUsername}`}
                  </p>
                )}
              </div>
            )}

            {/* Members & Administrators Expandable Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !showMembersSection;
                setShowMembersSection(next);
                if (next && !details) void loadChatDetails();
              }}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-primary" />
                <span className="font-medium">Members &amp; Administrators</span>
              </div>
              <span className="font-mono text-muted dark:text-muted tabular-nums">
                {loadingDetails ? '...' : effectiveMemberCount ?? membersList.length}
              </span>
            </button>

            {showMembersSection && (
              <div className="p-3 space-y-2.5 bg-surface dark:bg-surface">
                {isAdmin && (
                  <form onSubmit={(e) => void handleAddMember(e)} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newMemberHandle}
                      onChange={(e) => setNewMemberHandle(e.target.value)}
                      placeholder="Add @username or user ID"
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      disabled={addingMember || !newMemberHandle.trim()}
                      className="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </form>
                )}

                {membersList.length > 5 && (
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Filter members..."
                    className="w-full px-2.5 py-1 rounded-lg bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-[11px] focus:outline-none"
                  />
                )}

                {loadingDetails && membersList.length === 0 ? (
                  <div className="py-3 text-center text-xs text-muted">Loading members...</div>
                ) : filteredMembers.length === 0 ? (
                  <p className="text-[11px] text-muted dark:text-muted text-center py-2">
                    Member list hidden or no matching members
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-outline dark:divide-outline">
                    {filteredMembers.map((m) => (
                      <div key={m.id} className="py-2 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div
                            onClick={() => onOpenUserProfile?.(m.id, m.name)}
                            className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <Avatar src={m.avatarUrl} title={m.name} id={m.id} size="xs" />
                            <div className="min-w-0">
                              <p className="font-medium truncate text-primary hover:underline">{m.name}</p>
                              <p className="text-[10.5px] text-muted truncate">
                                {m.role === 'creator'
                                  ? m.rank || 'Owner'
                                  : m.role === 'admin'
                                  ? m.rank || 'Admin'
                                  : m.username
                                  ? `@${m.username}`
                                  : 'Tap to view profile'}
                              </p>
                            </div>
                          </div>

                          {isAdmin && m.role !== 'creator' && (
                            <div className="flex items-center gap-1 shrink-0">
                              {m.role === 'admin' ? (
                                <button
                                  type="button"
                                  disabled={memberBusyId === m.id}
                                  onClick={() => void handleMemberRole(m.id, 'demote')}
                                  className="px-1.5 py-0.5 rounded bg-elevated dark:bg-elevated text-[10px] font-semibold text-amber-500 cursor-pointer"
                                >
                                  Demote
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={memberBusyId === m.id}
                                  onClick={() => {
                                    setPromotingMemberId(promotingMemberId === m.id ? null : m.id);
                                    setCustomAdminRank('Admin');
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-elevated dark:bg-elevated text-[10px] font-semibold text-primary cursor-pointer"
                                >
                                  Promote
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={memberBusyId === m.id}
                                onClick={() => void handleMemberRole(m.id, 'kick')}
                                className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-[10px] font-semibold text-rose-500 cursor-pointer"
                              >
                                Ban
                              </button>
                            </div>
                          )}
                        </div>

                        {isAdmin && promotingMemberId === m.id && (
                          <div className="flex items-center gap-1.5 pt-1 pl-7">
                            <input
                              type="text"
                              value={customAdminRank}
                              onChange={(e) => setCustomAdminRank(e.target.value)}
                              placeholder="Custom title (e.g. Moderator)"
                              className="flex-1 min-w-0 px-2 py-1 rounded bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-[11px] focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={memberBusyId === m.id}
                              onClick={() => void handleMemberRole(m.id, 'promote', customAdminRank)}
                              className="px-2 py-1 rounded bg-primary text-white text-[10.5px] font-semibold cursor-pointer"
                            >
                              Confirm
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Slow Mode & Default Member Permissions (Admin Only) */}
            {chat.type === 'group' && isAdmin && (
              <>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="font-medium">Slow Mode</span>
                  </div>
                  <select
                    disabled={savingSlowMode}
                    value={slowModeSeconds}
                    onChange={(e) => void handleSlowModeChange(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px] font-medium focus:outline-none cursor-pointer"
                  >
                    <option value={0}>Off</option>
                    <option value={10}>10 sec</option>
                    <option value={30}>30 sec</option>
                    <option value={60}>1 min</option>
                    <option value={300}>5 min</option>
                    <option value={900}>15 min</option>
                    <option value={3600}>1 hour</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPermissionsSection(!showPermissionsSection)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-primary" />
                    <span className="font-medium">Member Permissions</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-muted transition-transform ${
                      showPermissionsSection ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {showPermissionsSection && (
                  <div className="p-3 space-y-2 bg-surface dark:bg-surface text-xs">
                    {(
                      [
                        ['sendMessages', 'Send Text Messages'],
                        ['sendMedia', 'Send Photos & Videos'],
                        ['sendStickers', 'Send Stickers & GIFs'],
                        ['sendPolls', 'Create Polls'],
                        ['embedLinks', 'Embed Web Links'],
                        ['inviteUsers', 'Add New Members'],
                        ['pinMessages', 'Pin Messages'],
                        ['changeInfo', 'Change Group Info'],
                      ] as [keyof ChatBannedRightsState, string][]
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between py-0.5">
                        <span className="text-[11.5px]">{label}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={defaultRights[key]}
                          onClick={() =>
                            setDefaultRights((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                          className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                            defaultRights[key] ? 'bg-primary' : 'bg-surface dark:bg-elevated'
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                              defaultRights[key] ? 'translate-x-4' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={savingRights}
                      onClick={() => void handleSaveDefaultRights()}
                      className="w-full py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer mt-2"
                    >
                      {savingRights && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>Apply Permissions</span>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Admin-Only Moderation Sections: Join Requests, Removed/Banned Users & Recent Admin Actions */}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showJoinRequestsSection;
                    setShowJoinRequestsSection(next);
                    if (next) void loadJoinRequestsList();
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <UserPlus className="w-4 h-4 text-primary" />
                    <span className="font-medium">Join Requests</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-muted transition-transform ${
                      showJoinRequestsSection ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {showJoinRequestsSection && (
                  <div className="p-3 space-y-2 bg-surface dark:bg-surface text-xs">
                    {loadingRequests ? (
                      <div className="py-2 text-center text-muted text-[11px]">
                        Loading join requests...
                      </div>
                    ) : joinRequests.length === 0 ? (
                      <div className="py-2 text-center text-muted text-[11px]">
                        No pending join requests
                      </div>
                    ) : (
                      joinRequests.map((req) => (
                        <div
                          key={req.userId}
                          className="py-1.5 flex items-center justify-between gap-2 border-b last:border-b-0 border-outline dark:border-outline"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{req.name}</p>
                            {req.username && (
                              <p className="text-[10.5px] text-muted truncate">@{req.username}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={requestBusyId === req.userId}
                              onClick={() => void handleJoinDecision(req.userId, true)}
                              className="p-1 rounded-lg bg-primary text-white cursor-pointer"
                              title="Approve"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={requestBusyId === req.userId}
                              onClick={() => void handleJoinDecision(req.userId, false)}
                              className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-500 cursor-pointer"
                              title="Decline"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const next = !showBannedSection;
                    setShowBannedSection(next);
                    if (next) void loadBannedList();
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Ban className="w-4 h-4 text-rose-500" />
                    <span className="font-medium">Removed &amp; Banned Users</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-muted transition-transform ${
                      showBannedSection ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {showBannedSection && (
                  <div className="p-3 space-y-2 bg-surface dark:bg-surface text-xs">
                    {loadingBanned ? (
                      <div className="py-2 text-center text-muted text-[11px]">
                        Loading banned users...
                      </div>
                    ) : bannedMembers.length === 0 ? (
                      <div className="py-2 text-center text-muted text-[11px]">
                        No banned users
                      </div>
                    ) : (
                      bannedMembers.map((b) => (
                        <div
                          key={b.id}
                          className="py-1.5 flex items-center justify-between gap-2 border-b last:border-b-0 border-outline dark:border-outline"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{b.name}</p>
                            {b.username && (
                              <p className="text-[10.5px] text-muted truncate">@{b.username}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={memberBusyId === b.id}
                            onClick={() => void handleMemberRole(b.id, 'unban')}
                            className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[10.5px] font-semibold cursor-pointer"
                          >
                            Unban
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const next = !showAdminLogSection;
                    setShowAdminLogSection(next);
                    if (next) void loadAdminLogList();
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <History className="w-4 h-4 text-primary" />
                    <span className="font-medium">Recent Admin Actions</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-muted transition-transform ${
                      showAdminLogSection ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {showAdminLogSection && (
                  <div className="p-3 space-y-2 bg-surface dark:bg-surface text-xs max-h-56 overflow-y-auto">
                    {loadingAdminLog ? (
                      <div className="py-2 text-center text-muted text-[11px]">
                        Loading admin log...
                      </div>
                    ) : adminLogEvents.length === 0 ? (
                      <div className="py-2 text-center text-muted text-[11px]">
                        No recent admin actions recorded
                      </div>
                    ) : (
                      adminLogEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="py-1.5 border-b last:border-b-0 border-outline dark:border-outline flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{ev.userName}</p>
                            <p className="text-[10.5px] text-primary truncate">{ev.action}</p>
                          </div>
                          <span className="text-[10px] font-mono text-muted tabular-nums shrink-0">
                            {new Date(ev.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Notifications + Disappearing Media + Scheduled + Protection Card */}
        <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
          <div className="px-3.5 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              {chat.isMuted ? (
                <BellOff className="w-4 h-4 text-muted" />
              ) : (
                <Bell className="w-4 h-4 text-primary" />
              )}
              <span className="font-medium">Notifications</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!chat.isMuted}
              onClick={() => telegramService.toggleMuteChat(chat.id)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                !chat.isMuted ? 'bg-primary' : 'bg-surface dark:bg-elevated'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  !chat.isMuted ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {onOpenScheduled && !chat.isDeletedChat && (
            <button
              type="button"
              onClick={onOpenScheduled}
              className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <CalendarClock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-semibold block">Scheduled Messages</span>
                  <span className="text-[11px] text-muted dark:text-muted">
                    View, send now, or delete queued messages
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenDisappearingModal || onOpenAyuGram}
            className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
          >
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="text-xs font-semibold block">Disappearing Media</span>
                <span className="text-[11px] text-muted dark:text-muted">
                  {ayuSettings.preventTTLExpiration ? 'Vault auto-preserve active' : 'Send self-destructing photo/video'}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted shrink-0" />
          </button>

          <button
            type="button"
            onClick={onOpenAyuGram}
            className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
          >
            <div className="flex items-start gap-2.5">
              {chat.isProtected ? (
                ayuSettings.bypassContentRestrictions ? (
                  <Unlock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                ) : (
                  <Shield className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                )
              ) : (
                <Lock className="w-4 h-4 text-muted dark:text-muted mt-0.5 shrink-0" />
              )}
              <div>
                <span className="text-xs font-semibold block">
                  {chat.isProtected ? 'Protected Content' : 'MTProto Privacy'}
                </span>
                <span className="text-[11px] text-muted dark:text-muted">
                  {chat.isProtected
                    ? ayuSettings.bypassContentRestrictions
                      ? 'AyuGram bypass enabled'
                      : 'Restricted saving & forwarding'
                    : ayuSettings.ghostModeActive
                    ? 'Ghost Mode protection active'
                    : 'Encrypted cloud transport'}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted shrink-0" />
          </button>
        </div>

        {/* Danger Zone: Leave Group / Clear History / Delete Channel */}
        {chat.type !== 'saved' && !chat.isDeletedChat && (
          <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => void handleDangerAction('clear')}
              className="w-full px-3.5 py-2.5 flex items-center gap-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmDangerAction === 'clear' ? 'Click again to clear history' : 'Clear History'}</span>
            </button>
            {isGroupOrChannel && (
              <button
                type="button"
                onClick={() => void handleDangerAction('leave')}
                className="w-full px-3.5 py-2.5 flex items-center gap-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>
                  {confirmDangerAction === 'leave'
                    ? 'Click again to leave'
                    : chat.type === 'channel'
                    ? 'Leave Channel'
                    : 'Leave Group'}
                </span>
              </button>
            )}
            {isGroupOrChannel && isCreator && (
              <button
                type="button"
                onClick={() => void handleDangerAction('delete')}
                className="w-full px-3.5 py-2.5 flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  {confirmDangerAction === 'delete'
                    ? 'Click again to permanently delete'
                    : chat.type === 'channel'
                    ? 'Delete Channel'
                    : 'Delete Group'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
