import React from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';
export function MessageStatus({pending,read,viewed}:{pending?:boolean;read?:boolean;viewed?:boolean}) {
 const label=pending?'Sending':read?'Read': 'Sent to Telegram';
 return <span className={'tg-message-status '+(read?'is-read':'')} role="img" aria-label={label} title={label+(viewed?' · Media opened':'')}>{pending?<Clock/>:read?<CheckCheck/>:<Check/>}</span>;
}
