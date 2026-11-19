import React from 'react';
import { Cpu, LoaderCircle, RotateCcw } from 'lucide-react';
import { voiceChanger } from '../../services/voiceChangerEngine';
import type { VoiceChangerState } from '../../types/voiceChanger';
export function VoiceEngineStatus({ state }: { state: VoiceChangerState }) {
  if (state.selectedPresetId !== 'ai_female') return null;
  const busy = ['loading', 'checking', 'buffering'].includes(state.neuralStatus || '');
  const messages = { loading: 'Downloading AI voice · about 26 MB once', checking: 'Checking realtime speed on this device',
    buffering: 'Preparing realtime audio', active: 'AI voice active · processed on this device',
    idle: 'AI voice · enable to download and check this device', slow: '', error: '' };
  const message = !state.enabled ? messages.idle : state.neuralMessage || messages[state.neuralStatus || 'idle'];
  const retry = state.enabled && ['error', 'slow'].includes(state.neuralStatus || '');
  return <div className="tg-voice-engine-status rounded-xl border border-outline bg-surface-low p-3 text-xs text-ink" role="status" aria-live="polite">
    <div className="flex items-start gap-2 min-w-0">
      {busy ? <LoaderCircle size={16} className="animate-spin shrink-0 text-primary" /> : <Cpu size={16} className="shrink-0 text-primary" />}
      <span className="min-w-0 break-words">{message}</span>
    </div>
    <p className="text-muted mt-1.5">One trained feminine voice. Naturalness varies with speech and microphone. Audio stays in your browser.</p>
    {retry && <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-on-primary" onClick={() => void voiceChanger.retryNeuralVoice()}><RotateCcw size={14} />Retry AI</button>}
  </div>;
}
