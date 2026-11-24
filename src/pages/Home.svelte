<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { auth, isAdmin } from '../lib/auth.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import { personName } from '../lib/live.svelte';
  import { KIND_ICON } from '../lib/noteMeta';
  import { lt } from '../lib/loc';
  import Cauldron from '../components/Cauldron.svelte';
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
      supabase.from('notes').select('id,title,title_tr,lang,kind,updated_by,updated_at').order('updated_at', { ascending: false }).limit(6),
      supabase.from('books').select('id,title,title_tr,lang,created_by,updated_at').order('updated_at', { ascending: false }).limit(6),
    ]);
    recent = [
      ...(rn.data ?? []).map((x: any) => ({ href: `#/notes/${x.id}`, icon: KIND_ICON[x.kind as NoteKind], title: lt(x, 'title'), who: x.updated_by, at: x.updated_at })),
      ...(rb.data ?? []).map((x: any) => ({ href: `#/library/${x.id}`, icon: '📚', title: lt(x, 'title'), who: x.created_by, at: x.updated_at })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
    if (isAdmin()) pending = await count('profiles', (q) => q.eq('role', 'pending'));
  });
</script>

<section class="hero card">
  <div class="art"><Cauldron /></div>
  <div class="txt">
    <p class="kicker">✦ {t('app.tagline')} ✦</p>
    <h1>{t('home.welcome', { name: auth.profile?.username ?? '' })}</h1>
    <p class="muted">{t('home.heroText')}</p>
    <div class="row">
      <a class="btn primary" href="#/mixtures">⚗️ {t('nav.mixtures')}</a>
      <a class="btn" href="#/map">🗺️ {t('nav.map')}</a>
      <a class="btn" href="#/notes">📜 {t('nav.notes')}</a>
    </div>
  </div>
</section>

{#if pending > 0}
  <div class="card alert row">
    <span>🔔 {t('home.pending', { n: pending })}</span>
    <span class="spacer"></span>
    <a class="btn" href="#/admin">{t('home.pending.go')}</a>
  </div>
{/if}

<div class="grid">
  {#each stats as s, i}
    <a class="tile" href={s.href} style:--d={`${i * 60}ms`}>
      <span class="slotbox"><span class="icon">{s.icon}</span></span>
      <span class="n">{s.n ?? '…'}</span>
      <span class="label">{t(s.key)}</span>
    </a>
  {/each}
</div>

{#if recent.length}
  <section class="card recent">
    <div class="row"><h2>🕓 {t('home.recent')}</h2><span class="spacer"></span><a href="#/activity">{t('act.seeAll')} →</a></div>
    <ul>
      {#each recent as r (r.href)}
        <li><a href={r.href}><span class="ri">{r.icon}</span> {r.title}</a><span class="muted"> — {personName(r.who)} · {fmt(r.at)}</span></li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .hero {
    display: grid; grid-template-columns: 220px 1fr; gap: 1.5rem; align-items: center; overflow: hidden;
    background-image:
      radial-gradient(ellipse at 12% 70%, rgba(141, 255, 106, 0.12), transparent 50%),
      radial-gradient(ellipse at 100% 0%, rgba(180, 108, 255, 0.16), transparent 55%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
  }
  .art { width: 220px; height: 190px; }
  .kicker { margin: 0 0 0.3rem; font-family: var(--font-title); color: var(--magic); letter-spacing: 0.08em; text-shadow: 0 0 10px rgba(180, 108, 255, 0.6); }
  .hero h1 { margin-bottom: 0.3rem; }
  .hero .muted { margin: 0 0 1rem; max-width: 60ch; }
  @media (max-width: 700px) { .hero { grid-template-columns: 1fr; text-align: center; } .art { margin: 0 auto; width: 160px; height: 140px; } .hero .row { justify-content: center; } }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.9rem; margin-top: 1.4rem; }
  .tile {
    display: grid; justify-items: center; gap: 0.35rem; padding: 1rem 0.5rem 0.9rem; text-decoration: none; color: var(--text);
    background: var(--stone-1); border: 2px solid transparent; border-image: var(--px-gold) 3 / 6px stretch; background-clip: padding-box;
    box-shadow: var(--shadow); transition: transform 0.12s; animation: pop 0.35s var(--d) both;
  }
  .tile:hover { transform: translateY(-4px); border-image-source: var(--px-bright); }
  .tile:hover .slotbox { box-shadow: inset 0 4px 0 rgba(0, 0, 0, 0.5), 0 0 18px rgba(255, 190, 80, 0.45); }
  @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }
  .slotbox {
    width: 54px; height: 54px; display: grid; place-items: center; background: var(--cave-0);
    border: 2px solid transparent; border-image: var(--px-stone) 3 / 6px stretch; background-clip: padding-box;
    box-shadow: inset 0 4px 0 rgba(0, 0, 0, 0.5); transition: box-shadow 0.15s;
  }
  .icon { font-size: 1.7rem; filter: drop-shadow(2px 2px 0 #000); }
  .n { font-family: var(--font-title); font-size: 2rem; font-weight: 700; color: var(--gold-bright); text-shadow: 0 0 12px rgba(255, 190, 80, 0.4), 2px 2px 0 #000; line-height: 1; }
  .label { color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.78rem; font-family: var(--font-title); }

  .alert { margin-top: 1rem; border-image-source: var(--px-magic); }
  .recent { margin-top: 1.5rem; }
  .recent h2 { margin: 0; }
  .recent ul { list-style: none; padding: 0; margin: 0.8rem 0 0; display: grid; gap: 0.15rem; }
  .recent li { padding: 0.35rem 0.4rem; border-bottom: 2px dotted rgba(70, 56, 86, 0.6); }
  .recent a { text-decoration: none; font-weight: 700; }
  .ri { display: inline-block; width: 1.4rem; text-align: center; }
</style>
