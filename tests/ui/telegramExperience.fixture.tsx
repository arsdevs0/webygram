import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/flow-design.css';
import '../../src/telegram-next.css';
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
if (new URLSearchParams(location.search).has('stress')) {
  chats[1].avatarUrl='/api/tg/avatar/alice';chats[2].avatarUrl='/api/tg/avatar/bob';
  for (let index = 0; index < 160; index++) chats.push({ id: String(9000 + index), type: 'user', title: 'Contact ' + String(index).padStart(3, '0'), avatarUrl: '/api/tg/avatar/' + (9000 + index), unreadCount: index % 3, lastMessage: { text: 'Cached conversation preview', timestamp: Date.now() - index * 1000 }, isArchived: index >= 120 });
  messages.bob = Array.from({length: 200}, (_, index) => ({ ...base, chatId: 'bob', id: String(1000 + index), timestamp: Date.now() - (200 - index) * 60000, text: index % 7 === 0 ? 'Variable length message '.repeat(20) : 'Message ' + index, isOutgoing: index % 2 === 0, media: index % 25 === 0 ? { type: 'photo', url: '/api/tg/media/bob/' + index, thumbnailUrl: '/api/tg/media/bob/' + index + '?thumb=1', width: 320, height: index % 50 ? 180 : 400 } : undefined }));
  for(let index=0;index<3;index++) messages.bob.push({...base,chatId:'bob',id:String(1201+index),text:index===0?'Grouped album caption':'',groupedId:'album-42',media:{type:'photo',url:'/api/tg/media/bob/album'+index,width:300,height:300}});
  messages.bob.push({...base,chatId:'bob',id:'1204',text:'Latest group message',isOutgoing:true});
  messages.bob.push({...base,chatId:'bob',id:'1205',text:'',poll:{id:'77',question:'Which release?',options:[{text:'Mobile',optionHex:'01',voters:3,chosen:false},{text:'Desktop',optionHex:'02',voters:1,chosen:false}],totalVoters:4}});
  messages.readonly=messages.bob.map((message:any)=>({...message,chatId:'readonly',isOutgoing:false}));
  chats.push({id:'colors',type:'group',title:'Palette controls',unreadCount:0,canPostMessages:true});
  messages.colors=[
    {...base,chatId:'colors',id:'201',text:'Incoming text and sender'},
    {...base,chatId:'colors',id:'202',text:'Outgoing text',isOutgoing:true},
    {...base,chatId:'colors',id:'203',text:'',isOutgoing:true,media:{type:'voice',url:'/api/tg/media/colors/voice',duration:12,waveform:[2,8,4,14,7,11]}},
    {...base,chatId:'colors',id:'204',text:'',isOutgoing:true,media:{type:'file',url:'/api/tg/media/colors/file',fileName:'Readable document.pdf',fileSize:'24 KB'}},
    {...base,chatId:'colors',id:'205',text:'Bot controls',replyMarkup:[[{text:'Open website',url:'https://example.com'},{text:'Run action',callbackDataHex:'01'}]]},
  ];
}
const service: any = telegramService;
service.getAuthSession = () => ({ isConnected: !new URLSearchParams(location.search).has('signedOut'), isTestMode: true, user: { id: 'me', firstName: 'Tester', status: 'online' }, dcId: 2, lastSyncTimestamp: Date.now() });
service.authSession = service.getAuthSession();
service.getChats = () => chats;
service.getMessages = (id: string) => messages[id] || [];
(window as any).__chatLoads = [];
service.loadMessages = async (id: string) => {
  (window as any).__chatLoads.push({ id, time: performance.now() });
  if (new URLSearchParams(location.search).has('delayMessages')) await new Promise(resolve => setTimeout(resolve, 1200));
  return messages[id] || [];
};
service.getIsLoadingDialogs = () => false;
service.getPinnedMessages = async () => [];
service.getChatDetails = async (id: string) => ({ id, title: id, canPostMessages: true, canSendMedia: true, members: [], isCreator: false, isAdmin: false, isProtected: false, memberCount: 1 });
service.getTargetGroup = () => ({ id: 'bob', title: 'Bob group', type: 'group', link: '', setAt: Date.now() });
service.markChatAsRead = async () => {};
service.editMessage = async () => { throw new Error('Edit rejected for test'); };
(window as any).__appCommits = 0;
createRoot(document.getElementById('root')!).render(<React.Profiler id="app" onRender={() => (window as any).__appCommits++}><App /></React.Profiler>);
