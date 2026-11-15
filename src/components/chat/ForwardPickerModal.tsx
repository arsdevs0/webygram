import React, { useState, useMemo } from 'react';
import { X, Search, Forward, Check, Bookmark, EyeOff, Loader2 } from 'lucide-react';
import { TelegramChat } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { Avatar } from '../common/Avatar';

interface Props {
  isOpen: boolean;
  fromChatId: string;
  messageIds: string[];
  chats: TelegramChat[];
  onClose: () => void;
  onForwarded: (count: number, targetTitles: string[]) => void;
  onNotify?: (msg: string) => void;
}

export const ForwardPickerModal: React.FC<Props> = ({
  isOpen,
  fromChatId,
  messageIds,
  chats,
  onClose,
  onForwarded,
  onNotify,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hideSenderTag, setHideSenderTag] = useState(
    () => ayuGramEngine.getSettings().hideForwardTag
  );
  const [submitting, setSubmitting] = useState(false);

  const targetGroup = telegramService.getTargetGroup();

  const candidates = useMemo(() => {
    const active = chats.filter((c) => !c.isDeletedChat);
    const savedFirst = active.filter((c) => c.type === 'saved');
    const rest = active.filter((c) => c.type !== 'saved');
    const ordered = [...savedFirst, ...rest];
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q)
    );
  }, [chats, query]);

  if (!isOpen) return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0 || messageIds.length === 0) return;
    setSubmitting(true);
    try {
      const toChatIds = Array.from(selectedIds);
      const count = await telegramService.forwardBatch({
        fromChatId,
        toChatIds,
        messageIds,
        hideSenderTag,
      });
      const titles = toChatIds.map((id) => {
        if (id === 'target' && targetGroup) return targetGroup.title;
        if (id === 'me') return 'Saved Messages';
        return chats.find((c) => c.id === id)?.title || id;
      });
      onForwarded(count, titles);
      setSelectedIds(new Set());
      setQuery('');
      onClose();
    } catch (err) {
      onNotify?.((err as Error).message || 'Forward failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Forward messages" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[82vh] rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl flex flex-col overflow-hidden text-ink dark:text-ink"
      >
        <div className="px-4 py-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Forward className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Forward Messages</h3>
              <p className="text-[11px] text-muted dark:text-muted tabular-nums">
                {messageIds.length} {messageIds.length === 1 ? 'message' : 'messages'} selected
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-outline dark:border-outline space-y-2.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-elevated dark:bg-elevated border border-outline dark:border-outline">
            <Search className="w-3.5 h-3.5 text-muted shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats, groups, or channels..."
              className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted"
            />
          </div>

          <button
            type="button"
            onClick={() => setHideSenderTag(!hideSenderTag)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-xs cursor-pointer"
          >
            <span className="flex items-center gap-2 font-medium">
              <EyeOff className="w-3.5 h-3.5 text-primary" />
              <span>Hide sender name (anonymous copy)</span>
            </span>
            <span
              className={`w-4 h-4 rounded flex items-center justify-center border ${
                hideSenderTag
                  ? 'bg-primary border-primary text-white'
                  : 'border-outline dark:border-outline'
              }`}
            >
              {hideSenderTag && <Check className="w-3 h-3" />}
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-outline dark:divide-outline">
          {targetGroup && (
            <button
              type="button"
              onClick={() => toggleId('target')}
              className={`w-full px-4 py-2.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                selectedIds.has('target')
                  ? 'bg-primary/10'
                  : 'hover:bg-hover dark:hover:bg-hover'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Forward className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{targetGroup.title}</p>
                  <p className="text-[10.5px] text-primary truncate">Pinned Target Group</p>
                </div>
              </div>
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  selectedIds.has('target')
                    ? 'bg-primary border-primary text-white'
                    : 'border-outline dark:border-outline'
                }`}
              >
                {selectedIds.has('target') && <Check className="w-3 h-3" />}
              </span>
            </button>
          )}

          {!chats.some((c) => c.type === 'saved') && (
            <button
              type="button"
              onClick={() => toggleId('me')}
              className={`w-full px-4 py-2.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                selectedIds.has('me')
                  ? 'bg-primary/10'
                  : 'hover:bg-hover dark:hover:bg-hover'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                  <Bookmark className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Saved Messages</p>
                  <p className="text-[10.5px] text-muted dark:text-muted">Personal Cloud</p>
                </div>
              </div>
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  selectedIds.has('me')
                    ? 'bg-primary border-primary text-white'
                    : 'border-outline dark:border-outline'
                }`}
              >
                {selectedIds.has('me') && <Check className="w-3 h-3" />}
              </span>
            </button>
          )}

          {candidates.map((chat) => {
            const checked = selectedIds.has(chat.id);
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => toggleId(chat.id)}
                className={`w-full px-4 py-2.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                  checked ? 'bg-primary/10' : 'hover:bg-hover dark:hover:bg-hover'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={chat.avatarUrl}
                    title={chat.title}
                    id={chat.id}
                    size="sm"
                    isSaved={chat.type === 'saved'}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{chat.title}</p>
                    <p className="text-[10.5px] text-muted dark:text-muted truncate">
                      {chat.username ? `@${chat.username}` : chat.type}
                    </p>
                  </div>
                </div>
                <span
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    checked
                      ? 'bg-primary border-primary text-white'
                      : 'border-outline dark:border-outline'
                  }`}
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted dark:text-muted tabular-nums">
            {selectedIds.size} {selectedIds.size === 1 ? 'target' : 'targets'} selected
          </span>
          <button
            type="button"
            disabled={selectedIds.size === 0 || submitting}
            onClick={() => void handleConfirm()}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Forward Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
