import React, { useState, useEffect, useRef } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, Video, VideoOff, SwitchCamera, AudioLines, ShieldCheck, X } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { CallRecordingPanel } from './CallRecordingPanel';
import { callRecordingService } from '../../services/callRecordingService';
import { NativeTelegramCall, type NativeCallInfo, type NativeCallStatus } from '../../services/nativeTelegramCall';
import { voiceChanger, BUILTIN_VOICE_PRESETS } from '../../services/voiceChangerEngine';
import { soundEffects } from '../../services/soundEffects';
import type { TelegramChat } from '../../types/telegram';
interface Props { chat:TelegramChat; isOpen:boolean; initialVideo?:boolean; incomingOffer?:{nativeCall?:NativeCallInfo} | null; onClose:() => void }
export function NativePhoneCallModal(p:Props) {
  const [status,setStatus]=useState<NativeCallStatus>('requesting'), [error,setError]=useState(''), [seconds,setSeconds]=useState(0), [emojis,setEmojis]=useState('');
  const [muted,setMuted]=useState(false), [speaker,setSpeaker]=useState(true), [video,setVideo]=useState(Boolean(p.initialVideo)), [dsp,setDsp]=useState(false);
  const [voice,setVoice]=useState(voiceChanger.getState()), [streams,setStreams]=useState<ReturnType<NativeTelegramCall['getStreams']>>();
  const session=useRef<NativeTelegramCall | null>(null), remoteVideo=useRef<HTMLVideoElement | null>(null), ownVideo=useRef<HTMLVideoElement | null>(null);
  const onClose=useRef(p.onClose); onClose.current=p.onClose;
  useEffect(() => voiceChanger.subscribe(setVoice),[]);
  useEffect(() => {
    if (!p.isOpen) return;
    let mounted=true;
    setStatus('requesting'); setError(''); setSeconds(0); setMuted(false); setSpeaker(true); setEmojis('');
    const call=new NativeTelegramCall(p.chat.id,Boolean(p.initialVideo),p.incomingOffer?.nativeCall,(next,message) => {
      if(!mounted) return;
      setStatus(next); if(message) setError(message);
      if(next==='ringing' && !p.incomingOffer?.nativeCall) soundEffects.startRingbackTone();
      if(next==='connected') { soundEffects.stopRingbackTone(); soundEffects.stopIncomingRing(); soundEffects.playCallConnected(); }
      if(next==='failed' || next==='ended') { soundEffects.stopRingbackTone(); soundEffects.stopIncomingRing(); if(next==='ended') onClose.current(); }
    },() => { if(mounted) setStreams({...call.getStreams()}); },emoji => { if(mounted) setEmojis(emoji); });
    session.current=call; void call.start();
    return () => { mounted=false; call.stop(); session.current=null; soundEffects.stopRingbackTone(); callRecordingService.stop(); };
  },[p.isOpen,p.chat.id]);
  useEffect(() => {
    if(status!=='connected') return;
    const timer=setInterval(() => setSeconds(value=>value+1),1000);
    return () => clearInterval(timer);
  },[status]);
  useEffect(() => {
    const remote=streams?.presentation || streams?.video;
    if(remoteVideo.current) { remoteVideo.current.srcObject=remote || null; void remoteVideo.current.play().catch(()=>{}); }
    if(ownVideo.current) { ownVideo.current.srcObject=streams?.ownVideo || null; void ownVideo.current.play().catch(()=>{}); }
  },[streams]);
  if(!p.isOpen) return null;
  const active=status==='connected' || status==='connecting';
  const remote=streams?.presentation || streams?.video;
  const end=() => { session.current?.stop(); soundEffects.playCallEnded(); p.onClose(); };
  const labels={requesting:'Preparing secure call…',ringing:'Ringing…',connecting:'Connecting…',connected:Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'),ended:'Call ended',failed:'Call failed'};
  return <div role="dialog" aria-modal="true" aria-label="Call" className="tg-native-call fixed inset-0 z-50">
    <header><span><ShieldCheck />Telegram call</span><button type="button" aria-label="End call" onClick={end}><X /></button></header>
    {remote && <video ref={remoteVideo} autoPlay muted playsInline className="tg-call-remote-video" />}
    <div className={'tg-native-call-person ' + (remote ? 'has-video' : '')}><Avatar src={p.chat.avatarUrl} title={p.chat.title} id={p.chat.id} size="lg" /><h1>{p.chat.title}</h1><p role="status">{labels[status]}</p>{emojis && <span className="tg-call-fingerprint" title="Compare these emojis with the other person to verify encryption">{emojis}</span>}</div>
    {video && streams?.ownVideo && <video ref={ownVideo} autoPlay muted playsInline className="tg-call-own-video" />}
    {error && <p role="alert" className="tg-native-call-error">{error}</p>}
    <div className="tg-native-call-controls">
      <button type="button" aria-label={muted?'Unmute microphone':'Mute microphone'} disabled={!active} aria-pressed={muted} onClick={async()=>{try{setMuted(await session.current!.setMuted(!muted));}catch(err){setError((err as Error).message);}}}>{muted?<MicOff />:<Mic />}<span>{muted?'Unmute':'Mute'}</span></button>
      <button type="button" aria-label="Toggle speaker playback" aria-pressed={speaker} disabled={!active} onClick={()=>{session.current?.setSpeaker(!speaker);setSpeaker(!speaker);}}>{speaker?<Volume2 />:<VolumeX />}<span>Speaker</span></button>
      <button type="button" aria-label="Toggle call video" aria-pressed={video} disabled={!active} onClick={async()=>{try{setVideo(Boolean(await session.current?.setVideo(!video)));}catch(err){setError((err as Error).message);}}}>{video?<Video />:<VideoOff />}<span>Video</span></button>
      {video && <button type="button" aria-label="Switch camera" disabled={!active} onClick={()=>void session.current?.flipCamera().catch(err=>setError(err.message))}><SwitchCamera /><span>Flip</span></button>}
      <button type="button" aria-label="Voice effects" aria-expanded={dsp} onClick={()=>setDsp(!dsp)}><AudioLines /><span>Voice</span></button>
      <button type="button" aria-label="End call" className="tg-native-hangup" onClick={end}><PhoneOff /><span>End</span></button>
    </div>
    {dsp && <section className="tg-call-dsp"><div><h2>Live Voice Effects</h2><button type="button" role="switch" aria-label="Enable live voice effects" aria-checked={voice.enabled} onClick={()=>void voiceChanger.setEnabled(!voice.enabled)}>{voice.enabled?'On':'Off'}</button></div><p>Processed on this device before sending.</p>{voice.lastError && <p role="alert">{voice.lastError}</p>}<div className="tg-call-presets">{Object.values(BUILTIN_VOICE_PRESETS).filter(preset=>preset.id!=='custom').map(preset=><button type="button" key={preset.id} aria-pressed={voice.selectedPresetId===preset.id} onClick={()=>voiceChanger.setPreset(preset.id)}>{preset.name}</button>)}</div><label>Voice tone <input aria-label="Live formant shift" type="range" min="-8" max="8" step=".5" value={voice.formantShift} onChange={e=>voiceChanger.setFormantShift(Number(e.target.value))} /></label></section>}
    {status==='connected' && <CallRecordingPanel compact name={p.chat.title} streams={() => [streams?.ownAudio, streams?.audio].filter((stream): stream is MediaStream => Boolean(stream))} />}
  </div>;
}


