// Ambient cave sound + small interaction sounds, all synthesized (no audio files).
// Off by default; the choice is remembered on this device. Paused while the
// browser window is unfocused or the tab hidden, so it costs nothing in the background.

export type Sfx = 'bloop' | 'page' | 'chime' | 'stamp';

const KEY = 'nk-sound';
export const sound = $state<{ on: boolean }>({
  on: typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1',
});

let ctx: AudioContext | null = null;
let master: GainNode;
let echo: GainNode;        // input of the cave echo
let ambient: GainNode;     // ambient bed (noise + drips)
let noiseBuf: AudioBuffer;
let dripTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // cave echo: delay with feedback, darkened
  echo = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const dark = ctx.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 1800;
  echo.connect(delay); delay.connect(dark); dark.connect(fb); fb.connect(delay); dark.connect(master);

  // 4 s of brown noise, reused by the ambient bed and the page sound
  const n = ctx.sampleRate * 4;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }

  ambient = ctx.createGain();
  ambient.gain.value = 0;
  ambient.connect(master);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 260;
  const bed = ctx.createGain();
  bed.gain.value = 0.22;
  src.connect(low); low.connect(bed); bed.connect(ambient);
  src.start();
  return ctx;
}

const active = () => sound.on && !document.hidden && document.hasFocus();

function drip() {
  if (!ctx || !active()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = 900 + Math.random() * 900;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(ambient); g.connect(echo);
  o.start(t); o.stop(t + 0.2);
}

function scheduleDrips() {
  if (dripTimer) clearTimeout(dripTimer);
  dripTimer = setTimeout(() => { drip(); if (Math.random() < 0.25) setTimeout(drip, 120 + Math.random() * 200); scheduleDrips(); }, 1500 + Math.random() * 5000);
}

/** Start / pause everything according to the toggle, focus and visibility. */
function apply() {
  if (!sound.on) {
    if (dripTimer) { clearTimeout(dripTimer); dripTimer = null; }
    if (ctx && ctx.state === 'running') ctx.suspend();
    return;
  }
  if (!active()) {
    if (dripTimer) { clearTimeout(dripTimer); dripTimer = null; }
    if (ctx && ctx.state === 'running') ctx.suspend();
    return;
  }
  const c = ensure();
  if (!c) return;
  c.resume().catch(() => {});
  ambient.gain.setTargetAtTime(1, c.currentTime, 1.2); // fade in
  if (!dripTimer) scheduleDrips();
}

/** Call once (Layout). Browsers only allow audio after a click, so we also retry on the first one. */
export function initSound() {
  if (installed) return;
  installed = true;
  addEventListener('focus', apply);
  addEventListener('blur', apply);
  document.addEventListener('visibilitychange', apply);
  addEventListener('pointerdown', apply, { passive: true });
  apply();
}

export function toggleSound() {
  sound.on = !sound.on;
  try { localStorage.setItem(KEY, sound.on ? '1' : '0'); } catch {}
  apply();
}

/** One-shot interaction sound (only when sound is on). */
export function sfx(name: Sfx) {
  if (!sound.on) return;
  const c = ensure();
  if (!c) return;
  c.resume().catch(() => {});
  const t = c.currentTime + 0.01;
  const tone = (type: OscillatorType, f0: number, f1: number, start: number, dur: number, vol: number, wet = true) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(master); if (wet) g.connect(echo);
    o.start(start); o.stop(start + dur + 0.05);
  };
  const noise = (start: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, start);
    f.frequency.exponentialRampToValueAtTime(f1, start + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(start, Math.random() * 3); s.stop(start + dur + 0.05);
  };
  switch (name) {
    case 'bloop':
      tone('sine', 260, 720, t, 0.16, 0.22);
      tone('sine', 420, 980, t + 0.11, 0.13, 0.16);
      tone('sine', 340, 820, t + 0.24, 0.1, 0.1);
      break;
    case 'page':
      noise(t, 0.32, 'bandpass', 1400, 4200, 0.5);
      noise(t + 0.18, 0.18, 'highpass', 2500, 5000, 0.18);
      break;
    case 'chime':
      tone('sine', 880, 878, t, 1.2, 0.14);
      tone('sine', 1318, 1316, t + 0.09, 1.1, 0.1);
      tone('triangle', 1760, 1755, t + 0.18, 0.8, 0.05);
      break;
    case 'stamp':
      tone('sine', 140, 45, t, 0.28, 0.5, false);
      noise(t, 0.09, 'lowpass', 900, 300, 0.6);
      break;
  }
}
