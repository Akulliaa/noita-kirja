// Hidden secret titles, unlocked server-side by the tracker (see migration 009).
// Only titles somebody in the team has found are ever described by the server.
import { supabase } from './supabase';
import { liveChannel } from './realtime';
import { auth } from './auth.svelte';
import type { Lang } from './types';
import { sfx } from './sound.svelte';

export interface SecretGroup { id: string; icon: string; tiers: ({ n: number } & Record<Lang, string>)[] }
interface Found { player: string; grp: string; n: number; at: string }

export const secrets = $state<{
  loaded: boolean;
  total: number;
  groups: Record<string, SecretGroup>;
  found: Record<string, Record<string, number>>; // player -> group -> zones found
  toast: { icon: string; name: Record<Lang, string> } | null;
}>({ loaded: false, total: 0, groups: {}, found: {}, toast: null });

let started = false;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** Level reached in a group (0..tiers) for some number of zones found. */
export function secretLevel(g: SecretGroup, n: number) {
  let level = 0;
  while (level < g.tiers.length && n >= g.tiers[level].n) level++;
  return { level, cur: level ? g.tiers[level - 1] : null, next: g.tiers[level] ?? null };
}

/** Unlocked secret titles of a player. */
export function secretsOf(player: string) {
  const mine = secrets.found[player] ?? {};
  return Object.entries(mine)
    .map(([grp, n]) => ({ g: secrets.groups[grp], n }))
    .filter((x) => x.g && secretLevel(x.g, x.n).level > 0)
    .map(({ g, n }) => ({ g, n, ...secretLevel(g, n) }));
}

async function reload(announce = false) {
  const { data, error } = await supabase.rpc('secret_titles');
  if (error || !data) return; // migration 009 not run yet, or offline: just no secrets
  const wasLoaded = secrets.loaded;
  const before = auth.profile ? { ...(secrets.found[auth.profile.id] ?? {}) } : {};
  const groups: Record<string, SecretGroup> = {};
  for (const g of data.groups as SecretGroup[]) groups[g.id] = g;
  const found: Record<string, Record<string, number>> = {};
  for (const f of data.found as Found[]) (found[f.player] ??= {})[f.grp] = f.n;
  secrets.total = data.total;
  secrets.groups = groups;
  secrets.found = found;
  secrets.loaded = true;

  // Celebrate a new level of my own secret titles
  if (announce && wasLoaded && auth.profile) {
    for (const [grp, n] of Object.entries(found[auth.profile.id] ?? {})) {
      const g = groups[grp];
      if (!g) continue;
      const was = secretLevel(g, before[grp] ?? 0).level, now = secretLevel(g, n);
      if (now.level > was && now.cur) {
        secrets.toast = { icon: g.icon, name: { fr: now.cur.fr, en: now.cur.en } };
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (secrets.toast = null), 7000);
        sfx('chime');
        break;
      }
    }
  }
}

export function startSecrets() {
  if (started) return;
  started = true;
  reload();
  liveChannel('secrets', (ch) => ch
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'player_secrets' }, () => reload(true)),
    { resync: () => reload(true) });
}
