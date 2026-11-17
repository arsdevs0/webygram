import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  Sliders,
  Play,
  Square,
  RotateCcw,
  Save,
  Check,
  Headphones,
  Info,
  Radio,
  Disc,
  Flame,
  Cpu,
  User,
  Mic2,
  Feather,
} from 'lucide-react';
import { voiceChanger, BUILTIN_VOICE_PRESETS } from '../../services/voiceChangerEngine';
import { VoiceChangerState } from '../../types/voiceChanger';
import { AudioWaveformVisualizer } from './AudioWaveformVisualizer';
import { modSettingsStore } from '../../services/modSettingsStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceChangerStudio: React.FC<Props> = ({ isOpen, onClose }) => {
  const [state, setState] = useState<VoiceChangerState>(voiceChanger.getState());
  const [activeTab, setActiveTab] = useState<'dsp' | 'devices' | 'routing'>('dsp');
  const [visualizerMode, setVisualizerMode] = useState<'frequency' | 'oscilloscope'>('frequency');
  const [isRecordingTest, setIsRecordingTest] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const startingTestRef = useRef(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [audioDevices, setAudioDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({
    inputs: [],
    outputs: [],
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(false);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const unsub = voiceChanger.subscribe((s) => setState(s));
    voiceChanger.getAudioDevices().then(devices => { if (mountedRef.current) setAudioDevices(devices); }).catch(() => {});
    return () => {
      mountedRef.current = false;
      unsub();
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      captureStreamRef.current?.getTracks().forEach(track => track.stop());
      audioElementRef.current?.pause();
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) return;
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    audioElementRef.current?.pause(); setIsPlayingTest(false);
    void voiceChanger.setLivePreview(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const accentHex = modSettingsStore.getAccentColorHex();

  const handleTogglePower = async () => {
    await voiceChanger.setEnabled(!state.enabled);
  };

  const handleStartTestRecord = async () => {
    if (startingTestRef.current || mediaRecorderRef.current?.state === 'recording') return;
    startingTestRef.current = true; setPreviewError('');
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record audio. Update it and try again.');
      const ok = await voiceChanger.ensureReadyForCapture();
      if (!mountedRef.current) return;
      if (!ok) {
        setIsRecordingTest(false);
        setPreviewError(voiceChanger.getLastError() || 'Microphone unavailable. Check browser permissions.');
        return;
      }
      const stream = voiceChanger.getProcessedOutputStream() || voiceChanger.micStream;
      if (!stream || stream.getAudioTracks().length === 0) {
        setIsRecordingTest(false);
        return;
      }

      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        recordedUrlRef.current = null;
        setRecordedAudioUrl(null);
      }
      audioElementRef.current?.pause();
      setIsPlayingTest(false);

      recordedChunksRef.current = [];
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const chosenMime =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? preferredTypes.find((t) => MediaRecorder.isTypeSupported(t))
          : undefined;

      const captureStream = stream.clone();
      captureStreamRef.current = captureStream;
      const recorder = new MediaRecorder(captureStream, { ...(chosenMime ? { mimeType: chosenMime } : {}), audioBitsPerSecond: modSettingsStore.getSettings().highQualityVoiceNotes ? 64000 : 32000 });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        captureStream.getTracks().forEach(track => track.stop());
        captureStreamRef.current = null;
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        if (!mountedRef.current) return;
        const mime = chosenMime || recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        if(blob.size < 64) { setIsRecordingTest(false); setPreviewError('The recording was empty. Try a longer sample.'); return; }
        const url = URL.createObjectURL(blob);
        recordedUrlRef.current = url;
        setRecordedAudioUrl(url);
        setIsRecordingTest(false);
      };

      recorder.onerror = () => {
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        captureStream.getTracks().forEach(track=>track.stop());
        if(mountedRef.current) { setIsRecordingTest(false); setPreviewError('Recording stopped unexpectedly. Please retry.'); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecordingTest(true);

      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 8000);
    } catch(error) {
      if (mountedRef.current) setPreviewError((error as Error).message || "Could not record a voice sample.");
      captureStreamRef.current?.getTracks().forEach(track => track.stop());
      captureStreamRef.current = null;
      if (mountedRef.current) setIsRecordingTest(false);
    } finally { startingTestRef.current = false; }
  };

  const handleStopTestRecord = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleTogglePlayTest = () => {
    const el = audioElementRef.current;
    if (!el || !recordedAudioUrl) return;
    if (isPlayingTest) {
      el.pause();
      setIsPlayingTest(false);
    } else {
      if (el.ended) el.currentTime = 0;
      el.muted = false;
      el.volume = 1.0;
      el
        .play()
        .then(() => setIsPlayingTest(true))
        .catch(error => { setIsPlayingTest(false); setPreviewError(error.message || 'Playback failed. Tap Play again.'); });
    }
  };

  const handleSaveCustomPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!savePresetName.trim()) return;
    voiceChanger.saveCustomPreset(savePresetName.trim());
    setSavePresetName('');
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2500);
  };

  const getPresetIcon = (icon: string) => {
    switch (icon) {
      case 'User': return <User className="w-4 h-4" />;
      case 'Mic2': return <Mic2 className="w-4 h-4" />;
      case 'Feather': return <Feather className="w-4 h-4" />;
      case 'Radio': return <Radio className="w-4 h-4" />;
      case 'Disc': return <Disc className="w-4 h-4" />;
      case 'Flame': return <Flame className="w-4 h-4" />;
      case 'Cpu': return <Cpu className="w-4 h-4" />;
      default: return <Sliders className="w-4 h-4" />;
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Voice Changer Studio" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-[3px]">
      <div className="relative w-full max-w-4xl bg-surface dark:bg-surface border border-outline dark:border-outline rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-ink dark:text-ink">
        {/* Header */}
        <div className="tg-studio-header flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl border ${
                state.enabled
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-surface dark:bg-elevated border-outline dark:border-outline text-muted'
              }`}
            >
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Voice Changer Studio</h2>
                <span
                  className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full border ${
                    state.enabled
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-surface dark:bg-elevated text-muted border-outline dark:border-outline'
                  }`}
                >
                  {state.enabled ? 'Active' : 'Standby'}
                </span>
              </div>
              <p className="text-xs text-muted dark:text-muted">
                Voice effects for messages and calls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePower}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap border ${
                state.enabled
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                  : 'bg-primary hover:bg-primary-hover text-white border-primary'
              }`}
            >
              {state.enabled ? 'Disable' : 'Enable Voice Changer'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close voice studio"
              className="p-2 text-muted hover:text-ink dark:text-muted dark:hover:text-white rounded-xl hover:bg-hover/70 dark:hover:bg-hover transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tg-studio-tabs flex flex-wrap items-center justify-between px-3 sm:px-6 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas overflow-x-auto no-scrollbar">
          <div className="flex w-full sm:w-auto gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'dsp', label: 'Presets & Formants' },
                { id: 'devices', label: 'Microphones & Output' },
                { id: 'routing', label: 'Call Routing' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted dark:text-muted hover:text-ink dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 py-2 shrink-0">
            <button
              type="button"
              onClick={() => setVisualizerMode('frequency')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer ${
                visualizerMode === 'frequency'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted dark:text-muted'
              }`}
            >
              Spectrum
            </button>
            <button
              type="button"
              onClick={() => setVisualizerMode('oscilloscope')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer ${
                visualizerMode === 'oscilloscope'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted dark:text-muted'
              }`}
            >
              Waveform
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {(state.lastError || previewError) && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
              {previewError || state.lastError}
            </div>
          )}

          <div className="p-4 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">Live Input Monitor</span>
                {state.detectedInputHz ? (
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10.5px] font-mono font-semibold tabular-nums">
                    {state.detectedInputHz} Hz → {state.outputPitchHz} Hz
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void voiceChanger.setLivePreview(!state.livePreview)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border cursor-pointer ${
                  state.livePreview
                    ? 'bg-primary border-primary text-white'
                    : 'bg-surface dark:bg-elevated border-outline dark:border-outline text-muted dark:text-muted'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Hear Yourself: {state.livePreview ? 'ON' : 'OFF'}</span>
              </button>
            </div>
            <AudioWaveformVisualizer height={54} mode={visualizerMode} accentColor={accentHex} />
            {state.livePreview && (
              <p className="text-[10.5px] text-amber-600 dark:text-amber-300 mt-1.5">
                Tip: Use earphones/headphones when Hear Yourself is ON to prevent speaker feedback echo.
              </p>
            )}
          </div>

          {activeTab === 'dsp' && (
            <>
              <div>
                <h3 className="text-xs font-semibold text-muted dark:text-muted uppercase tracking-wider mb-2.5">
                  Voice Presets
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {Object.values(BUILTIN_VOICE_PRESETS).map((preset) => {
                    const isSelected = state.selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => voiceChanger.setPreset(preset.id)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary/15 border-primary'
                            : 'bg-surface-low dark:bg-canvas border-outline dark:border-outline hover:bg-hover dark:hover:bg-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div
                            className={`p-1.5 rounded-lg ${
                              isSelected
                                ? 'bg-primary text-white'
                                : 'bg-surface dark:bg-elevated text-muted'
                            }`}
                          >
                            {getPresetIcon(preset.icon)}
                          </div>
                          <span className="text-[10px] font-mono text-muted dark:text-muted tabular-nums">
                            {preset.pitchShift > 0 ? `+${preset.pitchShift}` : preset.pitchShift} st
                          </span>
                        </div>
                        <div className="font-semibold text-xs">{preset.name}</div>
                        <div className="text-[11px] text-muted dark:text-muted line-clamp-2 mt-0.5">
                          {preset.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline dark:border-outline">
                  <h3 className="text-xs font-semibold">Fine-Tune Parameters</h3>
                  <button
                    type="button"
                    onClick={() => voiceChanger.resetToDefaults()}
                    className="flex items-center gap-1 text-xs text-muted hover:text-primary cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="p-3 bg-surface dark:bg-elevated rounded-xl border border-outline dark:border-outline">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold">Pitch Shift</span>
                      <span className="font-mono text-primary font-semibold tabular-nums">
                        {state.pitchShift > 0 ? `+${state.pitchShift}` : state.pitchShift} st
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={state.pitchShift}
                      onChange={(e) => voiceChanger.setPitch(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-elevated dark:bg-elevated rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted mt-1">
                      <span>Deep (-12)</span>
                      <span>0</span>
                      <span>High (+12)</span>
                    </div>
                  </div>

                  <div className="p-3 bg-surface dark:bg-elevated rounded-xl border border-outline dark:border-outline">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold">Formant / Vocal Tract</span>
                      <span className="font-mono text-primary font-semibold tabular-nums">
                        {state.formantShift > 0 ? `+${state.formantShift}` : state.formantShift}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="10"
                      step="1"
                      value={state.formantShift}
                      onChange={(e) => voiceChanger.setFormantShift(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-elevated dark:bg-elevated rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted mt-1">
                      <span>Chest</span>
                      <span>Neutral</span>
                      <span>Female Air</span>
                    </div>
                  </div>

                  <div className="p-3 bg-surface dark:bg-elevated rounded-xl border border-outline dark:border-outline">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold">Tone Warmth</span>
                      <span className="font-mono text-primary font-semibold tabular-nums">
                        {state.tone}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="10"
                      step="1"
                      value={state.tone}
                      onChange={(e) => voiceChanger.setTone(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-elevated dark:bg-elevated rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted mt-1">
                      <span>Warm</span>
                      <span>Flat</span>
                      <span>Crisp</span>
                    </div>
                  </div>

                  <div className="p-3 bg-surface dark:bg-elevated rounded-xl border border-outline dark:border-outline">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold">Vocal Resonance</span>
                      <span className="font-mono text-primary font-semibold tabular-nums">
                        {state.resonance} / 10
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={state.resonance}
                      onChange={(e) => voiceChanger.setResonance(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-elevated dark:bg-elevated rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted mt-1">
                      <span>Dry</span>
                      <span>Rich</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="flex items-center justify-between p-3 bg-surface dark:bg-elevated rounded-xl border border-outline dark:border-outline cursor-pointer">
                    <div>
                      <div className="text-xs font-semibold">Clarity &amp; De-Esser</div>
                      <div className="text-[11px] text-muted dark:text-muted">
                        Smooths harsh highs for natural speech
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={state.enhancement}
                      onChange={(e) => voiceChanger.setEnhancement(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                  </label>

                  <form onSubmit={handleSaveCustomPreset} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Custom preset name..."
                      value={savePresetName}
                      onChange={(e) => setSavePresetName(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {showSaveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                      <span>{showSaveSuccess ? 'Saved' : 'Save'}</span>
                    </button>
                  </form>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold">Audition Sample</h4>
                  <p className="text-[11px] text-muted dark:text-muted">
                    Record a short sample to hear your modulated voice before sending in a chat.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {isRecordingTest ? (
                    <button
                      type="button"
                      onClick={handleStopTestRecord}
                      className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartTestRecord}
                      className="flex items-center gap-1.5 px-4 py-2 bg-surface dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-xs font-semibold rounded-xl border border-outline dark:border-outline cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5 text-primary" />
                      <span>Record Test</span>
                    </button>
                  )}

                  {recordedAudioUrl && (
                    <button
                      type="button"
                      onClick={handleTogglePlayTest}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isPlayingTest ? 'Pause' : 'Play'}</span>
                    </button>
                  )}
                  <audio
                    ref={audioElementRef}
                    src={recordedAudioUrl || undefined}
                    onEnded={() => setIsPlayingTest(false)}
                    onError={() => { setIsPlayingTest(false); setPreviewError('This recording could not be played. Record a new sample.'); }}
                    className="hidden"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'devices' && (
            <div className="p-4 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Audio Devices</h3>

              <div>
                <label className="text-xs font-medium block mb-1.5">Input Microphone</label>
                <select
                  value={state.selectedMicId}
                  onChange={(e) => voiceChanger.setAudioInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                >
                  <option value="default">Default System Microphone</option>
                  {audioDevices.inputs.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone (${mic.deviceId.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1.5">Output Speaker / Headphones</label>
                <select
                  value={state.selectedOutputId}
                  onChange={(e) => voiceChanger.setAudioOutput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                >
                  <option value="default">Default System Output</option>
                  {audioDevices.outputs.map((out) => (
                    <option key={out.deviceId} value={out.deviceId}>
                      {out.label || `Output (${out.deviceId.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'routing' && (
            <div className="p-5 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline space-y-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Info className="w-4 h-4" />
                <span>Audio Routing</span>
              </div>
              <p className="text-xs text-muted dark:text-muted leading-relaxed">
                Voice notes recorded inside TG Plus pass directly through the active DSP chain before being uploaded to Telegram.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 rounded-xl bg-surface dark:bg-elevated border border-outline dark:border-outline">
                  <div className="text-xs font-semibold mb-1">1. Telegram Voice Notes</div>
                  <p className="text-[11px] text-muted dark:text-muted leading-relaxed">
                    Record using the mic button in any chat — your processed female or male voice is sent directly.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-surface dark:bg-elevated border border-outline dark:border-outline">
                  <div className="text-xs font-semibold mb-1">2. Desktop Calls (Virtual Cable)</div>
                  <p className="text-[11px] text-muted dark:text-muted leading-relaxed">
                    Enable Hear Yourself and route output to VB-Cable or BlackHole to use in external call apps.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-outline dark:border-outline bg-surface-low dark:bg-canvas text-xs">
          <div className="text-muted dark:text-muted">
            Active preset:{' '}
            <span className="font-semibold text-ink dark:text-ink">
              {BUILTIN_VOICE_PRESETS[state.selectedPresetId as keyof typeof BUILTIN_VOICE_PRESETS]?.name || 'Custom'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
