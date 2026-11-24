<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { auth, isAdmin } from '../lib/auth.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import { personName } from '../lib/live.svelte';
  import { KIND_ICON } from '../lib/noteMeta';
  import type { NoteKind } from '../lib/types';
  const fmt = (s: string) => new Date(s).toLocaleString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  let stats = $state<{ key: Key; icon: string; n: number | null; href: string }[]>([
    { key: 'home.stats.elements', icon: '💧', n: null, href: '#/elements' },
    { key: 'home.stats.mixtures', icon: '⚗️', n: null, href: '#/mixtures' },
    { key: 'home.stats.notes', icon: '📜', n: null, href: '#/notes' },
    { key: 'home.stats.books', icon: '📚', n: null, href: '#/library' },
    { key: 'home.stats.glyphs', icon: '🔣', n: null, href: '#/rosetta' },
    { key: 'home.stats.players', icon: '🧙', n: null, href: '#/players' },
  ]);
  type Recent = { href: string; icon: string; title: string; who: string | null; at: string };
  let recent = $state<Recent[]>([]);
  let pending = $state(0);

  const count = async (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count } = await q;
    return count ?? 0;
  };

  onMount(async () => {
    const [e, m, n, b, g, p] = await Promise.all([
      count('elements'),
      count('mixtures'),
      count('notes'),
      count('books'),
      count('glyphs'),
      count('profiles', (q) => q.neq('role', 'pending')),
    ]);
    [e, m, n, b, g, p].forEach((v, i) => (stats[i].n = v));

    const [rn, rb] = await Promise.all([
      supabase.from('notes').select('id,title,kind,updated_by,updated_at').order('updated_at', { ascending: false }).limit(6),
      supabase.from('books').select('id,title,created_by,updated_at').order('updated_at', { ascending: false }).limit(6),
    ]);
    recent = [
      ...(rn.data ?? []).map((x: any) => ({ href: `#/notes/${x.id}`, icon: KIND_ICON[x.kind as NoteKind], title: x.title, who: x.updated_by, at: x.updated_at })),
      ...(rb.data ?? []).map((x: any) => ({ href: `#/library/${x.id}`, icon: '📚', title: x.title, who: x.created_by, at: x.updated_at })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
    if (isAdmin()) pending = await count('profiles', (q) => q.eq('role', 'pending'));
  });
</script>

<h1>{t('home.welcome', { name: auth.profile?.username ?? '' })}</h1>
<p class="muted">{t('app.tagline')}</p>

{#if pending > 0}
  <div class="card alert row">
    <span>🔔 {t('home.pending', { n: pending })}</span>
    <span class="spacer"></span>
    <a class="btn" href="#/admin">{t('home.pending.go')}</a>
  </div>
{/if}

<div class="grid">
  {#each stats as s}
    <a class="card stat" href={s.href}>
      <span class="icon">{s.icon}</span>
      <span class="n">{s.n ?? '…'}</span>
      <span class="label">{t(s.key)}</span>
    </a>
  {/each}
</div>

{#if recent.length}
  <section class="card recent">
    <h2>🕓 {t('home.recent')}</h2>
    <ul>
      {#each recent as r (r.href)}
        <li><a href={r.href}>{r.icon} {r.title}</a><span class="muted"> — {personName(r.who)} · {fmt(r.at)}</span></li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .recent { margin-top: 1.5rem; }
  .recent ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .recent a { text-decoration: none; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
  .stat { display: grid; justify-items: center; gap: 0.2rem; text-decoration: none; color: var(--text); transition: transform 0.15s, border-color 0.15s; }
  .stat:hover { transform: translateY(-3px); border-color: var(--gold); }
  .icon { font-size: 2rem; }
  .n { font-family: var(--font-title); font-size: 2.2rem; color: var(--gold-bright); font-weight: 800; }
  .label { color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.85rem; }
  .alert { margin-top: 1rem; border-color: #e0a96d; }
</style>
