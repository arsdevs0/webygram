import React from 'react';
import { MessageSquare, Radio, FolderArchive, Settings } from 'lucide-react';
import type { BottomNavTab } from './ChatList';

const tabs = [
  { id: 'chats', label: 'Chats', Icon: MessageSquare },
  { id: 'channels', label: 'Channels', Icon: Radio },
  { id: 'vault', label: 'Vault', Icon: FolderArchive },
  { id: 'settings', label: 'Settings', Icon: Settings },
] as const;

export function MobileBottomNav({ active, unread, onSelect }: {
  active: BottomNavTab; unread: number; onSelect: (tab: BottomNavTab) => void;
}) {
  return <nav aria-label="Mobile navigation" className="tg-mobile-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 lg:hidden">
    {tabs.map(({ id, label, Icon }) => <button key={id} type="button" aria-label={label}
      aria-current={active === id ? 'page' : undefined} onClick={() => onSelect(id)}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 active:bg-hover dark:active:bg-hover ${active === id ? 'text-primary' : 'text-muted dark:text-muted'}`}>
      <span className={`relative rounded-full px-4 py-1 ${active === id ? 'bg-primary/10' : ''}`}>
        <Icon className="h-5 w-5" strokeWidth={active === id ? 2.3 : 1.8} />
        {id === 'chats' && unread > 0 && <span className="absolute -right-1 -top-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
      </span>
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </button>)}
  </nav>;
}
