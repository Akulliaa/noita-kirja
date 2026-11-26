// Sounds, all synthesized in the browser (no audio files):
//  - ambient: a slow, generative "crystal cave" soundscape (drone chords, bell chimes,
//    water drops, faint wind) through a generated cave reverb. Own toggle.
//  - sfx: short interaction sounds. Own toggle.
// Both are off by default and remembered on this device. The ambience pauses while the
// browser window is unfocused or the tab hidden, so it costs nothing in the background.

export type Sfx = 'bloop' | 'page' | 'chime' | 'stamp';

const KEY_SFX = 'nk-sound';
const KEY_AMB = 'nk-ambient';
const read = (k: string) => typeof localStorage !== 'undefined' && localStorage.getItem(k) === '1';
export const sound = $state<{ on: boolean; ambient: boolean }>({ on: read(KEY_SFX), ambient: read(KEY_AMB) });

let ctx: AudioContext | null = null;
let master: GainNode;
let reverb: ConvolverNode;   // shared cave reverb (input)
let noiseBuf: AudioBuffer;

function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  // gentle limiter so overlapping sounds never clip
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);

  reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 4, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  reverb.connect(wet); wet.connect(master);

  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// ---------------------------------------------------------------------------
// Ambient soundscape
// ---------------------------------------------------------------------------
// Chords voiced low and wide (Hz). A gentle minor-key walk; never resolves, never repeats exactly.
const CHORDS: number[][] = [
  [110.0, 164.81, 220.0, 261.63],   // Am
  [87.31, 130.81, 220.0, 329.63],   // Fmaj7
  [130.81, 196.0, 261.63, 329.63],  // C
  [82.41, 123.47, 196.0, 293.66],   // Em7
  [73.42, 146.83, 220.0, 349.23],   // Dm
  [98.0, 146.83, 246.94, 293.66],   // G
];
const BELLS = [880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]; // A minor pentatonic, high
const CHORD_EVERY = 14;   // s between chord starts
const CHORD_LEN = 22;     // s each chord lasts (they overlap and cross-fade)

let amb: { bus: GainNode; pad: BiquadFilterNode; lfo: OscillatorNode; wind: AudioBufferSourceNode } | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];
let chordIdx = 0;
let installed = false;

function buildAmbient(c: AudioContext) {
  const bus = c.createGain();
  bus.gain.value = 0;
  bus.connect(master);
  bus.connect(reverb);

  // pad filter with a slow "breathing" sweep
  const pad = c.createBiquadFilter();
  pad.type = 'lowpass'; pad.frequency.value = 700; pad.Q.value = 0.6;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.045;
  const depth = c.createGain();
  depth.gain.value = 350;
  lfo.connect(depth); depth.connect(pad.frequency);
  lfo.start();
  pad.connect(bus);

  // faint wind: band-passed noise whose level drifts slowly
  const wind = c.createBufferSource();
  wind.buffer = noiseBuf; wind.loop = true;
  const wf = c.createBiquadFilter();
  wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.8;
  const wg = c.createGain();
  wg.gain.value = 0.006;
  const wl = c.createOscillator();
  wl.frequency.value = 0.07;
  const wd = c.createGain();
  wd.gain.value = 0.004;
  wl.connect(wd); wd.connect(wg.gain); wl.start();
  wind.connect(wf); wf.connect(wg); wg.connect(bus);
  wind.start();

  amb = { bus, pad, lfo, wind };
}

function chord(c: AudioContext) {
  if (!amb) return;
  const notes = CHORDS[chordIdx];
  // random walk to a neighbouring chord
  chordIdx = (chordIdx + (Math.random() < 0.5 ? 1 : CHORDS.length - 1) + (Math.random() < 0.3 ? 2 : 0)) % CHORDS.length;
  const t = c.currentTime + 0.05;
  for (const f of notes) {
    for (const [type, detune, vol] of [['sine', -5, 0.03], ['triangle', 6, 0.014]] as const) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = detune;
      const g = c.createGain();
      // linear swell / fade: overlapping chords cross-fade without a dip in between
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 8);
      g.gain.setValueAtTime(vol, t + CHORD_LEN - 8);
      g.gain.linearRampToValueAtTime(0, t + CHORD_LEN);
      o.connect(g); g.connect(amb.pad);
      o.start(t); o.stop(t + CHORD_LEN + 0.1);
    }
  }
}

function bell(c: AudioContext) {
  if (!amb) return;
  const f = BELLS[Math.floor(Math.random() * BELLS.length)];
  const t = c.currentTime + 0.02;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.022, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
  const pan = c.createStereoPanner();
  pan.pan.value = Math.random() * 1.4 - 0.7;
  g.connect(pan); pan.connect(amb.bus);
  // fundamental + an inharmonic partial = glassy bell
  for (const [mul, v] of [[1, 1], [2.76, 0.25], [5.4, 0.08]] as const) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.value = f * mul; og.gain.value = v;
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + 4.1);
  }
}

function drop(c: AudioContext) {
  if (!amb) return;
  // a real water drop "plinks" upward in pitch
  const t = c.currentTime + 0.02;
  const f = 600 + Math.random() * 500;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  const pan = c.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  o.connect(g); g.connect(pan); pan.connect(reverb); pan.connect(amb.bus);
  o.start(t); o.stop(t + 0.12);
}

function every(min: number, max: number, fn: () => void) {
  const loop = () => { timers.push(setTimeout(() => { fn(); loop(); }, (min + Math.random() * (max - min)) * 1000)); };
  loop();
}

function startLoops(c: AudioContext) {
  stopLoops();
  chord(c);
  every(CHORD_EVERY, CHORD_EVERY, () => chord(c));
  every(5, 14, () => bell(c));
  every(6, 16, () => { drop(c); if (Math.random() < 0.3) timers.push(setTimeout(() => drop(c), 180 + Math.random() * 250)); });
}
function stopLoops() { for (const t of timers) clearTimeout(t); timers = []; }

const focused = () => !document.hidden && document.hasFocus();

/** Start / pause the ambience according to its toggle and the window focus. */
function applyAmbient() {
  const want = sound.ambient && focused();
  if (!want) {
    stopLoops();
    if (ctx && amb) {
      amb.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      const c = ctx;
      setTimeout(() => { if (!(sound.ambient && focused()) && c.state === 'running') c.suspend(); }, 600);
    }
    return;
  }
  const c = ensure();
  if (!c) return;
  if (!amb) buildAmbient(c);
  c.resume().then(() => {
    if (!(sound.ambient && focused()) || timers.length) return;
    amb!.bus.gain.cancelScheduledValues(c.currentTime);
    amb!.bus.gain.setTargetAtTime(0.8, c.currentTime, 2.5); // fade in
    startLoops(c);
  }).catch(() => {});
}

/** Call once (Layout). Browsers only allow audio after a click, so we also retry on clicks. */
export function initSound() {
  if (installed) return;
  installed = true;
  addEventListener('focus', applyAmbient);
  addEventListener('blur', applyAmbient);
  document.addEventListener('visibilitychange', applyAmbient);
  addEventListener('pointerdown', () => { if (sound.ambient && !timers.length) applyAmbient(); }, { passive: true });
  applyAmbient();
}

export function toggleAmbient() {
  sound.ambient = !sound.ambient;
  try { localStorage.setItem(KEY_AMB, sound.ambient ? '1' : '0'); } catch {}
  applyAmbient();
}

export function toggleSound() {
  sound.on = !sound.on;
  try { localStorage.setItem(KEY_SFX, sound.on ? '1' : '0'); } catch {}
  if (sound.on) sfx('chime'); // preview (a click also unlocks audio)
}

// ---------------------------------------------------------------------------
// Interaction sounds
// ---------------------------------------------------------------------------
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
    o.connect(g); g.connect(master); if (wet) g.connect(reverb);
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
    s.start(start, Math.random()); s.stop(start + dur + 0.05);
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
