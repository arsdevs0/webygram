import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, Plus, Users, RefreshCw } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import { telegramService } from '../../services/telegramService';
import type { UserProfileInfo } from '../../types/telegram';
interface Props { accountId: string; connected: boolean; onBack: () => void; onLogin: () => void; onOpenContact: (contact: UserProfileInfo) => void; onAddContact: () => void }
export function ContactsView(p: Props) {
  const [query, setQuery] = useState(''), [contacts, setContacts] = useState<UserProfileInfo[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEscapeDismiss(Boolean(query), () => setQuery(''));
  useEffect(() => {
    setContacts([]); setError('');
    if (!p.connected) return;
    const abort = new AbortController(); setLoading(true);
    telegramService.getContacts(abort.signal).then(value => { if (!abort.signal.aborted) setContacts(value); }).catch(err => { if (!abort.signal.aborted) setError(err.message || 'Could not load contacts'); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [p.accountId, p.connected, revision]);
  const visible = contacts.filter(contact => (contact.title + ' ' + (contact.username || '') + ' ' + (contact.phone || '')).toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="tg-next-page" aria-label="Contacts">
    <header className="tg-next-header"><button type="button" aria-label="Back to chats" className="tg-icon-button" onClick={p.onBack}><ArrowLeft /></button><h1>Contacts</h1><button type="button" aria-label="Search contacts" className="tg-icon-button" onClick={() => searchRef.current?.focus()}><Search /></button><button type="button" aria-label="Find a contact" className="tg-icon-button" onClick={p.onAddContact}><Plus /></button></header>
    <div className="tg-next-scroll"><label className="tg-search-field"><Search className="w-5 h-5" /><input ref={searchRef} aria-label="Search your contacts" placeholder="Search contacts" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {!p.connected ? <div className="tg-next-empty"><Users /><p>Sign in to see your Telegram contacts.</p><button className="tg-next-primary" onClick={p.onLogin}>Sign in</button></div> : <>
        <h2 className="tg-next-section-label">Contacts <span>{contacts.length}</span></h2>
        {loading && <p role="status" className="tg-next-empty">Loading contacts…</p>}
        {error && <div role="alert" className="tg-next-empty"><p>{error}</p><button className="tg-next-primary" onClick={() => setRevision(v => v + 1)}><RefreshCw className="w-4 h-4" />Retry</button></div>}
        {!loading && !error && <div className="tg-next-card">{visible.map(contact => <button type="button" key={contact.id} className="tg-contact-row" onClick={() => p.onOpenContact(contact)}><Avatar src={contact.avatarUrl} title={contact.title} id={contact.id} size="md" /><span className="min-w-0"><strong className="block truncate">{contact.title}</strong><span className={'block text-[13px] ' + (contact.status === 'online' ? 'text-primary' : 'text-muted')}>{contact.status}</span></span></button>)}
          {!visible.length && <p className="tg-next-empty">{query ? 'No contacts match your search.' : 'Your contact list is empty.'}</p>}</div>}
      </>}
    </div>
  </section>;
}

