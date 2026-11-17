import React, { useState } from 'react';
import { X, User, Users, Radio, Phone, Bookmark, Settings, Moon, Archive, ChevronDown, ShieldCheck, FolderArchive, Trash2, AudioLines, Palette, FolderCog, UserPlus } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import type { TelegramUser } from '../../types/telegram';
interface Props {
  user?: TelegramUser; name: string; isConnected: boolean; night: boolean;
  onClose: () => void; onProfile: () => void; onNewGroup: () => void; onNewChannel: () => void;
  onContacts: () => void; onCalls: () => void; onSaved: () => void; onArchive: () => void;
  onSettings: () => void; onNight: () => void; onLogin: () => void;
  onVault: () => void; onDeleted: () => void; onMods: () => void; onVoice: () => void;
  onAppearance: () => void; onFolders: () => void; onChannels: () => void;
}
export function TelegramNavigationMenu(p: Props) {
  const [extras, setExtras] = useState(false);
  const action = (callback: () => void) => () => { p.onClose(); callback(); };
  const item = (title: string, Icon: typeof User, callback: () => void) => <button key={title} type="button" onClick={action(callback)} className="tg-menu-row"><Icon /><span>{title}</span></button>;
  return <div role="dialog" aria-modal="true" aria-label="Navigation menu" className="tg-telegram-menu fixed inset-0 z-[90]" onClick={p.onClose}>
    <div className="tg-menu-surface" onClick={e => e.stopPropagation()}>
      <div className="tg-menu-account">
        <button type="button" onClick={action(p.onProfile)} className="flex items-center gap-3 flex-1 min-w-0 text-left" aria-label="My profile">
          <Avatar src={p.user?.avatarUrl} title={p.name} id={p.user?.id || 'me'} size="md" />
          <span className="min-w-0"><strong className="block truncate text-[15px] font-semibold">{p.name}</strong><span className="block truncate text-[13px] text-muted">{p.user?.phone ? '+' + p.user.phone.replace(/^\++/, '') : p.user?.username ? '@' + p.user.username : p.isConnected ? 'online' : 'Sign in to Telegram'}</span></span>
        </button>
        <button type="button" onClick={p.onClose} aria-label="Close menu" className="tg-icon-button"><X /></button>
      </div>
      <div className="tg-menu-section">
        {p.isConnected ? <>{item('New group', Users, p.onNewGroup)}{item('New channel', Radio, p.onNewChannel)}{item('Contacts', User, p.onContacts)}{item('Calls', Phone, p.onCalls)}{item('Saved Messages', Bookmark, p.onSaved)}{item('Archived chats', Archive, p.onArchive)}</> : item('Sign in', UserPlus, p.onLogin)}
        {item('Settings', Settings, p.onSettings)}
        <button type="button" role="switch" aria-checked={p.night} onClick={p.onNight} className="tg-menu-row"><Moon /><span className="flex-1">Night Mode</span><span className={'tg-menu-switch ' + (p.night ? 'is-on' : '')}><span /></span></button>
      </div>
      <div className="tg-menu-section">
        <button type="button" aria-expanded={extras} onClick={() => setExtras(!extras)} className="tg-menu-row"><ShieldCheck /><span className="flex-1">Webygram extras</span><ChevronDown className={extras ? 'rotate-180' : ''} /></button>
        {extras && <>{item('Channels', Radio, p.onChannels)}{item('Media vault', FolderArchive, p.onVault)}{item('Deleted messages', Trash2, p.onDeleted)}{item('AyuGram settings', ShieldCheck, p.onMods)}{item('Voice changer', AudioLines, p.onVoice)}{item('Appearance', Palette, p.onAppearance)}{item('Chat folders', FolderCog, p.onFolders)}</>}
      </div>
      <div className="tg-menu-footer">Webygram · Telegram Web</div>
    </div>
  </div>;
}
