/**
 * Suit sounds for Simulate, synthesised with Web Audio (no audio files, nothing to credit).
 * On by default; the choice is remembered in localStorage.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let loop: { stop: () => void } | null = null;
const KEY = 'eva-sound';

export const isMuted = () => typeof localStorage === 'undefined' || localStorage.getItem(KEY) === 'off';

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
  burst('highpass', 3000, 0.12, 1.4);
}

/** O₂ warning: soft double beep for low, sharper triple for the reserve. */
export function beep(kind: 'low' | 'alarm') {
  if (isMuted()) return;
  const c = ac();
  const [freq, n, vol] = kind === 'low' ? [880, 2, 0.04] : [1320, 3, 0.06];
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

/** While moving: crunchy footsteps when walking (faster at higher playback speed), a low engine rumble when driving. */
export function startLoop(walking: boolean, stepMs: () => number) {
  stopLoop();
  if (isMuted()) return;
  const c = ac();
  if (walking) {
    // the recorded walk on rocks, looped; a bit quicker at higher playback speeds
    const w = new Audio('/sounds/walking.mp3');
    w.loop = true;
    w.volume = 0.3;
    w.playbackRate = Math.min(1.5, Math.max(0.8, 650 / stepMs()));
    void w.play().catch(() => {});
    loop = { stop: () => w.pause() };
    return;
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.03, c.currentTime + 0.6);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const oscs = [68, 71.5].map((hz) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.connect(f);
    o.start();
    return o;
  });
  f.connect(g).connect(c.destination);
  loop = {
    stop: () => {
      g.gain.setTargetAtTime(0, c.currentTime, 0.15);
      oscs.forEach((o) => o.stop(c.currentTime + 0.8));
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

/** Spaceship landing for the intro flight, sped up to fit it. */
export function playIntro() {
  if (isMuted()) return;
  const a = new Audio('/sounds/landing.mp3');
  a.playbackRate = 1.6;
  a.volume = 0.35;
  void a.play().catch(() => {});
}
