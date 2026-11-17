import { NativePhoneCallModal } from './NativePhoneCallModal';
import type { NativeCallInfo } from '../../services/nativeTelegramCall';
import { CallRecordingPanel } from './CallRecordingPanel';
import { callRecordingService } from '../../services/callRecordingService';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  Sliders,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  Radio,
  Users,
  Sparkles,
  SwitchCamera,
  Signal,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { TelegramChat } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { voiceChanger } from '../../services/voiceChangerEngine';
import { VoiceChangerState, VoiceGender } from '../../types/voiceChanger';
import { AudioWaveformVisualizer } from '../voice/AudioWaveformVisualizer';
import { soundEffects } from '../../services/soundEffects';
import { Avatar } from '../common/Avatar';

interface Props {
  chat: TelegramChat | null;
  isOpen: boolean;
  initialVideo?: boolean;
  isIncoming?: boolean;
  incomingOffer?: { nativeCall?: NativeCallInfo; callId?: string; sdp?: RTCSessionDescriptionInit; isVideo?: boolean } | null;
  onClose: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const LegacyVoiceCallModal: React.FC<Props> = ({
  chat,
  isOpen,
  initialVideo = false,
  incomingOffer = null,
  onClose,
}) => {
  const [callStatus, setCallStatus] = useState<'requesting' | 'ringing' | 'connected' | 'unavailable' | 'failed'>('requesting');
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [handRaised, setHandRaised] = useState(false);
  const [showVoiceDsp, setShowVoiceDsp] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [vcParticipants, setVcParticipants] = useState<
    Array<{ id: string; name: string; avatarUrl?: string; muted?: boolean }>
  >([]);
  const [vcRoomTitle, setVcRoomTitle] = useState<string>('Voice Chat');
  const [vcLiveOnTelegram, setVcLiveOnTelegram] = useState(false);
  const outgoingAudioRef = useRef<MediaStreamTrack | null>(null);
  const recordingCallRef = useRef(false);
  const [voiceState, setVoiceState] = useState<VoiceChangerState>(voiceChanger.getState());
  const [micLevel, setMicLevel] = useState(0);
  const [mediaPermissionError, setMediaPermissionError] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: 16, y: 76 });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const mtprotoCallRef = useRef<{ callId?: string; accessHash?: string }>({});
  const callSecondsRef = useRef(0);
  const pipDragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 16,
    origY: 76,
  });

  const isGroupVc = Boolean(chat && (chat.type === 'group' || chat.type === 'channel'));

  useEffect(() => {
    callSecondsRef.current = callSeconds;
  }, [callSeconds]);

  useEffect(() => {
    const unsub = voiceChanger.subscribe((s) => setVoiceState(s));
    return () => unsub();
  }, []);

  const attachLocalStreamToVideo = useCallback((stream: MediaStream | null) => {
    cameraStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      if (stream) {
        localVideoRef.current.muted = true;
        void localVideoRef.current.play().catch(() => {});
      }
    }
  }, []);

  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const cleanupPeerConnection = useCallback(() => {
    soundEffects.stopRingbackTone();
    soundEffects.stopIncomingRing();
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
      videoSenderRef.current = null;
    }
    outgoingAudioRef.current?.stop();
    outgoingAudioRef.current = null;
    if (recordingCallRef.current) { callRecordingService.stop(); recordingCallRef.current = false; }
    remoteStreamRef.current = null;
    setHasRemoteVideo(false);
    setPeerConnected(false);
  }, []);

  // Re-attach local camera stream whenever ref mounts or stream changes
  useEffect(() => {
    if ((isVideoEnabled || isScreenSharing) && localVideoRef.current && cameraStreamRef.current) {
      localVideoRef.current.srcObject = cameraStreamRef.current;
      localVideoRef.current.muted = true;
      void localVideoRef.current.play().catch(() => {});
    }
  }, [isVideoEnabled, isScreenSharing]);

  useEffect(() => {
    if (hasRemoteVideo && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.muted = true;
      void remoteVideoRef.current.play().catch(() => {});
    }
  }, [hasRemoteVideo]);

  // Sync speaker mute & output volume on remote audio/video
  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOn;
      remoteAudioRef.current.volume = isSpeakerOn ? 1.0 : 0.0;
      if (isSpeakerOn && remoteStreamRef.current) {
        void remoteAudioRef.current.play().catch(() => {});
      }
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = true;
      remoteVideoRef.current.volume = 0;
    }
  }, [isSpeakerOn, peerConnected]);

  // Acquire mic + optional initial camera on open, initiate MTProto + WebRTC call
  useEffect(() => {
    if (!isOpen || !chat) return;

    let cancelled = false;
    setCallStatus('requesting');
    setTransportError(null);
    setCallSeconds(0);
    setIsMuted(false);
    setIsSpeakerOn(true);
    setIsScreenSharing(false);
    setHandRaised(false);
    setMediaPermissionError(null);
    setHasRemoteVideo(false);
    setPeerConnected(false);
    setIsVideoEnabled(initialVideo);
    mtprotoCallRef.current = {};

    soundEffects.initCtx();

    const startCallSequence = async () => {
      if (isGroupVc) {
        const info = await telegramService.getGroupCallInfo(chat.id);
        if (cancelled) return;
        setVcLiveOnTelegram(info.hasActiveCall);
        setVcRoomTitle(info.title || chat.title);
        setVcParticipants(info.participants);
      }
      const response = await fetch('/api/tg/calls/capabilities');
      if (!response.ok) throw new Error('Could not check calling availability.');
      const capabilities = await response.json();
      if (cancelled) return;
      if (!incomingOffer?.sdp && !(isGroupVc ? capabilities.nativeGroupCalls : capabilities.nativeCalls)) {
        setTransportError(capabilities.reason || 'Telegram calling is not available in this build.');
        setCallStatus('unavailable');
        setIsVideoEnabled(false);
        return;
      }

      // Initialize audio engine (mic + DSP pipeline)
      const micReady = await voiceChanger.ensureReadyForCapture();
      if (cancelled) return;
      if (!micReady) {
        setMediaPermissionError(
          voiceChanger.getLastError() || 'Microphone permission denied. Allow mic access to hear & speak.'
        );
        setCallStatus('failed');
        return;
      }

      // Acquire camera immediately if started as Video Call
      let camStream: MediaStream | null = null;
      if (initialVideo && navigator.mediaDevices?.getUserMedia) {
        try {
          camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode },
          });
          if (!cancelled) {
            attachLocalStreamToVideo(camStream);
            setIsVideoEnabled(true);
          } else {
            camStream.getTracks().forEach((t) => t.stop());
          }
        } catch (err) {
          if (!cancelled) {
            setIsVideoEnabled(false);
            setMediaPermissionError(
              (err as Error)?.message || 'Camera permission blocked or unavailable.'
            );
          }
        }
      }

      // Create WebRTC PeerConnection
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      const audioStream = voiceChanger.getProcessedOutputStream() || voiceChanger.micStream;
      if (audioStream) {
        const track = audioStream.getAudioTracks()[0]?.clone();
        if (track) { outgoingAudioRef.current = track; pc.addTrack(track, new MediaStream([track])); }
      }
      if (camStream) {
        videoSenderRef.current = pc.addTrack(camStream.getVideoTracks()[0], camStream);
      } else videoSenderRef.current = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          telegramService.sendCallSignal({
            action: 'ice',
            chatId: chat.id,
            callId: mtprotoCallRef.current.callId,
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (ev) => {
        const stream = remoteStreamRef.current || new MediaStream();
        if (!stream.getTracks().includes(ev.track)) stream.addTrack(ev.track);
        remoteStreamRef.current = stream;
        if (ev.track.kind === 'video') {
          setHasRemoteVideo(true);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.muted = true;
            void remoteVideoRef.current.play().catch(() => {});
          }
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.muted = !isSpeakerOn;
          remoteAudioRef.current.volume = isSpeakerOn ? 1.0 : 0.0;
          void remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setPeerConnected(true);
          setCallStatus('connected');
          soundEffects.stopRingbackTone();
          soundEffects.playCallConnected();
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setPeerConnected(false);
          setCallStatus('failed');
          soundEffects.stopRingbackTone();
          setTransportError('Call connection interrupted. End the call and try again.');
        }
      };

      if (!isGroupVc) {
        if (incomingOffer?.sdp) {
          mtprotoCallRef.current = { callId: incomingOffer.callId };
          await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          telegramService.sendCallSignal({
            action: 'answer',
            chatId: chat.id,
            callId: incomingOffer.callId,
            sdp: answer,
          });
          setCallStatus('ringing');
          soundEffects.stopIncomingRing();
        } else {
          const started = await telegramService.startPhoneCall(chat.id, initialVideo);
          if (cancelled) return;
          mtprotoCallRef.current = { callId: started.callId, accessHash: started.accessHash };

          setCallStatus('ringing');
          soundEffects.startRingbackTone();

          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            await pc.setLocalDescription(offer);
            telegramService.sendCallSignal({
              action: 'offer',
              chatId: chat.id,
              callId: started.callId,
              isVideo: initialVideo,
              sdp: offer,
            });
          } catch {
            // ignore offer error if no audio tracks yet
          }
        }
      }
    };

    void startCallSequence().catch(error => {
      if (cancelled) return;
      setCallStatus('failed');
      setTransportError(error.message || 'Could not connect this call.');
      cleanupPeerConnection();
      stopCameraStream();
    });
    const connectTimer = window.setTimeout(() => {
      if (!cancelled && pcRef.current && pcRef.current.connectionState !== 'connected') {
        setCallStatus('failed');
        setTransportError('No answer. End the call and try again.');
        cleanupPeerConnection();
      }
    }, 45000);

    return () => {
      cancelled = true;
      clearTimeout(connectTimer);
      cleanupPeerConnection();
      stopCameraStream();
    };
  }, [isOpen, chat?.id, initialVideo]);

  // Listen to live WebRTC WS signaling events from peer
  useEffect(() => {
    if (!isOpen || !chat) return;
    const unsub = telegramService.subscribeCallSignals(async (ev) => {
      if (ev.type === 'CALL_SIGNAL' && String(ev.chatId || '') === chat.id && String(ev.callId || '') === mtprotoCallRef.current.callId) {
        const pc = pcRef.current;
        const action = String(ev.action || '');
        if (action === 'answer' && ev.sdp && pc) {
          try {
            await pc.setRemoteDescription(
              new RTCSessionDescription(ev.sdp as RTCSessionDescriptionInit)
            );
            setCallStatus('ringing');
          } catch {
            // ignore
          }
        } else if (action === 'ice' && ev.candidate && pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(ev.candidate as RTCIceCandidateInit));
          } catch {
            // ignore
          }
        } else if (action === 'hangup') {
          soundEffects.playCallEnded();
          onClose();
        }
      } else if (ev.type === 'PHONE_CALL_UPDATE' && String(ev.callId || '') === mtprotoCallRef.current.callId) {
        const st = String(ev.state || '');
        if (st === 'PhoneCallAccepted' || st === 'PhoneCall') {
          setCallStatus('ringing');
        } else if (st === 'PhoneCallDiscarded') {
          soundEffects.playCallEnded();
          onClose();
        }
      }
    });
    return () => unsub();
  }, [isOpen, chat?.id, onClose]);

  // Real-time AnalyserNode mic energy meter for animated Telegram wave rings
  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const tick = () => {
      const analyser = voiceChanger.analyserNode;
      if (analyser && !isMuted) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / Math.max(1, data.length);
        setMicLevel(Math.min(1, avg / 55));
      } else {
        setMicLevel(0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, isMuted]);

  // Call duration timer
  useEffect(() => {
    if (callStatus !== 'connected' || !isOpen) return;
    const interval = setInterval(() => {
      setCallSeconds((prev) => prev + 1);

    }, 1000);
    return () => clearInterval(interval);
  }, [callStatus, isOpen, isGroupVc, vcParticipants.length]);

  // Mic track mute toggle & live DSP track sync
  useEffect(() => {
    if (outgoingAudioRef.current) outgoingAudioRef.current.enabled = !isMuted;
  }, [isMuted, callStatus]);

  const handleToggleCamera = async (overrideFacing?: 'user' | 'environment') => {
    if (!pcRef.current) return;
    const targetFacing = overrideFacing || facingMode;
    if (isVideoEnabled && !overrideFacing) {
      stopCameraStream();
      await videoSenderRef.current?.replaceTrack(null);
      setIsVideoEnabled(false);
      return;
    }
    try {
      setMediaPermissionError(null);
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: targetFacing },
      });
      attachLocalStreamToVideo(stream);
      setIsVideoEnabled(true);
      setIsScreenSharing(false);

      const vTrack = stream.getVideoTracks()[0];
      if (videoSenderRef.current && vTrack) await videoSenderRef.current.replaceTrack(vTrack);
    } catch (err) {
      setIsVideoEnabled(false);
      setMediaPermissionError(
        (err as Error)?.message || 'Camera unavailable or permission denied.'
      );
    }
  };

  const handleFlipCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (isVideoEnabled) {
      await handleToggleCamera(next);
    }
  };

  const handleToggleScreenShare = async () => {
    if (!pcRef.current) return;
    if (isScreenSharing) {
      stopCameraStream();
      await videoSenderRef.current?.replaceTrack(null);
      setIsScreenSharing(false);
      return;
    }
    try {
      setMediaPermissionError(null);
      if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stopCameraStream();
        attachLocalStreamToVideo(stream);
        await videoSenderRef.current?.replaceTrack(stream.getVideoTracks()[0]);
        setIsScreenSharing(true);
        setIsVideoEnabled(false);
        stream.getVideoTracks()[0].onended = () => {
          void videoSenderRef.current?.replaceTrack(null).catch(() => {});
          stopCameraStream();
          setIsScreenSharing(false);
        };
      }
    } catch {
      setIsScreenSharing(false);
    }
  };

  const handleRetryMedia = async () => {
    setMediaPermissionError(null);
    soundEffects.initCtx();
    const ok = await voiceChanger.initialize();
    if (!ok) {
      setMediaPermissionError(voiceChanger.getLastError() || 'Allow microphone permission in browser.');
    }
    if (initialVideo || isVideoEnabled) {
      await handleToggleCamera(facingMode);
    }
  };

  if (!isOpen || !chat) return null;

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleToggleGender = async (g: VoiceGender) => {
    await voiceChanger.setEnabled(true);
    voiceChanger.setGender(g);
  };

  const handleEndCall = () => {
    soundEffects.playCallEnded();
    if (voiceChanger.micStream) {
      voiceChanger.micStream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
    }
    telegramService.sendCallSignal({
      action: 'hangup',
      chatId: chat.id,
      callId: mtprotoCallRef.current.callId,
    });
    if (mtprotoCallRef.current.callId && !isGroupVc) {
      void telegramService.discardPhoneCall({
        callId: mtprotoCallRef.current.callId,
        accessHash: mtprotoCallRef.current.accessHash,
        duration: callSecondsRef.current,
        isVideo: isVideoEnabled,
      });
    }
    cleanupPeerConnection();
    stopCameraStream();
    setIsMuted(false);
    setIsVideoEnabled(false);
    setIsScreenSharing(false);
    void voiceChanger.setLivePreview(false);
    onClose();
  };

  const currentUser = telegramService.getAuthSession().user;
  const isLocalVideoActive = isVideoEnabled || isScreenSharing;

  return (
    <div role="dialog" aria-modal="true" aria-label="Call" data-video={hasRemoteVideo} className="tg-call fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md select-none">
      {/* Remote WebRTC Audio Element */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="relative w-full h-[100dvh] sm:h-[660px] sm:max-h-[92vh] sm:max-w-[410px] bg-canvas border-0 sm:border border-outline sm:rounded-[30px] shadow-2xl overflow-hidden flex flex-col justify-between text-ink">
        {/* Full-bleed Remote Video Feed when WebRTC peer sends video */}
        {hasRemoteVideo && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover z-[1]"
          />
        )}

        {/* Draggable Local Self-Camera PiP Window (Video Call Mode) */}
        {isLocalVideoActive && (
          <div
            onPointerDown={(e) => {
              pipDragRef.current = {
                dragging: true,
                startX: e.clientX,
                startY: e.clientY,
                origX: pipPos.x,
                origY: pipPos.y,
              };
            }}
            onPointerMove={(e) => {
              if (!pipDragRef.current.dragging) return;
              const dx = e.clientX - pipDragRef.current.startX;
              const dy = e.clientY - pipDragRef.current.startY;
              setPipPos({
                x: Math.max(12, Math.min(240, pipDragRef.current.origX - dx)),
                y: Math.max(64, Math.min(390, pipDragRef.current.origY + dy)),
              });
            }}
            onPointerUp={() => {
              pipDragRef.current.dragging = false;
            }}
            style={{ right: `${pipPos.x}px`, top: `${pipPos.y}px` }}
            className="absolute z-20 w-28 h-40 sm:w-32 sm:h-44 rounded-2xl overflow-hidden bg-black border border-outline shadow-2xl cursor-grab active:cursor-grabbing"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                isVideoEnabled && facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />
            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[9.5px] font-semibold">
              {isScreenSharing ? 'Screen' : 'You'}
            </span>
            {isVideoEnabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleFlipCamera();
                }}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-surface hover:bg-black/80 flex items-center justify-center text-ink cursor-pointer"
                title="Flip Camera"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Top Header: E2EE Verification Emoji Pill & DSP Toggle */}
        <div className="relative z-10 px-4 pt-4 pb-2 flex items-center justify-between">
          {isGroupVc ? (
            <div className="flex items-center gap-2.5 bg-surface backdrop-blur-md px-3 py-1.5 rounded-full border border-outline">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold flex items-center gap-1.5 truncate">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[140px]">{vcRoomTitle}</span>
                </div>
                <p className="text-[10px] text-muted truncate">
                  {vcLiveOnTelegram ? 'Live on Telegram' : 'Voice Room'} · {vcParticipants.length} participants
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled className="px-3 py-1.5 text-xs text-muted"
            >
              {peerConnected ? 'Call connected' : 'Call'}
            </button>
          )}

          <div className="flex items-center gap-1.5">
            <div
              className="px-2 py-1 rounded-full bg-surface backdrop-blur-md border border-outline flex items-center gap-1 text-[10px] text-emerald-300"
              title={peerConnected ? 'Audio connected' : 'Audio not connected'}
            >
              <Signal className="w-3 h-3" />
              <span className="hidden sm:inline">{peerConnected ? 'Connected' : 'Offline'}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowVoiceDsp((prev) => !prev)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border backdrop-blur-md transition-colors cursor-pointer ${
                voiceState.enabled
                  ? 'bg-primary border-primary text-ink shadow-md'
                  : 'bg-surface border-outline text-muted hover:text-ink'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{voiceState.enabled ? 'Voice ON' : 'Voice Mod'}</span>
            </button>
          </div>
        </div>

        {transportError && <div role="status" className="relative z-10 mx-4 mt-2 rounded-2xl bg-black/50 border border-outline p-4 text-sm space-y-3">
          <p>{transportError}</p>
          <a href="https://web.telegram.org/a/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold">Open Telegram</a>
        </div>}

        {/* Permission Warning Banner if Mic or Camera Blocked */}
        {mediaPermissionError && (
          <div className="relative z-10 mx-4 mt-1 px-3 py-2 rounded-2xl bg-amber-500/20 backdrop-blur-md border border-amber-400/40 flex items-center justify-between gap-2 text-[11px] text-amber-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="truncate">{mediaPermissionError}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleRetryMedia()}
              className="px-2 py-1 rounded-lg bg-amber-500 text-ink font-bold text-[10px] flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Main Center Call / VC Stage */}
        <div className="relative z-10 flex-1 overflow-y-auto px-5 py-3 flex flex-col justify-center">
          {isGroupVc ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div
                  className={`p-3 rounded-2xl bg-surface backdrop-blur-md border flex flex-col items-center text-center gap-1.5 transition-all ${
                    !isMuted && micLevel > 0.08
                      ? 'border-emerald-400 ring-2 ring-emerald-400/35'
                      : 'border-outline'
                  }`}
                >
                  <div className="relative">
                    <Avatar
                      src={currentUser.avatarUrl}
                      title={currentUser.firstName || 'You'}
                      id={currentUser.id || 'me'}
                      size="md"
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0E1621] ${
                        isMuted ? 'bg-rose-500 text-ink' : 'bg-emerald-500 text-ink'
                      }`}
                    >
                      {isMuted ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                    </span>
                  </div>
                  <span className="text-xs font-semibold truncate w-full">
                    {currentUser.firstName || 'You'}
                  </span>
                  <span className={`text-[10px] font-medium ${isMuted ? 'text-muted' : 'text-emerald-300'}`}>
                    {!peerConnected ? 'Not connected' : handRaised ? '✋ Hand Raised' : isMuted ? 'Muted' : micLevel > 0.08 ? 'Speaking' : 'Listening'}
                  </span>
                </div>

                {vcParticipants.slice(0, 5).map((p, idx) => {
                  const isSpeaking = false;
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-2xl bg-surface backdrop-blur-md border flex flex-col items-center text-center gap-1.5 transition-all ${
                        isSpeaking
                          ? 'border-emerald-400/75 ring-2 ring-emerald-400/25'
                          : 'border-outline'
                      }`}
                    >
                      <Avatar src={p.avatarUrl} title={p.name} id={p.id} size="md" />
                      <span className="text-xs font-semibold truncate w-full">{p.name}</span>
                      <span className={`text-[10px] font-medium ${isSpeaking ? 'text-emerald-300' : 'text-muted'}`}>
                        {p.muted ? 'Muted' : isSpeaking ? 'Speaking...' : 'Unmuted'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {!vcLiveOnTelegram && (
                <div className="p-2.5 rounded-2xl bg-surface backdrop-blur-md border border-outline flex items-center justify-between gap-2 text-[11px] text-muted">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate">No active voice chat</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await telegramService.createGroupCall(chat.id, `${chat.title} Voice Chat`);
                        setVcLiveOnTelegram(true);
                      } catch (e) {
                        setMediaPermissionError((e as Error).message);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-primary text-ink font-semibold shrink-0 cursor-pointer"
                  >
                    Go Live on TG
                  </button>
                </div>
              )}
            </div>
          ) : (
            !hasRemoteVideo && (
              <div className="flex flex-col items-center text-center my-auto">
                {/* Telegram Avatar with Dynamic Real-Time Voice Energy Aura */}
                <div className="relative mb-5 flex items-center justify-center">
                  <span
                    style={{
                      transform: `scale(${1 + micLevel * 0.42})`,
                      opacity: callStatus === 'connected' && !isMuted ? 0.25 + micLevel * 0.45 : 0.12,
                    }}
                    className="absolute -inset-4 rounded-full bg-primary transition-transform duration-75 pointer-events-none"
                  />
                  <span
                    style={{
                      transform: `scale(${1 + micLevel * 0.24})`,
                    }}
                    className="absolute -inset-2 rounded-full bg-elevated blur-xs transition-transform duration-100 pointer-events-none"
                  />
                  <Avatar
                    src={chat.avatarUrl}
                    title={chat.title}
                    id={chat.id}
                    size="xl"
                    isSaved={chat.type === 'saved'}
                    className="w-28 h-28 relative z-10 ring-2 ring-white/25 shadow-2xl"
                  />
                </div>

                <h3 className="text-2xl font-bold tracking-tight text-ink drop-shadow-xs">
                  {chat.title}
                </h3>
                <p className="text-xs text-muted font-medium mt-1.5 tabular-nums flex items-center gap-1.5">
                  {callStatus === 'requesting' && 'Checking call availability…'}
                  {callStatus === 'unavailable' && 'Call audio unavailable'}
                  {callStatus === 'failed' && 'Could not connect'}
                  {callStatus === 'ringing' && 'Ringing...'}
                  {callStatus === 'connected' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>
                        {formatDuration(callSeconds)} · {isLocalVideoActive ? 'Video Call' : 'Voice Call'}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )
          )}

          {/* Expandable Live Voice Changer DSP Panel */}
          {(showVoiceDsp || voiceState.enabled) && (
            <div className="w-full mt-3 p-3.5 rounded-2xl bg-surface backdrop-blur-lg border border-outline space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Sliders className="w-3.5 h-3.5 text-primary" />
                  <span>Real-Time Voice Modulation</span>
                </div>
                <button
                  type="button"
                  onClick={() => void voiceChanger.setEnabled(!voiceState.enabled)}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                    voiceState.enabled
                      ? 'bg-primary text-ink'
                      : 'bg-elevated text-muted'
                  }`}
                >
                  {voiceState.enabled ? 'ACTIVE' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => void handleToggleGender('female')}
                  className={`py-1.5 rounded-xl font-semibold border transition-colors cursor-pointer ${
                    voiceState.enabled && voiceState.gender === 'female'
                      ? 'bg-primary border-primary text-ink'
                      : 'bg-elevated border-outline text-muted'
                  }`}
                >
                  Female
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleGender('male')}
                  className={`py-1.5 rounded-xl font-semibold border transition-colors cursor-pointer ${
                    voiceState.enabled && voiceState.gender === 'male' && voiceState.selectedPresetId !== 'deep_voice'
                      ? 'bg-primary border-primary text-ink'
                      : 'bg-elevated border-outline text-muted'
                  }`}
                >
                  Male
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await voiceChanger.setEnabled(true);
                    voiceChanger.setPreset('deep_voice');
                  }}
                  className={`py-1.5 rounded-xl font-semibold border transition-colors cursor-pointer ${
                    voiceState.enabled && voiceState.selectedPresetId === 'deep_voice'
                      ? 'bg-primary border-primary text-ink'
                      : 'bg-elevated border-outline text-muted'
                  }`}
                >
                  Deep Bass
                </button>
              </div>

              <AudioWaveformVisualizer mode="frequency" height={34} accentColor="#53BDEB" />

              <button
                type="button"
                onClick={() => void voiceChanger.setLivePreview(!voiceState.livePreview)}
                className={`w-full py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                  voiceState.livePreview
                    ? 'bg-primary/25 border-primary text-primary'
                    : 'bg-elevated border-outline text-muted hover:text-ink'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>
                  {voiceState.livePreview ? 'Mic Loopback Monitor ON (Audible)' : 'Hear Self / Test Audio Output'}
                </span>
              </button>
            </div>
          )}
        </div>

        {peerConnected && <div className="relative z-10 px-4 pb-3"><CallRecordingPanel compact name={chat.title} streams={() => {
          recordingCallRef.current = true;
          return [remoteStreamRef.current, outgoingAudioRef.current ? new MediaStream([outgoingAudioRef.current]) : null].filter((stream): stream is MediaStream => Boolean(stream));
        }} /></div>}
        {/* Call controls */}
        <div className="relative z-10 px-4 py-4 bg-surface backdrop-blur-xl border-t border-outline flex items-center justify-around gap-1.5">
          <button
            type="button"
            onClick={() => setIsSpeakerOn((prev) => !prev)}
            className="flex flex-col items-center gap-1.5 cursor-pointer min-w-[54px]"
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
                isSpeakerOn
                  ? 'bg-primary text-on-primary border-outline shadow-md'
                  : 'bg-elevated border-outline text-ink hover:bg-elevated'
              }`}
            >
              {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </div>
            <span className="text-[10.5px] text-muted font-medium">
              {isSpeakerOn ? 'Speaker' : 'Muted Spk'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleToggleCamera()}
            disabled={!pcRef.current}
            className="flex flex-col items-center gap-1.5 cursor-pointer min-w-[54px]"
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
                isVideoEnabled
                  ? 'bg-primary text-on-primary border-outline shadow-md'
                  : 'bg-elevated border-outline text-ink hover:bg-elevated'
              }`}
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </div>
            <span className="text-[10.5px] text-muted font-medium">Video</span>
          </button>

          {/* Center Mute Button */}
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            disabled={!pcRef.current}
            className="flex flex-col items-center gap-1.5 cursor-pointer min-w-[54px]"
          >
            <div
              className={`w-13 h-13 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                isMuted
                  ? 'bg-primary text-on-primary border-outline'
                  : 'bg-elevated hover:bg-elevated text-ink border-outline'
              }`}
            >
              {isMuted ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
            </div>
            <span className="text-[10.5px] font-semibold text-ink">
              {isMuted ? 'Unmute' : 'Mute'}
            </span>
          </button>

          {isGroupVc ? (
            <button
              type="button"
              onClick={() => setHandRaised((prev) => !prev)}
              disabled={!peerConnected}
              className="flex flex-col items-center gap-1.5 cursor-pointer min-w-[54px]"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
                  handRaised
                    ? 'bg-amber-400 text-ink border-amber-300 shadow-md'
                    : 'bg-elevated border-outline text-ink hover:bg-elevated'
                }`}
              >
                <Hand className="w-5 h-5" />
              </div>
              <span className="text-[10.5px] text-muted font-medium">Raise Hand</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleToggleScreenShare()}
              disabled={!pcRef.current || !navigator.mediaDevices?.getDisplayMedia}
              className="flex flex-col items-center gap-1.5 cursor-pointer min-w-[54px]"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
                  isScreenSharing
                    ? 'bg-primary text-on-primary border-outline shadow-md'
                    : 'bg-elevated border-outline text-ink hover:bg-elevated'
                }`}
              >
                <MonitorUp className="w-5 h-5" />
              </div>
              <span className="text-[10.5px] text-muted font-medium">Share</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleEndCall}
            className="flex flex-col items-center gap-1.5 cursor-pointer min-w-[54px]"
          >
            <div className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-transform active:scale-95 shadow-lg">
              <PhoneOff className="w-5 h-5" />
            </div>
            <span className="text-[10.5px] text-rose-300 font-semibold">
              {isGroupVc ? 'Leave' : 'End Call'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
import { appFetch as fetch } from '../../services/appTransport';

export const VoiceCallModal: React.FC<Props> = props => props.chat?.type === "user" ? <NativePhoneCallModal chat={props.chat} isOpen={props.isOpen} initialVideo={props.initialVideo} incomingOffer={props.incomingOffer} onClose={props.onClose} /> : <LegacyVoiceCallModal {...props} />;
