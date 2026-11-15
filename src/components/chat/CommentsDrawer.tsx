import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquareText, Send, Loader2 } from 'lucide-react';
import { TelegramMessage } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { Avatar } from '../common/Avatar';
import { FormattedText } from '../common/FormattedText';

interface Props {
  isOpen: boolean;
  chatId: string;
  postMessage: TelegramMessage | null;
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

export const CommentsDrawer: React.FC<Props> = ({
  isOpen,
  chatId,
  postMessage,
  onClose,
  onNotify,
}) => {
  const [comments, setComments] = useState<TelegramMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !postMessage) return;
    setLoading(true);
    setError(null);
    setComments([]);
    void telegramService
      .getPostComments(chatId, postMessage.id)
      .then((res) => {
        setComments(res.messages);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 60);
      })
      .catch((err) => {
        setError((err as Error).message || 'Comments unavailable for this post.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, chatId, postMessage?.id]);

  if (!isOpen || !postMessage) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      const sent = await telegramService.sendPostComment(chatId, postMessage.id, replyText.trim());
      setComments((prev) => [...prev, sent]);
      setReplyText('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (err) {
      onNotify?.((err as Error).message || 'Failed to send comment');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-surface dark:bg-surface border-l border-outline dark:border-outline shadow-2xl flex flex-col text-ink dark:text-ink"
      >
        <div className="px-4 py-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Comments</h3>
              <p className="text-[11px] text-muted dark:text-muted tabular-nums">
                {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
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

        {/* Original Channel Post Preview */}
        <div className="p-3.5 border-b border-outline dark:border-outline bg-surface-low/70 dark:bg-elevated text-xs space-y-1">
          <div className="text-[10.5px] font-semibold text-primary">Original Post</div>
          <p className="text-ink dark:text-muted line-clamp-4 whitespace-pre-wrap">
            {postMessage.text || `[${postMessage.media?.type || 'Post'}]`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-muted dark:text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Loading discussion thread...</span>
            </div>
          ) : error ? (
            <div className="py-10 text-center text-xs text-rose-500">{error}</div>
          ) : comments.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted dark:text-muted">
              No comments yet. Be the first to reply.
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 text-xs">
                <Avatar src={c.senderAvatar} title={c.senderName} id={c.senderId} size="xs" />
                <div className="flex-1 min-w-0 p-2.5 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-semibold text-primary truncate">{c.senderName}</span>
                    <span className="text-[10px] text-muted font-mono tabular-nums shrink-0">
                      {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    <FormattedText text={c.text || `[${c.media?.type || 'Media'}]`} entities={c.entities} />
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => void handleSend(e)}
          className="p-3 border-t border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center gap-2"
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 px-3 py-2 rounded-full bg-surface dark:bg-elevated border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!replyText.trim() || sending}
            className="w-9 h-9 rounded-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
