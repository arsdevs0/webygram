import React from 'react';
import { MessageCircle, UsersRound, Radio, FolderArchive, Settings, UserRound } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import type { BottomNavTab } from './ChatList';
import type { TelegramUser } from '../../types/telegram';
export function MobileBottomNav({ active, unread, onSelect, modern = true, user }: { active: BottomNavTab; unread: number; onSelect: (tab: BottomNavTab) => void; modern?: boolean; user?: TelegramUser }) {
  const tabs = [{ id: 'chats', label: 'Chats', Icon: MessageCircle }, { id: 'contacts', label: 'Contacts', Icon: UserRound }, { id: 'settings', label: 'Settings', Icon: Settings }, { id: 'you', label: 'Profile', Icon: UserRound }] as const;
  return <nav aria-label="Mobile navigation" className={'tg-mobile-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 lg:hidden ' + 'tg-next-bottom-nav'}>
    {tabs.map(({ id, label, Icon }) => <button key={id} type="button" aria-label={label} aria-current={active === id ? 'page' : undefined} onClick={() => onSelect(id)} className="tg-bottom-tab">
      <span className="tg-bottom-icon">{id === 'you' && user ? <Avatar src={user.avatarUrl} title={user.firstName} id={user.id} size="sm" /> : <Icon />}
        {id === 'chats' && unread > 0 && <span className="tg-bottom-badge">{unread > 99 ? '99+' : unread}</span>}</span><span>{label}</span>
    </button>)}
  </nav>;
}
