import React, { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Edit2, Settings, Shield, Bell, Database, Palette, ChevronRight, BadgeCheck } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { telegramService } from '../../services/telegramService';
import type { AuthSession, UserProfileInfo } from '../../types/telegram';
interface Props { session: AuthSession; onBack: () => void; onEdit: () => void; onSettings: () => void; onPrivacy: () => void; onNotifications: () => void; onData: () => void; onAppearance: () => void; onNotify: (message: string) => void }
export function SelfProfileView(p: Props) {
  const [profile, setProfile] = useState<UserProfileInfo | null>(null), [error, setError] = useState('');
  useEffect(() => { let cancelled = false; setProfile(null); setError('');
    if (p.session.isConnected) telegramService.getUserProfile(p.session.user.id).then(data => { if (!cancelled) setProfile(data); }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [p.session.user.id, p.session.isConnected]);
  const user = p.session.user, title = profile?.title || [user.firstName, user.lastName].filter(Boolean).join(' '), phone = profile?.phone || user.phone || '';
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); p.onNotify('Copied'); } catch { p.onNotify('Could not copy. Check clipboard permission.'); } };
  const rows = [['Settings', Settings, p.onSettings], ['Privacy and Security', Shield, p.onPrivacy], ['Notifications', Bell, p.onNotifications], ['Data and Storage', Database, p.onData], ['Appearance', Palette, p.onAppearance]] as const;
  return <section className="tg-next-page tg-self-profile" aria-label="Your profile"><div className="tg-profile-cover"><button type="button" aria-label="Back to chats" className="tg-icon-button" onClick={p.onBack}><ArrowLeft /></button></div>
    <div className="tg-next-scroll tg-profile-body">
      <div className="tg-profile-avatar"><Avatar src={profile?.avatarUrl || user.avatarUrl} title={title} id={user.id} size="lg" /><button type="button" aria-label="Edit profile" className="tg-profile-edit" onClick={p.onEdit}><Edit2 /></button></div>
      <h1>{title}{profile?.isVerified && <BadgeCheck className="text-primary w-5 h-5" />}</h1><p className="text-muted">{phone ? '+' + phone.replace(/^\++/, '') : 'Your Telegram profile'}</p>
      {error && <p role="status" className="text-muted text-sm mt-3">{error}</p>}
      <div className="tg-next-card tg-profile-fields"><div><strong>Bio</strong><p>{profile?.about || user.bio || 'Not set yet'}</p></div><div><span><strong>Username</strong><p>{profile?.username || user.username ? '@' + (profile?.username || user.username) : 'Not set yet'}</p></span>{(profile?.username || user.username) && <button type="button" aria-label="Copy username" className="tg-icon-button" onClick={() => void copy('@' + (profile?.username || user.username))}><Copy /></button>}</div><div><strong>Phone Number</strong><p>{phone ? '+' + phone.replace(/^\++/, '') : 'Not available'}</p></div></div>
      <div className="tg-next-card">{rows.map(([label, Icon, action], index) => <button type="button" key={label} className="tg-next-row" onClick={action}><span className={'tg-next-icon tone-' + index}><Icon /></span><span>{label}</span><ChevronRight /></button>)}</div>
    </div>
  </section>;
}

