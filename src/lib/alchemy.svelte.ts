// Shared, live-synced alchemy data (elements + mixtures) for every page.
import { supabase } from './supabase';
import type { Element, Mixture } from './types';

export const alchemy = $state<{ loaded: boolean; elements: Element[]; mixtures: Mixture[]; error: string }>({
  loaded: false,
  elements: [],
  mixtures: [],
  error: '',
});

let started = false;

async function fetchAll<T>(table: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...((data as T[]) ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function reloadAlchemy() {
  try {
    const [els, mixes] = await Promise.all([
      fetchAll<Element>('elements', 'name'),
      fetchAll<Mixture>('mixtures', 'created_at'),
    ]);
    alchemy.elements = els;
    alchemy.mixtures = mixes;
    alchemy.error = '';
  } catch (e: any) {
    alchemy.error = e?.message ?? String(e);
  }
  alchemy.loaded = true;
}

function upsert<T extends { id: string }>(list: T[], row: T) {
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
}

/** Load once and keep in sync through Supabase Realtime. */
export function startAlchemy() {
  if (started) return;
  started = true;
  reloadAlchemy();
  supabase
    .channel('alchemy')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'elements' }, (p) => {
      if (p.eventType === 'DELETE') alchemy.elements = alchemy.elements.filter((e) => e.id !== (p.old as Element).id);
      else upsert(alchemy.elements, p.new as Element);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mixtures' }, (p) => {
      if (p.eventType === 'DELETE') alchemy.mixtures = alchemy.mixtures.filter((m) => m.id !== (p.old as Mixture).id);
      else upsert(alchemy.mixtures, p.new as Mixture);
    })
    .subscribe((status) => {
      // After a reconnection, resync to catch anything missed.
      if (status === 'SUBSCRIBED' && alchemy.loaded) reloadAlchemy();
    });
}

// ---- Helpers --------------------------------------------------------------
export const norm = (s: string) => s.trim().toLowerCase();

export function elementName(id: string | null): string {
  if (!id) return '?';
  return alchemy.elements.find((e) => e.id === id)?.name ?? '?';
}

export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export const ingredientsKey = (ids: string[]) => [...ids].sort().join(',');

/** Find an element by name, or create it (admin only). */
export async function ensureElement(name: string): Promise<string> {
  const n = name.trim();
  const found = alchemy.elements.find((e) => norm(e.name) === norm(n));
  if (found) return found.id;
  const { data, error } = await supabase.from('elements').insert({ name: n }).select().single();
  if (error) throw error;
  upsert(alchemy.elements, data as Element);
  return (data as Element).id;
}
