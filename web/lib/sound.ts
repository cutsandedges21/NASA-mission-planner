/**
 * Suit sounds for Simulate, synthesised with Web Audio (no audio files, nothing to credit).
 * Muted by default; the choice is remembered in localStorage.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let loop: { stop: () => void } | null = null;
const KEY = 'eva-sound';

export const isMuted = () => typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== 'on';

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function burst(type: BiquadFilterType, freq: number, peak: number, dur: number, at = 0) {
  const c = ac();
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** Airlock hiss at the start and end of the walk. */
export function hiss() {
  if (isMuted()) return;
  burst('highpass', 3000, 0.25, 1.4);
}

/** O₂ warning: soft double beep for low, sharper triple for the reserve. */
export function beep(kind: 'low' | 'alarm') {
  if (isMuted()) return;
  const c = ac();
  const [freq, n, vol] = kind === 'low' ? [880, 2, 0.08] : [1320, 3, 0.12];
  for (let i = 0; i < n; i++) {
    const t = c.currentTime + i * 0.22;
    const o = c.createOscillator();
    o.type = kind === 'low' ? 'sine' : 'square';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.2);
  }
}

/** Breathing loop, plus footsteps when walking (faster on steep ground: stepMs shrinks). */
export function startLoop(walking: boolean, stepMs: () => number) {
  stopLoop();
  if (isMuted()) return;
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 500;
  f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.value = 0.05;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.28; // one breath every ~3.5 s
  const depth = c.createGain();
  depth.gain.value = 0.045;
  lfo.connect(depth).connect(g.gain);
  src.connect(f).connect(g).connect(c.destination);
  src.start();
  lfo.start();
  let timer = 0;
  const step = () => {
    burst('lowpass', 260, 0.35, 0.12);
    timer = window.setTimeout(step, stepMs());
  };
  if (walking) step();
  loop = {
    stop: () => {
      clearTimeout(timer);
      g.gain.setTargetAtTime(0, c.currentTime, 0.1);
      src.stop(c.currentTime + 0.5);
      lfo.stop(c.currentTime + 0.5);
    },
  };
}

export function stopLoop() {
  loop?.stop();
  loop = null;
}

export function setMuted(m: boolean) {
  localStorage.setItem(KEY, m ? 'off' : 'on');
  if (m) stopLoop();
}
