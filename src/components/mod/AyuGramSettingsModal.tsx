import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Clock,
  Unlock,
  EyeOff,
  Download,
  RotateCcw,
  Plus,
  Filter,
  ShieldCheck,
  Languages,
  Forward,
  History,
  Film,
  Image as ImageIcon,
  FolderArchive,
  Sliders,
  Link2,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  VolumeX,
  Phone,
  Zap,
  Pin,
  Shield,
} from 'lucide-react';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import {
  telegramService,
  TargetGroupInfo,
  BulkForwardProgress,
} from '../../services/telegramService';
import { AyuGramSettings } from '../../types/ayugram';
import { TelegramChat, VaultItem } from '../../types/telegram';
import { soundEffects } from '../../services/soundEffects';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  chats?: TelegramChat[];
  activeChatId?: string | null;
}

type AyuCategory = 'general' | 'ghost' | 'spy' | 'vault' | 'filters';

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  danger?: boolean;
  label?: string;
}> = ({ checked, onChange, danger, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label || 'Master Ghost Mode'}
    onClick={onChange}
    className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
      checked ? (danger ? 'bg-rose-600' : 'bg-primary') : 'bg-surface dark:bg-elevated'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`}
    />
  </button>
);

const SettingRow: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  danger?: boolean;
}> = ({ icon, title, description, checked, onChange, danger }) => (
  <div className="px-4 py-3.5 flex items-center justify-between gap-4">
    <div className="flex items-start gap-3 min-w-0">
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        <h4 className="text-xs font-semibold leading-snug">{title}</h4>
        <p className="text-[11px] text-muted dark:text-muted leading-relaxed mt-0.5">
          {description}
        </p>
      </div>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} danger={danger} label={title} />
  </div>
);

export const AyuGramSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  chats = [],
  activeChatId = null,
}) => {
  const [settings, setSettings] = useState<AyuGramSettings>(ayuGramEngine.getSettings());
  const [activeCategory, setActiveCategory] = useState<AyuCategory>('ghost');
  const [newKeyword, setNewKeyword] = useState('');
  const [deletedLogs, setDeletedLogs] = useState(ayuGramEngine.getDeletedLogs());
  const [vaultItems, setVaultItems] = useState<VaultItem[]>(telegramService.getVaultItems());
  const [targetGroup, setTargetGroup] = useState<TargetGroupInfo | null>(
    telegramService.getTargetGroup()
  );
  const [bulkProgress, setBulkProgress] = useState<BulkForwardProgress | null>(
    telegramService.getBulkForwardProgress()
  );

  // Target Group + Bulk Forward local UI state
  const [targetLinkInput, setTargetLinkInput] = useState('');
  const [resolvingTarget, setResolvingTarget] = useState(false);
  const [sourceChatId, setSourceChatId] = useState<string>(activeChatId || '');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [bulkForwarding, setBulkForwarding] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [forwardedVaultKey, setForwardedVaultKey] = useState<string | null>(null);

  useEffect(() => {
    const unsubAyu = ayuGramEngine.subscribe((s) => {
      setSettings(s);
      setDeletedLogs(ayuGramEngine.getDeletedLogs());
    });
    const unsubTg = telegramService.subscribe(() => {
      setVaultItems(telegramService.getVaultItems());
      setTargetGroup(telegramService.getTargetGroup());
      setBulkProgress(telegramService.getBulkForwardProgress());
    });
    return () => {
      unsubAyu();
      unsubTg();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      void telegramService.loadVault();
      void telegramService.loadTargetGroup();
      if (activeChatId) {
        setSourceChatId(activeChatId);
      } else if (!sourceChatId && chats.length > 0) {
        const firstGroup = chats.find((c) => c.type === 'group' || c.type === 'channel') || chats[0];
        if (firstGroup) setSourceChatId(firstGroup.id);
      }
    }
  }, [isOpen, activeChatId, chats, sourceChatId]);

  if (!isOpen) return null;

  const handleToggle = <K extends keyof AyuGramSettings>(key: K) => {
    const newVal = !settings[key];
    ayuGramEngine.updateSetting(key, newVal as AyuGramSettings[K]);
    soundEffects.playPop();
  };

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    ayuGramEngine.addBlockedKeyword(newKeyword);
    setNewKeyword('');
    soundEffects.playPop();
  };

  const handleSetTargetGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLinkInput.trim()) return;
    setResolvingTarget(true);
    setTargetError(null);
    setTargetStatus(null);
    try {
      const resolved = await telegramService.resolveTargetGroupByLink(targetLinkInput.trim());
      setTargetGroup(resolved);
      setTargetLinkInput('');
      setTargetStatus(`Target Group set: ${resolved.title}`);
    } catch (err) {
      setTargetError((err as Error).message || 'Could not resolve Telegram group link.');
    } finally {
      setResolvingTarget(false);
    }
  };

  const handleRunBulkForward = async () => {
    const fromId = sourceChatId || activeChatId;
    if (!fromId) {
      setTargetError('Select a source group or chat first.');
      return;
    }
    if (!targetGroup) {
      setTargetError('Set a target group link first.');
      return;
    }
    if (!includePhotos && !includeVideos) {
      setTargetError('Enable Photos or Videos to forward media.');
      return;
    }

    setBulkForwarding(true);
    setTargetError(null);
    setTargetStatus('Rendering & scanning all photos & videos first...');
    try {
      await telegramService.loadChatSharedMedia(fromId, 'media', false, 6);
      const result = await telegramService.forwardAllMediaToTargetGroup({
        fromChatId: fromId,
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
      setTargetStatus(
        result.total === 0
          ? `All media already sent to ${result.targetTitle}${dupMsg}`
          : `Sent ${result.forwarded} / ${result.total} photos & videos to ${result.targetTitle}${dupMsg}${failMsg}`
      );
    } catch (err) {
      setTargetError((err as Error).message || 'Bulk forward failed.');
    } finally {
      setBulkForwarding(false);
    }
  };

  const handleForwardVaultItem = async (item: VaultItem) => {
    const dest = targetGroup ? 'target' : 'me';
    const res = await telegramService.forwardMessage(
      item.chatId,
      String(item.messageId),
      dest,
      settings.hideForwardTag
    );
    if (res.ok) {
      setForwardedVaultKey(item.key);
      setTimeout(() => setForwardedVaultKey(null), 2200);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const categories: { id: AyuCategory; label: string; subtitle: string; icon: React.ReactNode }[] = [
    {
      id: 'ghost',
      label: 'Ghost Essentials',
      subtitle: 'Reads, online & timer privacy',
      icon: <EyeOff className="w-4 h-4" />,
    },
    {
      id: 'spy',
      label: 'History & Spy',
      subtitle: 'Anti-delete, edits & logs',
      icon: <Trash2 className="w-4 h-4" />,
    },
    {
      id: 'vault',
      label: 'Vault & Forwarder',
      subtitle: 'TTL saver, bypass & target group',
      icon: <FolderArchive className="w-4 h-4" />,
    },
    {
      id: 'general',
      label: 'General & Chats',
      subtitle: 'Timestamps, calls & layout',
      icon: <Sliders className="w-4 h-4" />,
    },
    {
      id: 'filters',
      label: 'Filters & Tools',
      subtitle: 'Translator, streamer & regex',
      icon: <Filter className="w-4 h-4" />,
    },
  ];

  const sourceCandidates = chats.filter((c) => c.type !== 'saved');

  return (
    <div role="dialog" aria-modal="true" aria-label="AyuGram Preferences" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/60 backdrop-blur-[3px]">
      <div className="w-full max-w-4xl bg-surface dark:bg-surface border border-outline dark:border-outline rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-ink dark:text-ink">
        {/* Top AyuGram Preferences Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">AyuGram Preferences</h2>
              <p className="text-[11px] text-muted dark:text-muted truncate">
                Ghost Essentials · Anti-Delete Spy · TTL Vault · Target Group Bulk Forwarder
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Reset AyuGram defaults"
              onClick={() => {
                ayuGramEngine.resetToDefaults();
                soundEffects.playPop();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted hover:text-primary rounded-xl cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Defaults</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted hover:text-ink dark:hover:text-white rounded-xl cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Category Strip */}
        <div className="flex md:hidden items-center gap-1.5 px-3 py-2 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={activeCategory === cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeCategory === cat.id
                  ? 'bg-primary text-white'
                  : 'text-muted dark:text-muted hover:bg-hover/70 dark:hover:bg-hover'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* 2-Pane Authentic AyuGram Desktop Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Category Sidebar (Desktop >= md) */}
          <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between border-r border-outline dark:border-outline bg-surface-low/70 dark:bg-elevated p-3 overflow-y-auto">
            <div className="space-y-1">
              {categories.map((cat) => {
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-primary text-white'
                        : 'text-ink dark:text-ink hover:bg-hover/70 dark:hover:bg-hover'
                    }`}
                  >
                    <div
                      className={`shrink-0 ${
                        active ? 'text-white' : 'text-muted dark:text-muted'
                      }`}
                    >
                      {cat.icon}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold block truncate">{cat.label}</span>
                      <span
                        className={`text-[10.5px] block truncate ${
                          active ? 'text-white/80' : 'text-muted dark:text-muted'
                        }`}
                      >
                        {cat.subtitle}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline space-y-1 text-[11px] mt-4">
              <div className="flex items-center justify-between">
                <span className="text-muted dark:text-muted">Ghost Mode</span>
                <span className="font-semibold text-primary">
                  {settings.ghostModeActive ? 'Active' : 'Off'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted dark:text-muted">Vault Archive</span>
                <span className="font-mono tabular-nums font-semibold">{vaultItems.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted dark:text-muted">Target Group</span>
                <span className="font-semibold truncate max-w-[100px]">
                  {targetGroup ? targetGroup.title : 'Not Set'}
                </span>
              </div>
            </div>
          </aside>

          {/* Right Settings Content Pane */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* CATEGORY 1: GHOST ESSENTIALS */}
            {activeCategory === 'ghost' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
                      <EyeOff className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold">Master Ghost Mode</h3>
                      <p className="text-[11px] text-muted dark:text-muted mt-0.5">
                        Enables full stealth presence across reads, online heartbeats, typing, and timed views
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={settings.ghostModeActive}
                    onChange={() => handleToggle('ghostModeActive')}
                  />
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted dark:text-muted mb-2 px-1">
                    Ghost Presence &amp; Read Behavior
                  </h4>
                  <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
                    <SettingRow
                      title="Don't Read Messages"
                      description="Keep chats unread on Telegram servers until you reply or tap Mark Read"
                      checked={!settings.sendReadReceipts}
                      onChange={() => handleToggle('sendReadReceipts')}
                    />
                    <SettingRow
                      title="Don't Send Online Status"
                      description="Stay offline while reading chats and managing your inbox"
                      checked={!settings.sendOnlineStatus}
                      onChange={() => handleToggle('sendOnlineStatus')}
                    />
                    <SettingRow
                      title="Don't Send Typing / Recording"
                      description="Suppress live typing and recording voice indicators to contacts"
                      checked={!settings.sendTypingIndicators}
                      onChange={() => handleToggle('sendTypingIndicators')}
                    />
                    <SettingRow
                      title="Send Read Receipt When Replying"
                      description="Automatically mark messages read only when you actively send a reply"
                      checked={settings.markReadOnReply}
                      onChange={() => handleToggle('markReadOnReply')}
                    />
                    <SettingRow
                      title="Send Offline Immediately After Action"
                      description="Force offline state immediately after sending or reacting"
                      checked={settings.sendOfflineAfterAction}
                      onChange={() => handleToggle('sendOfflineAfterAction')}
                    />
                    <SettingRow
                      icon={<VolumeX className="w-4 h-4 text-primary" />}
                      title="Send Without Sound by Default"
                      description="Deliver outgoing messages silently without triggering recipient notification sound"
                      checked={settings.sendWithoutSound}
                      onChange={() => handleToggle('sendWithoutSound')}
                    />
                    <SettingRow
                      icon={<Eye className="w-4 h-4 text-primary" />}
                      title="Auto-Mark Seen on Timer Click"
                      description="When disabled, tapping a disappearing photo/video shows options including manual Mark Seen to Sender"
                      checked={settings.markSeenOnTimerClick}
                      onChange={() => handleToggle('markSeenOnTimerClick')}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CATEGORY 2: HISTORY & SPY (ANTI-DELETE / ANTI-EDIT) */}
            {activeCategory === 'spy' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted dark:text-muted mb-2 px-1">
                    Anti-Delete &amp; Edit Spy Engine
                  </h4>
                  <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
                    <SettingRow
                      icon={<Trash2 className="w-4 h-4 text-rose-500" />}
                      title="Save Deleted Messages"
                      description="Preserve messages deleted by sender inline inside chat history"
                      checked={settings.antiDeleteEnabled}
                      onChange={() => handleToggle('antiDeleteEnabled')}
                      danger
                    />
                    <SettingRow
                      title="Save Deleted Media Locally"
                      description="Cache incoming photos & videos so revoked media stays viewable"
                      checked={settings.saveDeletedMedia}
                      onChange={() => handleToggle('saveDeletedMedia')}
                    />
                    <SettingRow
                      icon={<History className="w-4 h-4 text-primary" />}
                      title="Save Message Edit History"
                      description="Keep every previous revision whenever someone edits a message"
                      checked={settings.antiEditEnabled}
                      onChange={() => handleToggle('antiEditEnabled')}
                    />
                    <SettingRow
                      title="Show Deleted Badge in Chat"
                      description="Display your custom deleted marker next to revoked messages"
                      checked={settings.showDeletedBadge}
                      onChange={() => handleToggle('showDeletedBadge')}
                    />
                    <SettingRow
                      title="Show Edited Revision Badge"
                      description="Allow expanding original text on edited messages"
                      checked={settings.showEditedBadge}
                      onChange={() => handleToggle('showEditedBadge')}
                    />
                  </div>
                </div>

                {/* Custom Deleted Mark Label */}
                <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold">Deleted Message Mark Text</h4>
                      <p className="text-[11px] text-muted dark:text-muted">
                        Custom badge shown on preserved deleted messages
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-500 font-semibold">
                      {settings.deletedMarkText || '🧹 deleted'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={settings.deletedMarkText}
                    onChange={(e) => ayuGramEngine.updateSetting('deletedMarkText', e.target.value)}
                    placeholder="🧹 deleted"
                    className="w-full px-3 py-2 text-xs bg-surface dark:bg-surface border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Live Deleted Messages Log */}
                <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold">Captured Deleted Messages</h4>
                      <span className="text-[11px] font-mono text-primary tabular-nums">
                        {deletedLogs.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => ayuGramEngine.exportDeletedLogsAsJson()}
                        className="px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export JSON</span>
                      </button>
                      {deletedLogs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void ayuGramEngine.clearDeletedLogs()}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 text-[11px] font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {deletedLogs.length === 0 ? (
                    <p className="text-xs text-muted dark:text-muted py-4 text-center">
                      No deleted messages captured yet. Incoming deleted messages will appear here automatically.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {deletedLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs flex items-center justify-between gap-2"
                        >
                          <div className="truncate">
                            <span className="font-semibold text-rose-600 dark:text-rose-400 mr-2">
                              {log.senderName}:
                            </span>
                            <span>{log.text || `[${log.mediaType || 'Media'}]`}</span>
                          </div>
                          <span className="text-[10px] text-muted font-mono tabular-nums shrink-0">
                            {new Date(log.deletedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CATEGORY 3: TTL VAULT & TARGET GROUP BULK FORWARDER */}
            {activeCategory === 'vault' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted dark:text-muted mb-2 px-1">
                    TTL Media Saver &amp; Restriction Bypass
                  </h4>
                  <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
                    <SettingRow
                      icon={<Clock className="w-4 h-4 text-primary" />}
                      title="Save Disappearing Photos &amp; Videos"
                      description="Enable instant capture & Save to Vault on self-destructing photos and videos"
                      checked={settings.saveDisappearingMedia}
                      onChange={() => handleToggle('saveDisappearingMedia')}
                    />
                    <SettingRow
                      title="Prevent TTL Expiration"
                      description="Keep expiring photos and videos viewable after timer countdown finishes"
                      checked={settings.preventTTLExpiration}
                      onChange={() => handleToggle('preventTTLExpiration')}
                    />
                    <SettingRow
                      title="Auto-Save to Saved Messages"
                      description="Automatically archive opened disappearing media into Saved Messages"
                      checked={settings.autoSaveExpiringToSavedMessages}
                      onChange={() => handleToggle('autoSaveExpiringToSavedMessages')}
                    />
                    <SettingRow
                      icon={<Unlock className="w-4 h-4 text-primary" />}
                      title="Bypass Saving &amp; Forwarding Restrictions"
                      description="Allow saving AND forwarding media from groups/channels that block saving"
                      checked={settings.bypassContentRestrictions}
                      onChange={() => handleToggle('bypassContentRestrictions')}
                    />
                    <SettingRow
                      icon={<Forward className="w-4 h-4 text-primary" />}
                      title="Forward Without Sender Tag"
                      description="Strip original author attribution when forwarding messages or bypassed media"
                      checked={settings.hideForwardTag}
                      onChange={() => handleToggle('hideForwardTag')}
                    />
                    <SettingRow
                      icon={<Shield className="w-4 h-4 text-primary" />}
                      title="Allow Screenshots &amp; Local Copies"
                      description="Permit local playback & copying inside protected media dialogs"
                      checked={settings.allowScreenshotsSecretChat}
                      onChange={() => handleToggle('allowScreenshotsSecretChat')}
                    />
                  </div>
                </div>

                {/* Target Group by Link + Forward All Media */}
                <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Forward className="w-4 h-4 text-primary" />
                      <h4 className="text-xs font-bold">Target Group Link &amp; Bulk Media Forwarder</h4>
                    </div>
                    {targetGroup && (
                      <button
                        type="button"
                        onClick={() => void telegramService.clearTargetGroup()}
                        className="text-[11px] font-medium text-rose-500 hover:underline cursor-pointer"
                      >
                        Clear Target
                      </button>
                    )}
                  </div>

                  {targetGroup && (
                    <div className="p-3 rounded-xl bg-surface dark:bg-surface border border-primary/40 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-bold block truncate">{targetGroup.title}</span>
                        <span className="text-[11px] text-muted dark:text-muted block truncate tabular-nums">
                          {targetGroup.username ? `@${targetGroup.username}` : targetGroup.link}
                          {targetGroup.memberCount
                            ? ` · ${targetGroup.memberCount.toLocaleString()} members`
                            : ''}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-primary shrink-0">Active Target</span>
                    </div>
                  )}

                  <form onSubmit={(e) => void handleSetTargetGroup(e)} className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline">
                      <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
                      <input
                        type="text"
                        value={targetLinkInput}
                        onChange={(e) => setTargetLinkInput(e.target.value)}
                        placeholder="Paste https://t.me/+invite, https://t.me/group, or @username"
                        className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={resolvingTarget || !targetLinkInput.trim()}
                      className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {resolvingTarget ? 'Resolving...' : 'Set Target Group'}
                    </button>
                  </form>

                  {/* Bulk Forward All Media Controls */}
                  <div className="pt-2 border-t border-outline dark:border-outline space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-muted dark:text-muted block mb-1">
                          Source Group / Channel
                        </label>
                        <select
                          value={sourceChatId}
                          onChange={(e) => setSourceChatId(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary"
                        >
                          {sourceCandidates.length === 0 ? (
                            <option value="">No source chats loaded</option>
                          ) : (
                            sourceCandidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.title} {c.isProtected ? '(Restricted)' : ''}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-muted dark:text-muted block mb-1">
                          Media Filter (Photos &amp; Videos Only · No GIF/Text)
                        </label>
                        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs">
                          <button
                            type="button"
                            onClick={() => setIncludePhotos(!includePhotos)}
                            className={`py-1 rounded-lg font-medium cursor-pointer ${
                              includePhotos ? 'bg-primary text-white' : 'text-muted dark:text-muted'
                            }`}
                          >
                            Photos
                          </button>
                          <button
                            type="button"
                            onClick={() => setIncludeVideos(!includeVideos)}
                            className={`py-1 rounded-lg font-medium cursor-pointer ${
                              includeVideos ? 'bg-primary text-white' : 'text-muted dark:text-muted'
                            }`}
                          >
                            Videos
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted dark:text-muted">
                      <span>Automatically skips already sent items, captions, text &amp; GIFs</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await telegramService.resetSentMediaHistory(sourceChatId || activeChatId || undefined);
                          setTargetStatus('Cleared sent-media history cache');
                        }}
                        className="text-primary hover:underline cursor-pointer shrink-0 ml-2"
                      >
                        Clear Sent Log
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleRunBulkForward()}
                      disabled={bulkForwarding || !targetGroup || !sourceChatId}
                      className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      {bulkForwarding ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            {bulkProgress?.phase === 'scanning'
                              ? 'Rendering All Media First...'
                              : 'Sending Photos & Videos...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Forward className="w-4 h-4" />
                          <span>Render &amp; Send All Unsent Media to Target Group</span>
                        </>
                      )}
                    </button>

                    {bulkProgress && (
                      <div className="p-3 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline space-y-1.5">
                        <div className="flex items-center justify-between text-xs tabular-nums gap-2">
                          <span className="font-semibold truncate">
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
                        <div className="flex items-center justify-between text-[11px] text-muted dark:text-muted tabular-nums">
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

                    {targetStatus && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>{targetStatus}</span>
                      </div>
                    )}
                    {targetError && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{targetError}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Saved Media Vault Archive */}
                <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <FolderArchive className="w-4 h-4 text-primary" />
                      <span>Saved Photos &amp; Videos Vault ({vaultItems.length})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void telegramService.loadVault()}
                      className="text-xs text-primary font-semibold cursor-pointer"
                    >
                      Refresh
                    </button>
                  </div>

                  {vaultItems.length === 0 ? (
                    <p className="text-xs text-muted dark:text-muted py-4 text-center">
                      No media saved in vault yet. Save or forward any disappearing or restricted photo/video to archive it here.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {vaultItems.map((item) => {
                        const mediaUrl = `/api/tg/media/${encodeURIComponent(item.chatId)}/${item.messageId}`;
                        return (
                          <div
                            key={item.key}
                            className="p-2.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                                {item.mediaType === 'video' ? (
                                  <Film className="w-4 h-4" />
                                ) : (
                                  <ImageIcon className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold block truncate">{item.fileName}</span>
                                <span className="text-[10.5px] text-muted dark:text-muted block truncate tabular-nums">
                                  {item.mediaType.toUpperCase()} · {formatBytes(item.fileSize)} · {item.chatTitle}
                                  {item.isDisappearing ? ` · TTL ${item.ttlSeconds || ''}s` : ''}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => void handleForwardVaultItem(item)}
                                className="px-2.5 py-1.5 rounded-lg bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                title={
                                  targetGroup
                                    ? `Forward to ${targetGroup.title}`
                                    : 'Forward to Saved Messages'
                                }
                              >
                                <Forward className="w-3.5 h-3.5 text-primary" />
                                <span>{forwardedVaultKey === item.key ? 'Sent ✓' : 'Forward'}</span>
                              </button>
                              <a
                                href={`${mediaUrl}?download=1`}
                                download={item.fileName}
                                className="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold flex items-center gap-1 shrink-0"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CATEGORY 4: GENERAL & CHATS */}
            {activeCategory === 'general' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted dark:text-muted mb-2 px-1">
                    Chats &amp; Interface Preferences
                  </h4>
                  <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
                    <SettingRow
                      icon={<Clock className="w-4 h-4 text-primary" />}
                      title="Show Exact Message Seconds"
                      description="Display full HH:MM:SS timestamps on all messages"
                      checked={settings.showMessageSeconds}
                      onChange={() => handleToggle('showMessageSeconds')}
                    />
                    <SettingRow
                      icon={<Phone className="w-4 h-4 text-primary" />}
                      title="Confirm Before Call"
                      description="Ask for confirmation before starting an outgoing voice call"
                      checked={settings.confirmBeforeCall}
                      onChange={() => handleToggle('confirmBeforeCall')}
                    />
                    <SettingRow
                      icon={<Zap className="w-4 h-4 text-primary" />}
                      title="Download Speed Accelerator"
                      description="Maximize parallel MTProto chunk connections for media streaming"
                      checked={settings.speedAccelerator}
                      onChange={() => handleToggle('speedAccelerator')}
                    />
                    <SettingRow
                      icon={<Pin className="w-4 h-4 text-primary" />}
                      title="Unlimited Pinned Chats"
                      description="Pin as many conversations and target groups as needed locally"
                      checked={settings.infinitePinnedChats}
                      onChange={() => handleToggle('infinitePinnedChats')}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CATEGORY 5: FILTERS & TOOLS */}
            {activeCategory === 'filters' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted dark:text-muted mb-2 px-1">
                    Privacy &amp; Smart Utilities
                  </h4>
                  <div className="rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
                    <SettingRow
                      icon={<Languages className="w-4 h-4 text-primary" />}
                      title="Inline Message Translator"
                      description="Show quick translate button on incoming message bubbles"
                      checked={settings.localTranslateEnabled}
                      onChange={() => handleToggle('localTranslateEnabled')}
                    />
                    <SettingRow
                      icon={<EyeOff className="w-4 h-4 text-primary" />}
                      title="Streamer Privacy Mode"
                      description="Mask phone numbers, usernames, and contact titles during screen shares"
                      checked={settings.streamerMode}
                      onChange={() => handleToggle('streamerMode')}
                    />
                    <SettingRow
                      title="Hide Sponsored Messages"
                      description="Filter promoted channel advertisements cleanly from message streams"
                      checked={settings.hideSponsoredMessages}
                      onChange={() => handleToggle('hideSponsoredMessages')}
                    />
                  </div>
                </div>

                {/* Keyword & Regex Filter */}
                <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <Filter className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-xs font-semibold">Keyword &amp; Phrase Filter</h4>
                        <p className="text-[11px] text-muted dark:text-muted">
                          Collapse messages containing any blocked phrase below
                        </p>
                      </div>
                    </div>
                    <ToggleSwitch
                      label="Keyword & Phrase Filter"
                      checked={settings.regexFilterEnabled}
                      onChange={() => handleToggle('regexFilterEnabled')}
                    />
                  </div>

                  <form onSubmit={handleAddKeyword} className="flex gap-2">
                    <input
                      type="text"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="Add blocked phrase or word..."
                      className="flex-1 px-3 py-2 text-xs bg-surface dark:bg-surface border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-1.5">
                    {settings.blockedKeywords.length === 0 ? (
                      <span className="text-[11px] text-muted">No blocked keywords configured.</span>
                    ) : (
                      settings.blockedKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px]"
                        >
                          <span>{kw}</span>
                          <button
                            type="button"
                            onClick={() => ayuGramEngine.removeBlockedKeyword(kw)}
                            className="text-muted hover:text-rose-500 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-outline dark:border-outline bg-surface-low dark:bg-canvas text-xs">
          <span className="text-muted dark:text-muted truncate tabular-nums">
            Ghost: <strong>{settings.ghostModeActive ? 'On' : 'Off'}</strong> · Anti-Delete:{' '}
            <strong>{settings.antiDeleteEnabled ? 'On' : 'Off'}</strong> · Bypass:{' '}
            <strong>{settings.bypassContentRestrictions ? 'On' : 'Off'}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl cursor-pointer transition-colors shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
