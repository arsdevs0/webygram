import React, { useEffect, useRef } from 'react';
import { Send, Trash2, Lock, ChevronLeft } from 'lucide-react';
import { voiceChanger } from '../../services/voiceChangerEngine';
export const VoiceRecordingBar = React.memo(function VoiceRecordingBar({ seconds, locked, preset, onCancel, onSend }: {
  seconds: number; locked: boolean; preset: string | null; onCancel: () => void; onSend: () => void;
}) {
  const waveform = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const data = new Uint8Array(512);
    let frame = 0, last = 0;
    const update = (now: number) => {
      if (now - last > 80 && !document.hidden) {
        last = now;
        const analyser = voiceChanger.analyserNode;
        if (analyser) {
          analyser.getByteTimeDomainData(data);
          const bars = waveform.current?.children;
          if (bars) for (let i = 0; i < bars.length; i++) {
            let peak = 0;
            for (let n = i * 32; n < i * 32 + 32; n++) peak = Math.max(peak, Math.abs(data[n] - 128) / 128);
            (bars[i] as HTMLElement).style.transform = 'scaleY(' + Math.max(.16, Math.min(1, peak * 3)) + ')';
          }
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className="tg-recording" data-locked={locked} role="group" aria-label="Voice recording">
    <div className="tg-recording-track">
      <span className="tg-recording-dot" aria-hidden="true" />
      <time className="tg-recording-time" aria-label="Recording duration">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</time>
      <div ref={waveform} className="tg-recording-wave" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
      <span className="tg-recording-hint">{locked ? <><Lock size={14} />Recording</> : <><ChevronLeft size={16} />Slide to cancel</>}</span>
    </div>
    <button type="button" className="tg-recording-cancel" onClick={onCancel} aria-label="Cancel" title="Discard recording"><Trash2 size={21} /></button>
    <button type="button" className="tg-recording-send" onClick={onSend} aria-label="Send Voice Message" title="Send Voice Message"><Send size={21} /></button>
    <div className="tg-recording-detail"><span>{preset || 'Voice message'}</span><span>{locked ? 'Tap send when ready' : 'Slide up to lock'}</span></div>
  </div>;
});
