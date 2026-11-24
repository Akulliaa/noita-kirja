// Every player's explored area, loaded once and kept live through Realtime.
import { supabase } from './supabase';
import { liveChannel } from './realtime';
import { fromHex, CHUNK, type FogGrid } from './fog';

export const fog = $state<{ loaded: boolean; version: number; error: string }>({ loaded: false, version: 0, error: '' });
export const grids = new Map<string, FogGrid>(); // playerId -> grid (not reactive: watch fog.version)

let started = false;

let lastFull = 0;
let newest = 0; // most recent updated_at seen (ms), for incremental syncs
const ms = (s?: string) => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : 0; };

function put(player: string, cx: number, cy: number, bits: string | Uint8Array, into = grids) {
  let g = into.get(player);
  if (!g) { g = new Map(); into.set(player, g); }
  g.set(`${cx},${cy}`, typeof bits === 'string' ? fromHex(bits) : bits);
}

export async function reloadFog() {
  try {
    // Build into a fresh map and swap at the end: the map never flashes empty.
    const next = new Map<string, FogGrid>();
    let top = 0;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('fog_chunks').select('player_id,cx,cy,bits,updated_at')
        .order('player_id').order('cx').order('cy').range(from, from + 999);
      if (error) throw error;
      for (const r of data ?? []) {
        put(r.player_id, r.cx, r.cy, r.bits as unknown as string, next);
        top = Math.max(top, ms(r.updated_at));
      }
      if (!data || data.length < 1000) break;
    }
    grids.clear();
    for (const [k, v] of next) grids.set(k, v);
    newest = top;
    lastFull = Date.now();
    fog.error = '';
  } catch (e: any) {
    fog.error = e?.message ?? String(e);
  }
  fog.loaded = true;
  fog.version++;
}

/** Fetch only chunks changed recently (cheap). Falls back to a full reload now and then. */
async function syncFog() {
  if (!fog.loaded) return;
  if (!newest || Date.now() - lastFull > 10 * 60_000) return reloadFog();
  // 2 min margin for clock differences / slow transactions
  const since = new Date(newest - 120_000).toISOString();
  const { data, error } = await supabase.from('fog_chunks').select('player_id,cx,cy,bits,updated_at')
    .gt('updated_at', since).order('updated_at').limit(1000);
  if (error) return;
  if (data.length >= 1000) return reloadFog();
  for (const r of data) {
    put(r.player_id, r.cx, r.cy, r.bits as unknown as string);
    newest = Math.max(newest, ms(r.updated_at));
  }
  if (data.length) fog.version++;
}

export function startFog() {
  if (started) return;
  started = true;
  reloadFog();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const bump = () => { if (!timer) timer = setTimeout(() => { timer = null; fog.version++; }, 250); };
  liveChannel('fog', (ch) => ch
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fog_chunks' }, (p) => {
      if (p.eventType === 'DELETE') {
        const o = p.old as { player_id?: string; cx?: number; cy?: number };
        if (o.player_id !== undefined) grids.get(o.player_id)?.delete(`${o.cx},${o.cy}`);
        else { reloadFog(); return; }
      } else {
        const n = p.new as { player_id: string; cx: number; cy: number; bits: string; updated_at?: string };
        put(n.player_id, n.cx, n.cy, n.bits);
        newest = Math.max(newest, ms(n.updated_at));
      }
      bump();
    }), { resync: syncFog, pollMs: 30_000 });
}

/** Locally apply a change (instant feedback before the server confirms). */
export function localApply(player: string, delta: FogGrid, hide: boolean) {
  let g = grids.get(player);
  if (!g) { g = new Map(); grids.set(player, g); }
  for (const [k, m] of delta) {
    let cur = g.get(k);
    if (!cur) { if (hide) continue; cur = new Uint8Array(m.length); g.set(k, cur); }
    for (let i = 0; i < m.length; i++) cur[i] = hide ? cur[i] & ~m[i] : cur[i] | m[i];
  }
  fog.version++;
}

/** OR of several players' grids. */
export function unionOf(players: string[]): FogGrid {
  const out: FogGrid = new Map();
  for (const p of players) {
    const g = grids.get(p);
    if (!g) continue;
    for (const [k, m] of g) {
      const cur = out.get(k);
      if (!cur) out.set(k, m.slice());
      else for (let i = 0; i < m.length; i++) cur[i] |= m[i];
    }
  }
  return out;
}

/** Number of explored cells of a player. */
export function exploredCells(player: string): number {
  const g = grids.get(player);
  if (!g) return 0;
  let n = 0;
  for (const m of g.values()) for (const b of m) { let x = b; while (x) { n += x & 1; x >>= 1; } }
  return n;
}

/** Bounding box (world px) of a grid, or null when empty. */
export function boundsOf(grid: FogGrid, cell: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [k, m] of grid) {
    if (!m.some((b) => b)) continue;
    const [cx, cy] = k.split(',').map(Number);
    x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx + 1); y1 = Math.max(y1, cy + 1);
  }
  if (x0 === Infinity) return null;
  const s = CHUNK * cell;
  return { x0: x0 * s, y0: y0 * s, x1: x1 * s, y1: y1 * s };
}
