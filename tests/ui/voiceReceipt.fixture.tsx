import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/flow-design.css';
import '../../src/telegram-next.css';
import { ChatInput } from '../../src/components/chat/ChatInput';
import { MediaViewerModal } from '../../src/components/chat/MediaViewerModal';
import { DisappearingMediaModal } from '../../src/components/chat/DisappearingMediaModal';
import { telegramService } from '../../src/services/telegramService';
import { voiceChanger } from '../../src/services/voiceChangerEngine';
import { ayuGramEngine } from '../../src/services/ayuGramModEngine';
const fixture: any = window;
const service: any = telegramService;
fixture.voiceSends = [];
fixture.delayCapture = 0;
fixture.sendOk = false;
const ready = voiceChanger.ensureReadyForCapture.bind(voiceChanger);
voiceChanger.ensureReadyForCapture = async () => { if (fixture.delayCapture) await new Promise(resolve => setTimeout(resolve, fixture.delayCapture)); return ready(); };
service.messages = {};
service.getAuthSession = () => ({ isConnected: true, user: { id: 'me', firstName: 'Test' } });
ayuGramEngine.updateSetting('preventTTLExpiration', false);
ayuGramEngine.updateSetting('markSeenOnTimerClick', false);
function Harness() {
  const [mode, setMode] = useState('voice'), [, render] = useState(0);
  useEffect(() => service.subscribe(() => render(value => value + 1)), []);
  fixture.setCase = (next: string, outgoing = false, seconds = 5) => {
    service.messages['42'] = [{ id: '7', chatId: '42', text: '', senderName: 'Alice', senderId: outgoing ? 'me' : '42', isOutgoing: outgoing, isRead: outgoing, timestamp: Date.now(), media: { type: 'photo', url: '/fixture-photo.png', isDisappearing: true, expireSeconds: seconds } }];
    setMode(next); render(value => value + 1);
  };
  fixture.receiveOpen = (readAt: number) => service.handleWsEvent({ type: 'MEDIA_CONTENTS_READ', chatId: '42', messageIds: ['7'], readAt });
  fixture.mediaState = () => service.getMessages('42')[0]?.media;
  const media = service.getMessages('42')[0]?.media;
  return <main style={{ height: '100dvh', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
    <div style={{ flex: 1 }}>Recording and receipt fixture</div>
    {mode === 'voice' && <ChatInput chatId="42" replyingTo={null} editingMessage={null} onCancelReply={() => {}} onCancelEdit={() => {}} onOpenDisappearingModal={() => setMode('compose')} onSaveEdit={() => true} onSendMessage={async (_text, voice) => { fixture.voiceSends.push(voice); await new Promise(resolve => setTimeout(resolve, 80)); return fixture.sendOk; }} />}
    {mode === 'viewer' && <MediaViewerModal chatId="42" messageId="7" media={media} onClose={() => setMode('voice')} />}
    <DisappearingMediaModal isOpen={mode === 'compose'} onClose={() => setMode('voice')} onSend={async data => { fixture.timedSend = data; return fixture.sendOk; }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
