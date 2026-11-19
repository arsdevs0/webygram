import React,{useEffect,useState} from 'react';
import { X,Loader2 } from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import {useEscapeDismiss} from '../common/useEscapeDismiss';
export function ReportMessageModal({chatId,messageId,onClose,onNotify}:{chatId:string;messageId:string;onClose:()=>void;onNotify?:(text:string)=>void}) {
 const [step,setStep]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[comment,setComment]=useState('');
 useEscapeDismiss(true,onClose);
 const submit=async(option='',text='')=>{setBusy(true);setError('');try{const result=await telegramService.reportMessage(chatId,messageId,option,text);if(result.kind==='reported'){onNotify?.('Report submitted to Telegram');onClose();}else setStep(result);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{let alive=true;setBusy(true);telegramService.reportMessage(chatId,messageId).then(value=>{if(alive)setStep(value);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[chatId,messageId]);
 return <div className="tg-report-modal" role="dialog" aria-modal="true" aria-label="Report message" onClick={onClose}><section onClick={e=>e.stopPropagation()}><header><h2>{step?.title || 'Report message'}</h2><button className="tg-icon-button" aria-label="Close report" onClick={onClose}><X/></button></header>{busy && <p role="status"><Loader2 className="animate-spin"/>Contacting Telegram…</p>}{error && <p role="alert">{error}<button className="tg-next-text-button" onClick={()=>void submit()}>Retry</button></p>}{step?.kind==='options' && step.options.map((o:any)=><button key={o.option} disabled={busy} className="tg-action-row" onClick={()=>void submit(o.option)}>{o.text}</button>)}{step?.kind==='comment' && <><textarea aria-label="Report details" placeholder="Describe the problem" value={comment} maxLength={1024} onChange={e=>setComment(e.target.value)}/><button className="tg-next-primary" disabled={busy || (!step.optional && !comment.trim())} onClick={()=>void submit(step.option,comment)}>Submit report</button></>}</section></div>;
}
