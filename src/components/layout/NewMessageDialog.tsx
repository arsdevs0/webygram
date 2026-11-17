import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Search, Users, Radio, RefreshCw, UserRoundSearch } from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import { Avatar } from '../common/Avatar';
import type { TelegramChat, UserProfileInfo } from '../../types/telegram';
interface Props { accountId:string; chats:TelegramChat[]; onClose:()=>void; onSelectChat:(id:string)=>void; onOpenPeer?:(link:string)=>void | Promise<void>; onCreateChat?:(mode:'group'|'channel')=>void }
export function NewMessageDialog(p:Props) {
  const [contacts,setContacts]=useState<UserProfileInfo[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState('');
  useEffect(()=>{
    const abort=new AbortController();setError('');setLoading(true);
    telegramService.getContacts(abort.signal).then(value=>{if(!abort.signal.aborted)setContacts(value);}).catch(err=>{if(!abort.signal.aborted)setError(err.message || 'Could not load contacts.');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return ()=>abort.abort();
  },[p.accountId,revision]);
  const people=useMemo(()=>{
    const all=new Map<string,UserProfileInfo>();
    for(const chat of p.chats) all.set(chat.id,{id:chat.id,title:chat.title,firstName:chat.title,username:chat.username,avatarUrl:chat.avatarUrl,status:chat.status || 'Telegram contact'});
    for(const contact of contacts) all.set(contact.id,contact);
    const search=query.trim().replace(/^@/,'').toLowerCase();
    return [...all.values()].filter(user=>(user.title+' '+(user.username || '')+' '+(user.phone || '')).toLowerCase().includes(search)).sort((a,b)=>a.title.localeCompare(b.title));
  },[contacts,p.chats,query]);
  const open=async(user:UserProfileInfo)=>{
    if(busy)return;setError('');
    if(p.chats.some(chat=>chat.id===user.id)){p.onSelectChat(user.id);p.onClose();return;}
    if(!p.onOpenPeer)return;setBusy(user.id);
    try{await p.onOpenPeer(user.username?'@'+user.username:user.id);p.onClose();}catch(err){setError((err as Error).message || 'Could not open this contact.');}finally{setBusy('');}
  };
  const lookup=async()=>{if(!p.onOpenPeer || busy)return;setBusy('lookup');setError('');try{await p.onOpenPeer(query.trim().startsWith('@')?query.trim():'@'+query.trim());p.onClose();}catch(err){setError((err as Error).message || 'Could not find this username.');}finally{setBusy('');}};
  return createPortal(<div className="tg-compose-dialog" role="dialog" aria-modal="true" aria-label="New message" onClick={()=>{if(!busy)p.onClose();}}><section className="tg-compose-surface" onClick={e=>e.stopPropagation()}>
    <header className="tg-next-header"><button type="button" className="tg-icon-button" aria-label="Close new message" disabled={Boolean(busy)} onClick={p.onClose}><ArrowLeft /></button><h1>New Message</h1></header>
    <label className="tg-compose-search"><Search /><input type="search" aria-label="Search contacts or username" placeholder="Search contacts or username" value={query} onChange={e=>setQuery(e.target.value)} /></label>
    <div className="tg-compose-scroll">
      {!query.trim() && p.onCreateChat && <div className="tg-next-card"><button type="button" className="tg-next-row" onClick={()=>{p.onClose();p.onCreateChat?.('group');}}><span className="tg-next-icon tone-0"><Users /></span>New Group</button><button type="button" className="tg-next-row" onClick={()=>{p.onClose();p.onCreateChat?.('channel');}}><span className="tg-next-icon tone-4"><Radio /></span>New Channel</button></div>}
      <h2 className="tg-next-section-label">Contacts</h2>
      {loading && <p role="status" className="tg-compose-status">Updating contacts…</p>}
      {error && <div role="alert" className="tg-compose-status tg-compose-error">{error}<button type="button" className="tg-next-text-button" onClick={()=>setRevision(v=>v+1)}><RefreshCw className="inline w-4 h-4 mr-2" />Retry</button></div>}
      <div className="tg-next-card">{people.map(user=><button type="button" key={user.id} className="tg-contact-row tg-compose-contact" aria-label={'Message '+user.title} disabled={Boolean(busy)} onClick={()=>void open(user)}><Avatar src={user.avatarUrl} title={user.title} id={user.id} /><span className="min-w-0 flex-1"><strong className="block truncate">{user.title}</strong><span className="block text-muted text-[13px]">{busy===user.id?'Opening…':user.status==='online'?'online':user.username?'@'+user.username:user.status || 'Telegram contact'}</span></span></button>)}</div>
      {!people.length && !loading && <p className="tg-compose-status">{query?'No matching contacts.':'Your contacts will appear here.'}</p>}
      {p.onOpenPeer && /^@?[a-z][a-z0-9_]{3,31}$/i.test(query.trim()) && <button type="button" className="tg-next-row tg-next-card" disabled={Boolean(busy)} onClick={()=>void lookup()}><span className="tg-next-icon tone-0"><UserRoundSearch /></span><span>{busy==='lookup'?'Searching…':'Find @'+query.trim().replace(/^@/,'')+' on Telegram'}</span></button>}
    </div>
  </section></div>,document.body);
}
