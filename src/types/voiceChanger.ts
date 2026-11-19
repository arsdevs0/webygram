export type VoiceGender = 'male' | 'female' | 'neutral';

export type BuiltinPresetKey =
  | 'ai_female'
  | 'natural_female'
  | 'soft_female'
  | 'bright_female'
  | 'natural_male'
  | 'deep_voice'
  | 'soft_voice'
  | 'radio_military'
  | 'studio_warmth'
  | 'custom';

export interface VoicePreset {
  id: string;
  name: string;
  gender: VoiceGender;
  description: string;
  pitchShift: number; // Semitones (-12 to +12)
  formantShift: number; // (-10 to +10)
  tone: number; // (-10 bass to +10 treble)
  resonance: number; // (0 to 10)
  vibrato: number; // (0 to 10)
  noiseGateThreshold: number; // (-60dB to -20dB)
  enhancement: boolean;
  reverbAmount: number; // (0 to 10)
  icon: string;
}

export interface VoiceChangerState {
  enabled: boolean;
  selectedPresetId: string;
  gender: VoiceGender;
  pitchShift: number; // -12 to +12 semitones
  formantShift: number; // -10 to +10
  tone: number; // -10 to +10
  resonance: number; // 0 to 10
  vibrato: number; // 0 to 10
  noiseGateThreshold: number; // -60 to -20 dB
  enhancement: boolean; // Broadcast compressor + harmonics
  reverbAmount: number; // 0 to 10
  livePreview: boolean; // Hear yourself in headphones
  selectedMicId: string;
  selectedOutputId: string;
  customPresets: VoicePreset[];
  isReady?: boolean;
  lastError?: string | null;
  detectedInputHz?: number;
  outputPitchHz?: number;
  activeEngine?: 'original' | 'dsp' | 'neural';
  neuralStatus?: 'idle' | 'loading' | 'checking' | 'buffering' | 'active' | 'slow' | 'error';
  neuralMessage?: string;
  neuralP50Ms?: number;
  neuralP95Ms?: number;
}

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}
