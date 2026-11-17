import { notificationSettingsStore } from './notificationSettingsStore';
/**
 * Webygram Native Web Audio Synthesized Sound Effects & Call Tones
 * Auto-unlocks on user gesture for crisp audible playback everywhere.
 */

class SoundEffectPlayer {
  private ctx: AudioContext | null = null;
  private ringbackTimer: number | null = null;
  private incomingRingTimer: number | null = null;

  constructor() {
    notificationSettingsStore.subscribe(() => { if (!notificationSettingsStore.get().soundsEnabled) { this.stopIncomingRing(); this.stopRingbackTone(); } });
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.initCtx();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  public initCtx(): AudioContext | null {
    if (typeof window === 'undefined' || !notificationSettingsStore.get().soundsEnabled) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playSend(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);

      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.095);
    } catch {
      // Autoplay handled gracefully
    }
  }

  playReceive(enabled: boolean = true) {
    if (!enabled || !notificationSettingsStore.get().notificationsEnabled) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(780, t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(920, t + 0.12);

      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.15);
    } catch {
      // Autoplay handled gracefully
    }
  }

  playPop(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);

      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.06);
    } catch {
      // Autoplay handled gracefully
    }
  }

  playReaction(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = t + idx * 0.03;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.055, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.16);
      });
    } catch {
      // Graceful
    }
  }

  /**
   * Authentic Telegram VoIP soft outgoing ringback pulse (425Hz + 440Hz cadence)
   */
  public startRingbackTone() {
    this.stopRingbackTone();
    const playPulse = () => {
      try {
        const ctx = this.initCtx();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(425, t);
        osc2.frequency.setValueAtTime(450, t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.075, t + 0.06);
        gain.gain.setValueAtTime(0.075, t + 0.72);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.88);
        osc2.stop(t + 0.88);
      } catch {
        // ignore
      }
    };

    playPulse();
    this.ringbackTimer = window.setInterval(playPulse, 2200);
  }

  public stopRingbackTone() {
    if (this.ringbackTimer !== null) {
      clearInterval(this.ringbackTimer);
      this.ringbackTimer = null;
    }
  }

  public startIncomingRing() {
    this.stopIncomingRing();
    const playChime = () => {
      try {
        const ctx = this.initCtx();
        if (!ctx) return;
        const t = ctx.currentTime;
        const notes = [587.33, 783.99, 987.77, 783.99];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const s = t + i * 0.14;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, s);
          gain.gain.setValueAtTime(0.001, s);
          gain.gain.linearRampToValueAtTime(0.09, s + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, s + 0.24);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(s);
          osc.stop(s + 0.25);
        });
      } catch {
        // ignore
      }
    };
    playChime();
    this.incomingRingTimer = window.setInterval(playChime, 2400);
  }

  public stopIncomingRing() {
    if (this.incomingRingTimer !== null) {
      clearInterval(this.incomingRingTimer);
      this.incomingRingTimer = null;
    }
  }

  public playCallConnected() {
    this.stopRingbackTone();
    this.stopIncomingRing();
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const s = t + idx * 0.065;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, s);
        gain.gain.setValueAtTime(0.08, s);
        gain.gain.exponentialRampToValueAtTime(0.001, s + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(s);
        osc.stop(s + 0.2);
      });
    } catch {
      // ignore
    }
  }

  public playCallEnded() {
    this.stopRingbackTone();
    this.stopIncomingRing();
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      [440, 329.63].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const s = t + idx * 0.11;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, s);
        gain.gain.setValueAtTime(0.08, s);
        gain.gain.exponentialRampToValueAtTime(0.001, s + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(s);
        osc.stop(s + 0.2);
      });
    } catch {
      // ignore
    }
  }
}

export const soundEffects = new SoundEffectPlayer();
