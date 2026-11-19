/**
 * TG Plus Real-Time Voice Changer DSP Engine
 *
 * Uses a real-time 2048-pt Identity-Phase-Locked STFT Phase Vocoder AudioWorklet
 * with independent log-magnitude Spectral Envelope (Formant) Warping,
 * Adaptive Female F0 calibration, chest-mud highpass, vocal tract F1/F2/F3 shaping,
 * sibilance de-esser, and broadcast dynamics compressor.
 */

import { VoiceChangerState, VoicePreset, BuiltinPresetKey, VoiceGender } from '../types/voiceChanger';
import type { NeuralVoiceSession, NeuralUpdate } from './neuralVoice/NeuralVoiceSession';

export const BUILTIN_VOICE_PRESETS: Record<BuiltinPresetKey, VoicePreset> = {
  ai_female: {
    id: 'ai_female', name: 'AI Woman', gender: 'female',
    description: 'Local neural conversion. Optional 26 MB download and device speed check.',
    pitchShift: 5, formantShift: 3, tone: 0, resonance: 0, vibrato: 0,
    noiseGateThreshold: -52, enhancement: true, reverbAmount: 0, icon: 'Cpu',
  },
  natural_female: {
    id: 'natural_female',
    name: 'Natural Woman',
    gender: 'female',
    description: 'Adult feminine tone with adaptive pitch and independent vocal tract shaping.',
    pitchShift: 5,
    formantShift: 3,
    tone: 1,
    resonance: 4,
    vibrato: 0,
    noiseGateThreshold: -52,
    enhancement: true,
    reverbAmount: 0,
    icon: 'User',
  },
  soft_female: {
    id: 'soft_female',
    name: 'Soft & Sweet Female',
    gender: 'female',
    description: 'Gentle feminine tone (212 Hz target, 1.22x vocal tract) with warm air and smooth highs.',
    pitchShift: 6,
    formantShift: 3,
    tone: 0,
    resonance: 3,
    vibrato: 0,
    noiseGateThreshold: -52,
    enhancement: true,
    reverbAmount: 0,
    icon: 'Feather',
  },
  bright_female: {
    id: 'bright_female',
    name: 'Warm Alto Female',
    gender: 'female',
    description: 'Lower feminine tone with gentle vocal tract shaping.',
    pitchShift: 5,
    formantShift: 3,
    tone: 2,
    resonance: 5,
    vibrato: 0,
    noiseGateThreshold: -50,
    enhancement: true,
    reverbAmount: 0,
    icon: 'Mic2',
  },
  natural_male: {
    id: 'natural_male',
    name: 'Natural Male',
    gender: 'male',
    description: 'Masculine speaking timbre (-3 st, chest formant lengthening & body).',
    pitchShift: -3,
    formantShift: -3,
    tone: -2,
    resonance: 5,
    vibrato: 0,
    noiseGateThreshold: -50,
    enhancement: true,
    reverbAmount: 0,
    icon: 'User',
  },
  deep_voice: {
    id: 'deep_voice',
    name: 'Deep Baritone',
    gender: 'male',
    description: 'Rich deep baritone (-6 st) with broadened vocal tract and chest resonance.',
    pitchShift: -6,
    formantShift: -5,
    tone: -4,
    resonance: 7,
    vibrato: 0,
    noiseGateThreshold: -48,
    enhancement: true,
    reverbAmount: 0,
    icon: 'Mic2',
  },
  soft_voice: {
    id: 'soft_voice',
    name: 'Soft Neutral',
    gender: 'neutral',
    description: 'Balanced warm voice (+1 st) with gentle compression.',
    pitchShift: 1,
    formantShift: 1,
    tone: 1,
    resonance: 2,
    vibrato: 0,
    noiseGateThreshold: -52,
    enhancement: true,
    reverbAmount: 0,
    icon: 'Feather',
  },
  radio_military: {
    id: 'radio_military',
    name: 'Comms Radio',
    gender: 'neutral',
    description: 'Crisp midrange broadcast clarity with controlled bandwidth.',
    pitchShift: 0,
    formantShift: 1,
    tone: 4,
    resonance: 6,
    vibrato: 0,
    noiseGateThreshold: -44,
    enhancement: true,
    reverbAmount: 0,
    icon: 'Radio',
  },
  studio_warmth: {
    id: 'studio_warmth',
    name: 'Studio Clean',
    gender: 'neutral',
    description: 'Natural unprocessed pitch with clean noise floor & broadcast polish.',
    pitchShift: 0,
    formantShift: 0,
    tone: 1,
    resonance: 3,
    vibrato: 0,
    noiseGateThreshold: -52,
    enhancement: true,
    reverbAmount: 0,
    icon: 'Disc',
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    gender: 'neutral',
    description: 'Custom pitch, formant, and vocal tract curve.',
    pitchShift: 0,
    formantShift: 0,
    tone: 0,
    resonance: 0,
    vibrato: 0,
    noiseGateThreshold: -50,
    enhancement: true,
    reverbAmount: 0,
    icon: 'Sliders',
  },
};

const STORAGE_KEY_STATE = 'tgplus_voice_changer_state_v3';
const STORAGE_KEY_CUSTOM_PRESETS = 'tgplus_custom_voice_presets_v2';

/**
 * Self-contained 2048-pt Identity-Phase-Locked STFT Phase Vocoder + YIN Sub-Hz F0 Tracker
 * + Voiced/Unvoiced Hybrid Consonant Preservation + Spectral Formant Envelope Warper.
 * Runs in an AudioWorklet with a 10.6ms hop and 42.7ms analysis window at 48kHz.
 */
const PHASE_VOCODER_WORKLET_CODE = `
class FormantPhaseVocoderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitchRatio', defaultValue: 1.0, minValue: 0.4, maxValue: 2.5, automationRate: 'k-rate' },
      { name: 'formantRatio', defaultValue: 1.0, minValue: 0.5, maxValue: 1.8, automationRate: 'k-rate' },
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gateThreshold', defaultValue: 0.0025, minValue: 0.0, maxValue: 0.1, automationRate: 'k-rate' },
      { name: 'femaleCalibration', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'femaleTargetHz', defaultValue: 198, minValue: 150, maxValue: 245, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.N = 2048;
    this.H = 512; // 75% overlap (~10.6ms hop @ 48kHz, 23.4Hz bin resolution)
    this.HALF = this.N >> 1;
    this.OUT_SIZE = this.N * 2;
    this.TWO_PI = 2.0 * Math.PI;

    this.inputRing = new Float32Array(this.N);
    this.inWrite = 0;
    this.hopSamples = 0;

    this.outRing = new Float32Array(this.OUT_SIZE);
    this.outRead = 0;
    this.outWrite = this.H;

    // Precompute Root-Hann analysis/synthesis window
    this.win = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      const hann = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / this.N));
      this.win[i] = Math.sqrt(hann);
    }

    // Radix-2 FFT tables (log2(2048) = 11)
    this.bitRev = new Uint16Array(this.N);
    const log2N = 11;
    for (let i = 0; i < this.N; i++) {
      let r = 0;
      let v = i;
      for (let b = 0; b < log2N; b++) {
        r = (r << 1) | (v & 1);
        v >>= 1;
      }
      this.bitRev[i] = r;
    }

    this.cosStage = [];
    this.sinStage = [];
    for (let size = 2; size <= this.N; size <<= 1) {
      const half = size >> 1;
      const cArr = new Float32Array(half);
      const sArr = new Float32Array(half);
      const step = (-2.0 * Math.PI) / size;
      for (let j = 0; j < half; j++) {
        cArr[j] = Math.cos(step * j);
        sArr[j] = Math.sin(step * j);
      }
      this.cosStage.push(cArr);
      this.sinStage.push(sArr);
    }

    this.timeFrame = new Float32Array(this.N);
    this.re = new Float32Array(this.N);
    this.im = new Float32Array(this.N);
    this.mag = new Float32Array(this.HALF + 1);
    this.phase = new Float32Array(this.HALF + 1);
    this.prevInPhase = new Float32Array(this.HALF + 1);
    this.instFreq = new Float32Array(this.HALF + 1);
    this.logMag = new Float32Array(this.HALF + 1);
    this.env = new Float32Array(this.HALF + 1);
    this.nearestPeak = new Int16Array(this.HALF + 1);
    this.peakSynPhase = new Float32Array(this.HALF + 1);
    this.peakActive = new Uint8Array(this.HALF + 1);
    this.peaks = new Int16Array(this.HALF + 1);
    this.prevOutPhase = new Float32Array(this.HALF + 1);
    this.nextOutPhase = new Float32Array(this.HALF + 1);
    this.outMag = new Float32Array(this.HALF + 1);

    // YIN time-domain pitch tracking buffer
    this.yinWin = 1024;
    this.yinMaxLag = Math.min(720, Math.ceil(sampleRate / 72));
    this.yinDiff = new Float32Array(this.yinMaxLag + 2);

    this.expectAdv = (this.TWO_PI * this.H) / this.N;
    this.gateGain = 1.0;
    this.smoothPitchRatio = 1.0;
    this.detectedF0 = 0;
    this.voicingClarity = 0;
    this.telemetryCounter = 0;
    this.pitchAnalysisHops = 0;
  }

  wrapPhase(ph) {
    let x = ph % this.TWO_PI;
    if (x > Math.PI) x -= this.TWO_PI;
    else if (x < -Math.PI) x += this.TWO_PI;
    return x;
  }

  fft(inverse) {
    const N = this.N;
    const re = this.re;
    const im = this.im;
    const bitRev = this.bitRev;

    for (let i = 0; i < N; i++) {
      const j = bitRev[i];
      if (i < j) {
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }

    let stageIdx = 0;
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1;
      const cArr = this.cosStage[stageIdx];
      const sArr = this.sinStage[stageIdx];
      stageIdx++;

      for (let start = 0; start < N; start += size) {
        for (let k = 0; k < half; k++) {
          const even = start + k;
          const odd = even + half;
          const c = cArr[k];
          const s = inverse ? -sArr[k] : sArr[k];

          const tre = c * re[odd] - s * im[odd];
          const tim = c * im[odd] + s * re[odd];

          re[odd] = re[even] - tre;
          im[odd] = im[even] - tim;
          re[even] += tre;
          im[even] += tim;
        }
      }
    }

    if (inverse) {
      const invN = 1.0 / N;
      for (let i = 0; i < N; i++) {
        re[i] *= invN;
        im[i] *= invN;
      }
    }
  }

  interpArray(arr, fracIdx) {
    if (fracIdx <= 0) return arr[0];
    if (fracIdx >= this.HALF) return arr[this.HALF];
    const i0 = Math.floor(fracIdx);
    const i1 = i0 + 1;
    const t = fracIdx - i0;
    return arr[i0] * (1.0 - t) + arr[i1] * t;
  }

  estimateYinPitch() {
    // Keep both sides of every lag comparison inside the analysis frame.
    const W = 768;
    const minLag = Math.max(24, Math.floor(sampleRate / 360));
    const maxLag = Math.min(this.yinMaxLag - 1, Math.floor(sampleRate / 72));
    const start = this.N - W - maxLag;
    const tf = this.timeFrame;
    const diff = this.yinDiff;

    let energy = 0;
    for (let i = 0; i < W; i++) {
      const v = tf[start + i];
      energy += v * v;
    }
    if (energy < 1e-4) {
      this.voicingClarity *= 0.6;
      return;
    }

    diff[0] = 1.0;
    let runningSum = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      let d = 0;
      for (let i = 0; i < W; i += 2) {
        const delta = tf[start + i] - tf[start + i + tau];
        d += delta * delta;
      }
      runningSum += d;
      diff[tau] = runningSum > 0 ? (d * tau) / runningSum : 1.0;
    }

    // Find first valley below threshold 0.22 (classic YIN step)
    let bestTau = -1;
    let minVal = 1.0;
    for (let tau = minLag; tau <= maxLag; tau++) {
      const val = diff[tau];
      if (val < 0.24) {
        while (tau + 1 <= maxLag && diff[tau + 1] < diff[tau]) {
          tau++;
        }
        bestTau = tau;
        minVal = diff[tau];
        break;
      }
      if (val < minVal) {
        minVal = val;
        bestTau = tau;
      }
    }

    const clarity = Math.max(0, Math.min(1, 1.0 - minVal * 1.8));
    this.voicingClarity = this.voicingClarity * 0.45 + clarity * 0.55;

    if (bestTau > minLag && bestTau < maxLag && minVal < 0.42) {
      // Parabolic interpolation around bestTau for sub-sample accuracy
      const s0 = diff[bestTau - 1];
      const s1 = diff[bestTau];
      const s2 = diff[bestTau + 1];
      const denom = 2.0 * (2.0 * s1 - s2 - s0);
      const shift = Math.abs(denom) > 1e-6 ? (s2 - s0) / denom : 0;
      const exactTau = bestTau + Math.max(-0.5, Math.min(0.5, shift));
      const f0 = sampleRate / exactTau;
      if (f0 >= 70 && f0 <= 360) {
        this.detectedF0 = this.detectedF0 > 0 ? this.detectedF0 * 0.72 + f0 * 0.28 : f0;
      }
    }
  }

  processHop(pitchRatio, formantRatio, femaleCalibration, femaleTargetHz) {
    const N = this.N;
    const HALF = this.HALF;
    const win = this.win;
    const re = this.re;
    const im = this.im;
    const tf = this.timeFrame;

    // 1. Copy latest N samples & apply analysis window
    for (let i = 0; i < N; i++) {
      const idx = (this.inWrite + i) % N;
      const sample = this.inputRing[idx];
      tf[i] = sample;
      re[i] = sample * win[i];
      im[i] = 0;
    }

    // 2. Sub-Hz YIN F0 & Voicing Clarity
    // A 21ms pitch update is sufficient for speech and halves the YIN work.
    if ((this.pitchAnalysisHops++ & 1) === 0) this.estimateYinPitch();

    // 3. Forward FFT
    this.fft(false);

    // 4. Polar analysis & phase unwrapping
    const mag = this.mag;
    const phase = this.phase;
    const prevInPhase = this.prevInPhase;
    const instFreq = this.instFreq;
    const logMag = this.logMag;

    let lowE = 0;
    let highE = 0;
    const binHz = sampleRate / N;
    const splitBin = Math.floor(2800 / binHz);

    for (let k = 0; k <= HALF; k++) {
      const r = re[k];
      const m = im[k];
      const a = Math.hypot(r, m);
      const p = Math.atan2(m, r);
      mag[k] = a;
      phase[k] = p;
      logMag[k] = Math.log(a + 1e-6);

      if (k > 1 && k < splitBin) lowE += a;
      else if (k >= splitBin && k < HALF) highE += a;

      let dPhi = p - prevInPhase[k] - k * this.expectAdv;
      dPhi = dPhi - Math.round(dPhi / this.TWO_PI) * this.TWO_PI;
      instFreq[k] = k * this.expectAdv + dPhi;
      prevInPhase[k] = p;
    }

    // Spectral voiced vs unvoiced safeguard (if high-freq fricatives dominate, preserve transients)
    const fricativeRatio = highE / (lowE + highE + 1e-5);
    const voicedConfidence = Math.max(
      0,
      Math.min(1, this.voicingClarity * (1.0 - Math.max(0, fricativeRatio - 0.35) * 1.6))
    );

    // Adaptive Female F0 calibration: gently guides real speech into natural female range without chipmunking
    let targetRatio = pitchRatio;
    // Use a slowly learned baseline so conversion keeps the speaker\'s intonation.
    if (voicedConfidence > 0.6 && this.detectedF0 >= 72 && this.detectedF0 <= 360) {
      this.sourceBaselineHz = this.sourceBaselineHz ? this.sourceBaselineHz * 0.99 + this.detectedF0 * 0.01 : this.detectedF0;
    }
    if (
      femaleCalibration > 0.5 &&
      voicedConfidence > 0.45 &&
      this.detectedF0 >= 72 &&
      this.detectedF0 <= 360
    ) {
      const idealRatio = femaleTargetHz / (this.sourceBaselineHz || this.detectedF0);
      const minBound = 0.85;
      const maxBound = Math.min(1.9, pitchRatio * 1.12);
      const clampedIdeal = Math.max(minBound, Math.min(maxBound, idealRatio));
      targetRatio = clampedIdeal;
    }
    this.smoothPitchRatio += (targetRatio - this.smoothPitchRatio) * 0.065;
    const activePitch = this.smoothPitchRatio;

    // 5. Smooth log-spectral envelope (finer resolution preserves F1/F2/F3 vocal tract shape accurately)
    const env = this.env;
    for (let k = 0; k <= HALF; k++) {
      const harmonicWidth = Math.max(6, Math.min(18, Math.ceil((this.detectedF0 || 150) / binHz)));
      const radius = k < 150 ? harmonicWidth : Math.max(10, harmonicWidth);
      let sum = 0;
      let wSum = 0;
      const lo = Math.max(0, k - radius);
      const hi = Math.min(HALF, k + radius);
      for (let j = lo; j <= hi; j++) {
        const w = radius + 1 - Math.abs(j - k);
        sum += logMag[j] * w;
        wSum += w;
      }
      env[k] = Math.exp(sum / (wSum || 1));
    }

    // 6. Find spectral peaks for Scaled Rigid Identity Phase Locking
    const nearestPeak = this.nearestPeak;
    const peakSynPhase = this.peakSynPhase;
    const prevOutPhase = this.prevOutPhase;

    // Every bin locks to a real local peak. A window maximum can point at a
    // non-peak with stale synthesis phase, which produces a metallic buzz.
    let peakCount = 0;
    for (let k = 1; k < HALF; k++) {
      if (mag[k] >= mag[k - 1] && mag[k] > mag[k + 1]) {
        this.peaks[peakCount++] = k;
        const dstPeak = Math.max(1, Math.min(HALF - 1, Math.round(k * activePitch)));
        peakSynPhase[k] = this.wrapPhase((this.peakActive[k] ? peakSynPhase[k] : prevOutPhase[dstPeak]) + instFreq[k] * activePitch);
        this.peakActive[k] = 1;
      } else this.peakActive[k] = 0;
    }
    if (!peakCount) this.peaks[peakCount++] = 1;
    let peakIndex = 0;
    for (let k = 0; k <= HALF; k++) {
      while (peakIndex + 1 < peakCount && k > (this.peaks[peakIndex] + this.peaks[peakIndex + 1]) / 2) peakIndex++;
      nearestPeak[k] = this.peaks[peakIndex];
    }

    // 7. Hybrid Voiced/Unvoiced Spectral Resampling + Formant Warping + Glottal Tilt
    const outMag = this.outMag;
    const nextOutPhase = this.nextOutPhase;
    const isFemale = femaleCalibration > 0.5;
    // Hysteresis avoids mixing an original low fundamental under shifted vowels.
    if(voicedConfidence>.55)this.voicedMode=true;
    else if(voicedConfidence<.20)this.voicedMode=false;
    const voicedMask=this.voicedMode?1:0;

    for (let k = 1; k < HALF; k++) {
      const freqHz = k * binHz;

      // Preserve crisp natural unvoiced fricatives/consonants above ~4.6kHz or during unvoiced frames
      const hfFricative = freqHz > 4600 ? Math.min(1, (freqHz - 4600) / 2400) : 0;
      const harmonicBlend = voicedMask * (1.0 - hfFricative * 0.88);

      const src = k / activePitch;
      let shiftedMag = mag[k];
      let harmonicPhase = phase[k];

      if (src >= 1.0 && src < HALF - 1) {
        shiftedMag = this.interpArray(mag, src);
        const srcInt = Math.max(1, Math.min(HALF - 1, Math.round(src)));
        const pBin = nearestPeak[srcInt];
        harmonicPhase = this.wrapPhase(peakSynPhase[pBin] + (phase[srcInt] - phase[pBin]));
      }

      // Independent Vocal Tract Formant Envelope Substitution (decoupled from pitch!)
      const sibBlend = freqHz > 5000 ? Math.max(0.12, 1.0 - (freqHz - 5000) / 3200) : 1.0;
      const effectiveFormant = 1.0 + (formantRatio - 1.0) * sibBlend;

      const envSrcIdx = src >= 1.0 && src < HALF - 1 ? src : k;
      const envFromSrc = this.interpArray(env, envSrcIdx * harmonicBlend + k * (1.0 - harmonicBlend));
      const envTarget = this.interpArray(env, k / effectiveFormant);
      let envScale = (envTarget + 1e-5) / (envFromSrc + 1e-5);
      if (envScale > 2.4) envScale = 2.4;
      if (envScale < 0.4) envScale = 0.4;

      // Subtle Female Glottal Spectral Tilt: warmer F0 body, less pinched mid-nasal buzz, soft air
      const tiltScale = isFemale ? Math.pow(Math.max(150,freqHz)/150,-.025) : 1;

      // Crossfade complex spectra so consonants retain their own phase.
      // Interpolating an angle with unrelated magnitudes causes phase smearing.
      const wetMag = shiftedMag * envScale * tiltScale;
      const dryMag = mag[k];
      const real = wetMag * Math.cos(harmonicPhase) * harmonicBlend + dryMag * Math.cos(phase[k]) * (1 - harmonicBlend);
      const imaginary = wetMag * Math.sin(harmonicPhase) * harmonicBlend + dryMag * Math.sin(phase[k]) * (1 - harmonicBlend);
      outMag[k] = Math.hypot(real, imaginary);
      nextOutPhase[k] = Math.atan2(imaginary, real);
    }

    // Reconstruct Hermitian spectrum
    re[0] = isFemale ? 0 : mag[0] * Math.cos(phase[0]);
    im[0] = 0;
    for (let k = 1; k < HALF; k++) {
      const m = outMag[k];
      const ph = nextOutPhase[k];
      const c = m * Math.cos(ph);
      const s = m * Math.sin(ph);
      re[k] = c;
      im[k] = s;
      re[N - k] = c;
      im[N - k] = -s;
      prevOutPhase[k] = ph;
    }
    re[HALF] = 0;
    im[HALF] = 0;

    // 8. Inverse FFT & COLA Root-Hann Overlap-Add
    this.fft(true);
    const outRing = this.outRing;
    const OUT_SIZE = this.OUT_SIZE;
    const colaNorm = 0.5;

    for (let i = 0; i < N; i++) {
      const pos = (this.outWrite + i) % OUT_SIZE;
      outRing[pos] += re[i] * win[i] * colaNorm;
    }
    this.outWrite = (this.outWrite + this.H) % OUT_SIZE;

    // Telemetry updates (~4 times/sec)
    this.telemetryCounter++;
    if (this.telemetryCounter >= 12) {
      this.telemetryCounter = 0;
      const inF0 = this.voicingClarity > 0.35 ? Math.round(this.detectedF0) : 0;
      const outF0 = inF0 > 0 ? Math.round(inF0 * activePitch) : 0;
      this.port.postMessage({ inputHz: inF0, outputHz: outF0 });
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inCh = input[0];
    const outCh = output[0];
    const len = inCh.length;

    const pitchRatio = parameters.pitchRatio[0];
    const formantRatio = parameters.formantRatio[0];
    const isEnabled = parameters.enabled[0] >= 0.5;
    const gateThresh = parameters.gateThreshold[0];
    const femaleCalibration = parameters.femaleCalibration[0];
    const femaleTargetHz = parameters.femaleTargetHz[0];
    const bypass = !isEnabled || (Math.abs(pitchRatio - 1.0) < 0.01 && Math.abs(formantRatio - 1.0) < 0.01);
    if (this.wasBypassed !== bypass) {
      // Do not replay an old overlap buffer after toggling effects during a call.
      this.outRing.fill(0);
      this.peakActive.fill(0);
      this.prevInPhase.fill(0);
      this.prevOutPhase.fill(0);
      this.outRead = 0;
      this.outWrite = this.H;
      this.hopSamples = 0;
      this.wasBypassed = bypass;
    }

    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      sumSq += inCh[i] * inCh[i];
    }
    const rms = Math.sqrt(sumSq / len);
    const targetGate = rms >= gateThresh ? 1.0 : 0.18;
    const gateCoeff = targetGate > this.gateGain ? 0.35 : 0.04;

    // Clean dry pass-through when disabled (or unity ratio)
    if (bypass) {
      for (let i = 0; i < len; i++) {
        const s = inCh[i];
        this.inputRing[this.inWrite] = s;
        this.inWrite = (this.inWrite + 1) % this.N;
        outCh[i] = s;
      }
      for (let c = 1; c < output.length; c++) output[c].set(outCh);
      return true;
    }

    for (let i = 0; i < len; i++) {
      this.gateGain += (targetGate - this.gateGain) * gateCoeff;
      this.inputRing[this.inWrite] = inCh[i] * this.gateGain;
      this.inWrite = (this.inWrite + 1) % this.N;
      this.hopSamples++;

      if (this.hopSamples >= this.H) {
        this.hopSamples = 0;
        this.processHop(pitchRatio, formantRatio, femaleCalibration, femaleTargetHz);
      }

      const val = this.outRing[this.outRead];
      this.outRing[this.outRead] = 0;
      this.outRead = (this.outRead + 1) % this.OUT_SIZE;
      outCh[i] = Math.max(-0.98, Math.min(0.98, val));
    }

    for (let c = 1; c < output.length; c++) {
      output[c].set(outCh);
    }

    return true;
  }
}

registerProcessor('formant-phase-vocoder-processor', FormantPhaseVocoderProcessor);
`;

export class VoiceChangerEngine {
  private static instance: VoiceChangerEngine | null = null;

  public audioContext: AudioContext | null = null;
  public micStream: MediaStream | null = null;
  public sourceNode: MediaStreamAudioSourceNode | null = null;

  private highpassFilter: BiquadFilterNode | null = null;
  private pitchWorkletNode: AudioWorkletNode | null = null;
  private workletLoaded = false;
  private processorFailed = false;
  private dryGain: GainNode | null = null;
  private neuralGain: GainNode | null = null;
  private neuralFilters: BiquadFilterNode[] = [];
  private neuralSession: NeuralVoiceSession | null = null;
  private neuralPromise: Promise<void> | null = null;
  private neuralGeneration = 0;
  private neuralBlocked = false;

  // Multi-band Vocal Tract Conditioning & De-Esser
  private chestCutFilter: BiquadFilterNode | null = null;
  private formantF1Filter: BiquadFilterNode | null = null;
  private formantF2Filter: BiquadFilterNode | null = null;
  private formantF3Filter: BiquadFilterNode | null = null;
  private deEsserFilter: BiquadFilterNode | null = null;
  private toneLowShelf: BiquadFilterNode | null = null;
  private toneHighShelf: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  // Persistent Outputs
  public analyserNode: AnalyserNode | null = null;
  public destinationNode: MediaStreamAudioDestinationNode | null = null;
  private livePreviewGain: GainNode | null = null;

  private state: VoiceChangerState;
  private listeners: Set<(state: VoiceChangerState) => void> = new Set();
  private isProcessing = false;
  private initPromise: Promise<boolean> | null = null;

  private constructor() {
    this.state = this.loadInitialState();
  }

  public static getInstance(): VoiceChangerEngine {
    if (!VoiceChangerEngine.instance) {
      VoiceChangerEngine.instance = new VoiceChangerEngine();
    }
    return VoiceChangerEngine.instance;
  }

  private loadInitialState(): VoiceChangerState {
    const savedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_PRESETS);
    let customPresets: VoicePreset[] = [];
    if (savedCustom) {
      try {
        customPresets = JSON.parse(savedCustom);
      } catch {
        customPresets = [];
      }
    }

    const defaultPreset = BUILTIN_VOICE_PRESETS.natural_female;
    const baseState: VoiceChangerState = {
      enabled: false,
      selectedPresetId: 'natural_female',
      gender: defaultPreset.gender,
      pitchShift: defaultPreset.pitchShift,
      formantShift: defaultPreset.formantShift,
      tone: defaultPreset.tone,
      resonance: defaultPreset.resonance,
      vibrato: defaultPreset.vibrato,
      noiseGateThreshold: defaultPreset.noiseGateThreshold,
      enhancement: defaultPreset.enhancement,
      reverbAmount: defaultPreset.reverbAmount,
      livePreview: false,
      selectedMicId: 'default',
      selectedOutputId: 'default',
      customPresets,
      isReady: false,
      lastError: null,
      detectedInputHz: 0,
      outputPitchHz: 0,
      activeEngine: 'original', neuralStatus: 'idle', neuralMessage: '',
    };

    const saved = localStorage.getItem(STORAGE_KEY_STATE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...baseState,
          ...parsed,
          livePreview: false,
          isReady: false,
          lastError: null,
          detectedInputHz: 0,
          outputPitchHz: 0,
          activeEngine: 'original', neuralStatus: 'idle', neuralMessage: '',
          neuralP50Ms: undefined, neuralP95Ms: undefined,
          customPresets,
        };
      } catch {
        return baseState;
      }
    }
    return baseState;
  }

  public getState(): VoiceChangerState {
    return { ...this.state };
  }

  public getLastError(): string | null {
    return this.state.lastError || null;
  }

  public subscribe(listener: (state: VoiceChangerState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(persist = true) {
    if (persist) {
      try {
        const toSave = { ...this.state };
        delete toSave.isReady;
        delete toSave.lastError;
        delete toSave.detectedInputHz;
        delete toSave.outputPitchHz;
        delete toSave.activeEngine; delete toSave.neuralStatus; delete toSave.neuralMessage;
        delete toSave.neuralP50Ms; delete toSave.neuralP95Ms;
        localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(toSave));
      } catch {
        // ignore storage error
      }
    }
    this.listeners.forEach((l) => l({ ...this.state }));
  }

  private hasLiveMic(): boolean {
    return Boolean(
      this.micStream &&
        this.micStream.getAudioTracks().some((t) => t.readyState === 'live')
    );
  }

  public async initialize(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initializeInternal().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async _initializeInternal(): Promise<boolean> {
    try {
      this.state.lastError = null;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access requires HTTPS or localhost in this browser.');
      }

      if (!this.audioContext || this.audioContext.state === "closed") {
        this.workletLoaded = false; this.processorFailed = false; this.destinationNode = null; this.isProcessing = false;
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioContext = new AudioCtx({ latencyHint: 'interactive' });
      }

      if (this.audioContext.state !== 'running') {
        await this.audioContext.resume();
      }

      if (!this.workletLoaded && this.audioContext.audioWorklet) {
        try {
          const blob = new Blob([PHASE_VOCODER_WORKLET_CODE], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          try { await this.audioContext.audioWorklet.addModule(url); }
          finally { URL.revokeObjectURL(url); }
          this.workletLoaded = true;
        } catch (err) {
          console.warn('Blob AudioWorklet load failed, trying data URI:', err);
          try {
            const dataUrl = `data:application/javascript;base64,${btoa(unescape(encodeURIComponent(PHASE_VOCODER_WORKLET_CODE)))}`;
            await this.audioContext.audioWorklet.addModule(dataUrl);
            this.workletLoaded = true;
          } catch (err2) {
            console.warn('AudioWorklet fallback active (EQ only):', err2);
          }
        }
      }

      await this.acquireMicrophone();
      this.buildDspGraph();
      this.applyCurrentSettings();

      if (this.audioContext.state !== "running") throw new Error("Microphone audio is paused. Tap Record or enable the voice changer again.");
      this.state.isReady = true;
      if (this.state.enabled && !this.pitchWorkletNode) {
        this.state.enabled = false;
        this.state.lastError = 'Live pitch effects are unavailable in this browser. Your microphone still works with its original voice.';
      } else this.state.lastError = null;
      this.notify(false);
      await this.syncNeuralMode();
      await this.waitForNeuralAudio();
      return true;
    } catch (err) {
      const msg = (err as Error)?.message || 'Could not access microphone.';
      this.state.isReady = false;
      this.state.lastError = (err as Error).name === 'NotAllowedError' || msg.includes('Permission') || msg.includes('NotAllowed')
        ? 'Microphone permission blocked. Allow mic access in browser settings.'
        : msg;
      this.notify(false);
      return false;
    }
  }

  public async ensureReadyForCapture(): Promise<boolean> {
    if (!this.audioContext || this.audioContext.state === "closed" || !this.hasLiveMic() || !this.isProcessing) {
      return await this.initialize();
    }
    if (this.audioContext.state !== 'running') {
      try {
        await this.audioContext.resume();
      } catch {
        // ignore
      }
    }
    this.applyCurrentSettings();
    await this.syncNeuralMode();
    await this.waitForNeuralAudio();
    return this.hasLiveMic() && this.audioContext.state === "running";
  }

  private async acquireMicrophone(): Promise<MediaStream> {
    const previousStream = this.micStream;

    const baseAudio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      channelCount: 1,
    };

    if (this.state.selectedMicId && this.state.selectedMicId !== 'default') {
      baseAudio.deviceId = { exact: this.state.selectedMicId };
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
    } catch (error) {
      if (!["OverconstrainedError", "NotFoundError"].includes((error as Error).name)) throw error;
      this.state.selectedMicId = "default";
      // Retry without exact deviceId in case saved device was unplugged
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
    }

    this.micStream = stream;
    previousStream?.getTracks().forEach(track => track.stop());
    if (this.audioContext) {
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch {
          // ignore
        }
      }
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    }
    return stream;
  }

  public async startMicrophone(): Promise<MediaStream | null> {
    const ok = await this.initialize();
    return ok ? this.micStream : null;
  }

  private waitForNeuralAudio(): Promise<void> {
    if (this.state.neuralStatus !== 'buffering') return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => { clearTimeout(timer); unsubscribe(); resolve(); };
      const unsubscribe = this.subscribe(state => { if (state.neuralStatus !== 'buffering') finish(); });
      const timer = setTimeout(() => {
        if (this.state.neuralStatus === 'buffering') {
          this.neuralBlocked = true; this.neuralSession?.dispose();
          this.state.neuralStatus = 'error';
          this.state.neuralMessage = 'AI audio did not start. Lightweight effects are active.';
          this.applyCurrentSettings(); this.notify(false);
        }
        finish();
      }, 1000);
    });
  }

  private stopNeuralMode() {
    this.neuralGeneration++;
    this.neuralSession?.dispose(); this.neuralSession = null;
    this.neuralPromise = null;
    if (this.neuralFilters[0]) { try { this.highpassFilter?.disconnect(this.neuralFilters[0]); } catch { /* Graph may have already changed. */ } }
    for (const filter of this.neuralFilters) filter.disconnect();
    this.neuralFilters = [];
    this.state.neuralStatus = 'idle'; this.state.neuralMessage = '';
  }

  private syncNeuralMode(retry = false): Promise<void> {
    if (!this.state.enabled || this.state.selectedPresetId !== 'ai_female') {
      this.stopNeuralMode(); this.neuralBlocked = false; this.applyCurrentSettings();
      return Promise.resolve();
    }
    if (!this.audioContext?.audioWorklet || !this.isProcessing) return Promise.resolve();
    if (retry) { this.stopNeuralMode(); this.neuralBlocked = false; }
    if (this.neuralPromise) return this.neuralPromise;
    if (this.neuralSession || this.neuralBlocked) return Promise.resolve();
    const generation = ++this.neuralGeneration;
    const pending = this.startNeuralMode(generation);
    this.neuralPromise = pending;
    void pending.finally(() => { if (this.neuralPromise === pending) this.neuralPromise = null; });
    return pending;
  }

  private async startNeuralMode(generation: number) {
    try {
      const { NeuralVoiceSession } = await import('./neuralVoice/NeuralVoiceSession');
      if (generation !== this.neuralGeneration) return;
      const context = this.audioContext!;
      const session = new NeuralVoiceSession(context, (update: NeuralUpdate) => {
        if (generation !== this.neuralGeneration) return;
        this.state.neuralStatus = update.status;
        this.state.neuralMessage = update.message || '';
        if (update.p50ms !== undefined) this.state.neuralP50Ms = update.p50ms;
        if (update.p95ms !== undefined) this.state.neuralP95Ms = update.p95ms;
        if (update.status === 'error' || update.status === 'slow') this.neuralBlocked = true;
        this.applyCurrentSettings(); this.notify(false);
      });
      this.neuralSession = session;
      const ready = await session.start();
      if (!ready || generation !== this.neuralGeneration) { session.dispose(); if (this.neuralSession === session) this.neuralSession = null; return; }
      // Two lowpasses suppress aliasing when converting 44.1/48 kHz input to 16 kHz.
      this.neuralFilters = [context.createBiquadFilter(), context.createBiquadFilter()];
      for (const filter of this.neuralFilters) { filter.type = 'lowpass'; filter.frequency.value = 6500; filter.Q.value = .707; }
      this.highpassFilter!.connect(this.neuralFilters[0]);
      this.neuralFilters[0].connect(this.neuralFilters[1]);
      this.neuralFilters[1].connect(session.node!);
      session.node!.connect(this.neuralGain!);
      session.activate();
    } catch (error) {
      if (generation !== this.neuralGeneration) return;
      this.neuralBlocked = true;
      this.neuralSession?.dispose(); this.neuralSession = null;
      this.state.neuralStatus = 'error';
      this.state.neuralMessage = (error as Error).message || 'AI unavailable. Lightweight effects are active.';
      this.applyCurrentSettings(); this.notify(false);
    }
  }

  public async retryNeuralVoice() {
    if (this.state.selectedPresetId !== 'ai_female') this.setPreset('ai_female');
    this.state.enabled = true;
    if (!this.isProcessing) await this.initialize();
    await this.syncNeuralMode(true);
    this.notify();
  }

  private teardownDspNodes() {
    const nodes: (AudioNode | null)[] = [
      this.highpassFilter,
      this.pitchWorkletNode,
      this.chestCutFilter,
      this.formantF1Filter,
      this.formantF2Filter,
      this.formantF3Filter,
      this.deEsserFilter,
      this.toneLowShelf,
      this.toneHighShelf,
      this.compressor,
      this.analyserNode,
      this.livePreviewGain,
      this.dryGain, this.neuralGain, ...this.neuralFilters,
    ];
    for (const n of nodes) {
      if (n) {
        try {
          n.disconnect();
        } catch {
          // ignore
        }
      }
    }
    this.pitchWorkletNode = null;
  }

  private buildDspGraph() {
    if (!this.audioContext || !this.sourceNode) return;

    this.stopNeuralMode();
    this.teardownDspNodes();

    try {
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 110;

      if (this.workletLoaded && !this.processorFailed) {
        this.pitchWorkletNode = new AudioWorkletNode(this.audioContext, 'formant-phase-vocoder-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        this.pitchWorkletNode.onprocessorerror = () => {
          this.state.enabled = false; this.state.lastError = "Voice effects stopped. Your original mic is active; tap Power to retry.";
          this.processorFailed = true;
          this.sourceNode?.disconnect(); this.buildDspGraph(); this.applyCurrentSettings(); this.notify(false);
        };
        this.pitchWorkletNode.port.onmessage = (ev) => {
          const { inputHz, outputHz } = ev.data || {};
          if (typeof inputHz === 'number' && typeof outputHz === 'number') {
            if (
              inputHz !== this.state.detectedInputHz ||
              outputHz !== this.state.outputPitchHz
            ) {
              this.state.detectedInputHz = inputHz;
              this.state.outputPitchHz = outputHz;
              this.notify(false);
            }
          }
        };
      }

      this.chestCutFilter = this.audioContext.createBiquadFilter();
      this.chestCutFilter.type = 'peaking';
      this.chestCutFilter.frequency.value = 215;
      this.chestCutFilter.Q.value = 1.0;

      this.formantF1Filter = this.audioContext.createBiquadFilter();
      this.formantF1Filter.type = 'peaking';
      this.formantF1Filter.frequency.value = 680;
      this.formantF1Filter.Q.value = 1.2;

      this.formantF2Filter = this.audioContext.createBiquadFilter();
      this.formantF2Filter.type = 'peaking';
      this.formantF2Filter.frequency.value = 1850;
      this.formantF2Filter.Q.value = 1.4;

      this.formantF3Filter = this.audioContext.createBiquadFilter();
      this.formantF3Filter.type = 'peaking';
      this.formantF3Filter.frequency.value = 3100;
      this.formantF3Filter.Q.value = 1.3;

      this.deEsserFilter = this.audioContext.createBiquadFilter();
      this.deEsserFilter.type = 'peaking';
      this.deEsserFilter.frequency.value = 6600;
      this.deEsserFilter.Q.value = 2.0;

      this.toneLowShelf = this.audioContext.createBiquadFilter();
      this.toneLowShelf.type = 'lowshelf';
      this.toneLowShelf.frequency.value = 220;

      this.toneHighShelf = this.audioContext.createBiquadFilter();
      this.toneHighShelf.type = 'highshelf';
      this.toneHighShelf.frequency.value = 8800;

      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -22;
      this.compressor.knee.value = 22;
      this.compressor.ratio.value = 3.2;
      this.compressor.attack.value = 0.006;
      this.compressor.release.value = 0.18;

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.78;

      if (!this.destinationNode) {
        this.destinationNode = this.audioContext.createMediaStreamDestination();
      }
      this.livePreviewGain = this.audioContext.createGain();
      this.livePreviewGain.gain.value = this.state.livePreview ? 1.25 : 0.0;

      this.dryGain = this.audioContext.createGain();
      this.neuralGain = this.audioContext.createGain();
      this.neuralGain.gain.value = 0;
      this.dryGain.connect(this.chestCutFilter);
      this.neuralGain.connect(this.chestCutFilter);
      this.sourceNode.connect(this.highpassFilter);
      if (this.pitchWorkletNode) {
        this.highpassFilter.connect(this.pitchWorkletNode);
        this.pitchWorkletNode.connect(this.dryGain);
      } else {
        this.highpassFilter.connect(this.dryGain);
      }

      this.chestCutFilter.connect(this.formantF1Filter);
      this.formantF1Filter.connect(this.formantF2Filter);
      this.formantF2Filter.connect(this.formantF3Filter);
      this.formantF3Filter.connect(this.deEsserFilter);
      this.deEsserFilter.connect(this.toneLowShelf);
      this.toneLowShelf.connect(this.toneHighShelf);
      this.toneHighShelf.connect(this.compressor);
      this.compressor.connect(this.analyserNode);

      this.analyserNode.connect(this.destinationNode);
      this.analyserNode.connect(this.livePreviewGain);
      this.livePreviewGain.connect(this.audioContext.destination);

      this.isProcessing = true;
    } catch (e) {
      this.isProcessing = false;
      throw e;
    }
  }

  public applyCurrentSettings() {
    if (!this.audioContext || !this.isProcessing) return;

    const t = this.audioContext.currentTime;
    const {
      enabled,
      gender,
      pitchShift,
      formantShift,
      tone,
      resonance,
      noiseGateThreshold,
      enhancement,
      livePreview,
    } = this.state;

    const aiRequested = this.state.selectedPresetId === 'ai_female';
    const neuralActive = enabled && aiRequested && this.state.neuralStatus === 'active' && Boolean(this.neuralSession);
    // Do not compete with inference using the legacy vocoder while AI warms up.
    const effectsEnabled = enabled && !neuralActive && (!aiRequested || this.neuralBlocked);
    this.state.activeEngine = neuralActive ? 'neural' : effectsEnabled && this.pitchWorkletNode ? 'dsp' : 'original';
    this.dryGain?.gain.setTargetAtTime(neuralActive ? 0 : 1, t, .025);
    this.neuralGain?.gain.setTargetAtTime(neuralActive ? 1 : 0, t, .025);
    const activePitch = effectsEnabled ? pitchShift : 0;
    const activeFormant = effectsEnabled ? formantShift : 0;
    const activeTone = effectsEnabled ? tone : 0;
    const activeResonance = effectsEnabled ? resonance : 0;
    const isFemaleCurve = effectsEnabled && (gender === 'female' || activeFormant > 1);

    const pitchRatio = Math.pow(2, activePitch / 12);
    // Decoupled vocal tract ratio: +4 formantShift => ~1.18x (17.5cm -> 14.8cm female tract)
    const formantRatio = Math.pow(2, (activeFormant * 0.72) / 12);
    const gateLinear = Math.pow(10, noiseGateThreshold / 20);

    if (this.pitchWorkletNode) {
      const targetFemaleHz =
        this.state.selectedPresetId === 'soft_female'
          ? 202
          : this.state.selectedPresetId === 'bright_female'
          ? 182
          : 190;

      this.pitchWorkletNode.parameters
        .get('pitchRatio')
        ?.setTargetAtTime(Math.max(0.4, Math.min(2.5, pitchRatio)), t, 0.035);
      this.pitchWorkletNode.parameters
        .get('formantRatio')
        ?.setTargetAtTime(Math.max(0.5, Math.min(1.8, formantRatio)), t, 0.035);
      this.pitchWorkletNode.parameters
        .get('enabled')
        ?.setValueAtTime(effectsEnabled ? 1 : 0, t);
      this.pitchWorkletNode.parameters
        .get('gateThreshold')
        ?.setValueAtTime(gateLinear, t);
      this.pitchWorkletNode.parameters
        .get('femaleCalibration')
        ?.setValueAtTime(isFemaleCurve ? 1 : 0, t);
      this.pitchWorkletNode.parameters
        .get('femaleTargetHz')
        ?.setValueAtTime(targetFemaleHz, t);
    }

    // Subtle acoustic polish filters (primary vocal tract shift already handled cleanly inside Phase Vocoder!)
    if (this.highpassFilter) {
      const hpFreq = enabled ? 65 : 75;
      this.highpassFilter.frequency.setTargetAtTime(hpFreq, t, 0.04);
    }

    if (this.chestCutFilter) {
      const chestGain = isFemaleCurve ? -1.2 : activeFormant < 0 ? Math.min(4.5, Math.abs(activeFormant) * 0.7) : 0;
      this.chestCutFilter.gain.setTargetAtTime(chestGain, t, 0.04);
    }

    if (this.formantF1Filter) {
      this.formantF1Filter.gain.setTargetAtTime(isFemaleCurve ? 0.4 : 0, t, 0.04);
    }

    if (this.formantF2Filter) {
      const f2Gain = isFemaleCurve ? 0.2 + activeResonance * 0.03 : activeFormant < 0 ? -1.5 : 0;
      this.formantF2Filter.gain.setTargetAtTime(f2Gain, t, 0.04);
    }

    if (this.formantF3Filter) {
      this.formantF3Filter.gain.setTargetAtTime(isFemaleCurve ? 0.5 : 0, t, 0.04);
    }

    if (this.deEsserFilter) {
      const deEss = activePitch > 2 ? -Math.min(3.5, activePitch * 0.4) : 0;
      this.deEsserFilter.gain.setTargetAtTime(deEss, t, 0.04);
    }

    if (this.toneLowShelf && this.toneHighShelf) {
      this.toneLowShelf.gain.setTargetAtTime(-activeTone * 0.55, t, 0.04);
      const airBoost = (isFemaleCurve ? 0.5 : 0) + activeTone * 0.55;
      this.toneHighShelf.gain.setTargetAtTime(airBoost, t, 0.04);
    }

    if (this.compressor) {
      this.compressor.threshold.setTargetAtTime(enhancement && enabled ? -22 : -12, t, 0.04);
      this.compressor.ratio.setTargetAtTime(enhancement && enabled ? 3.2 : 2, t, 0.04);
    }

    if (this.livePreviewGain) {
      this.livePreviewGain.gain.setTargetAtTime(livePreview ? 0.9 : 0.0, t, 0.04);
    }
  }

  public async setEnabled(enabled: boolean) {
    this.state.enabled = enabled;
    if (enabled && this.processorFailed && this.isProcessing) {
      this.processorFailed = false; this.sourceNode?.disconnect(); this.buildDspGraph(); this.state.lastError = null;
    }
    if (enabled && (!this.isProcessing || !this.hasLiveMic() || this.audioContext?.state === "closed" || !this.workletLoaded)) {
      await this.initialize();
    } else if (enabled && this.audioContext?.state !== 'running') {
      await this.audioContext?.resume().catch(() => {});
    }
    if (enabled && (!this.state.isReady || !this.pitchWorkletNode)) {
      this.state.enabled = false;
      this.state.lastError ||= 'Live pitch effects could not start. Check microphone access and try again.';
    }
    this.applyCurrentSettings();
    await this.syncNeuralMode();
    this.notify();
  }

  public setPreset(presetKey: BuiltinPresetKey | string, autoEnable = true) {
    let preset: VoicePreset | undefined = BUILTIN_VOICE_PRESETS[presetKey as BuiltinPresetKey];
    if (!preset) {
      preset = this.state.customPresets.find((p) => p.id === presetKey);
    }

    if (preset) {
      this.state.selectedPresetId = preset.id;
      this.state.gender = preset.gender;
      this.state.pitchShift = preset.pitchShift;
      this.state.formantShift = preset.formantShift;
      this.state.tone = preset.tone;
      this.state.resonance = preset.resonance;
      this.state.vibrato = preset.vibrato;
      this.state.noiseGateThreshold = preset.noiseGateThreshold;
      this.state.enhancement = preset.enhancement;
      this.state.reverbAmount = preset.reverbAmount;
    } else {
      this.state.selectedPresetId = presetKey;
    }

    if (autoEnable && !this.state.enabled && presetKey !== 'custom') {
      this.state.enabled = true;
      void this.ensureReadyForCapture();
    }

    this.applyCurrentSettings();
    void this.syncNeuralMode();
    this.notify();
  }

  public setGender(gender: VoiceGender, autoEnable = true) {
    this.state.gender = gender;
    if (gender === 'female') {
      this.setPreset('natural_female', autoEnable);
      return;
    }
    if (gender === 'male') {
      this.setPreset('natural_male', autoEnable);
      return;
    }
    this.setPreset('studio_warmth', autoEnable);
  }

  public setPitch(pitch: number) {
    this.state.pitchShift = pitch;
    this.state.selectedPresetId = 'custom';
    this.stopNeuralMode(); this.neuralBlocked = false;
    if (!this.state.enabled) {
      this.state.enabled = true;
      void this.ensureReadyForCapture();
    }
    this.applyCurrentSettings();
    this.notify();
  }

  public setTone(tone: number) {
    this.state.tone = tone;
    this.state.selectedPresetId = 'custom';
    this.stopNeuralMode(); this.neuralBlocked = false;
    this.applyCurrentSettings();
    this.notify();
  }

  public setFormantShift(formant: number) {
    this.state.formantShift = formant;
    this.state.selectedPresetId = 'custom';
    this.stopNeuralMode(); this.neuralBlocked = false;
    if (!this.state.enabled) {
      this.state.enabled = true;
      void this.ensureReadyForCapture();
    }
    this.applyCurrentSettings();
    this.notify();
  }

  public setResonance(resonance: number) {
    this.state.resonance = resonance;
    this.state.selectedPresetId = 'custom';
    this.stopNeuralMode(); this.neuralBlocked = false;
    this.applyCurrentSettings();
    this.notify();
  }

  public setNoiseGate(threshold: number) {
    this.state.noiseGateThreshold = threshold;
    this.applyCurrentSettings();
    this.notify();
  }

  public setEnhancement(enhancement: boolean) {
    this.state.enhancement = enhancement;
    this.applyCurrentSettings();
    this.notify();
  }

  public async setLivePreview(enabled: boolean) {
    this.state.livePreview = enabled;
    if (enabled) {
      await this.ensureReadyForCapture();
    }
    this.applyCurrentSettings();
    this.notify();
  }

  public async setAudioInput(deviceId: string) {
    this.state.selectedMicId = deviceId;
    this.notify();
    if (this.audioContext) {
      await this.acquireMicrophone();
      this.buildDspGraph();
      this.applyCurrentSettings();
      await this.syncNeuralMode();
    }
  }

  public async setAudioOutput(deviceId: string) {
    this.state.selectedOutputId = deviceId;
    this.notify();
    if (this.audioContext && 'setSinkId' in this.audioContext) {
      try {
        await (this.audioContext as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      } catch {
        // ignore if unsupported
      }
    }
  }

  public saveCustomPreset(name: string): VoicePreset {
    const newPreset: VoicePreset = {
      id: `custom_${Date.now()}`,
      name: name || `Custom ${this.state.customPresets.length + 1}`,
      gender: this.state.gender,
      description: 'Saved voice profile',
      pitchShift: this.state.pitchShift,
      formantShift: this.state.formantShift,
      tone: this.state.tone,
      resonance: this.state.resonance,
      vibrato: this.state.vibrato,
      noiseGateThreshold: this.state.noiseGateThreshold,
      enhancement: this.state.enhancement,
      reverbAmount: this.state.reverbAmount,
      icon: 'Sliders',
    };

    const updated = [...this.state.customPresets, newPreset];
    this.state.customPresets = updated;
    this.state.selectedPresetId = newPreset.id;
    this.stopNeuralMode(); this.applyCurrentSettings();
    localStorage.setItem(STORAGE_KEY_CUSTOM_PRESETS, JSON.stringify(updated));
    this.notify();
    return newPreset;
  }

  public resetToDefaults() {
    this.stopNeuralMode(); this.neuralBlocked = false;
    const defaultPreset = BUILTIN_VOICE_PRESETS.natural_female;
    this.state = {
      ...this.state,
      enabled: false,
      selectedPresetId: 'natural_female',
      gender: defaultPreset.gender,
      pitchShift: defaultPreset.pitchShift,
      formantShift: defaultPreset.formantShift,
      tone: defaultPreset.tone,
      resonance: defaultPreset.resonance,
      vibrato: defaultPreset.vibrato,
      noiseGateThreshold: defaultPreset.noiseGateThreshold,
      enhancement: defaultPreset.enhancement,
      reverbAmount: defaultPreset.reverbAmount,
      livePreview: false,
    };
    this.applyCurrentSettings();
    this.notify();
  }

  public async getAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return { inputs: [], outputs: [] };
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        inputs: devices.filter((d) => d.kind === 'audioinput'),
        outputs: devices.filter((d) => d.kind === 'audiooutput'),
      };
    } catch {
      return { inputs: [], outputs: [] };
    }
  }

  public getProcessedOutputStream(): MediaStream | null {
    // Always route via destinationNode when DSP graph is initialized so toggling presets/power mid-call or mid-recording takes effect live!
    if (this.isProcessing && this.destinationNode && this.destinationNode.stream.getAudioTracks().length > 0) {
      return this.destinationNode.stream;
    }
    return this.micStream;
  }
}

export const voiceChanger = VoiceChangerEngine.getInstance();
