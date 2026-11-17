// Synthesized sound for SOLMAR HEAT: every sound is built with WebAudio, no audio files.
// Engine hum (oscillator pitch follows speed), two-tone siren, gunshot (noise burst),
// pickup chime, UI clicks and a small bass + hat music loop scheduled on a timer.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  // A minor-key bass line over Solmar: Am – F – C – G, one bar each, 8 steps a bar.
  const BASS = [55, 55, 65.41, 55, 43.65, 43.65, 52, 43.65, 130.81, 130.81, 146.83, 130.81, 98, 98, 110, 98, 55, 55, 65.41, 55, 43.65, 43.65, 52, 43.65, 49, 49, 58.27, 49, 98, 98, 110, 98];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, gain by speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55.7;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 480;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      engineOsc._pair = engineOsc2;
      // Siren: triangle alternating 700 / 950 Hz.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noiseBurst(dur, freq, vol) {
    if (!ensure()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const step = musicStep % 32;
      const bass = BASS[step];
      tone(bass, 0.22, 'triangle', 0.16);
      if (step % 2 === 0) noiseBurst(0.03, 6000, 0.05); // hat tick
      if (step % 8 === 4) tone(bass * 4, 0.12, 'sine', 0.05); // sparkle
      musicStep += 1;
    }, 230);
  }

  return {
    unlock,
    startMusic,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
    click() { tone(660, 0.06, 'square', 0.08); },
    chime() { tone(880, 0.12, 'sine', 0.14); window.setTimeout(() => tone(1318, 0.18, 'sine', 0.12), 90); },
    gunshot() { noiseBurst(0.14, 2400, 0.5); tone(180, 0.1, 'square', 0.2, 60); },
    crash() { noiseBurst(0.25, 900, 0.5); tone(90, 0.2, 'sawtooth', 0.2, 45); },
    siren(on) {
      if (!ensure()) return;
      if (sirenOsc._timer) { window.clearInterval(sirenOsc._timer); sirenOsc._timer = null; }
      if (on) {
        let high = false;
        sirenOsc._timer = window.setInterval(() => {
          if (ctx) sirenOsc.frequency.value = high ? 950 : 700;
          high = !high;
        }, 420);
        sirenGain.gain.value = 0.05;
      } else {
        sirenGain.gain.value = 0;
      }
    },
    setEngine(speed01, on) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.04 + speed01 * 0.06 : 0, t, 0.1);
      const f = 55 + speed01 * 110;
      engineOsc.frequency.setTargetAtTime(f, t, 0.08);
      if (engineOsc._pair) engineOsc._pair.frequency.setTargetAtTime(f * 1.012, t, 0.08);
    },
    setSirenAudible(on) { if (sirenGain) sirenGain.gain.value = on ? 0.05 : 0; },
  };
}
