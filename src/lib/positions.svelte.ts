// Live player positions sent by the tracker mod.
import { supabase } from './supabase';

export interface Position { player_id: string; x: number; y: number; updated_at: string }

export const positions = $state<{ items: Record<string, Position>; now: number }>({ items: {}, now: Date.now() });
let started = false;

async function reload() {
  const { data } = await supabase.from('player_positions').select('*');
  const out: Record<string, Position> = {};
  for (const p of (data as Position[]) ?? []) out[p.player_id] = p;
  positions.items = out;
}

export function startPositions() {
  if (started) return;
  started = true;
  reload();
  setInterval(() => (positions.now = Date.now()), 15000);
  supabase
    .channel('positions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_positions' }, (p) => {
      if (p.eventType === 'DELETE') reload();
      else { const n = p.new as Position; positions.items[n.player_id] = n; positions.now = Date.now(); }
    })
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload(); });
}

/** Seconds since the last signal, or null if never. */
export function ageSeconds(playerId: string): number | null {
  const p = positions.items[playerId];
  if (!p) return null;
  return Math.max(0, (positions.now - new Date(p.updated_at).getTime()) / 1000);
}

export const isLive = (playerId: string) => { const a = ageSeconds(playerId); return a !== null && a < 120; };
