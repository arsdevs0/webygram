import React, { useEffect, useState } from 'react';
import { Circle, Square, Download, RefreshCw, Mic } from 'lucide-react';
import { callRecordingService } from '../../services/callRecordingService';

export function CallRecordingPanel({ name = 'Voice chat', streams, compact = false }: {
  name?: string; streams?: () => MediaStream[]; compact?: boolean;
}) {
  const [state, setState] = useState(callRecordingService.getState());
  const [recordingName, setRecordingName] = useState(name);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    const unsubscribe = callRecordingService.subscribe(setState);
    void callRecordingService.restore();
    return unsubscribe;
  }, []);
  return <section aria-label="Call recording" className={`rounded-2xl border border-outline dark:border-outline bg-surface-low dark:bg-surface text-ink dark:text-ink ${compact ? 'p-3' : 'p-4'} space-y-3`}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Mic className="h-4 w-4 text-primary" />Call recording</h3>
      {state.recording && <span role="status" className="text-xs font-medium text-rose-500 tabular-nums">● REC {Math.floor(state.seconds / 60)}:{String(state.seconds % 60).padStart(2, '0')}</span>}
    </div>
    {!state.recording && <label className="block text-xs text-muted dark:text-muted">Recording name
      <input value={recordingName} onChange={event => setRecordingName(event.target.value)} maxLength={80} placeholder="Call or voice chat name" className="mt-1 w-full rounded-xl border border-outline dark:border-outline bg-surface dark:bg-canvas px-3 py-2.5 text-sm text-ink dark:text-ink" />
    </label>}
    <p className="text-xs leading-relaxed text-muted dark:text-muted">
      {streams ? 'Records the connected call audio.' : 'On desktop, choose the Telegram call tab and enable Share tab audio.'} No playback or recording tone. Stop to save the named audio in Saved Messages. Each clip ends automatically after 30 minutes.
    </p>
    <button type="button" disabled={starting || (state.saving && !state.recording)} onClick={async () => {
      if (state.recording) { callRecordingService.stop(); return; }
      setStarting(true);
      try { await callRecordingService.start(recordingName, streams?.()); } finally { setStarting(false); }
    }} className={`flex w-full items-center justify-center gap-2 min-h-11 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${state.recording ? 'bg-rose-500' : 'bg-primary'}`}>
      {state.recording ? <Square className="h-4 w-4 fill-current" /> : <Circle className="h-4 w-4" />}
      {state.recording ? 'Stop & save' : starting ? 'Choosing audio…' : state.saving ? 'Saving…' : streams ? 'Record call' : 'Record tab audio'}
    </button>
    {state.notice && <p role="status" className="text-xs leading-relaxed text-muted dark:text-muted">{state.notice}</p>}
    {state.pending.map(record => <div key={record.id} className="flex items-center gap-2 rounded-xl border border-outline dark:border-outline p-2">
      <span className="flex-1 min-w-0 truncate text-xs" title={record.fileName}>{record.name}</span>
      <button aria-label={`Retry saving ${record.name}`} disabled={state.saving} onClick={() => void callRecordingService.save(record.id)} className="min-h-11 min-w-11 grid place-items-center text-primary"><RefreshCw className="h-4 w-4" /></button>
      <button aria-label={`Download ${record.name}`} onClick={() => callRecordingService.download(record.id)} className="min-h-11 min-w-11 grid place-items-center text-primary"><Download className="h-4 w-4" /></button>
    </div>)}
  </section>;
}

export function CallRecordingIndicator({ onOpen }: { onOpen: () => void }) {
  const [state, setState] = useState(callRecordingService.getState());
  useEffect(() => {
    void callRecordingService.restore();
    return callRecordingService.subscribe(setState);
  }, []);
  if (!state.recording && !state.saving && !state.pending.length) return null;
  return <button type="button" onClick={onOpen} className="fixed top-2 left-1/2 -translate-x-1/2 z-[70] max-w-[90vw] min-h-11 px-4 rounded-full bg-rose-600 text-white shadow-lg text-sm font-semibold flex items-center gap-2" aria-label="Open recording controls">
    <Circle className="w-3 h-3 fill-current" />
    <span className="truncate">{state.recording ? `Recording · ${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, '0')}` : state.saving ? 'Saving recording…' : 'Recording ready to save'}</span>
  </button>;
}
