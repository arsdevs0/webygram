import { createPortal } from 'react-dom';
import React, { useState } from 'react';
import { X, User, Users, Radio, Phone, Bookmark, Settings, Moon, Archive, ChevronDown, ShieldCheck, FolderArchive, Trash2, AudioLines, Palette, FolderCog, UserPlus, Monitor, Bell, Shield, Database, Battery, LogOut } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import type { TelegramUser } from '../../types/telegram';
interface Props {
  user?: TelegramUser; name: string; isConnected: boolean; night: boolean;
  onClose: () => void; onProfile: () => void; onNewGroup: () => void; onNewChannel: () => void;
  onContacts: () => void; onCalls: () => void; onSaved: () => void; onArchive: () => void;
  onSettings: () => void; onNight: () => void; onLogin: () => void; onVault: () => void; onDeleted: () => void; onMods: () => void; onVoice: () => void; onAppearance: () => void; onFolders: () => void; onChannels: () => void;
  onDevices?: () => void; onNotifications?: () => void; onPrivacy?: () => void; onData?: () => void; onPowerSaving?: () => void; powerSaving?: boolean; onLogout?: () => Promise<void>;
}
export function TelegramNavigationMenu(p: Props) {
  const [extras, setExtras] = useState(false), [account, setAccount] = useState(false), [confirmLogout, setConfirmLogout] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEscapeDismiss(confirmLogout, () => { if (!busy) setConfirmLogout(false); });
  const action = (callback: () => void) => () => { p.onClose(); callback(); };
  const item = (title: string, Icon: typeof User, callback: () => void, tone = 0) => <button key={title} type="button" onClick={action(callback)} className="tg-menu-row"><span className={'tg-next-icon tone-' + tone}><Icon /></span><span className="flex-1">{title}</span><ChevronDown className="tg-menu-chevron -rotate-90" /></button>;
  const toggle = (label: string, Icon: typeof User, on: boolean, callback: () => void, tone: number) => <button type="button" role="switch" aria-checked={on} onClick={callback} className="tg-menu-row"><span className={'tg-next-icon tone-' + tone}><Icon /></span><span className="flex-1">{label}</span><span className={'tg-next-switch ' + (on ? 'is-on' : '')}><span /></span></button>;
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Navigation menu" className="tg-telegram-menu fixed inset-0 z-[90]" onClick={() => { if (!busy) p.onClose(); }}>
    <div className="tg-menu-surface" onClick={e => e.stopPropagation()}><div className="tg-sheet-handle" />
      <div className="tg-menu-account"><button type="button" onClick={action(p.onProfile)} className="tg-account-photo" aria-label="Your profile"><Avatar src={p.user?.avatarUrl} title={p.name} id={p.user?.id || 'me'} size="lg" /></button><button type="button" onClick={p.onClose} aria-label="Close menu" className="tg-icon-button tg-account-close"><X /></button>
        <button type="button" aria-expanded={account} onClick={() => setAccount(!account)} className="tg-account-name"><span><strong>{p.name}</strong><span>{p.user?.phone ? '+' + p.user.phone.replace(/^\++/, '') : p.user?.username ? '@' + p.user.username : p.isConnected ? 'Your Telegram account' : 'Sign in to Telegram'}</span></span><ChevronDown className={account ? 'rotate-180' : ''} /></button>
        {account && <button type="button" className="tg-menu-row" onClick={action(p.onLogin)}><UserPlus /><span>Sign in or switch account</span></button>}
      </div>
      <div className="tg-account-cards"><div className="tg-menu-section">
        {p.isConnected ? <>{item('My Profile', User, p.onProfile, 0)}{item('Saved Messages', Bookmark, p.onSaved, 4)}{item('Recent Calls', Phone, p.onCalls, 0)}{item('Devices', Monitor, p.onDevices || p.onSettings, 0)}{item('Chat Folders', FolderCog, p.onFolders, 1)}</> : item('Sign in', UserPlus, p.onLogin)}
      </div><div className="tg-menu-section">
        {item('Notifications and Sounds', Bell, p.onNotifications || p.onSettings, 4)}{item('Privacy and Security', Shield, p.onPrivacy || p.onSettings, 0)}{item('Data and Storage', Database, p.onData || p.onSettings, 2)}
        {p.onPowerSaving && toggle('Power Saving', Battery, Boolean(p.powerSaving), p.onPowerSaving, 1)}
        {item('Chat Settings', Palette, p.onAppearance, 4)}{item('Settings', Settings, p.onSettings, 0)}{toggle('Night Mode', Moon, p.night, p.onNight, 4)}
      </div><div className="tg-menu-section">
        <button type="button" aria-expanded={extras} onClick={() => setExtras(!extras)} className="tg-menu-row"><span className="tg-next-icon tone-4"><ShieldCheck /></span><span className="flex-1">Webygram extras</span><ChevronDown className={extras ? 'rotate-180' : ''} /></button>
        {extras && <>{item('New Group', Users, p.onNewGroup, 0)}{item('New Channel', Radio, p.onNewChannel, 0)}{item('Contacts', User, p.onContacts, 0)}{item('Channels', Radio, p.onChannels, 4)}{item('Archived chats', Archive, p.onArchive, 1)}{item('Media vault', FolderArchive, p.onVault, 2)}{item('Deleted messages', Trash2, p.onDeleted, 3)}{item('AyuGram settings', ShieldCheck, p.onMods, 4)}{item('Voice changer', AudioLines, p.onVoice, 0)}</>}
      </div>
      {p.isConnected && p.onLogout && <button type="button" className="tg-account-logout" onClick={() => setConfirmLogout(true)}><LogOut /><span>Log Out</span></button>}
      <div className="tg-menu-footer">Webygram · Telegram client</div></div>
      {confirmLogout && <div role="alertdialog" aria-modal="true" aria-label="Confirm logout" className="tg-logout-confirm"><strong>Log out of this browser?</strong><p className="text-muted text-sm">You will need to sign in again.</p>{error && <p role="alert">{error}</p>}<div><button type="button" disabled={busy} onClick={() => setConfirmLogout(false)}>Cancel</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await p.onLogout?.(); p.onClose(); } catch (err) { setError((err as Error).message || 'Could not log out'); } finally { setBusy(false); } }}>{busy ? 'Logging out…' : 'Log Out'}</button></div></div>}
    </div>
  </div>, document.body);
}
