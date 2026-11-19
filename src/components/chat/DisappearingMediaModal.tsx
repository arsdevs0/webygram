import React, { useState, useEffect, useRef } from 'react';
import { Clock, Upload, X, Send, Loader2 } from 'lucide-react';
import { VIEW_ONCE_SECONDS } from '../../utils/mediaReceipt';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import { MAX_ATTACHMENT_BYTES } from '../../utils/attachmentDraft';
interface Props { isOpen:boolean; onClose:()=>void; onSend:(params:{fileDataUrl:string;fileName:string;mediaType:'photo'|'video';caption:string;expireSeconds:number})=>Promise<boolean|void>|boolean|void; }
const TIMERS = [VIEW_ONCE_SECONDS, 1, 3, 5, 10, 30, 60];
export const DisappearingMediaModal:React.FC<Props> = ({isOpen,onClose,onSend}) => {
  const [file,setFile]=useState<File|null>(null),[url,setUrl]=useState(''),[caption,setCaption]=useState(''),[seconds,setSeconds]=useState(5),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null);
  useEscapeDismiss(isOpen,()=>{if(!busy)onClose();});
  useEffect(()=>{if(!file)return;const objectUrl=URL.createObjectURL(file);setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl);},[file]);
  useEffect(()=>{if(!isOpen){setFile(null);setUrl('');setCaption('');setError('');}},[isOpen]);
  const send=async()=>{
    if(!file || busy)return;setBusy(true);setError('');
    try {
      const fileDataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read this file.'));reader.readAsDataURL(file);});
      const ok=await onSend({fileDataUrl,fileName:file.name,mediaType:file.type.startsWith('video/')?'video':'photo',caption:caption.trim(),expireSeconds:seconds});
      if(ok===false)setError('Not sent. Your media is kept here. Try again.');else onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  if(!isOpen)return null;
  return <div className="tg-attachment-backdrop" role="dialog" aria-modal="true" aria-label="Disappearing media" onClick={()=>{if(!busy)onClose();}}><section className="tg-attachment-sheet tg-timed-sheet" onClick={e=>e.stopPropagation()}>
    <header><div><h2>Timed media</h2><p>Photo or video</p></div><button className="tg-icon-button" aria-label="Close timed media" disabled={busy} onClick={onClose}><X/></button></header>
    <div className="tg-attachment-scroll">
      <input ref={input} type="file" accept="image/*,video/*" hidden onChange={e=>{const next=e.target.files?.[0];e.target.value='';if(!next)return;if(!next.type.startsWith('image/') && !next.type.startsWith('video/')){setError('Choose a photo or video.');return;}if(next.size>MAX_ATTACHMENT_BYTES){setError('Choose a file smaller than 42 MB.');return;}setError('');setFile(next);}}/>
      {file?<div className="tg-attachment-preview">{url && (file.type.startsWith('video/')?<video src={url} controls playsInline/>:<img src={url} alt="Timed media preview"/>)}</div>:<button className="tg-timed-upload" onClick={()=>input.current?.click()}><Upload/><span>Choose photo or video</span></button>}
      {file && <button className="tg-next-text-button" disabled={busy} onClick={()=>input.current?.click()}>Change media</button>}
      <h3 className="tg-timer-label"><Clock size={18}/>Self-destruct timer</h3>
      <div className="tg-timer-choices" role="group" aria-label="Self-destruct timer">{TIMERS.map(value=><button key={value} disabled={busy} aria-pressed={seconds===value} onClick={()=>setSeconds(value)}>{value===VIEW_ONCE_SECONDS?'View once':value===60?'1 min':value+'s'}</button>)}</div>
      <p className="tg-timed-explanation">{seconds===VIEW_ONCE_SECONDS?'Disappears after the recipient closes it.':'The timer starts when the recipient opens it.'}</p>
      <textarea aria-label="Timed media caption" placeholder="Add a caption…" maxLength={1024} value={caption} disabled={busy} onChange={e=>setCaption(e.target.value)}/>
      {error && <p role="alert" className="tg-timed-error">{error}</p>}
    </div><footer><button className="tg-next-primary" disabled={!file || busy} onClick={()=>void send()}>{busy?<Loader2 className="animate-spin" size={19}/>:<Send size={19}/>} {busy?'Sending…':error?'Retry send':'Send'}</button></footer>
  </section></div>;
};
