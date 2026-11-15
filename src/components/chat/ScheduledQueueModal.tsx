import React, { useState, useEffect } from 'react';
import { X, CalendarClock, Send, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { TelegramMessage } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';

interface Props {
  isOpen: boolean;
  chatId: string;
  chatTitle: string;
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

export const ScheduledQueueModal: React.FC<Props> = ({
  isOpen,
  chatId,
  chatTitle,
  onClose,
  onNotify,
}) => {
  const [items, setItems] = useState<TelegramMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const list = await telegramService.getScheduledMessages(chatId);
      setItems(list);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not load scheduled queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && chatId) {
      void loadQueue();
    }
  }, [isOpen, chatId]);

  if (!isOpen) return null;

  const handleSendNow = async (id: string) => {
    setBusyId(id);
    try {
      await telegramService.sendScheduledNow(chatId, [Number(id)]);
      setItems((prev) => prev.filter((m) => m.id !== id));
      onNotify?.('Scheduled message sent now');
    } catch (err) {
      onNotify?.((err as Error).message || 'Failed to send');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await telegramService.deleteScheduledMessages(chatId, [Number(id)]);
      setItems((prev) => prev.filter((m) => m.id !== id));
      onNotify?.('Scheduled message deleted');
    } catch (err) {
      onNotify?.((err as Error).message || 'Failed to delete');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Scheduled messages" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[80vh] rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl flex flex-col overflow-hidden text-ink dark:text-ink"
      >
        <div className="px-4 py-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">Scheduled Messages</h3>
              <p className="text-[11px] text-muted dark:text-muted truncate">{chatTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadQueue()}
              className="p-1.5 rounded-lg text-muted hover:text-primary cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-ink dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {loading && items.length === 0 ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted dark:text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Loading scheduled queue...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <CalendarClock className="w-7 h-7 text-muted mx-auto" />
              <p className="text-xs font-medium">No scheduled messages</p>
              <p className="text-[11px] text-muted dark:text-muted">
                Use the clock schedule option next to Send to queue messages for a future time.
              </p>
            </div>
          ) : (
            items.map((msg) => (
              <div
                key={msg.id}
                className="p-3 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-primary font-medium tabular-nums">
                    {new Date(msg.timestamp).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === msg.id}
                      onClick={() => void handleSendNow(msg.id)}
                      className="px-2 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>Send Now</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === msg.id}
                      onClick={() => void handleDelete(msg.id)}
                      className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      title="Delete scheduled message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed break-words">
                  {msg.text || (msg.poll ? `Poll: ${msg.poll.question}` : `[${msg.media?.type || 'Media'}]`)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
