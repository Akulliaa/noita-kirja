<script lang="ts">
  import { supabase } from '../lib/supabase';
  import { people } from '../lib/live.svelte';
  import { fog, startFog, exploredCells } from '../lib/fogStore.svelte';
  import { books } from '../lib/stores';
  import { auth } from '../lib/auth.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import { CELL } from '../lib/fog';
  import { positions, startPositions, ageSeconds } from '../lib/positions.svelte';
  startPositions();

  startFog(); books.start();

  // Area covered by the noitamap tiles (3 parts), in cells
  const MAP_CELLS = ((36352 + 36352 + 35840 - 1024) * 73728) / (CELL * CELL);

  const members = $derived(people.state.items.filter((p) => p.role !== 'pending'));
  const rows = $derived.by(() => {
    fog.version;
    return members
      .map((p) => ({ p, cells: exploredCells(p.id), books: books.state.items.filter((b) => b.found_by === p.id).length }))
      .sort((a, b) => (a.p.role === b.p.role ? b.cells - a.cells : a.p.role === 'admin' ? -1 : 1));
  });
  const maxCells = $derived(Math.max(1, ...rows.map((r) => r.cells)));

  async function setColor(c: string) {
    if (!auth.profile) return;
    const { error } = await supabase.from('profiles').update({ color: c }).eq('id', auth.profile.id);
    if (error) alert(error.message);
    else auth.profile.color = c;
  }

  const pct = (cells: number) => ((cells / MAP_CELLS) * 100).toLocaleString(i18n.lang, { maximumFractionDigits: 2 });
  const fmt = (s: string) => new Date(s).toLocaleDateString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
</script>

<div class="row head">
  <h1>🧙 {t('nav.players')}</h1>
  <span class="spacer"></span>
  <a class="btn" href="#/tracker">🎮 {t('nav.tracker')}</a>
  <a class="btn" href="#/map">🌍 {t('map.global')}</a>
</div>

<div class="grid">
  {#each rows as { p, cells, books: nb } (p.id)}
    <div class="card player" style:--c={p.color}>
      <div class="row top">
        <span class="avatar">{p.username.slice(0, 1).toUpperCase()}</span>
        <div>
          <h3>{p.username}</h3>
          <span class="badge {p.role}">{t(`role.${p.role}` as Key)}</span>
          {#if positions.now && ageSeconds(p.id) !== null}
            {@const a = ageSeconds(p.id)!}
            {#if a < 120}<span class="badge live">🟢 {t('trk.inGame')}</span>
            {:else}<span class="muted small"> · {t('trk.seen', { date: fmt(positions.items[p.id].updated_at) })}</span>{/if}
          {/if}
        </div>
        <span class="spacer"></span>
        {#if p.id === auth.profile?.id}
          <label class="color" title={t('players.myColor')}>
            <input type="color" value={p.color} onchange={(e) => setColor((e.target as HTMLInputElement).value)} />
          </label>
        {/if}
      </div>

      <div class="stat">
        <span>{t('players.explored')}</span>
        <strong>{pct(cells)} %</strong>
      </div>
      <div class="bar"><div style:width={`${(cells / maxCells) * 100}%`}></div></div>
      <div class="row muted small">
        <span>📖 {t('players.books', { n: nb })}</span>
        <span class="spacer"></span>
        <span>{t('admin.since')} {fmt(p.created_at)}</span>
      </div>
      <a class="btn mapbtn" href={`#/map?player=${p.id}`}>🗺️ {t('players.seeMap')}</a>
    </div>
  {/each}
</div>

<style>
  .head h1 { margin: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 1rem; margin-top: 1rem; }
  .player { border-top: 4px solid var(--c); display: grid; gap: 0.6rem; }
  .top { flex-wrap: nowrap; }
  .top h3 { margin: 0 0 0.2rem; }
  .avatar {
    width: 2.8rem; height: 2.8rem; border-radius: 50%; display: grid; place-items: center;
    background: var(--c); color: #111; font-family: var(--font-title); font-weight: 800; font-size: 1.3rem;
    box-shadow: 0 0 12px var(--c);
  }
  .color input { width: 2.2rem; height: 2.2rem; }
  .stat { display: flex; justify-content: space-between; align-items: baseline; }
  .stat strong { font-family: var(--font-title); color: var(--gold-bright); font-size: 1.2rem; }
  .bar { height: 8px; border-radius: 99px; background: rgba(0, 0, 0, 0.35); overflow: hidden; }
  .bar div { height: 100%; background: var(--c); border-radius: 99px; transition: width 0.4s; }
  .small { font-size: 0.85rem; }
  .badge.live { color: #9fd27a; margin-left: 0.3rem; }
  .mapbtn { justify-content: center; }
</style>
