import { groupTimelineMessages } from '../../utils/messageAlbums';
import React, { useState, useMemo, useRef } from 'react';
import { X, Search, Forward, Check, Bookmark, EyeOff, Loader2, ArrowLeft, BellOff, CalendarClock, MessageSquare } from 'lucide-react';
import { TelegramChat, TelegramMessage } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import type { ForwardBatchResult } from '../../utils/forwardOptions';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import { Avatar } from '../common/Avatar';
interface Props {
  isOpen: boolean; fromChatId: string; messageIds: string[]; messages: TelegramMessage[];
  chats: TelegramChat[]; onClose: () => void;
  onForwarded: (count: number, targetTitles: string[], scheduled?: boolean) => void; onNotify?: (msg: string) => void;
}
export const ForwardPickerModal: React.FC<Props> = ({ isOpen, fromChatId, messageIds, messages, chats, onClose, onForwarded }) => {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'recipients' | 'preview'>('recipients');
  const [hideSenderTag, setHideSenderTag] = useState(() => ayuGramEngine.getSettings().hideForwardTag);
  const [hideCaptions, setHideCaptions] = useState(false);
  const [silent, setSilent] = useState(false);
  const [comment, setComment] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ForwardBatchResult | null>(null);
  const busyRef = useRef(false);
  const attemptRef = useRef<Parameters<typeof telegramService.forwardBatchDetailed>[0] | null>(null);
  const targetGroup = telegramService.getTargetGroup();
  const targets = useMemo(() => {
    const saved = chats.find(c => c.type === 'saved' && !c.isDeletedChat);
    const list: TelegramChat[] = [{ ...(saved || {}), id: 'me', type: 'saved', title: 'Saved Messages', unreadCount: 0, isPinned: false, isMuted: false }];
    const active = chats.filter(c => !c.isDeletedChat && c.type !== 'saved' && c.canPostMessages !== false);
    if (targetGroup && !active.some(c => c.id === targetGroup.id) && !chats.some(c => c.id === targetGroup.id && c.canPostMessages === false)) {
      list.push({ id: targetGroup.id, title: targetGroup.title, type: 'group', unreadCount: 0, isPinned: false, isMuted: false });
    }
    list.push(...active);
    return list.filter((chat, index) => list.findIndex(c => c.id === chat.id) === index);
  }, [chats, targetGroup?.id, targetGroup?.title]);
  const candidates = targets.filter(c => !query.trim() || (c.title + ' ' + (c.username || '')).toLowerCase().includes(query.trim().replace(/^@/, '').toLowerCase()));
  const selectedTargets = targets.filter(c => selectedIds.has(c.id));
  const hasCaptions = messages.some(m => m.media && m.text);
  const attempted = Boolean(attemptRef.current);
  const closeOrBack = () => {
    if (busyRef.current) return;
    if (step === 'preview' && !attemptRef.current) { setStep('recipients'); setError(''); }
    else onClose();
  };
  useEscapeDismiss(isOpen, closeOrBack);
  if (!isOpen) return null;
  const titleFor = (id: string) => targets.find(c => c.id === id)?.title || id;
  const handleConfirm = async () => {
    if (busyRef.current || !selectedIds.size || !messageIds.length) return;
    setError('');
    if (!attemptRef.current) {
      const scheduleDate = scheduled ? Math.floor(new Date(scheduleDateTime).getTime() / 1000) : undefined;
      if (scheduled && (!scheduleDate || scheduleDate <= Date.now() / 1000)) { setError('Choose a future date and time.'); return; }
      attemptRef.current = { fromChatId, toChatIds: [...selectedIds], messageIds, hideSenderTag,
        hideCaptions, silent, comment, scheduleDate, requestId: crypto.randomUUID() };
    }
    busyRef.current = true; setSubmitting(true);
    try {
      const delivery = await telegramService.forwardBatchDetailed(attemptRef.current);
      setResult(delivery);
      if (delivery.ok) { onForwarded(delivery.count, delivery.targets.map(t => titleFor(t.chatId)), scheduled); onClose(); }
      else setError('Some messages could not be sent. Retry continues the remaining deliveries.');
    } catch (err) { setError((err as Error).message || 'Forward failed. Retry to check and continue this delivery.'); }
    finally { busyRef.current = false; setSubmitting(false); }
  };
  const option = (label: string, checked: boolean, action: () => void, icon: React.ReactNode, detail?: string) => (
    <button type="button" role="checkbox" aria-checked={checked} disabled={attempted || submitting} onClick={action}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover disabled:opacity-60">
      <span className="text-primary shrink-0">{icon}</span><span className="flex-1 text-sm">{label}{detail && <span className="block text-xs text-muted mt-0.5">{detail}</span>}</span>
      <span className={`w-5 h-5 rounded border flex items-center justify-center ${checked ? 'bg-primary border-primary text-white' : 'border-outline'}`}>{checked && <Check className="w-3.5 h-3.5" />}</span>
    </button>
  );
  return <div role="dialog" aria-modal="true" aria-label="Forward messages" onClick={() => { if (!busyRef.current) onClose(); }}
    className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
    <div onClick={e => e.stopPropagation()} className="w-full max-w-md max-h-[88dvh] rounded-2xl bg-surface border border-outline shadow-2xl flex flex-col overflow-hidden text-ink">
      <div className="px-4 py-3 border-b border-outline flex items-center gap-3">
        <button type="button" aria-label={step === 'preview' && !attempted ? 'Change recipients' : 'Cancel forwarding'} disabled={submitting} onClick={closeOrBack} className="tg-icon-button">
          {step === 'preview' && !attempted ? <ArrowLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </button><div className="flex-1"><h3 className="text-base font-semibold">{step === 'preview' ? 'Forward preview' : 'Forward to'}</h3>
          <p className="text-xs text-muted">{messageIds.length} {messageIds.length === 1 ? 'message' : 'messages'}{step === 'preview' ? ' · ' + selectedTargets.map(c => c.title).join(', ') : ''}</p></div>
        <Forward className="w-5 h-5 text-primary" />
      </div>
      {step === 'recipients' ? <>
        <div className="p-3"><label className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-elevated"><Search className="w-4 h-4 text-muted" />
          <input autoFocus aria-label="Search recipients" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {candidates.map(chat => <button type="button" aria-pressed={selectedIds.has(chat.id)} key={chat.id} onClick={() => setSelectedIds(previous => { const next = new Set(previous); next.has(chat.id) ? next.delete(chat.id) : next.add(chat.id); return next; })}
            className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-hover ${selectedIds.has(chat.id) ? 'bg-primary/10' : ''}`}>
            {chat.type === 'saved' ? <span className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center"><Bookmark className="w-5 h-5" /></span> : <Avatar src={chat.avatarUrl} title={chat.title} id={chat.id} size="sm" />}
            <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{chat.title}</span><span className="block text-xs text-muted truncate">{chat.type === 'saved' ? 'Your personal cloud' : chat.username ? '@' + chat.username : chat.type}</span></span>
            <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedIds.has(chat.id) ? 'bg-primary border-primary text-white' : 'border-outline'}`}>{selectedIds.has(chat.id) && <Check className="w-3.5 h-3.5" />}</span>
          </button>)}
          {!candidates.length && <p role="status" className="p-8 text-sm text-muted text-center">No chats found</p>}
        </div>
        <div className="p-3 border-t border-outline flex items-center justify-between"><span className="text-xs text-muted">{selectedIds.size} selected</span>
          <button type="button" disabled={!selectedIds.size} onClick={() => setStep('preview')} className="px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm disabled:opacity-40">Next</button></div>
      </> : <>
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
          <div className="rounded-xl bg-elevated p-3 space-y-2 max-h-48 overflow-y-auto" aria-label="Message preview">
            {groupTimelineMessages(messages).map(album => <div key={album[0].id} className="border-l-2 border-primary pl-3 text-sm" role={album.length > 1 ? 'group' : undefined} aria-label={album.length > 1 ? 'Album preview' : undefined}>
              {!hideSenderTag && <p className="text-primary font-semibold text-xs">Forwarded from {album[0].forwardFrom?.name || album[0].senderName}</p>}
              {album.length > 1 && <p className="text-muted text-xs">Album · {album.length} photos/videos</p>}
              {album.map(message => <React.Fragment key={message.id}>{message.media && album.length === 1 && <p className="text-muted text-xs">{message.media.fileName || message.media.type}</p>}{(!message.media || !hideCaptions) && message.text && <p className="whitespace-pre-wrap break-words line-clamp-4">{message.text}</p>}{message.poll && <p>{message.poll.question}</p>}</React.Fragment>)}
            </div>)}
            {!messages.length && <p className="text-sm text-muted">{messageIds.length} messages ready to forward</p>}
          </div>
          <div className="rounded-xl border border-outline">
            {option('Hide sender names', hideSenderTag, () => { setHideSenderTag(!hideSenderTag); if (hideSenderTag) setHideCaptions(false); }, <EyeOff className="w-4 h-4" />)}
            {hasCaptions && option('Hide captions', hideCaptions, () => { setHideCaptions(!hideCaptions); if (!hideCaptions) setHideSenderTag(true); }, <MessageSquare className="w-4 h-4" />, 'Sender names are also hidden when captions are removed.')}
            {option('Send without sound', silent, () => setSilent(!silent), <BellOff className="w-4 h-4" />)}
            {option('Schedule messages', scheduled, () => { setScheduled(!scheduled); setError(''); }, <CalendarClock className="w-4 h-4" />)}
          </div>
          {scheduled && <label className="block text-xs text-muted">Send at your local time<input type="datetime-local" aria-label="Scheduled forwarding time" value={scheduleDateTime} onChange={e => setScheduleDateTime(e.target.value)} disabled={attempted || submitting} className="block w-full rounded-xl border border-outline bg-elevated p-3 text-sm text-ink mt-1" /></label>}
          <label className="block text-xs text-muted">Add a comment<textarea aria-label="Forward comment" value={comment} maxLength={4096} onChange={e => setComment(e.target.value)} disabled={attempted || submitting} rows={2} placeholder="Write a comment…" className="mt-1 w-full resize-none rounded-xl bg-elevated border border-outline p-3 text-sm text-ink outline-none" /></label>
          {result && <div className="text-xs space-y-1" role="status">{result.targets.map(target => <p key={target.chatId} className={target.complete ? 'text-primary' : 'text-rose-500'}>{titleFor(target.chatId)}: {target.complete ? scheduled ? 'Scheduled' : 'Sent' : target.deliveredMessageIds.length + '/' + messageIds.length + ' sent · ' + target.error}</p>)}</div>}
          {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
        </div>
        <div className="p-3 border-t border-outline flex justify-end gap-2">
          <button type="button" disabled={submitting} onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-muted">Cancel</button>
          <button type="button" disabled={submitting} onClick={() => void handleConfirm()} className="rounded-xl px-5 py-2.5 bg-primary text-white flex items-center gap-2 text-sm font-semibold disabled:opacity-60">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}{submitting ? 'Sending…' : attempted ? 'Retry remaining' : scheduled ? 'Schedule' : 'Send'}</button>
        </div>
      </>}
    </div>
  </div>;
};
