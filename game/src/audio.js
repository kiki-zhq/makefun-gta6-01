// SOLMAR HEAT — all sound synthesized with WebAudio. No audio files.
import { clamp } from './util.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = 0;
    this.sirenOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine hum: sawtooth through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.09 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, t, 0.08);
  }

  setSiren(on) {
    this.sirenOn = on;
  }

  update(dt) {
    if (!this.ctx || this.muted) return;
    if (this.sirenOn) {
      this.sirenTimer += dt;
      const phase = Math.floor(this.sirenTimer / 0.35) % 2;
      // two-tone siren via a short blip each half period
      if (phase !== this._sirenPhase) {
        this._sirenPhase = phase;
        this.blip(phase ? 880 : 660, 0.32, 0.05, 'sine');
      }
    }
  }

  blip(freq, dur, vol, type = 'sine') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  noiseBurst(dur, vol, filterFreq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.16, 0.5, 900); }
  hit() { this.noiseBurst(0.08, 0.3, 2400); }
  pickup() { this.blip(660, 0.09, 0.2); setTimeout(() => this.blip(990, 0.12, 0.2), 90); }
  click() { this.blip(440, 0.05, 0.15, 'square'); }
  crash() { this.noiseBurst(0.3, 0.45, 300); }
  horn() { this.blip(370, 0.25, 0.18, 'square'); setTimeout(() => this.blip(370, 0.2, 0.18, 'square'), 260); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // Simple bass loop: A minor groove, one note per 0.22s.
    const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 65.4, 0];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      this.musicStep++;
      if (f) this.blip(f, 0.2, 0.07, 'triangle');
      if (this.musicStep % 4 === 0) this.blip(220, 0.06, 0.03, 'square');
    }, 220);
  }
}
