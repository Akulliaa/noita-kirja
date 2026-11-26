<script lang="ts">
  import { supabase } from '../lib/supabase';
  import { people } from '../lib/live.svelte';
  import { fog, startFog, exploredCells } from '../lib/fogStore.svelte';
  import { books, notes, glyphs, pins } from '../lib/stores';
  import { alchemy } from '../lib/alchemy.svelte';
  import { points, rankOf, TITLES, titleLevel, DAILY_CAP, cappedCount, activeDays, type Contrib } from '../lib/ranks';
  import { secrets, secretsOf, startSecrets } from '../lib/secrets.svelte';
  import { auth } from '../lib/auth.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import { CELL } from '../lib/fog';
  import { positions, startPositions, ageSeconds } from '../lib/positions.svelte';
  startPositions();

  startFog(); books.start(); notes.start(); glyphs.start(); pins.start(); startSecrets();

  type Dated = { created_by: string | null; created_at: string };
  /** Contributions of a player (daily-capped, see DAILY_CAP) + days active + confirmed notes. */
  function contrib(id: string): Contrib & { days: number; confirmed: number } {
    const dates = (arr: Dated[]) => arr.filter((x) => x.created_by === id).map((x) => x.created_at);
    const d = {
      notes: dates(notes.state.items),
      books: books.state.items.filter((b) => b.found_by === id).map((b) => b.created_at),
      mixtures: dates(alchemy.mixtures),
      runes: dates(glyphs.state.items),
      pins: dates(pins.state.items),
    };
    return {
      notes: cappedCount(d.notes, DAILY_CAP.notes),
      books: cappedCount(d.books, DAILY_CAP.books),
      mixtures: cappedCount(d.mixtures, DAILY_CAP.mixtures),
      runes: cappedCount(d.runes, DAILY_CAP.runes),
      pins: cappedCount(d.pins, DAILY_CAP.pins),
      days: activeDays(Object.values(d).flat()),
      confirmed: notes.state.items.filter((n) => n.created_by === id && (n.status === 'confirmed' || n.status === 'done')).length,
    };
  }

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
    {@const c = contrib(p.id)}
    {@const pts = points(c)}
    {@const r = rankOf(pts)}
    {@const stats = { ...c, explored: (cells / MAP_CELLS) * 100 }}
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

      <div class="rank" title={t('fx.rankDetail', { notes: c.notes, books: c.books, mixtures: c.mixtures, runes: c.runes, pins: c.pins })}>
        <span class="ricon">{r.cur.icon}</span>
        <div class="rtext">
          <strong>{r.cur.name[i18n.lang]}</strong>
          <span class="muted small">{t('fx.points', { n: pts })}{#if r.next} · {t('fx.nextRank', { name: r.next.name[i18n.lang], n: r.next.min - pts })}{/if}</span>
          <div class="rbar"><div style:width={`${Math.round(r.progress * 100)}%`}></div></div>
        </div>
      </div>

      <!-- special titles: unlocked ones shine, locked ones show what is still needed -->
      <div class="titles">
        {#each TITLES as ti (ti.id)}
          {@const lv = titleLevel(ti, stats)}
          {@const val = ti.stat === 'explored' ? lv.value.toLocaleString(i18n.lang, { maximumFractionDigits: 2 }) : lv.value}
          <span class="title lv{lv.level}"
            title={(lv.cur ? lv.cur.name[i18n.lang] + ' — ' : '') + `${val} ${ti.what[i18n.lang]}` +
              (ti.capped ? ` (${t('fx.capped', { n: DAILY_CAP[ti.stat as keyof Contrib] })})` : '') +
              (lv.next ? ' · ' + t('fx.titleNext', { name: lv.next.name[i18n.lang], n: lv.next.n }) : ' · ' + t('fx.titleMax'))}>
            <span class="ticon">{lv.level ? ti.icon : '🔒'}</span>
            <span class="tname">{lv.cur ? lv.cur.name[i18n.lang] : ti.tiers[0].name[i18n.lang]}</span>
            <span class="pips">{#each ti.tiers as _, k}<i class:on={k < lv.level}></i>{/each}</span>
          </span>
        {/each}
      </div>

      <!-- hidden secret titles: found in the game itself, through the tracker -->
      {#if secrets.loaded && secrets.total}
        {@const sec = secretsOf(p.id)}
        <div class="titles">
          {#each sec as s (s.g.id)}
            <span class="title secret" title={`${t('fx.secretTitle')} — ${s.cur![i18n.lang]}` +
              (s.next ? ' · ' + t('fx.secretMore') : ' · ' + t('fx.titleMax'))}>
              <span class="ticon">{s.g.icon}</span>
              <span class="tname">{s.cur![i18n.lang]}</span>
              <span class="pips">{#each s.g.tiers as _, k}<i class:on={k < s.level}></i>{/each}</span>
            </span>
          {/each}
          <span class="title lv0 hidden" title={t('fx.secretHint')}>
            <span class="ticon">🗝️</span><span class="tname">{t('fx.secrets', { n: sec.length, total: secrets.total })}</span>
          </span>
        </div>
      {/if}

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
  .bar { height: 8px; border-radius: 2px; background: rgba(0, 0, 0, 0.35); overflow: hidden; }
  .bar div { height: 100%; background: var(--c); border-radius: 2px; transition: width 0.4s; }
  .small { font-size: 0.85rem; }
  .badge.live { color: #9fd27a; margin-left: 0.3rem; }
  .mapbtn { justify-content: center; }
  .rank {
    display: flex; gap: 0.6rem; align-items: center; padding: 0.45rem 0.6rem;
    background: linear-gradient(90deg, rgba(255, 190, 80, 0.12), transparent); border-left: 3px solid var(--gold);
  }
  .ricon { font-size: 1.7rem; filter: drop-shadow(1px 1px 0 #000); }
  .rtext { flex: 1; display: grid; gap: 0.15rem; min-width: 0; }
  .rtext strong { font-family: var(--font-title); color: var(--gold-bright); font-size: 1.1rem; letter-spacing: 0.03em; }
  .titles { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .title {
    display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.1rem 0.45rem; font-size: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(0, 0, 0, 0.25); color: var(--text-dim); cursor: help;
  }
  .title.lv0 { opacity: 0.5; }
  .title.lv1 { color: #e6d3a8; border-color: #8f7232; }
  .title.lv2 { color: var(--gold-bright); border-color: var(--gold); background: rgba(255, 190, 80, 0.1); }
  .title.lv3 { color: #f3e6ff; border-color: var(--magic); background: rgba(180, 108, 255, 0.18); box-shadow: 0 0 8px rgba(180, 108, 255, 0.4); }
  .title.secret {
    color: #d8fff4; border-color: #3fd0b0; background: linear-gradient(90deg, rgba(63, 208, 176, 0.22), rgba(180, 108, 255, 0.18));
    box-shadow: 0 0 10px rgba(63, 208, 176, 0.45); text-shadow: 0 0 6px rgba(63, 208, 176, 0.7);
  }
  .title.hidden { font-style: italic; }
  .pips { display: inline-flex; gap: 2px; }
  .pips i { width: 5px; height: 5px; background: rgba(255, 255, 255, 0.15); }
  .pips i.on { background: currentColor; }
  .rbar { height: 4px; background: rgba(0, 0, 0, 0.4); }
  .rbar div { height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-bright)); }
</style>
