// Canvas map: noitamap Deep Zoom tiles + black fog + player outlines + markers.
// All positions are Noita world coordinates (y grows downward).
import { CELL, CHUNK, CHUNK_PX, type FogGrid } from './fog';

// ---------------------------------------------------------------------------
// Tile sources (public noitamap.com tiles, CORS-enabled)
// ---------------------------------------------------------------------------
const SOURCES = ['left', 'middle', 'right'].map((p) => {
  const base = `https://regular-main-branch-${p}.acidflow.stream/maps/regular-main-branch-${p}/regular-main-branch-${p}-2024-08-12-78633191`;
  return { name: p, dzi: `${base}.dzi`, files: `${base}_files/` };
});

interface Part {
  files: string;
  x: number; y: number; // world top-left
  w: number; h: number; // full-resolution size
  tile: number; overlap: number; maxLevel: number; format: string;
}

let partsPromise: Promise<Part[]> | null = null;
export function loadParts(): Promise<Part[]> {
  partsPromise ??= Promise.all(SOURCES.map(async (s) => {
    const r = await fetch(s.dzi);
    if (!r.ok) throw new Error(`map tiles: HTTP ${r.status}`);
    const img = (await r.json()).Image;
    const w = Number(img.Size.Width), h = Number(img.Size.Height);
    return {
      files: s.files, x: Number(img.TopLeft.X), y: Number(img.TopLeft.Y), w, h,
      tile: Number(img.TileSize), overlap: Number(img.Overlap),
      maxLevel: Math.ceil(Math.log2(Math.max(w, h))), format: img.Format || 'webp',
    } satisfies Part;
  }));
  partsPromise.catch(() => (partsPromise = null));
  return partsPromise;
}

// ---------------------------------------------------------------------------
export interface Marker {
  id: string;
  x: number; y: number;
  icon: string;
  title: string;
  kind: 'pin' | 'book' | 'rune' | 'player' | 'quest'; // quest: icon = step number, color = badge color
  color?: string;
}
export interface Outline { color: string; path: Path2D }
export type Tool = 'pan' | 'reveal' | 'hide' | 'pin' | 'place';

export interface EngineEvents {
  brush?: (x: number, y: number, rWorld: number, hide: boolean) => void;
  brushEnd?: () => void;
  click?: (x: number, y: number) => void;
  marker?: (m: Marker, screen: { x: number; y: number }) => void;
  hover?: (x: number, y: number) => void;
  view?: (cx: number, cy: number, scale: number) => void;
}

const MIN_SCALE = 0.004, MAX_SCALE = 6;

export class MapEngine {
  private ctx: CanvasRenderingContext2D;
  private fogCanvas = document.createElement('canvas');
  private fctx = this.fogCanvas.getContext('2d')!;
  private parts: Part[] = [];
  private tiles = new Map<string, { img: HTMLImageElement; ok: boolean; used: number }>();
  private chunkCanvases = new Map<string, { ver: number; c: HTMLCanvasElement }>();
  private dpr = 1;
  private w = 0; private h = 0;
  private frame = 0;
  private queued = false;
  private pulseTimer: ReturnType<typeof setTimeout> | 0 = 0;

  cx = 0; cy = 0; scale = 0.05;
  union: FogGrid = new Map();
  unionVersion = 0;
  outlines: Outline[] = [];
  routes: { color: string; points: { x: number; y: number }[] }[] = []; // dashed lines (quest routes)
  trails: { color: string; points: { x: number; y: number }[] }[] = []; // recent path of live players, oldest first
  markers: Marker[] = [];
  focus: string | null = null; // highlighted marker id
  tool: Tool = 'pan';
  brushPx = 30;
  showTiles = true;
  error = '';

  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; moved: boolean } | null = null;
  private pinchDist = 0;
  private mouse: { x: number; y: number } | null = null;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private on: EngineEvents = {}) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('pointerleave', this.leave);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    loadParts().then((p) => { this.parts = p; this.draw(); }).catch((e) => { this.error = String(e?.message ?? e); this.draw(); });
  }

  destroy() {
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.focus = null;
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.canvas.removeEventListener('pointerleave', this.leave);
    this.canvas.removeEventListener('wheel', this.wheel);
    for (const t of this.tiles.values()) t.img.src = '';
    this.tiles.clear();
  }

  // ---- coordinates --------------------------------------------------------
  toWorld(sx: number, sy: number) {
    return { x: (sx - this.w / 2) / this.scale + this.cx, y: (sy - this.h / 2) / this.scale + this.cy };
  }
  toScreen(wx: number, wy: number) {
    return { x: (wx - this.cx) * this.scale + this.w / 2, y: (wy - this.cy) * this.scale + this.h / 2 };
  }

  centerOn(x: number, y: number, scale?: number) {
    this.cx = x; this.cy = y;
    if (scale) this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    this.changed();
  }
  fit(b: { x0: number; y0: number; x1: number; y1: number }) {
    const s = Math.min(this.w / Math.max(1, b.x1 - b.x0), this.h / Math.max(1, b.y1 - b.y0)) * 0.85;
    this.centerOn((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, s);
  }
  zoomBy(f: number, sx = this.w / 2, sy = this.h / 2) {
    const before = this.toWorld(sx, sy);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * f));
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.changed();
  }
  private changed() { this.on.view?.(this.cx, this.cy, this.scale); this.draw(); }

  // ---- input ----------------------------------------------------------------
  private pos(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private brushing() { return this.tool === 'reveal' || this.tool === 'hide'; }

  private down = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.dragStart = null;
      return;
    }
    this.dragStart = { ...p, moved: false };
    if (this.brushing() && e.button === 0) this.paint(p);
  };

  private move = (e: PointerEvent) => {
    const p = this.pos(e);
    this.mouse = p;
    const w = this.toWorld(p.x, p.y);
    this.on.hover?.(w.x, w.y);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) { if (this.brushing()) this.draw(); this.canvas.style.cursor = this.hitMarker(p) ? 'pointer' : ''; return; }
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.zoomBy(d / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinchDist = d;
      return;
    }
    if (this.dragStart && Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > 4) this.dragStart.moved = true;
    if (this.brushing() && !(e.buttons & 2)) { this.paint(p); return; }
    this.cx -= (p.x - prev.x) / this.scale;
    this.cy -= (p.y - prev.y) / this.scale;
    this.changed();
  };

  private up = (e: PointerEvent) => {
    const p = this.pos(e);
    const wasTwo = this.pointers.size === 2;
    this.pointers.delete(e.pointerId);
    if (wasTwo) { this.pinchDist = 0; return; }
    const start = this.dragStart;
    this.dragStart = null;
    if (this.brushing()) { this.on.brushEnd?.(); return; }
    if (start && !start.moved) {
      const m = this.hitMarker(p);
      if (m && m.kind !== 'player' && this.tool === 'pan') this.on.marker?.(m, p);
      else { const w = this.toWorld(p.x, p.y); this.on.click?.(w.x, w.y); }
    }
  };

  private leave = () => { this.mouse = null; if (this.brushing()) this.draw(); };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.pos(e);
    this.zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), p.x, p.y);
  };

  private paint(p: { x: number; y: number }) {
    const w = this.toWorld(p.x, p.y);
    this.on.brush?.(w.x, w.y, this.brushPx / this.scale, this.tool === 'hide');
  }

  private hitMarker(p: { x: number; y: number }): Marker | null {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      const s = this.toScreen(m.x, m.y);
      if (Math.hypot(s.x - p.x, s.y - 12 - p.y) < 16) return m;
    }
    return null;
  }

  // ---- drawing -----------------------------------------------------------
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.fogCanvas.width = this.canvas.width;
    this.fogCanvas.height = this.canvas.height;
    this.draw();
  }

  draw() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.render(); });
  }

  /** Is any cell of the union set inside this world rectangle (chunk precision)? */
  private revealedNear(x0: number, y0: number, x1: number, y1: number) {
    const c0x = Math.floor(x0 / CHUNK_PX), c1x = Math.floor((x1 - 1) / CHUNK_PX);
    const c0y = Math.floor(y0 / CHUNK_PX), c1y = Math.floor((y1 - 1) / CHUNK_PX);
    if ((c1x - c0x + 1) * (c1y - c0y + 1) > this.union.size) {
      for (const k of this.union.keys()) {
        const [cx, cy] = k.split(',').map(Number);
        if (cx >= c0x && cx <= c1x && cy >= c0y && cy <= c1y) return true;
      }
      return false;
    }
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) if (this.union.has(`${cx},${cy}`)) return true;
    return false;
  }

  private tile(url: string) {
    let t = this.tiles.get(url);
    if (!t) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      t = { img, ok: false, used: this.frame };
      const rec = t;
      img.onload = () => { rec.ok = true; this.draw(); };
      img.onerror = () => { this.tiles.delete(url); };
      img.src = url;
      this.tiles.set(url, t);
    }
    t.used = this.frame;
    return t;
  }

  private drawLevel(part: Part, level: number, request: boolean) {
    const ctx = this.ctx;
    const s = 2 ** (part.maxLevel - level); // world px per level px
    const lw = Math.ceil(part.w / s), lh = Math.ceil(part.h / s);
    const tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h);
    const lx0 = Math.max(0, (tl.x - part.x) / s), ly0 = Math.max(0, (tl.y - part.y) / s);
    const lx1 = Math.min(lw, (br.x - part.x) / s), ly1 = Math.min(lh, (br.y - part.y) / s);
    if (lx1 <= lx0 || ly1 <= ly0) return;
    const T = part.tile, O = part.overlap;
    for (let row = Math.floor(ly0 / T); row <= Math.floor((ly1 - 1) / T); row++) {
      for (let col = Math.floor(lx0 / T); col <= Math.floor((lx1 - 1) / T); col++) {
        const wx = part.x + col * T * s, wy = part.y + row * T * s;
        if (!this.revealedNear(wx, wy, wx + T * s, wy + T * s)) continue; // never fetch hidden areas
        const url = `${part.files}${level}/${col}_${row}.${part.format}`;
        const t = request ? this.tile(url) : this.tiles.get(url);
        if (!t?.ok) continue;
        if (!request) t.used = this.frame;
        const ox = col > 0 ? O : 0, oy = row > 0 ? O : 0;
        const p = this.toScreen(wx - ox * s, wy - oy * s);
        ctx.drawImage(t.img, p.x, p.y, t.img.naturalWidth * s * this.scale, t.img.naturalHeight * s * this.scale);
      }
    }
  }

  /** Force the fog image of some chunks to be rebuilt (after a brush stroke). */
  invalidateChunks(keys: Iterable<string>) {
    for (const k of keys) this.chunkCanvases.delete(k);
    this.draw();
  }

  private chunkCanvas(key: string, mask: Uint8Array) {
    let c = this.chunkCanvases.get(key);
    if (c && c.ver === this.unionVersion) return c.c;
    const canvas = c?.c ?? document.createElement('canvas');
    canvas.width = CHUNK; canvas.height = CHUNK;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(CHUNK, CHUNK);
    for (let i = 0; i < CHUNK * CHUNK; i++) if (mask[i >> 3] & (1 << (i & 7))) img.data[i * 4 + 3] = 255;
    g.putImageData(img, 0, 0);
    this.chunkCanvases.set(key, { ver: this.unionVersion, c: canvas });
    return canvas;
  }

  private render() {
    this.frame++;
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, this.h);

    // 1) map tiles (coarse level first as a placeholder, then the right level)
    if (this.showTiles) {
      ctx.imageSmoothingEnabled = this.scale < 1;
      for (const part of this.parts) {
        const ideal = part.maxLevel - Math.log2(1 / this.scale);
        const level = Math.max(0, Math.min(part.maxLevel, Math.ceil(ideal)));
        for (let l = Math.max(0, level - 4); l < level; l++) this.drawLevel(part, l, false);
        if (level - 3 >= 0) this.drawLevel(part, level - 3, true);
        this.drawLevel(part, level, true);
      }
    } else {
      ctx.fillStyle = '#3a2a1d';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // 2) fog: black everywhere, punched out where the union is revealed
    const f = this.fctx;
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, this.w, this.h);
    f.fillStyle = '#000';
    f.fillRect(0, 0, this.w, this.h);
    f.globalCompositeOperation = 'destination-out';
    f.imageSmoothingEnabled = false;
    const tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h);
    for (const [k, m] of this.union) {
      const [cx, cy] = k.split(',').map(Number);
      const x0 = cx * CHUNK_PX, y0 = cy * CHUNK_PX;
      if (x0 > br.x || y0 > br.y || x0 + CHUNK_PX < tl.x || y0 + CHUNK_PX < tl.y) continue;
      const p = this.toScreen(x0, y0);
      const size = CHUNK_PX * this.scale;
      f.drawImage(this.chunkCanvas(k, m), Math.floor(p.x), Math.floor(p.y), Math.ceil(size + 1), Math.ceil(size + 1));
    }
    f.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fogCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 3) outlines (one per visible player)
    if (this.outlines.length) {
      ctx.save();
      ctx.translate(this.w / 2, this.h / 2);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.cx, -this.cy);
      ctx.lineJoin = 'round';
      // soft warm glow where the fog ends (two wide translucent passes, no blur filter = cheap)
      ctx.setLineDash([]);
      for (const [w, a] of [[14, 0.06], [7, 0.1]] as const) {
        ctx.lineWidth = w / this.scale;
        ctx.strokeStyle = `rgba(255, 190, 90, ${a})`;
        for (const o of this.outlines) ctx.stroke(o.path);
      }
      ctx.lineWidth = Math.max(1.5, 2.5 * Math.min(1, this.scale * 8)) / this.scale;
      this.outlines.forEach((o, i) => {
        ctx.strokeStyle = o.color;
        ctx.setLineDash(this.outlines.length > 1 && i % 2 ? [6 / this.scale, 4 / this.scale] : []);
        ctx.stroke(o.path);
      });
      ctx.restore();
    }

    // 3b) routes (screen space, so the dash stays the same size at every zoom)
    for (const r of this.routes) {
      if (r.points.length < 2) continue;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      r.points.forEach((pt, i) => { const s = this.toScreen(pt.x, pt.y - 12 / this.scale); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = r.color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }

    // 3c) fading trails behind live players (small pixel squares, oldest = faintest)
    for (const tr of this.trails) {
      const n = tr.points.length;
      ctx.fillStyle = tr.color;
      tr.points.forEach((pt, i) => {
        const s = this.toScreen(pt.x, pt.y);
        if (s.x < -10 || s.y < -10 || s.x > this.w + 10 || s.y > this.h + 10) return;
        const k = (i + 1) / n;
        ctx.globalAlpha = 0.08 + 0.55 * k;
        const size = Math.round(2 + 3 * k);
        ctx.fillRect(Math.round(s.x - size / 2), Math.round(s.y - size / 2), size, size);
      });
      ctx.globalAlpha = 1;
    }

    // 4) markers
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const m of this.markers) {
      const p = this.toScreen(m.x, m.y);
      if (p.x < -30 || p.y < -30 || p.x > this.w + 30 || p.y > this.h + 30) continue;
      if (m.id === this.focus) {
        const r = 18 + 4 * Math.sin(performance.now() / 200);
        ctx.strokeStyle = '#f0cf7a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y - 12, r, 0, Math.PI * 2); ctx.stroke();
      }
      if (m.kind === 'player') {
        ctx.fillStyle = m.color ?? '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = '600 12px "Alegreya Sans", sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(m.title, p.x, p.y - 10);
        continue;
      }
      if (m.kind === 'quest') {
        // numbered badge, drawn so its centre sits where emoji markers sit (hit test: y - 12)
        const cy = p.y - 12;
        ctx.fillStyle = m.color ?? '#d4af55';
        ctx.strokeStyle = '#1a1008';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, cy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = '700 12px "Alegreya Sans", sans-serif';
        ctx.fillStyle = '#1a1008';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.icon, p.x, cy + 1);
        ctx.textBaseline = 'bottom';
        if (this.scale > 0.15) {
          ctx.font = '600 12px "Alegreya Sans", sans-serif';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.strokeText(m.title, p.x, p.y + 14);
          ctx.fillStyle = '#f0e2c0';
          ctx.fillText(m.title, p.x, p.y + 14);
        }
        continue;
      }
      ctx.font = '22px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(m.icon, p.x, p.y);
      ctx.shadowBlur = 0;
      if (this.scale > 0.15) {
        ctx.font = '600 12px "Alegreya Sans", sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(m.title, p.x, p.y + 14);
        ctx.fillStyle = '#f0e2c0';
        ctx.fillText(m.title, p.x, p.y + 14);
      }
    }
    // keep the focus ring pulsing, at ~15 fps: a full redraw (tiles + fog) every frame is costly
    if (this.focus && !this.pulseTimer) this.pulseTimer = setTimeout(() => { this.pulseTimer = 0; this.draw(); }, 66);

    // 5) brush preview
    if (this.brushing() && this.mouse) {
      ctx.strokeStyle = this.tool === 'hide' ? '#e57b67' : '#f0cf7a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, this.brushPx, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.error) {
      ctx.fillStyle = '#ff9c86';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(this.error, 12, this.h - 12);
    }

    // drop tiles not used for a while
    if (this.tiles.size > 600) {
      const old = [...this.tiles].sort((a, b) => a[1].used - b[1].used).slice(0, this.tiles.size - 450);
      for (const [k, t] of old) { t.img.src = ''; this.tiles.delete(k); }
    }
  }
}

// ---------------------------------------------------------------------------
/** Outline of a grid's revealed area as a world-space path (merged edge runs). */
export function outlinePath(grid: FogGrid): Path2D {
  const path = new Path2D();
  const bit = (m: Uint8Array | undefined, lx: number, ly: number) => {
    if (!m) return false;
    const i = ly * CHUNK + lx;
    return (m[i >> 3] & (1 << (i & 7))) !== 0;
  };
  const at = (gx: number, gy: number) => {
    const cx = Math.floor(gx / CHUNK), cy = Math.floor(gy / CHUNK);
    return bit(grid.get(`${cx},${cy}`), gx - cx * CHUNK, gy - cy * CHUNK);
  };
  for (const [k, m] of grid) {
    if (!m.some((b) => b)) continue;
    const [cx, cy] = k.split(',').map(Number);
    const gx0 = cx * CHUNK, gy0 = cy * CHUNK;
    // horizontal edges (top & bottom of each row), merged into runs
    for (let ly = 0; ly < CHUNK; ly++) {
      for (const dy of [-1, 1]) {
        let run = -1;
        for (let lx = 0; lx <= CHUNK; lx++) {
          const edge = lx < CHUNK && bit(m, lx, ly) && !at(gx0 + lx, gy0 + ly + dy);
          if (edge && run < 0) run = lx;
          if (!edge && run >= 0) {
            const y = (gy0 + ly + (dy > 0 ? 1 : 0)) * CELL;
            path.moveTo((gx0 + run) * CELL, y);
            path.lineTo((gx0 + lx) * CELL, y);
            run = -1;
          }
        }
      }
    }
    // vertical edges (left & right of each column)
    for (let lx = 0; lx < CHUNK; lx++) {
      for (const dx of [-1, 1]) {
        let run = -1;
        for (let ly = 0; ly <= CHUNK; ly++) {
          const edge = ly < CHUNK && bit(m, lx, ly) && !at(gx0 + lx + dx, gy0 + ly);
          if (edge && run < 0) run = ly;
          if (!edge && run >= 0) {
            const x = (gx0 + lx + (dx > 0 ? 1 : 0)) * CELL;
            path.moveTo(x, (gy0 + run) * CELL);
            path.lineTo(x, (gy0 + ly) * CELL);
            run = -1;
          }
        }
      }
    }
  }
  return path;
}
