import React from 'react';
import { ArrowLeft, Folder, Plus, Check, MessageCircle, User, Users, Radio, Mail, Archive } from 'lucide-react';
import type { ChatFolder, TelegramChat } from '../../types/telegram';
interface Props { folders: ChatFolder[]; chats: TelegramChat[]; activeId: string; onBack: () => void; onManage: () => void; onSelect: (id: string) => void }
export function ChatFoldersView(p: Props) {
  const count = (folder: ChatFolder) => p.chats.filter(chat => !chat.isDeletedChat && (folder.filter === 'all' ? !chat.isArchived : folder.filter === 'personal' ? chat.type === 'user' || chat.type === 'saved' : folder.filter === 'groups' ? chat.type === 'group' : folder.filter === 'channels' ? chat.type === 'channel' : folder.filter === 'unread' ? chat.unreadCount > 0 : folder.filter === 'archived' ? chat.isArchived : chat.folderIds?.includes(folder.id) || folder.includeChatIds?.includes(chat.id))).length;
  const icons = { all: MessageCircle, personal: User, groups: Users, channels: Radio, unread: Mail, archived: Archive, custom: Folder, bots: User };
  return <section className="tg-next-page"><header className="tg-next-header"><button type="button" aria-label="Back from folders" className="tg-icon-button" onClick={p.onBack}><ArrowLeft /></button><h1>Chat Folders</h1><button type="button" className="tg-next-text-button" onClick={p.onManage}>Edit</button></header>
    <div className="tg-next-scroll"><div className="tg-next-card tg-folder-promo"><span className="tg-folder-hero"><Folder /></span><div><strong>Organize your chats</strong><p>Create folders to quickly find your conversations.</p></div><button type="button" className="tg-next-primary" onClick={p.onManage}>Create Folder</button></div>
      <h2 className="tg-next-section-label">Your Folders</h2><div className="tg-next-card">{p.folders.map((folder, index) => { const Icon = icons[folder.filter] || Folder; return <button type="button" className="tg-next-row" key={folder.id} onClick={() => p.onSelect(folder.id)}><span className={'tg-next-icon tone-' + (index % 6)}><Icon /></span><span className="flex-1">{folder.filter === 'all' ? 'All Chats' : folder.name}</span><span className="text-muted">{count(folder)}</span>{p.activeId === folder.id && <Check className="text-primary" />}</button>; })}<button type="button" className="tg-next-row text-primary" onClick={p.onManage}><Plus /><span>Add Folder</span></button></div>
    </div></section>;
}

