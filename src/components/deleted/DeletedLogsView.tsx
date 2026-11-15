import React, { useState, useEffect } from 'react';
import { Trash2, Download, ArrowLeft, MessageSquare } from 'lucide-react';
import { TelegramChat } from '../../types/telegram';
import { AyuGramDeletedMessageLog } from '../../types/ayugram';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { telegramService } from '../../services/telegramService';
import { Avatar } from '../common/Avatar';

interface Props {
  chats: TelegramChat[];
  onSelectChat: (chatId: string) => void;
  onBackMobile?: () => void;
}

export const DeletedLogsView: React.FC<Props> = ({ chats, onSelectChat, onBackMobile }) => {
  const [deletedLogs, setDeletedLogs] = useState<AyuGramDeletedMessageLog[]>(
    ayuGramEngine.getDeletedLogs()
  );

  useEffect(() => {
    const unsub = ayuGramEngine.subscribe(() => {
      setDeletedLogs(ayuGramEngine.getDeletedLogs());
    });
    return () => unsub();
  }, []);

  const deletedChats = chats.filter((c) => c.isDeletedChat);

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-canvas dark:bg-canvas text-ink dark:text-ink overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-outline dark:border-outline bg-surface dark:bg-surface flex items-center justify-between gap-3 flex-wrap">
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
            <h1 className="text-base font-bold">Deleted Chats &amp; Message Logs</h1>
            <p className="text-xs text-muted dark:text-muted tabular-nums">
              {deletedChats.length} deleted chats · {deletedLogs.length} deleted messages preserved
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => ayuGramEngine.exportDeletedLogsAsJson()}
            className="px-3 py-1.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export JSON</span>
          </button>
          {deletedLogs.length > 0 && (
            <button
              type="button"
              onClick={() => void ayuGramEngine.clearDeletedLogs()}
              className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 text-xs font-semibold cursor-pointer"
            >
              Clear Messages
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Section 1: Deleted Chat Threads (Rendered at 70% opacity + side Deleted label) */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-muted dark:text-muted px-1">
            Deleted Chats &amp; Removed Groups · {deletedChats.length}
          </h2>
          {deletedChats.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline text-center text-xs text-muted dark:text-muted">
              No deleted or left chats captured yet. When a dialog disappears or is deleted while Anti-Delete is enabled, it stays accessible here at 70% opacity.
            </div>
          ) : (
            <div className="rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
              {deletedChats.map((chat) => (
                <div
                  key={chat.id}
                  className="px-4 py-3 flex items-center justify-between gap-3 opacity-70 hover:bg-hover dark:hover:bg-hover transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onSelectChat(chat.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <Avatar src={chat.avatarUrl} title={chat.title} id={chat.id} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{chat.title}</p>
                      <p className="text-xs text-muted dark:text-muted truncate">
                        {chat.lastMessage?.text || 'Archived conversation'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] font-medium text-rose-500 dark:text-rose-400 tabular-nums">
                      Deleted · {formatDate(chat.deletedAt || chat.lastMessage?.timestamp)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectChat(chat.id)}
                      className="px-2.5 py-1 rounded-lg bg-elevated dark:bg-elevated text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3 text-primary" />
                      <span>History</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void telegramService.removeDeletedChatFromArchive(chat.id)}
                      className="p-1.5 text-muted hover:text-rose-500 cursor-pointer"
                      title="Remove from Archive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Captured Deleted Messages (Rendered at 70% opacity + side Deleted label) */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-muted dark:text-muted px-1">
            Deleted Messages Log · {deletedLogs.length}
          </h2>
          {deletedLogs.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline text-center text-xs text-muted dark:text-muted">
              No deleted messages logged yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
              {deletedLogs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => onSelectChat(log.chatId)}
                  className="px-4 py-3 flex items-center justify-between gap-3 opacity-70 hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{log.senderName}</p>
                    <p className="text-xs text-muted dark:text-muted truncate mt-0.5">
                      {log.text || `[${log.mediaType || 'Media'}]`}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-rose-500 dark:text-rose-400 tabular-nums shrink-0">
                    Deleted · {formatDate(log.deletedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
