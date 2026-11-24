<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { auth, isAdmin } from '../lib/auth.svelte';
  import { t, type Key } from '../lib/i18n.svelte';

  let stats = $state<{ key: Key; icon: string; n: number | null; href: string }[]>([
    { key: 'home.stats.elements', icon: '💧', n: null, href: '#/elements' },
    { key: 'home.stats.mixtures', icon: '⚗️', n: null, href: '#/mixtures' },
    { key: 'home.stats.notes', icon: '📜', n: null, href: '#/notes' },
    { key: 'home.stats.players', icon: '🧙', n: null, href: '#/players' },
  ]);
  let pending = $state(0);

  const count = async (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count } = await q;
    return count ?? 0;
  };

  onMount(async () => {
    const [e, m, n, p] = await Promise.all([
      count('elements'),
      count('mixtures'),
      count('notes'),
      count('profiles', (q) => q.neq('role', 'pending')),
    ]);
    stats[0].n = e; stats[1].n = m; stats[2].n = n; stats[3].n = p;
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

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
  .stat { display: grid; justify-items: center; gap: 0.2rem; text-decoration: none; color: var(--text); transition: transform 0.15s, border-color 0.15s; }
  .stat:hover { transform: translateY(-3px); border-color: var(--gold); }
  .icon { font-size: 2rem; }
  .n { font-family: var(--font-title); font-size: 2.2rem; color: var(--gold-bright); font-weight: 800; }
  .label { color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.85rem; }
  .alert { margin-top: 1rem; border-color: #e0a96d; }
</style>
