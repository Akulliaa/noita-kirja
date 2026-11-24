// Generic live-synced table: loads all rows once, then follows Supabase Realtime.
import { supabase } from './supabase';
import type { Profile } from './types';

export interface Live<T> {
  readonly state: { loaded: boolean; items: T[]; error: string };
  start(): void;
  reload(): Promise<void>;
  get(id: string): T | undefined;
}

export function liveTable<T extends { id: string }>(table: string, order: string, ascending = true): Live<T> {
  const state = $state<{ loaded: boolean; items: T[]; error: string }>({ loaded: false, items: [], error: '' });
  let started = false;

  async function reload() {
    const out: T[] = [];
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).range(from, from + 999);
        if (error) throw error;
        out.push(...((data as T[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      state.items = out;
      state.error = '';
    } catch (e: any) {
      state.error = e?.message ?? String(e);
    }
    state.loaded = true;
  }

  function start() {
    if (started) return;
    started = true;
    reload();
    supabase
      .channel(`live-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
        if (p.eventType === 'DELETE') {
          state.items = state.items.filter((x) => x.id !== (p.old as T).id);
        } else {
          const row = p.new as T;
          const i = state.items.findIndex((x) => x.id === row.id);
          if (i >= 0) state.items[i] = row;
          else state.items.push(row);
        }
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED' && state.loaded) reload(); });
  }

  return { state, start, reload, get: (id) => state.items.find((x) => x.id === id) };
}

export const people = liveTable<Profile>('profiles', 'username');
export const personName = (id: string | null | undefined) =>
  (id && people.get(id)?.username) || '—';
export const personColor = (id: string | null | undefined) =>
  (id && people.get(id)?.color) || '#888888';
