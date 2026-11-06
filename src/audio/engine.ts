/**
 * Procedural Web Audio sound design. No recorded assets: every sound is
 * synthesised (noise bursts, filtered oscillators, modulated drones). Audio
 * starts only after a user gesture, per browser policy.
 */
export type SoundId =
  | 'ui_click'
  | 'ui_hover'
  | 'ui_confirm'
  | 'alert'
  | 'target_lock'
  | 'battery_ready'
  | 'ma_small'
  | 'ma_large'
  | 'hades_internal'
  | 'thanix'
  | 'reaper_beam'
  | 'impact_barrier'
  | 'impact_hull'
  | 'explosion_small'
  | 'explosion_large'
  | 'gardian'
  | 'torpedo';

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

export class AudioEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private musicBus?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private ambienceStarted = false;
  private lastPlay = new Map<SoundId, number>();
  settings: AudioSettings = { master: 0.8, sfx: 0.9, music: 0.5, muted: false };
  /** Max simultaneous one-shots per 100 ms window to avoid clipping during big battles. */
  private budget = 0;
  private budgetTime = 0;

  get ready(): boolean {
    return !!this.ctx;
  }

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.sfxBus.connect(comp);
    this.musicBus.connect(comp);
    comp.connect(this.master);
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings();
  }

  applySettings(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const s = this.settings;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music, this.ctx.currentTime, 0.05);
  }

  private noise(duration: number, filterType: BiquadFilterType, freq: number, q: number, gain: number, dest: AudioNode, when = 0, decay = duration): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, duration: number, gain: number, dest: AudioNode, when = 0): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime + when;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  /**
   * Play a one-shot. `distance` is in km from the camera; volume falls off
   * with distance (not physically accurate — space is silent — but a
   * cinematic convention).
   */
  play(id: SoundId, distance = 0, intensity = 1): void {
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.budgetTime > 0.1) {
      this.budgetTime = now;
      this.budget = 0;
    }
    if (this.budget > 10) return;
    const last = this.lastPlay.get(id) ?? -1;
    const minGap = id.startsWith('ui') ? 0.03 : id === 'gardian' ? 0.08 : 0.05;
    if (now - last < minGap) return;
    this.lastPlay.set(id, now);
    this.budget++;
    const att = Math.min(1, 1 / (1 + distance / 25)) * intensity;
    if (att < 0.02) return;
    const bus = this.sfxBus;
    switch (id) {
      case 'ui_click':
        this.tone('square', 1800, 1200, 0.05, 0.05 * att, bus);
        break;
      case 'ui_hover':
        this.tone('sine', 2400, 2400, 0.03, 0.02 * att, bus);
        break;
      case 'ui_confirm':
        this.tone('triangle', 600, 1200, 0.18, 0.08 * att, bus);
        this.tone('sine', 1200, 1800, 0.25, 0.05 * att, bus, 0.06);
        break;
      case 'alert':
        this.tone('square', 440, 440, 0.12, 0.06 * att, bus);
        this.tone('square', 440, 440, 0.12, 0.06 * att, bus, 0.2);
        break;
      case 'target_lock':
        // Soft two-pulse tracking confirmation, restrained and diegetic.
        this.tone('sine', 920, 1070, 0.075, 0.07 * att, bus);
        this.tone('sine', 1120, 1360, 0.10, 0.045 * att, bus, 0.105);
        break;
      case 'battery_ready':
        this.tone('triangle', 420, 760, 0.15, 0.06 * att, bus);
        break;
      case 'ma_small':
        this.noise(0.12, 'bandpass', 1800, 1.2, 0.25 * att, bus);
        this.tone('sawtooth', 240, 60, 0.12, 0.12 * att, bus);
        break;
      case 'ma_large':
        this.noise(0.35, 'lowpass', 900, 0.8, 0.7 * att, bus);
        this.tone('sawtooth', 110, 28, 0.5, 0.45 * att, bus);
        this.tone('sine', 55, 30, 0.7, 0.4 * att, bus);
        this.noise(0.08, 'highpass', 3000, 1, 0.3 * att, bus);
        break;
      case 'hades_internal':
        this.noise(0.055, 'highpass', 2600, 1, 0.3 * att, bus);
        this.tone('sine', 78, 23, 1.5, 0.55 * att, bus, 0.16);
        this.noise(1.2, 'lowpass', 280, 0.6, 0.55 * att, bus, 0.16, 1.2);
        break;
      case 'thanix':
        this.noise(1.6, 'bandpass', 700, 3, 0.35 * att, bus, 0, 1.4);
        this.tone('sawtooth', 180, 240, 1.5, 0.18 * att, bus);
        this.tone('sine', 90, 120, 1.6, 0.2 * att, bus);
        break;
      case 'reaper_beam': {
        // Iconic low-frequency blast: deep sub tone with a modulated mid growl.
        this.tone('sawtooth', 48, 42, 2.6, 0.55 * att, bus);
        this.tone('square', 96, 90, 2.4, 0.18 * att, bus);
        this.noise(2.6, 'lowpass', 400, 0.7, 0.5 * att, bus, 0, 2.4);
        this.noise(0.3, 'bandpass', 1200, 1, 0.4 * att, bus);
        if (this.ctx) {
          const lfo = this.ctx.createOscillator();
          lfo.frequency.value = 11;
          const lg = this.ctx.createGain();
          lg.gain.value = 0.15 * att;
          const carrier = this.ctx.createOscillator();
          carrier.type = 'triangle';
          carrier.frequency.value = 140;
          const cg = this.ctx.createGain();
          cg.gain.value = 0;
          lfo.connect(lg).connect(cg.gain);
          carrier.connect(cg).connect(bus);
          const t = this.ctx.currentTime;
          lfo.start(t);
          carrier.start(t);
          lfo.stop(t + 2.5);
          carrier.stop(t + 2.5);
        }
        break;
      }
      case 'impact_barrier':
        this.tone('sine', 1200, 500, 0.18, 0.12 * att, bus);
        this.noise(0.15, 'highpass', 2500, 1, 0.1 * att, bus);
        break;
      case 'impact_hull':
        this.noise(0.25, 'lowpass', 600, 1, 0.3 * att, bus);
        this.tone('triangle', 120, 50, 0.2, 0.15 * att, bus);
        break;
      case 'explosion_small':
        this.noise(0.6, 'lowpass', 700, 0.6, 0.5 * att, bus);
        this.tone('sine', 90, 30, 0.6, 0.3 * att, bus);
        break;
      case 'explosion_large':
        this.noise(2.2, 'lowpass', 350, 0.5, 0.9 * att, bus, 0, 2.0);
        this.noise(0.5, 'bandpass', 1500, 0.8, 0.4 * att, bus, 0.05);
        this.tone('sine', 60, 18, 2.4, 0.6 * att, bus);
        this.noise(1.5, 'lowpass', 200, 0.5, 0.6 * att, bus, 0.6, 1.4);
        break;
      case 'gardian':
        this.tone('square', 3200, 2400, 0.05, 0.04 * att, bus);
        break;
      case 'torpedo':
        this.noise(0.5, 'bandpass', 500, 2, 0.15 * att, bus);
        this.tone('sawtooth', 300, 500, 0.4, 0.06 * att, bus);
        break;
    }
  }

  /** Low atmospheric drone + engine ambience; idempotent. */
  startAmbience(): void {
    if (!this.ctx || !this.musicBus || this.ambienceStarted) return;
    this.ambienceStarted = true;
    const ctx = this.ctx;
    const make = (freq: number, type: OscillatorType, gain: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.musicBus!);
      o.start();
      return g;
    };
    make(55, 'sine', 0.08);
    make(55 * 1.5, 'sine', 0.03, 6);
    make(27.5, 'triangle', 0.05);
    const pad = make(110, 'sawtooth', 0.0);
    // Slow swell on the pad.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg).connect(pad.gain);
    lfo.start();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    pad.disconnect();
    pad.connect(f).connect(this.musicBus);
    // Distant rumble bed.
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 120;
      const ng = ctx.createGain();
      ng.gain.value = 0.12;
      src.connect(nf).connect(ng).connect(this.musicBus);
      src.start();
    }
  }
}

export const audio = new AudioEngine();
