import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCcw,
  Check,
  ChevronDown,
  Play,
  Pause,
  Headphones,
  Sliders,
} from 'lucide-react';
import { voiceChanger, BUILTIN_VOICE_PRESETS } from '../../services/voiceChangerEngine';
import { VoiceChangerState, VoiceGender } from '../../types/voiceChanger';
import { VoiceEngineStatus } from './VoiceEngineStatus';

interface Props {
  onOpenFullStudio?: () => void;
}

const STORAGE_POS_KEY = 'tgplus_voice_btn_pos_v1';
const BUTTON_SIZE = 44;
const EDGE_MARGIN = 12;

interface Pos {
  x: number;
  y: number;
}

function getDefaultPos(): Pos {
  if (typeof window === 'undefined') return { x: 300, y: 420 };
  return {
    x: Math.max(EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - 24),
    y: Math.max(EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - 98),
  };
}

function clampPos(pos: Pos): Pos {
  if (typeof window === 'undefined') return pos;
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(EDGE_MARGIN, pos.x), maxX),
    y: Math.min(Math.max(EDGE_MARGIN, pos.y), maxY),
  };
}

export const FloatingVoiceChanger: React.FC<Props> = ({ onOpenFullStudio }) => {
  const [state, setState] = useState<VoiceChangerState>(voiceChanger.getState());
  const [isOpen, setIsOpen] = useState(false);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [audioDevices, setAudioDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({
    inputs: [],
    outputs: [],
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [pos, setPos] = useState<Pos>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_POS_KEY);
      if (raw) return clampPos(JSON.parse(raw));
    } catch {
      // ignore
    }
    return getDefaultPos();
  });

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startPointerX: number;
    startPointerY: number;
    startPosX: number;
    startPosY: number;
  }>({
    active: false,
    moved: false,
    startPointerX: 0,
    startPointerY: 0,
    startPosX: 0,
    startPosY: 0,
  });

  useEffect(() => {
    const unsub = voiceChanger.subscribe((s) => setState(s));
    voiceChanger.getAudioDevices().then(setAudioDevices);

    const onResize = () => {
      setPos((prev) => clampPos(prev));
    };
    window.addEventListener('resize', onResize);
    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      moved: false,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startPointerX;
    const dy = e.clientY - dragRef.current.startPointerY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragRef.current.moved = true;
    }
    if (dragRef.current.moved) {
      const next = clampPos({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      });
      setPos(next);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (dragRef.current.moved) {
      try {
        localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(pos));
      } catch {
        // ignore
      }
    } else {
      setIsOpen((prev) => !prev);
    }
  };

  const handleTogglePower = async () => {
    await voiceChanger.setEnabled(!state.enabled);
  };

  const handleGenderSelect = (gender: VoiceGender) => {
    voiceChanger.setGender(gender);
  };

  const handlePresetSelect = (presetId: string) => {
    voiceChanger.setPreset(presetId);
    setPresetDropdownOpen(false);
  };

  const handleToggleListenPreview = async () => {
    await voiceChanger.setLivePreview(!state.livePreview);
  };

  const handleSave = () => {
    voiceChanger.saveCustomPreset('Custom Voice');
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const currentPresetName =
    BUILTIN_VOICE_PRESETS[state.selectedPresetId as keyof typeof BUILTIN_VOICE_PRESETS]?.name ||
    state.customPresets.find((p) => p.id === state.selectedPresetId)?.name ||
    'Natural Female';

  const pitchPercent = Math.round((state.pitchShift / 12) * 50);
  const formantPercent = Math.round((state.formantShift / 10) * 50);
  const tonePercent = Math.round(state.tone * 5);

  const getPanelStyle = (): React.CSSProperties => {
    if (typeof window === 'undefined') return { right: 16, bottom: 80 };
    const panelWidth = Math.min(312, window.innerWidth - 24);
    const panelHeightEst = 540;
    let left = pos.x - panelWidth + BUTTON_SIZE;
    if (left < 12) left = 12;
    if (left + panelWidth > window.innerWidth - 12) {
      left = window.innerWidth - panelWidth - 12;
    }

    let top = pos.y - panelHeightEst - 10;
    if (top < 12) {
      top = Math.min(pos.y + BUTTON_SIZE + 10, window.innerHeight - panelHeightEst - 12);
    }
    if (top < 12) top = 12;

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${panelWidth}px`,
    };
  };

  const selectedMicLabel =
    state.selectedMicId === 'default'
      ? 'Default Device'
      : audioDevices.inputs.find((m) => m.deviceId === state.selectedMicId)?.label || 'Selected Mic';

  return (
    <>
      {/* Draggable Circular Electric Blue Audio Waveform Button */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          touchAction: 'none',
        }}
        title="Voice Changer (Drag to move, tap to open)"
        className={`fixed z-40 rounded-full flex items-center justify-center transition-colors border select-none cursor-grab active:cursor-grabbing shadow-md ${
          state.enabled
            ? 'bg-primary text-white border-outline'
            : 'bg-surface dark:bg-elevated text-primary border-outline dark:border-outline'
        }`}
      >
        <div className="flex items-center justify-center gap-[2.5px] pointer-events-none">
          <span className="w-[2px] h-2 bg-current rounded-full" />
          <span className="w-[2px] h-3.5 bg-current rounded-full" />
          <span className="w-[2px] h-4.5 bg-current rounded-full" />
          <span className="w-[2px] h-3 bg-current rounded-full" />
          <span className="w-[2px] h-2 bg-current rounded-full" />
        </div>
      </button>

      {/* Sleek Floating Voice Changer Panel */}
      {isOpen && (
        <div
          style={getPanelStyle()}
          className="fixed z-50 bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-2xl shadow-2xl overflow-hidden text-ink dark:text-ink"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-elevated">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                <div className="flex items-center gap-[1.5px]">
                  <span className="w-[1.5px] h-1.5 bg-current rounded-full" />
                  <span className="w-[1.5px] h-3 bg-current rounded-full" />
                  <span className="w-[1.5px] h-2 bg-current rounded-full" />
                </div>
              </div>
              <h3 className="text-sm font-semibold">Voice Changer</h3>
            </div>

            <div className="flex items-center gap-1">
              {onOpenFullStudio && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenFullStudio();
                  }}
                  className="p-1.5 text-muted dark:text-muted hover:text-primary rounded-lg hover:bg-hover/60 dark:hover:bg-hover cursor-pointer"
                  title="Open Full Voice Studio"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-muted hover:text-ink dark:text-muted dark:hover:text-white rounded-full hover:bg-hover/60 dark:hover:bg-hover transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3.5 max-h-[75vh] overflow-y-auto">
            {state.lastError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-[11px] text-rose-700 dark:text-rose-300 leading-snug">
                {state.lastError}
              </div>
            )}

            <VoiceEngineStatus state={state} />
            {/* Power Toggle */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold">Enabled</span>
                {state.enabled && state.activeEngine !== 'neural' && state.detectedInputHz ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-mono tabular-nums truncate">
                    {state.detectedInputHz}→{state.outputPitchHz}Hz
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleTogglePower}
                className={`relative inline-flex h-5.5 w-10 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                  state.enabled ? 'bg-primary' : 'bg-surface dark:bg-elevated'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    state.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Male / Female Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleGenderSelect('male')}
                className={`py-2.5 px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 font-semibold text-xs transition-colors cursor-pointer border ${
                  state.gender === 'male'
                    ? 'bg-primary border-primary text-white'
                    : 'bg-elevated dark:bg-elevated border-outline dark:border-outline text-muted dark:text-muted'
                }`}
              >
                <span className="text-sm leading-none">♂</span>
                <span>Male</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenderSelect('female')}
                className={`py-2.5 px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 font-semibold text-xs transition-colors cursor-pointer border ${
                  state.gender === 'female'
                    ? 'bg-primary border-primary text-white'
                    : 'bg-elevated dark:bg-elevated border-outline dark:border-outline text-muted dark:text-muted'
                }`}
              >
                <span className="text-sm leading-none">♀</span>
                <span>Female</span>
              </button>
            </div>

            {/* Voice Preset Dropdown */}
            <div className="relative">
              <label className="text-[11px] font-medium text-muted dark:text-muted block mb-1">
                Voice Preset
              </label>

              <button
                type="button"
                onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-elevated dark:bg-elevated border border-outline dark:border-outline rounded-xl cursor-pointer"
              >
                <span className="truncate">{currentPresetName}</span>
                <ChevronDown className="w-4 h-4 text-muted shrink-0" />
              </button>

              {presetDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-xl shadow-lg py-1 max-h-44 overflow-y-auto">
                  {Object.values(BUILTIN_VOICE_PRESETS).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset.id)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-hover dark:hover:bg-hover cursor-pointer ${
                        state.selectedPresetId === preset.id
                          ? 'text-primary font-semibold bg-blue-50/70 dark:bg-elevated'
                          : ''
                      }`}
                    >
                      <span>{preset.name}</span>
                      <span className="text-[10px] text-muted font-mono tabular-nums">
                        {preset.id === 'ai_female' ? 'AI · Local' : `${preset.pitchShift > 0 ? '+' : ''}${preset.pitchShift} st`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {state.selectedPresetId !== 'ai_female' && <>
            {/* Pitch Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">Pitch</span>
                <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                  {pitchPercent >= 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
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
            </div>

            {/* Formant / Vocal Tract Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">Formant (Vocal Tract)</span>
                <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                  {formantPercent >= 0 ? `+${formantPercent}%` : `${formantPercent}%`}
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
            </div>

            {/* Tone Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">Tone</span>
                <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                  {tonePercent >= 0 ? `+${tonePercent}%` : `${tonePercent}%`}
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
            </div>

            </>}
            {/* Listen Preview */}
            <button
              type="button"
              onClick={handleToggleListenPreview}
              className={`w-full py-2.5 rounded-full flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer border ${
                state.livePreview
                  ? 'bg-primary border-primary text-white'
                  : 'bg-elevated dark:bg-elevated border-outline dark:border-outline hover:bg-hover/70 dark:hover:bg-hover'
              }`}
            >
              {state.livePreview ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Listening (Headphones On)</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Listen Preview</span>
                </>
              )}
            </button>

            {/* Audio Device */}
            <div className="relative">
              <label className="text-[11px] font-medium text-muted dark:text-muted block mb-1">
                Audio Device
              </label>
              <button
                type="button"
                onClick={() => setDeviceDropdownOpen(!deviceDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs bg-elevated dark:bg-elevated border border-outline dark:border-outline rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  <Headphones className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{selectedMicLabel}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
              </button>

              {deviceDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-xl shadow-lg py-1 max-h-36 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      voiceChanger.setAudioInput('default');
                      setDeviceDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-hover dark:hover:bg-hover cursor-pointer"
                  >
                    Default Device
                  </button>
                  {audioDevices.inputs.map((mic) => (
                    <button
                      key={mic.deviceId}
                      type="button"
                      onClick={() => {
                        voiceChanger.setAudioInput(mic.deviceId);
                        setDeviceDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-hover dark:hover:bg-hover truncate cursor-pointer"
                    >
                      {mic.label || `Microphone ${mic.deviceId.slice(0, 6)}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reset & Save */}
            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              <button
                type="button"
                onClick={() => voiceChanger.resetToDefaults()}
                className="py-2 px-3 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="py-2 px-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saveSuccess ? 'Saved' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
