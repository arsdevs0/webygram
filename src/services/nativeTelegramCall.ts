import { telegramService } from './telegramService';
import { voiceChanger } from './voiceChangerEngine';
import { PhoneCallState } from '../vendor/telegram-calls/api/gramjs/methods/phoneCallState';
import { EMOJI_DATA, EMOJI_OFFSETS } from '../vendor/telegram-calls/util/phoneCallEmojiConstants';
import { bufferFromBase64 } from '../vendor/telegram-calls/util/encoding/buffer';
import * as media from '../vendor/telegram-calls/lib/vibecalls/phone/phoneCall';
import type { P2pMessage } from '../vendor/telegram-calls/lib/vibecalls/phone/signalingMessages';
import type { ApiPhoneCallConnection } from '../vendor/telegram-calls/lib/vibecalls/types';

export interface NativeCallInfo {
  id:string; accessHash?:string; state:string; video?:boolean; adminId?:string; participantId?:string;
  gAHash?:number[]; gB?:number[]; gAOrB?:number[]; keyFingerprint?:string; p2pAllowed?:boolean;
  shouldUseSctp?:boolean; connections?:ApiPhoneCallConnection[];
}
export type NativeCallStatus = 'requesting' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';
export async function nativeCallRequest(name:string, body:object = {}) {
  const response = await fetch('/api/tg/calls/native/' + name, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Telegram call request failed');
  return data;
}
export class NativeTelegramCall {
  private key:PhoneCallState;
  private info?:NativeCallInfo;
  private closed = false;
  private joined = false;
  private verified = false;
  private unsubscribe?:() => void;
  private voiceUnsubscribe?:() => void;
  private timer?:ReturnType<typeof setInterval>;
  private expiry?:ReturnType<typeof setTimeout>;
  private signalQueue:number[][] = [];
  private pendingUpdates:NativeCallInfo[] = [];
  private outgoing = Promise.resolve();
  private incoming = Promise.resolve();
  private updates = Promise.resolve();
  private startedAt = 0;
  private earlySignals:{callId:string;data:number[]}[] = [];
  private lastStatus?:NativeCallStatus;
  private sourceTrackId?:string;
  constructor(private chatId:string, private video:boolean, private initial:NativeCallInfo | undefined,
    private onStatus:(status:NativeCallStatus, error?:string) => void, private onMedia:() => void, private onFingerprint:(emoji:string) => void) {
    this.key = new PhoneCallState(!initial, initial?.shouldUseSctp ?? true);
    this.info = initial;
  }
  async start() {
    this.unsubscribe = telegramService.subscribeCallSignals(event => {
      const call = event.nativeCall as NativeCallInfo | undefined;
      if (call) {
        if (!this.info && this.pendingUpdates.length < 64) this.pendingUpdates.push(call);
        else if (call.id === this.info?.id) this.enqueueUpdate(call);
      } else if (event.type === 'PHONE_CALL_SIGNAL' && (!this.info || String(event.callId) === this.info.id)) {
        try {
          const encoded=String(event.dataBase64 || '');
          if (encoded.length > 131072) throw new Error('Call signaling packet is too large');
          const data=Array.from(bufferFromBase64(encoded));
          if (!this.info) { if(this.earlySignals.length < 128) this.earlySignals.push({callId:String(event.callId),data}); }
          else { if (this.signalQueue.length >= 128) throw new Error('Too many pending call packets'); this.signalQueue.push(data); this.drainSignals(); }
        } catch { this.fail('Invalid call signaling packet'); }
      }
    });
    this.reportStatus('requesting');
    this.expiry=setTimeout(() => { if (!this.startedAt && !this.closed) this.fail('No answer or call could not connect. Try again.'); },60000);
    try {
      if (!await voiceChanger.ensureReadyForCapture()) throw new Error(voiceChanger.getLastError() || 'Microphone unavailable');
      if (this.closed) return;
      const dh=await nativeCallRequest('dh');
      if (this.closed) return;
      let response;
      {
        if (this.initial) {
          if (!this.initial.gAHash) throw new Error('Missing incoming call encryption commitment');
          const gB = this.key.acceptCall({...dh,gAHash:this.initial.gAHash});
          response=await nativeCallRequest('accept',{callId:this.initial.id,accessHash:this.initial.accessHash,gB});
        } else {
          const gAHash=await this.key.requestCall(dh);
          if (this.closed) return;
          response=await nativeCallRequest('request',{chatId:this.chatId,video:this.video,gAHash});
        }
      }
      this.info=response.call;
      if (this.closed) { await this.discard(); return; }
      this.reportStatus('ringing');
      this.enqueueUpdate(response.call);
      for (const call of this.pendingUpdates) if (call.id === this.info?.id) this.enqueueUpdate(call);
      this.pendingUpdates=[];
      this.signalQueue.push(...this.earlySignals.filter(packet=>packet.callId===this.info?.id).map(packet=>packet.data));
      this.earlySignals=[];
      this.timer=setInterval(() => { for(const data of this.key.drainSignalingData()) this.sendPacket(data); },100);
    } catch(error) { if (!this.closed) this.fail((error as Error).message); }
  }
  private reportStatus(status:NativeCallStatus,error?:string) {
    if (status === this.lastStatus && !error) return;
    this.lastStatus=status; if(status==='connected') clearTimeout(this.expiry);
    this.onStatus(status,error);
  }
  private enqueueUpdate(call:NativeCallInfo) { this.updates=this.updates.then(() => this.applyUpdate(call)).catch(error => this.fail(error.message)); }
  private async applyUpdate(call:NativeCallInfo) {
    if (this.closed || call.id !== this.info?.id) return;
    this.info={...this.info,...call};
    if (call.state === 'PhoneCallDiscarded') { this.stop(false); this.reportStatus('ended'); return; }
    if (call.state === 'PhoneCallAccepted' && !this.initial && !this.verified) {
      if (!call.gB) throw new Error('Missing remote call key');
      const result=await this.key.confirmCall({gAOrB:call.gB,emojiData:EMOJI_DATA,emojiOffsets:EMOJI_OFFSETS});
      this.verified=true; this.onFingerprint(result.emojis);
      const confirmed=await nativeCallRequest('confirm',{callId:call.id,accessHash:call.accessHash,gA:result.gA,keyFingerprint:result.keyFingerprint});
      if (this.closed) return;
      await this.applyUpdate(confirmed.call);
    } else if (call.state === 'PhoneCall') {
      if (!call.keyFingerprint || !call.connections?.length) throw new Error('Call transport information is missing');
      if (!this.verified) {
        if (!this.initial || !call.gAOrB) throw new Error('Call key exchange is incomplete');
        const result=await this.key.confirmCall({gAOrB:call.gAOrB,expectedKeyFingerprint:call.keyFingerprint,emojiData:EMOJI_DATA,emojiOffsets:EMOJI_OFFSETS});
        this.verified=true; this.onFingerprint(result.emojis);
      } else this.key.verifyKeyFingerprint({expectedKeyFingerprint:call.keyFingerprint});
      if (this.joined || this.closed) return;
      this.key.setShouldUseSctp(call.shouldUseSctp ?? true);
      this.reportStatus('connecting');
      await media.joinPhoneCall(call.connections, packet => {
        this.outgoing=this.outgoing.then(async () => { if(this.closed) return; const data=await this.key.encode(packet); if(data) this.sendPacket(data); }).catch(error => this.fail(error.message));
      }, !this.initial, this.video, Boolean(call.p2pAllowed), update => {
        if (this.closed) return;
        if (update['@type'] === 'updatePhoneCallConnectionState') {
          if (update.connectionState === 'connected') { this.startedAt ||= Date.now(); this.reportStatus('connected'); }
          else if (update.connectionState === 'failed') this.fail('Call connection failed. Check your network and retry.');
          else if (update.connectionState === 'disconnected') this.reportStatus('connecting');
        }
        this.onMedia();
      });
      if (this.closed) { media.stopPhoneCall(); return; }
      this.joined=true;
      this.sourceTrackId=voiceChanger.getProcessedOutputStream()?.getAudioTracks()[0]?.id;
      this.voiceUnsubscribe=voiceChanger.subscribe(() => {
        const id=voiceChanger.getProcessedOutputStream()?.getAudioTracks()[0]?.id;
        if (id && id !== this.sourceTrackId) { this.sourceTrackId=id; void media.refreshProcessedAudio().catch(error => this.fail(error.message)); }
      });
      this.onMedia(); this.drainSignals();
    }
  }
  private sendPacket(data:number[]) {
    if (this.closed || !this.info?.accessHash) return;
    void nativeCallRequest('signal',{callId:this.info.id,accessHash:this.info.accessHash,data}).catch(error => this.fail(error.message));
  }
  private drainSignals() {
    if (!this.joined || this.closed) return;
    const packets=this.signalQueue.splice(0);
    for (const packet of packets) this.incoming=this.incoming.then(async () => {
      if (this.closed) return;
      const decoded=await this.key.decode(packet);
      for (const message of Array.isArray(decoded) ? decoded : decoded ? [decoded] : []) await media.processSignalingMessage(message as P2pMessage);
      for (const data of this.key.drainSignalingData()) this.sendPacket(data);
    }).catch(error => this.fail(error.message));
  }
  private fail(message:string) { if(this.closed) return; this.stop(); this.reportStatus('failed',message); }
  private async discard() {
    if (!this.info?.accessHash) return;
    await telegramService.discardPhoneCall({callId:this.info.id,accessHash:this.info.accessHash,duration:this.startedAt ? Math.floor((Date.now()-this.startedAt)/1000) : 0,isVideo:this.video});
  }
  stop(send=true) {
    if(this.closed) return;
    if(send) void this.discard().catch(() => {});
    this.closed=true; this.unsubscribe?.(); this.voiceUnsubscribe?.(); clearInterval(this.timer); clearTimeout(this.expiry);
    this.key.destroy(); media.stopPhoneCall(); void voiceChanger.setLivePreview(false);
    this.signalQueue=[]; this.pendingUpdates=[]; this.earlySignals=[];
  }
  getStreams() { return media.getStreams(); }
  async setMuted(muted:boolean) { await media.toggleStreamP2p('audio',!muted); return media.getStreams()?.ownAudio?.getAudioTracks()[0]?.enabled === false; }
  setSpeaker(enabled:boolean) { media.setSpeakerEnabled(enabled); }
  async setVideo(enabled:boolean) { await media.toggleStreamP2p('video',enabled); this.onMedia(); return Boolean(media.getStreams()?.ownVideo?.getVideoTracks()[0]?.enabled); }
  async flipCamera() { await media.switchCameraInputP2p(); this.onMedia(); }
}

