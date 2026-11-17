import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/flow-design.css';
import App from '../../src/App';
import { telegramService } from '../../src/services/telegramService';
const chats: any[] = [
  { id: 'me', type: 'saved', title: 'Saved Messages', unreadCount: 0, isPinned: false, isMuted: false },
  { id: 'alice', type: 'user', title: 'Alice', unreadCount: 0, isPinned: false, isMuted: false, canPostMessages: true },
  { id: 'bob', type: 'group', title: 'Bob group', unreadCount: 0, isPinned: false, isMuted: false, canPostMessages: true },
  { id: 'readonly', type: 'channel', title: 'Read only', unreadCount: 0, isPinned: false, isMuted: false, canPostMessages: false },
];
const base: any = { chatId: 'alice', senderId: 'alice', senderName: 'Alice', timestamp: Date.now(), isOutgoing: false, isRead: true };
const messages: any = { alice: [
  { ...base, id: '1', text: 'Caption one', media: { type: 'photo', url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', width: 240, height: 160 } },
  { ...base, id: '2', text: 'Editable message', senderId: 'me', senderName: 'You', isOutgoing: true },
], bob: [], me: [] };
const service: any = telegramService;
service.getAuthSession = () => ({ isConnected: true, isTestMode: true, user: { id: 'me', firstName: 'Tester', status: 'online' }, dcId: 2, lastSyncTimestamp: Date.now() });
service.getChats = () => chats;
service.getMessages = (id: string) => messages[id] || [];
service.loadMessages = async () => [];
service.getIsLoadingDialogs = () => false;
service.getPinnedMessages = async () => [];
service.getChatDetails = async (id: string) => ({ id, title: id, canPostMessages: true, canSendMedia: true, members: [], isCreator: false, isAdmin: false, isProtected: false, memberCount: 1 });
service.getTargetGroup = () => ({ id: 'bob', title: 'Bob group', type: 'group', link: '', setAt: Date.now() });
service.markChatAsRead = async () => {};
service.editMessage = async () => { throw new Error('Edit rejected for test'); };
createRoot(document.getElementById('root')!).render(<App />);
