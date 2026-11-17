import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radio, X } from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import { Avatar } from '../common/Avatar';
import type { TelegramChat } from '../../types/telegram';
type Info = Awaited<ReturnType<typeof telegramService.getGroupCallInfo>>;
export function GroupVoiceBanner({ chat }: { chat: TelegramChat }) {
  const [info, setInfo] = useState<Info>();
  const [open, setOpen] = useState(false);
  useEscapeDismiss(open, () => setOpen(false));
  useEffect(() => {
    let cancelled = false, busy = false;
    const refresh = async () => { if (document.hidden || busy) return; busy = true; try { const value = await telegramService.getGroupCallInfo(chat.id); if (!cancelled) setInfo(value); } finally { busy = false; } };
    void refresh();
    const timer = setInterval(() => void refresh(), 20000);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [chat.id]);
  if (!info?.hasActiveCall) return null;
  const scheduled = Boolean(info.scheduledStart && info.scheduledStart > Date.now());
  const telegramLink = chat.username ? 'https://t.me/' + chat.username + '?voicechat' : chat.inviteLink;
  return <><button type="button" className="tg-group-vc-banner" onClick={() => setOpen(true)} aria-label="View group voice chat"><Radio /><span><strong>{info.title || (chat.type === 'channel' ? 'Live stream' : 'Voice chat')}</strong><small>{scheduled ? 'Starts ' + new Date(info.scheduledStart!).toLocaleString() : (info.participantsCount || 0) + ' participants · Live'}</small></span><span>View</span></button>
    {open && createPortal(<div className="tg-compose-dialog" role="dialog" aria-modal="true" aria-label="Group voice chat" onClick={() => setOpen(false)}><section className="tg-compose-surface tg-vc-info" onClick={event => event.stopPropagation()}><header className="tg-next-header"><h1>{info.title || 'Voice chat'}</h1><button type="button" aria-label="Close voice chat info" className="tg-icon-button" onClick={() => setOpen(false)}><X /></button></header><p className="tg-compose-status">{scheduled ? 'Scheduled voice chat' : (info.participantsCount || 0) + ' participants'}</p><div className="tg-compose-scroll">{info.participants.map(person => <div key={person.id} className="tg-contact-row"><Avatar src={person.avatarUrl} title={person.name} id={person.id} /><span>{person.name}<small className="block text-muted">{person.muted ? 'Muted' : 'Microphone on'}</small></span></div>)}</div><footer>{telegramLink ? <a className="tg-next-primary" href={telegramLink} target="_blank" rel="noopener noreferrer">Open in Telegram</a> : <p className="tg-compose-status">Open this private chat in Telegram to join the voice chat.</p>}</footer></section></div>, document.body)}
  </>;
}
