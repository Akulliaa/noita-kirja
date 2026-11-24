// Live player positions sent by the tracker mod.
import { supabase } from './supabase';
import { liveChannel } from './realtime';

export interface Position { player_id: string; x: number; y: number; updated_at: string }

export const positions = $state<{ items: Record<string, Position>; now: number }>({ items: {}, now: Date.now() });
let started = false;

async function reload() {
  const { data, error } = await supabase.from('player_positions').select('*');
  if (error) return; // keep what we had; the next sync will retry
  const out: Record<string, Position> = {};
  for (const p of (data as Position[]) ?? []) out[p.player_id] = p;
  positions.items = out;
  positions.now = Date.now();
}

export function startPositions() {
  if (started) return;
  started = true;
  reload();
  setInterval(() => (positions.now = Date.now()), 15000);
  liveChannel('positions', (ch) => ch
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_positions' }, (p) => {
      if (p.eventType === 'DELETE') reload();
      else { const n = p.new as Position; positions.items[n.player_id] = n; positions.now = Date.now(); }
    }), { resync: reload, pollMs: 15_000 });
}

/** Seconds since the last signal, or null if never. */
export function ageSeconds(playerId: string): number | null {
  const p = positions.items[playerId];
  if (!p) return null;
  return Math.max(0, (positions.now - new Date(p.updated_at).getTime()) / 1000);
}

export const isLive = (playerId: string) => { const a = ageSeconds(playerId); return a !== null && a < 120; };
