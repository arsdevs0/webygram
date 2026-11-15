import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Search, X, UserRound, Bell, Monitor, Folder, Shield, Trash2, FolderArchive, EyeOff, AudioLines, Palette, RotateCcw, QrCode, Phone } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import type { AuthSession } from '../../types/telegram';
import type { SettingsCategory } from './SettingsModal';

interface Props {
  session: AuthSession; phone: string; palette: string; deletedCount: number;
  onBack: () => void; onProfile: () => void; onLogin: () => void;
  onSettings: (category: SettingsCategory) => void;
  onDeleted: () => void; onVault: () => void; onAyu: () => void;
  onVoice: () => void; onAppearance: () => void; onCalls: () => void; onResetStyle: () => void;
}

export function SettingsHome(p: Props) {
  const [query, setQuery] = useState('');
  const groups = [
    { title: 'Account', rows: [
      { title: 'My profile', detail: 'Name, bio and username', icon: UserRound, action: p.onProfile },
      { title: 'Devices', detail: 'Active Telegram sessions', icon: Monitor, action: () => p.onSettings('devices') },
      { title: 'Privacy and security', detail: 'Passcode, last seen and blocked users', icon: Shield, action: () => p.onSettings('privacy') },
    ]},
    { title: 'Your experience', rows: [
      { title: 'Appearance', detail: p.palette, icon: Palette, action: p.onAppearance },
      { title: 'Notifications and sounds', detail: 'Message alerts and sound effects', icon: Bell, action: () => p.onSettings('notifications') },
      { title: 'Chat folders', detail: 'Organize your conversations', icon: Folder, action: () => p.onSettings('chats') },
      { title: 'Calls and recordings', detail: 'Call history and saved audio', icon: Phone, action: p.onCalls },
    ]},
    { title: 'Webygram extras', rows: [
      { title: 'AyuGram', detail: 'Ghost mode, privacy and extra controls', icon: EyeOff, action: p.onAyu },
      { title: 'Media vault', detail: 'Saved media and auto-forward rules', icon: FolderArchive, action: p.onVault },
      { title: 'Deleted messages', detail: `${p.deletedCount} archived items`, icon: Trash2, action: p.onDeleted },
      { title: 'Voice changer', detail: 'Live effects and voice notes', icon: AudioLines, action: p.onVoice },
    ]},
    { title: 'Preferences', rows: [
      { title: 'Reset appearance', detail: 'Restore Original Telegram', icon: RotateCcw, action: p.onResetStyle },
    ]},
  ];
  const filtered = groups.map(g => ({...g, rows: g.rows.filter(r => `${r.title} ${r.detail}`.toLowerCase().includes(query.toLowerCase()))})).filter(g => g.rows.length);
  const name = p.session.isConnected ? `${p.session.user.firstName} ${p.session.user.lastName || ''}`.trim() : 'Welcome to Webygram';
  return <section className="tg-settings-home flex-1 min-w-0 flex flex-col bg-canvas text-ink overflow-hidden">
    <header className="tg-screen-header">
      <button aria-label="Back to chats" onClick={p.onBack} className="tg-icon-button"><ArrowLeft /></button>
      <h1>Settings</h1>
    </header>
    <div className="tg-settings-content flex-1 overflow-y-auto px-4 pb-5 space-y-6">
      <div className="tg-search-field"><Search className="h-5 w-5" /><input aria-label="Search settings" placeholder="Search settings" value={query} onChange={e=>setQuery(e.target.value)} />{query && <button onClick={()=>setQuery('')} aria-label="Clear settings search"><X className="h-4 w-4" /></button>}</div>
      {!query && <div className="tg-profile-card">
        <button onClick={p.session.isConnected ? p.onProfile : p.onLogin} className="flex items-center gap-4 flex-1 min-w-0 text-left">
          <Avatar src={p.session.user.avatarUrl} title={name} id={p.session.user.id} size="lg" />
          <span className="min-w-0"><strong className="block text-lg font-medium leading-snug">{name}</strong><span className="block text-sm text-muted mt-1">{p.session.isConnected ? p.phone : 'Connect your Telegram account'}</span></span>
        </button>
        <button aria-label="Sign in or switch account" onClick={p.onLogin} className="tg-icon-button"><QrCode /></button>
      </div>}
      {filtered.map(group=><section key={group.title} className="tg-settings-section space-y-2"><h2 className="tg-section-label">{group.title}</h2><div className="tg-settings-group">
        {group.rows.map(row=><button key={row.title} onClick={row.action} className="tg-settings-row"><span className="tg-row-icon"><row.icon className="h-5 w-5" /></span><span className="flex-1 min-w-0"><span className="block text-[15px] font-medium">{row.title}</span><span className="block text-[13px] text-muted mt-0.5">{row.detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted" /></button>)}
      </div></section>)}
      {!filtered.length && <p role="status" className="py-12 text-center text-muted">No settings match “{query}”.</p>}
    </div>
  </section>;
}
