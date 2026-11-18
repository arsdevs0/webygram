import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Music, Mic, Download, RefreshCw } from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import { extractLinksFromText } from '../../utils/links';
import type { TelegramMessage, MediaAttachment } from '../../types/telegram';
import { SharedMediaTile } from './SharedMediaTile';
type Tab = 'media' | 'files' | 'links' | 'music' | 'voice' | 'gifs' | 'polls';
const tabs: Array<[Tab, string]> = [['media', 'Media'], ['links', 'Links'], ['polls', 'Polls'], ['gifs', 'GIFs'], ['files', 'Files'], ['music', 'Music'], ['voice', 'Voice']];
function matches(message: TelegramMessage, tab: Tab) {
  const type = message.media?.type;
  if (tab === 'gifs') return type === 'gif';
  if (tab === 'polls') return Boolean(message.poll);
  if (tab === 'media') return type === 'photo' || type === 'video' || type === 'gif';
  if (tab === 'links') return extractLinksFromText(message.text || '').length > 0;
  if (tab === 'music') return type === 'file' && Boolean(message.media?.mimeType?.startsWith('audio/'));
  return type === (tab === 'files' ? 'file' : 'voice') || (tab === 'voice' && type === 'video' && Boolean(message.media?.isRoundVideo));
}
export function SharedMediaTabs({ chatId, messages = [], onOpenMedia, onOpenChatByLink, onOpenMessage }: { chatId: string; messages?: TelegramMessage[]; onOpenMedia: (media: MediaAttachment, id: string) => void; onOpenChatByLink?: (link: string) => void; onOpenMessage?: (message: TelegramMessage) => void }) {
  const visibleTabs=onOpenMessage?tabs:tabs.filter(([key])=>key!=='polls');
  const [tab, setTab] = useState<Tab>('media');
  const [, refresh] = useState(0);
  useEffect(() => telegramService.subscribe(() => refresh(value => value + 1)), []);
  useEffect(() => { if (!telegramService.getSharedMedia(chatId, tab)) void telegramService.loadChatSharedMedia(chatId, tab); }, [chatId, tab]);
  const fetched = telegramService.getSharedMedia(chatId, tab);
  const items = useMemo(() => {
    const map = new Map<string, TelegramMessage>();
    for (const message of [...messages, ...(fetched || [])]) if (matches(message, tab)) map.set(message.id, message);
    return [...map.values()].sort((a, b) => b.timestamp - a.timestamp || Number(b.id) - Number(a.id));
  }, [messages, fetched, tab]);
  const loading = telegramService.isLoadingSharedMedia(chatId, tab);
  const error = telegramService.getSharedMediaError(chatId, tab);
  const more = telegramService.hasMoreSharedMedia(chatId, tab);
  const loadMore = () => { if (more && !loading) void telegramService.loadChatSharedMedia(chatId, tab, true); };
  return <section className="tg-shared-media" aria-label="Shared media">
    <div className="tg-shared-tabs" role="tablist" aria-label="Shared history">{visibleTabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} aria-controls={'shared-panel-' + chatId} onClick={() => setTab(key)}>{label}</button>)}</div>
    <div id={'shared-panel-' + chatId} role="tabpanel" aria-label={tabs.find(item => item[0] === tab)![1]} className="tg-shared-scroll" onScroll={event => { const el = event.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) loadMore(); }}>
      {error && <p role="alert" className="tg-shared-status">{error}<button type="button" onClick={() => void telegramService.loadChatSharedMedia(chatId, tab, Boolean(items.length && more))}><RefreshCw />Retry</button></p>}
      {tab === 'media' || tab === 'gifs' ? <div className="tg-shared-grid">{items.map(message => <SharedMediaTile key={message.id} message={message} onOpen={() => onOpenMedia(message.media!, message.id)} />)}</div> : tab === 'links' ? items.flatMap(message => extractLinksFromText(message.text || '').map((link, index) => <div key={message.id + ':' + index} className="tg-shared-link"><a href={link.href} target="_blank" rel="noopener noreferrer" onClick={event => { if (link.isTelegram && onOpenChatByLink) { event.preventDefault(); onOpenChatByLink(link.raw); } }}>{link.raw}</a><p>{message.text}</p><time>{new Date(message.timestamp).toLocaleDateString()}</time></div>)) : tab === 'polls' ? items.map(message => <button type="button" key={message.id} className="tg-shared-poll" aria-label={'Open poll: '+message.poll!.question} disabled={!onOpenMessage} onClick={()=>onOpenMessage?.(message)}><strong>{message.poll!.question}</strong>{message.poll!.options.map(option=><span key={option.optionHex}>{option.text}<small>{option.voters} votes</small></span>)}<small>{message.poll!.totalVoters} votes · {message.poll!.closed?'Closed':'View in chat'}</small></button>) : items.map(message => <div key={message.id} className="tg-shared-file">
        <button type="button" aria-label={'Open ' + (message.media?.fileName || (tab === 'voice' ? 'voice message' : 'file'))} onClick={() => onOpenMedia(message.media!, message.id)}><span className="tg-shared-file-icon">{tab === 'voice' ? <Mic /> : tab === 'music' ? <Music /> : <FileText />}</span><span><strong>{message.media?.fileName || (tab === 'voice' ? 'Voice message' : 'Document')}</strong><small>{message.media?.fileSize || ''} · {new Date(message.timestamp).toLocaleDateString()}</small></span></button>
        {(tab === 'voice' || tab === 'music') && !message.media?.isRoundVideo && <audio controls preload="none" src={message.media?.url} aria-label={tab === 'voice' ? 'Play voice message' : 'Play music'} />}
        <a href={message.media?.url} download={message.media?.fileName} target="_blank" rel="noopener noreferrer" aria-label="Download file"><Download /></a>
      </div>)}
      {loading && <p role="status" className="tg-shared-status">Loading {tab}…</p>}
      {!loading && !error && !items.length && <p className="tg-shared-status">No shared {tab} yet.</p>}
      {more && <button type="button" disabled={loading} className="tg-shared-more" onClick={loadMore}>{loading ? 'Loading…' : 'Load more'}</button>}
    </div>
  </section>;
}
