// Small interaction sounds, synthesized (no audio files). Off by default; the choice
// is remembered on this device. Nothing runs between sounds.

export type Sfx = 'bloop' | 'page' | 'chime' | 'stamp';

const KEY = 'nk-sound';
export const sound = $state<{ on: boolean }>({
  on: typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1',
});

let ctx: AudioContext | null = null;
let master: GainNode;
let echo: GainNode;   // input of a short room echo
let noiseBuf: AudioBuffer;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  echo = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.22;
  const fb = ctx.createGain();
  fb.gain.value = 0.25;
  const dark = ctx.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 1800;
  echo.connect(delay); delay.connect(dark); dark.connect(fb); fb.connect(delay); dark.connect(master);

  // 1 s of noise for the page / stamp sounds
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function toggleSound() {
  sound.on = !sound.on;
  try { localStorage.setItem(KEY, sound.on ? '1' : '0'); } catch {}
  if (sound.on) sfx('chime'); // preview, and unlocks audio (needs a click)
  else if (ctx && ctx.state === 'running') ctx.suspend();
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
    s.start(start); s.stop(start + dur + 0.05);
  };
  switch (name) {
    case 'bloop':
      tone('sine', 260, 720, t, 0.16, 0.22);
      tone('sine', 420, 980, t + 0.11, 0.13, 0.16);
      tone('sine', 340, 820, t + 0.24, 0.1, 0.1);
      break;
    case 'page':
      noise(t, 0.3, 'bandpass', 1400, 4200, 0.12);
      noise(t + 0.17, 0.16, 'highpass', 2500, 5000, 0.05);
      break;
    case 'chime':
      tone('sine', 880, 878, t, 1.2, 0.14);
      tone('sine', 1318, 1316, t + 0.09, 1.1, 0.1);
      tone('triangle', 1760, 1755, t + 0.18, 0.8, 0.05);
      break;
    case 'stamp':
      tone('sine', 140, 45, t, 0.28, 0.5, false);
      noise(t, 0.08, 'lowpass', 900, 300, 0.15);
      break;
  }
}
