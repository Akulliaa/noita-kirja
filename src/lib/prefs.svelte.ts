// Personal preferences saved in the user's account (table user_prefs, private).
// A local copy makes them apply instantly; the account copy follows you everywhere.
import { supabase } from './supabase';
import { auth } from './auth.svelte';

export interface MapPrefs {
  hidden: string[];       // players hidden on the global map
  includeReaders: boolean;
  showPins: boolean;
  showBooks: boolean;
  showRunes: boolean;
  showQuests: boolean;
}
export interface Prefs { map: MapPrefs }

const DEFAULTS: Prefs = { map: { hidden: [], includeReaders: false, showPins: true, showBooks: true, showRunes: true, showQuests: true } };

function merge(raw: any): Prefs {
  const m = raw?.map ?? {};
  return {
    map: {
      hidden: Array.isArray(m.hidden) ? m.hidden.filter((x: unknown) => typeof x === 'string') : [],
      includeReaders: typeof m.includeReaders === 'boolean' ? m.includeReaders : DEFAULTS.map.includeReaders,
      showPins: typeof m.showPins === 'boolean' ? m.showPins : DEFAULTS.map.showPins,
      showBooks: typeof m.showBooks === 'boolean' ? m.showBooks : DEFAULTS.map.showBooks,
      showRunes: typeof m.showRunes === 'boolean' ? m.showRunes : DEFAULTS.map.showRunes,
      showQuests: typeof m.showQuests === 'boolean' ? m.showQuests : DEFAULTS.map.showQuests,
    },
  };
}

export const prefs = $state<{ loaded: boolean; value: Prefs }>({ loaded: false, value: merge(null) });

let loadedFor: string | null = null;
const cacheKey = (uid: string) => `nk-prefs-${uid}`;

/** Load the current user's preferences (cached copy first, then the account). */
export async function loadPrefs() {
  const uid = auth.profile?.id;
  if (!uid || loadedFor === uid) return;
  loadedFor = uid;
  try { const c = localStorage.getItem(cacheKey(uid)); if (c) prefs.value = merge(JSON.parse(c)); } catch {}
  prefs.loaded = true;
  const { data, error } = await supabase.from('user_prefs').select('prefs').eq('user_id', uid).maybeSingle();
  if (error || loadedFor !== uid) return; // table missing (migration not run) → local copy only
  if (data) {
    prefs.value = merge(data.prefs);
    try { localStorage.setItem(cacheKey(uid), JSON.stringify(prefs.value)); } catch {}
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Change the map preferences and save them (debounced). */
export function setMapPrefs(patch: Partial<MapPrefs>) {
  prefs.value.map = { ...prefs.value.map, ...patch };
  const uid = auth.profile?.id;
  if (!uid) return;
  const snapshot = JSON.parse(JSON.stringify(prefs.value));
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(snapshot)); } catch {}
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    supabase.from('user_prefs').upsert({ user_id: uid, prefs: snapshot, updated_at: new Date().toISOString() }).then(() => {});
  }, 600);
}
