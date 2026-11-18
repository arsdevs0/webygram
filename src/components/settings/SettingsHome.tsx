import React, { useState } from 'react';
import { ChevronRight, Search, X, UserRound, Bell, Monitor, Folder, Shield, Trash2, FolderArchive, EyeOff, AudioLines, Palette, QrCode, Phone, Bookmark, Database, Battery, Globe } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import type { AuthSession } from '../../types/telegram';
import type { SettingsCategory } from './SettingsModal';
interface Props {
  session: AuthSession; phone: string; palette: string; deletedCount: number;
  onBack: () => void; onProfile: () => void; onLogin: () => void;
  onSettings: (category: SettingsCategory) => void; onSaved: () => void; onFolders: () => void; onData: () => void;
  onDeleted: () => void; onVault: () => void; onAyu: () => void; onVoice: () => void; onAppearance: () => void; onCalls: () => void; onResetStyle: () => void;
  powerSaving: boolean; onPowerSaving: () => void;
}
export function SettingsHome(p: Props) {
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false);
  useEscapeDismiss(searching || Boolean(query), () => { setQuery(''); setSearching(false); });
  const groups = [
    { title: '', rows: [
      { title: 'Account', description: 'Number, Username, Bio', icon: UserRound, action: p.onProfile, tone: 0 },
      { title: 'Chat Settings', description: 'Wallpaper, Night Mode, Animations', icon: Palette, action: p.onAppearance, tone: 1 },
      { title: 'Privacy & Security', description: 'Last Seen, Devices, Passcode', icon: Shield, action: () => p.onSettings('privacy'), tone: 2 },
      { title: 'Notifications and Sounds', description: 'Sounds, Calls, Badges', icon: Bell, action: () => p.onSettings('notifications'), tone: 3 },
      { title: 'Data and Storage', description: 'Media download settings', icon: Database, action: p.onData, tone: 4 },
      { title: 'Chat Folders', description: 'Sort chats into folders', icon: Folder, action: p.onFolders, tone: 0 },
      { title: 'Devices', description: 'Manage connected devices', icon: Monitor, action: () => p.onSettings('devices'), tone: 5 },
      { title: 'Recent Calls', description: 'Your Telegram call history', icon: Phone, action: p.onCalls, tone: 2 },
    ]},
    { title: 'Webygram extras', rows: [
      { title: 'Saved Messages', description: 'Your cloud messages', icon: Bookmark, action: p.onSaved, tone: 0 },
      { title: 'AyuGram', description: 'Privacy and extra tools', icon: EyeOff, action: p.onAyu, tone: 4 },
      { title: 'Media Vault', description: 'Your saved media', icon: FolderArchive, action: p.onVault, tone: 2 },
      { title: 'Deleted Messages', description: 'Local message history', icon: Trash2, action: p.onDeleted, tone: 3 },
      { title: 'Voice Changer', description: 'Voice notes and call effects', icon: AudioLines, action: p.onVoice, tone: 0 },
    ]},
  ];
  const filtered = groups.map(group => ({ ...group, rows: group.rows.filter(row => row.title.toLowerCase().includes(query.toLowerCase())) })).filter(group => group.rows.length);
  const name = p.session.isConnected ? [p.session.user.firstName, p.session.user.lastName].filter(Boolean).join(' ') : 'Welcome to Webygram';
  return <section className="tg-settings-home tg-next-page"><header className="tg-next-header"><h1>Settings</h1><button type="button" aria-label={searching ? 'Close settings search' : 'Search settings'} className="tg-icon-button" onClick={() => { setSearching(!searching); setQuery(''); }}>{searching ? <X /> : <Search />}</button></header>
    <div className="tg-next-scroll">
      {searching && <label className="tg-search-field"><Search className="w-5 h-5" /><input autoFocus aria-label="Search settings" placeholder="Search settings" value={query} onChange={e => setQuery(e.target.value)} /></label>}
      {!query && <button type="button" onClick={p.session.isConnected ? p.onProfile : p.onLogin} className="tg-next-card tg-settings-identity"><Avatar src={p.session.user.avatarUrl} title={name} id={p.session.user.id} size="lg" /><span className="flex-1 min-w-0 text-center"><strong className="block truncate">{name}</strong><span className="block text-[13px] text-muted mt-1">{p.session.isConnected ? p.phone : 'Connect your Telegram account'}</span></span>{p.session.isConnected ? <ChevronRight /> : <QrCode />}</button>}
      {filtered.map((group, groupIndex) => <section key={group.title || 'preferences'}>{group.title && <h2 className="tg-next-section-label">{group.title}</h2>}<div className="tg-next-card">
        {group.rows.map(row => <button type="button" key={row.title} aria-label={row.title} onClick={row.action} className="tg-next-row"><span className={'tg-next-icon tone-' + row.tone}><row.icon /></span><span className="tg-settings-row-label flex-1"><span>{row.title}</span><small>{row.description}</small></span></button>)}
        {groupIndex === 0 && !query && <><button type="button" role="switch" aria-checked={p.powerSaving} onClick={p.onPowerSaving} className="tg-next-row"><span className="tg-next-icon tone-1"><Battery /></span><span className="tg-settings-row-label flex-1"><span>Power Saving</span><small>Reduce power usage</small></span><span className={'tg-next-switch ' + (p.powerSaving ? 'is-on' : '')}><span /></span></button><div className="tg-next-row"><span className="tg-next-icon tone-4"><Globe /></span><span className="flex-1">Language</span><span className="text-muted">English</span></div></>}
      </div></section>)}
      {!filtered.length && <p role="status" className="tg-next-empty">No settings match your search.</p>}
      <p className="tg-next-footer">Webygram · Telegram client</p>
    </div></section>;
}
