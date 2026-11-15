import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, FileText, Image, Music, Mic, Link2 } from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import type { GlobalSearchResult, TelegramChat, MessageSearchFilter, MessageSearchHit, MessageSearchPage } from '../../types/telegram';
import { Avatar } from '../common/Avatar';

const filters = ['all', 'chats', 'messages', 'media', 'files', 'links', 'music', 'voice'] as const;
type Filter = typeof filters[number];
function Highlight({ text, query }: { text: string; query: string }) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark className="bg-primary-container text-on-container rounded-sm">{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>;
}

export function SearchResults({ query, chats, chatId, topMsgId, accountId, onSelectChat, onOpenPeer, onOpenMessage }: {
  query: string; chats: TelegramChat[]; chatId?: string; topMsgId?: number; accountId: string;
  onSelectChat: (id: string) => void; onOpenPeer: (peer: GlobalSearchResult) => Promise<void> | void;
  onOpenMessage: (hit: MessageSearchHit, signal?: AbortSignal) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>(chatId ? 'messages' : 'all');
  const [peers, setPeers] = useState<GlobalSearchResult[]>([]);
  const [page, setPage] = useState<MessageSearchPage>({ results: [], hasMore: false });
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const q = query.trim();
  const localChats = useMemo(() => chats.filter(c => !c.isDeletedChat && (!q || `${c.title} ${c.username || ''}`.toLowerCase().includes(q.toLowerCase()))), [chats, q]);
  const showPeers = !chatId && (filter === 'all' || filter === 'chats');
  const canSearch = Boolean(q) || !['all', 'chats', 'messages'].includes(filter);
  useEffect(() => {
    const version = ++request.current;
    const abort = new AbortController(); controller.current = abort;
    setPeers([]); setPage({ results: [], hasMore: false }); setError(''); setLoading(canSearch);
    if (!canSearch) return () => abort.abort();
    const timer = setTimeout(async () => {
      const jobs = await Promise.allSettled([
        showPeers && q.length >= 2 ? telegramService.searchGlobal(q, abort.signal) : Promise.resolve([]),
        filter === 'chats' ? Promise.resolve({ results: [], hasMore: false }) : telegramService.searchMessages(q, filter as MessageSearchFilter, { chatId, topMsgId, signal: abort.signal }),
      ]);
      if (abort.signal.aborted || request.current !== version) return;
      if (jobs[0].status === 'fulfilled') setPeers(jobs[0].value);
      if (jobs[1].status === 'fulfilled') setPage(jobs[1].value);
      const failed = jobs.find(job => job.status === 'rejected');
      if (failed?.status === 'rejected') setError(failed.reason?.message || 'Search failed. Try again.');
      setLoading(false);
    }, 280);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [q, filter, chatId, topMsgId, accountId, retry]);

  async function loadMore() {
    if (!page.nextCursor || loading) return;
    const version = request.current;
    setLoading(true); setError('');
    try {
      const next = await telegramService.searchMessages(q, filter as MessageSearchFilter, { chatId, topMsgId, cursor: page.nextCursor, signal: controller.current?.signal });
      if (version !== request.current) return;
      setPage(previous => {
        const hits = new Map([...previous.results, ...next.results].map(hit => [`${hit.chat.id}:${hit.message.id}`, hit]));
        return { ...next, results: [...hits.values()] };
      });
    } catch (e) { if (version === request.current && (e as Error).name !== 'AbortError') setError((e as Error).message); }
    finally { if (version === request.current) setLoading(false); }
  }
  async function open(key: string, action: () => Promise<void> | void) {
    if (opening) return;
    setOpening(key); setError('');
    try { await action(); } catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Could not open this result.'); }
    finally { setOpening(null); }
  }
  const remotePeers = peers.filter(peer => !localChats.some(chat => chat.id === peer.id));
  const peerRow = (peer: GlobalSearchResult, local: boolean) => <button key={peer.id} type="button" disabled={Boolean(opening)} onClick={() => void open(peer.id, () => local ? onSelectChat(peer.id) : onOpenPeer(peer))} className="tg-search-result">
    <Avatar title={peer.title} src={peer.avatarUrl} id={peer.id} size="md" />
    <span className="min-w-0 flex-1"><span className="block font-medium truncate"><Highlight text={peer.title} query={q} /></span><span className="block text-xs text-muted truncate">{peer.username ? `@${peer.username} · ` : ''}{peer.type === 'user' ? 'Person' : peer.type === 'bot' ? 'Bot' : peer.type === 'saved' ? 'Saved Messages' : peer.type === 'group' ? 'Group' : 'Channel'}</span></span>
    {opening === peer.id && <Loader2 className="w-4 h-4 animate-spin" />}
  </button>;
  return <section aria-label={chatId ? 'Search this conversation' : 'Telegram search results'} className="flex-1 min-h-0 flex flex-col bg-canvas text-ink">
    <div className="tg-folder-tabs flex gap-2 px-3 py-2 overflow-x-auto no-scrollbar shrink-0" role="group" aria-label="Search filters">
      {filters.filter(f => !chatId || !['all', 'chats'].includes(f)).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="capitalize whitespace-nowrap text-sm shrink-0">{f === 'voice' ? 'Voice' : f}</button>)}
    </div>
    <div className="flex-1 overflow-y-auto min-h-0 pb-6">
      {!canSearch && <p className="px-5 py-6 text-sm text-muted flex items-center gap-3"><Search className="w-5 h-5 shrink-0" />Search messages, people and chats, or choose a media filter.</p>}
      {showPeers && localChats.length > 0 && <><h3 className="tg-section-label mt-4">{q ? 'Your chats' : 'Recent chats'}</h3>{localChats.slice(0, q ? 100 : 8).map(peer => peerRow(peer, true))}</>}
      {showPeers && remotePeers.length > 0 && <><h3 className="tg-section-label mt-4">Global results</h3>{remotePeers.map(peer => peerRow(peer, false))}</>}
      {page.results.length > 0 && <><h3 className="tg-section-label mt-4">{filter === 'all' ? 'Messages' : filter.charAt(0).toUpperCase() + filter.slice(1)}{page.count ? ` · ${page.count.toLocaleString()}` : ''}</h3>{page.results.map(hit => {
        const key = `${hit.chat.id}:${hit.message.id}`;
        const media = hit.message.media;
        const Icon = filter === 'links' ? Link2 : media?.type === 'photo' || media?.type === 'video' ? Image : media?.type === 'voice' ? Mic : filter === 'music' ? Music : FileText;
        return <button key={key} type="button" disabled={Boolean(opening)} onClick={() => void open(key, () => onOpenMessage(hit, controller.current?.signal))} className="tg-search-result">
          <span className="tg-row-icon">{opening === key ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}</span>
          <span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><strong className="font-medium truncate">{chatId ? hit.message.senderName || hit.chat.title : hit.chat.title}</strong><time className="text-[11px] text-muted shrink-0">{new Date(hit.message.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></span><span className="block text-sm text-muted line-clamp-2 break-words"><Highlight text={hit.message.text || media?.fileName || (media ? `[${media.type}]` : 'Message')} query={q} /></span></span>
        </button>;
      })}</>}
      {loading && <p role="status" className="py-6 flex justify-center items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" />Searching Telegram…</p>}
      {error && <div role="alert" className="mx-4 my-4 p-4 rounded-2xl bg-surface text-sm"><p>{error}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="text-primary mt-2 min-h-11">Try again</button></div>}
      {!loading && !error && canSearch && !page.results.length && (!showPeers || (!localChats.length && !remotePeers.length)) && <p role="status" className="text-sm text-muted text-center px-6 py-12">No {filter === 'all' ? 'results' : filter} found{q ? ` for “${q}”` : ''}.</p>}
      {page.hasMore && !loading && <button type="button" onClick={() => void loadMore()} className="block mx-auto bg-elevated text-ink rounded-full px-6 py-3 text-sm mt-4">Load more results</button>}
    </div>
  </section>;
}
