// audio.js — synthesised WebAudio sound. No audio files, no network.
// Engine hum follows throttle, wind follows speed; rings chime, crashes
// thud, landings jingle. Everything is created lazily on first user input
// (browsers block audio before a gesture).

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windSrc = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned saws through a low-pass, gain by throttle.
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 78;
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      engineOsc.connect(filter);
      engineOsc2.connect(g2);
      g2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise buffer, gain by airspeed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
      return true;
    } catch (err) {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    ensure,
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    // Called every frame with the plane state.
    update(plane) {
      if (!ctx || muted) return;
      const thr = plane.crashed ? 0 : plane.throttle;
      const f = 42 + thr * 58 + plane.speed * 0.35;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 1.5 + 3, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(plane.onGround && thr < 0.05 ? 0 : 0.05 + thr * 0.075, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.12, plane.speed * 0.0011), ctx.currentTime, 0.15);
    },
    ring() { tone(880, 0.25, 'sine', 0.22); tone(1318, 0.35, 'sine', 0.18, 0.09); },
    cargo() { tone(659, 0.2, 'sine', 0.2); tone(988, 0.3, 'sine', 0.2, 0.1); },
    land() { tone(523, 0.2, 'triangle', 0.22); tone(784, 0.3, 'triangle', 0.2, 0.12); tone(1046, 0.4, 'triangle', 0.18, 0.24); },
    // Short low thud for a rough or hard touchdown.
    thud() { tone(90, 0.18, 'sine', 0.35); tone(60, 0.25, 'sine', 0.25, 0.05); },
    crash() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const len = ctx.sampleRate * 0.5;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g); g.connect(ctx.destination);
      src.start(t0);
      tone(55, 0.5, 'sine', 0.4);
    },
    thunder() { tone(48, 1.2, 'sine', 0.25); },
  };
}
