// Exploration fog stored as bitmaps: 1 cell = CELL world px, 1 chunk = CHUNK×CHUNK cells.
// Must match supabase/migrations/001_init.sql (512-byte masks, LSB-first, row-major).
import { supabase } from './supabase';

export const CELL = 32;
export const CHUNK = 64;
export const CHUNK_PX = CELL * CHUNK; // 2048 world px
export const MASK_BYTES = (CHUNK * CHUNK) / 8; // 512

export type FogGrid = Map<string, Uint8Array>; // "cx,cy" -> mask

const keyOf = (cx: number, cy: number) => `${cx},${cy}`;
export const parseKey = (k: string) => k.split(',').map(Number) as [number, number];

function chunk(grid: FogGrid, cx: number, cy: number) {
  const k = keyOf(cx, cy);
  let m = grid.get(k);
  if (!m) { m = new Uint8Array(MASK_BYTES); grid.set(k, m); }
  return m;
}

export function setCell(grid: FogGrid, gx: number, gy: number, clear = false) {
  const cx = Math.floor(gx / CHUNK), cy = Math.floor(gy / CHUNK);
  const lx = gx - cx * CHUNK, ly = gy - cy * CHUNK;
  const i = ly * CHUNK + lx;
  const m = chunk(grid, cx, cy);
  if (clear) m[i >> 3] &= ~(1 << (i & 7));
  else m[i >> 3] |= 1 << (i & 7);
}

export function getCell(grid: FogGrid, gx: number, gy: number) {
  const cx = Math.floor(gx / CHUNK), cy = Math.floor(gy / CHUNK);
  const m = grid.get(keyOf(cx, cy));
  if (!m) return false;
  const i = (gy - cy * CHUNK) * CHUNK + (gx - cx * CHUNK);
  return (m[i >> 3] & (1 << (i & 7))) !== 0;
}

/** Mark every cell whose center is inside the circle (world coordinates). */
export function rasterizeCircle(grid: FogGrid, x: number, y: number, r: number, clear = false) {
  const g0x = Math.floor((x - r) / CELL), g1x = Math.floor((x + r) / CELL);
  const g0y = Math.floor((y - r) / CELL), g1y = Math.floor((y + r) / CELL);
  const r2 = r * r;
  for (let gy = g0y; gy <= g1y; gy++) {
    const dy = (gy + 0.5) * CELL - y;
    for (let gx = g0x; gx <= g1x; gx++) {
      const dx = (gx + 0.5) * CELL - x;
      if (dx * dx + dy * dy <= r2) setCell(grid, gx, gy, clear);
    }
  }
}

export const toHex = (m: Uint8Array) => Array.from(m, (b) => b.toString(16).padStart(2, '0')).join('');

export function fromHex(s: string): Uint8Array {
  const h = s.startsWith('\\x') ? s.slice(2) : s;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

/** Send a grid to the server (OR for reveal, AND-NOT for hide), in batches. */
export async function applyFog(
  playerId: string,
  grid: FogGrid,
  hide = false,
  progress?: (done: number, total: number) => void,
) {
  const entries = [...grid].filter(([, m]) => m.some((b) => b !== 0));
  const BATCH = 40;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunks = entries.slice(i, i + BATCH).map(([k, m]) => {
      const [cx, cy] = parseKey(k);
      return { cx, cy, mask: toHex(m) };
    });
    const { error } = await supabase.rpc('fog_apply', { p_player: playerId, p_chunks: chunks, p_hide: hide });
    if (error) throw error;
    progress?.(Math.min(i + BATCH, entries.length), entries.length);
  }
  return entries.length;
}

/** Load one player's whole fog grid. */
export async function loadFog(playerId: string): Promise<FogGrid> {
  const grid: FogGrid = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('fog_chunks').select('cx,cy,bits').eq('player_id', playerId).range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) grid.set(keyOf(r.cx, r.cy), fromHex(r.bits as unknown as string));
    if (!data || data.length < PAGE) break;
  }
  return grid;
}
