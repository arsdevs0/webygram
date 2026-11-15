import React, { useState, useEffect } from 'react';
import { deferredPanel } from '../common/DeferredPanel';
const MediaViewer = deferredPanel(() => import('../chat/MediaViewerModal').then(m => ({ default: m.MediaViewerModal })));
import {
  FolderArchive,
  Forward,
  Download,
  RefreshCw,
  Link2,
  ArrowLeft,
  Film,
  Image as ImageIcon,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { TelegramChat, VaultItem } from '../../types/telegram';
import { telegramService, TargetGroupInfo, BulkForwardProgress } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';

interface Props {
  chats: TelegramChat[];
  onBackMobile?: () => void;
  onNotify?: (msg: string) => void;
}

export const VaultView: React.FC<Props> = ({ chats, onBackMobile, onNotify }) => {
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>(telegramService.getVaultItems());
  const [targetGroup, setTargetGroup] = useState<TargetGroupInfo | null>(telegramService.getTargetGroup());
  const [bulkProgress, setBulkProgress] = useState<BulkForwardProgress | null>(
    telegramService.getBulkForwardProgress()
  );
  const [linkInput, setLinkInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [sourceChatId, setSourceChatId] = useState<string>('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'photo' | 'video' | 'file'>('all');
  const [forwardedKey, setForwardedKey] = useState<string | null>(null);

  useEffect(() => {
    const unsub = telegramService.subscribe(() => {
      setVaultItems(telegramService.getVaultItems());
      setTargetGroup(telegramService.getTargetGroup());
      setBulkProgress(telegramService.getBulkForwardProgress());
    });
    void telegramService.loadVault();
    void telegramService.loadTargetGroup();
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!sourceChatId && chats.length > 0) {
      const candidate = chats.find((c) => !c.isDeletedChat && (c.type === 'group' || c.type === 'channel')) || chats[0];
      if (candidate) setSourceChatId(candidate.id);
    }
  }, [chats, sourceChatId]);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSetTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) return;
    setResolving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const resolved = await telegramService.resolveTargetGroupByLink(linkInput.trim());
      setTargetGroup(resolved);
      setLinkInput('');
      setStatusMsg(`Target set to ${resolved.title}`);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Could not resolve target link');
    } finally {
      setResolving(false);
    }
  };

  const handleBulkForward = async () => {
    if (!sourceChatId || !targetGroup) return;
    setBulkBusy(true);
    setErrorMsg(null);
    setStatusMsg('Rendering & scanning all photos & videos first...');
    try {
      await telegramService.loadChatSharedMedia(sourceChatId, 'media', false, 6);
      const res = await telegramService.forwardAllMediaToTargetGroup({
        fromChatId: sourceChatId,
        includePhotos: true,
        includeVideos: true,
        includeFiles: false,
        limit: 2000,
      });
      const dupMsg =
        res.skippedDuplicates && res.skippedDuplicates > 0
          ? ` (${res.skippedDuplicates} already sent skipped)`
          : '';
      setStatusMsg(
        res.total === 0
          ? `All media already sent to ${res.targetTitle}${dupMsg}`
          : `Sent ${res.forwarded} of ${res.total} photos/videos to ${res.targetTitle}${dupMsg}`
      );
    } catch (err) {
      setErrorMsg((err as Error).message || 'Bulk forward failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleForwardItem = async (item: VaultItem) => {
    const dest = targetGroup ? 'target' : 'me';
    const hideTag = ayuGramEngine.getSettings().hideForwardTag;
    const res = await telegramService.forwardMessage(item.chatId, String(item.messageId), dest, hideTag);
    if (res.ok) {
      setForwardedKey(item.key);
      onNotify?.(`Forwarded ${item.fileName} to ${targetGroup ? targetGroup.title : 'Saved Messages'}`);
      setTimeout(() => setForwardedKey(null), 2000);
    } else if (res.error) {
      onNotify?.(res.error);
    }
  };

  const filteredItems = vaultItems.filter((item) =>
    typeFilter === 'all' ? true : item.mediaType === typeFilter
  );

  return (
    <div className="flex-1 flex flex-col bg-canvas dark:bg-canvas text-ink dark:text-ink overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-outline dark:border-outline bg-surface dark:bg-surface flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {onBackMobile && (
            <button
              type="button"
              onClick={onBackMobile}
              className="p-1.5 lg:hidden text-muted hover:text-ink dark:hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-base font-bold">Media Vault &amp; Forwarder</h1>
            <p className="text-xs text-muted dark:text-muted tabular-nums">
              {vaultItems.length} preserved items · TTL captures &amp; restricted group bypass
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void telegramService.loadVault()}
          className="px-3 py-1.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-primary" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Target Group & Bulk Forwarder Panel */}
        <section className="p-4 rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Forward className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-bold">Target Group Link &amp; Bulk Media Forwarder</h2>
            </div>
            {targetGroup && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-primary truncate max-w-[200px]">
                  {targetGroup.title}
                </span>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <form onSubmit={(e) => void handleSetTarget(e)} className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline">
                <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://t.me/+invite or @targetgroup"
                  className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={resolving || !linkInput.trim()}
                className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                {resolving ? 'Setting...' : 'Set Target'}
              </button>
            </form>

            <div className="flex items-center gap-2">
              <select
                value={sourceChatId}
                onChange={(e) => setSourceChatId(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary"
              >
                {chats
                  .filter((c) => !c.isDeletedChat && c.type !== 'saved')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} {c.isProtected ? '(Restricted)' : ''}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={bulkBusy || !targetGroup || !sourceChatId}
                onClick={() => void handleBulkForward()}
                className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {bulkBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{bulkBusy ? 'Rendering & Sending...' : 'Render & Send All'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted dark:text-muted">
            <span>Sends Photos &amp; Videos only (no text messages, captions, or GIFs) · Never duplicates</span>
            <button
              type="button"
              onClick={async () => {
                await telegramService.resetSentMediaHistory(sourceChatId || undefined);
                setStatusMsg('Cleared sent-media history cache');
              }}
              className="text-primary hover:underline cursor-pointer shrink-0 ml-2"
            >
              Clear Sent Log
            </button>
          </div>

          {bulkProgress && (
            <div className="pt-2 space-y-1 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {bulkProgress.statusText ||
                    `${bulkProgress.done ? 'Finished' : bulkProgress.phase === 'scanning' ? 'Scanning' : 'Forwarding'} → ${bulkProgress.targetTitle}`}
                </span>
                <span className="font-mono text-primary shrink-0">
                  {bulkProgress.phase === 'scanning'
                    ? `${bulkProgress.total} found`
                    : `${bulkProgress.current}/${bulkProgress.total} (${bulkProgress.forwarded} sent${
                        bulkProgress.skippedDuplicates ? `, ${bulkProgress.skippedDuplicates} skipped` : ''
                      })`}
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
            </div>
          )}

          {statusMsg && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>{statusMsg}</span>
            </p>
          )}
          {errorMsg && (
            <p className="text-xs text-rose-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errorMsg}</span>
            </p>
          )}
        </section>

        {/* Filter Tabs */}
        <div className="flex items-center gap-4 border-b border-outline dark:border-outline text-xs px-1">
          {(
            [
              ['all', 'All Media'],
              ['photo', 'Photos'],
              ['video', 'Videos'],
              ['file', 'Files'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTypeFilter(id)}
              className={`pb-2 border-b-2 font-medium cursor-pointer transition-colors ${
                typeFilter === id
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted dark:text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Vault Items */}
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <FolderArchive className="w-8 h-8 text-muted mx-auto" />
            <p className="text-sm font-medium text-muted dark:text-muted">
              {vaultItems.length ? `No ${typeFilter === 'photo' ? 'photos' : typeFilter === 'video' ? 'videos' : 'files'} in your vault` : 'No vaulted items yet'}
            </p>
            <p className="text-xs text-muted dark:text-muted">
              Save or view disappearing photos/videos or restricted group media to store local copies here.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
            {filteredItems.map((item) => {
              const mediaUrl = `/api/tg/media/${encodeURIComponent(item.chatId)}/${item.messageId}`;
              return (
                <div
                  key={item.key}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-hover dark:hover:bg-hover"
                >
                  <button type="button" aria-label={`Open ${item.fileName}`} onClick={() => {
                    if (item.mediaType === 'photo' || item.mediaType === 'video') setPreviewItem(item);
                    else window.open(mediaUrl, '_blank', 'noopener,noreferrer');
                  }} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
                    {item.mediaType === 'photo' || item.mediaType === 'video' ? (
                      <img
                        src={`${mediaUrl}?thumb=1`}
                        alt={item.fileName}
                        className="w-11 h-11 rounded-lg object-cover bg-elevated dark:bg-elevated shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        {item.mediaType === 'file' ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{item.fileName}</p>
                      <p className="text-[11px] text-muted dark:text-muted truncate tabular-nums">
                        {item.mediaType.toUpperCase()} · {formatBytes(item.fileSize)} · {item.chatTitle}
                        {item.isDisappearing ? ` · TTL ${item.ttlSeconds || ''}s` : ''}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleForwardItem(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Forward className="w-3.5 h-3.5 text-primary" />
                      <span>{forwardedKey === item.key ? 'Sent ✓' : 'Forward'}</span>
                    </button>
                    <a
                      href={`${mediaUrl}?download=1`}
                      download={item.fileName}
                      className="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold flex items-center gap-1"
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
      {previewItem && <MediaViewer
        key={previewItem.key}
        media={{ type: previewItem.mediaType, url: `/api/tg/media/${encodeURIComponent(previewItem.chatId)}/${previewItem.messageId}`, fileName: previewItem.fileName, mimeType: previewItem.mimeType }}
        chatId={previewItem.chatId} chatTitle={previewItem.chatTitle} messageId={String(previewItem.messageId)}
        onClose={() => setPreviewItem(null)}
      />}
    </div>
  );
};
