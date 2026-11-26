<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { MapEngine, outlinePath, type Marker, type Tool } from '../lib/mapEngine';
  import { fog, grids, startFog, unionOf, localApply, boundsOf } from '../lib/fogStore.svelte';
  import { applyFog, rasterizeCircle, CELL, type FogGrid } from '../lib/fog';
  import { people } from '../lib/live.svelte';
  import { pins, books, notes, glyphs } from '../lib/stores';
  import { excerpt } from '../lib/markdown';
  import StorageImage from '../components/StorageImage.svelte';
  import { auth, isAdmin } from '../lib/auth.svelte';
  import { route, go } from '../lib/router.svelte';
  import { t, type Key } from '../lib/i18n.svelte';
  import type { Pin } from '../lib/types';
  import { positions, startPositions, isLive } from '../lib/positions.svelte';
  import { lt } from '../lib/loc';
  import { addTranslations } from '../lib/translate';
  import { i18n } from '../lib/i18n.svelte';
  import { prefs, loadPrefs, setMapPrefs } from '../lib/prefs.svelte';
  import { displayQuest, questPlaces } from '../lib/quest';

  startFog(); pins.start(); books.start(); notes.start(); glyphs.start(); startPositions();
  let placeRuneId = $state<string | null>(null);
  let follow = $state(false);

  let canvas: HTMLCanvasElement;
  let engine: MapEngine | null = null;

  // ---------------- What is shown ----------------
  const singleId = $derived(route.query.get('player'));
  const single = $derived(singleId ? people.get(singleId) ?? null : null);
  const members = $derived(people.state.items.filter((p) => p.role !== 'pending'));
  // Saved in the user's account (see prefs.svelte.ts), so they survive a reload.
  $effect(() => { if (auth.profile?.id) loadPrefs(); });
  const includeReaders = $derived(prefs.value.map.includeReaders);
  const hiddenSet = $derived(new Set(prefs.value.map.hidden));
  const showPins = $derived(prefs.value.map.showPins);
  const showBooks = $derived(prefs.value.map.showBooks);
  const showRunes = $derived(prefs.value.map.showRunes);
  const showQuests = $derived(prefs.value.map.showQuests);
  // #/map?quest=<id>: show that quest's route (even if the layer is off) and frame it.
  const questId = $derived(route.query.get('quest'));
  const questSteps = $derived.by(() => {
    const out: { note: string; title: string; places: ReturnType<typeof questPlaces> }[] = [];
    for (const n of notes.state.items) {
      if (n.kind !== 'quest' || !(showQuests || n.id === questId)) continue;
      const places = questPlaces(displayQuest(n.body, lt(n, 'body')));
      if (places.length) out.push({ note: n.id, title: lt(n, 'title'), places });
    }
    return out;
  });
  const focusedQuest = $derived(questId ? notes.get(questId) : undefined);
  function togglePlayer(id: string) {
    const h = new Set(prefs.value.map.hidden);
    if (h.has(id)) h.delete(id); else h.add(id);
    setMapPrefs({ hidden: [...h] });
  }

  const globalPlayers = $derived(members.filter((p) => p.role === 'admin' || includeReaders));
  const visible = $derived(singleId ? [singleId] : globalPlayers.filter((p) => !hiddenSet.has(p.id)).map((p) => p.id));

  // ---------------- Tools ----------------
  let tool = $state<Tool>('pan');
  let brushPx = $state(30);
  let target = $state<string | null>(null); // whose fog the brush edits
  let placeBookId = $state<string | null>(null);
  const canEdit = (pid: string | null) => !!pid && (isAdmin() || pid === auth.profile?.id);
  const brushTarget = $derived(singleId ?? target ?? auth.profile?.id ?? null);

  let cursor = $state<{ x: number; y: number } | null>(null);
  let popup = $state<{ m: Marker; x: number; y: number } | null>(null);
  let newPin = $state<{ x: number; y: number } | null>(null);
  let pinTitle = $state('');
  let pinIcon = $state('📍');
  let pinNote = $state<string | null>(null);
  let toast = $state('');
  let saving = $state(0);
  const ICONS = ['📍', '⭐', '❗', '❓', '💀', '🗝️', '💎', '🔥', '🌀', '⚗️', '🏛️', '🚪', '🧪', '👁️', '🪦', '🌳'];

  function flash(msg: string) { toast = msg; setTimeout(() => { if (toast === msg) toast = ''; }, 3000); }

  // ---------------- Brush ----------------
  let pending: FogGrid = new Map();
  let pendingHide = false;

  function onBrush(x: number, y: number, r: number, hide: boolean) {
    if (!engine || !canEdit(brushTarget)) return;
    pendingHide = hide;
    const delta: FogGrid = new Map();
    rasterizeCircle(delta, x, y, Math.max(r, CELL / 2));
    // immediate feedback on screen
    for (const [k, m] of delta) {
      const p = pending.get(k);
      if (p) for (let i = 0; i < m.length; i++) p[i] |= m[i];
      else pending.set(k, m.slice());
      let u = engine.union.get(k);
      if (!u) { if (hide) continue; u = new Uint8Array(m.length); engine.union.set(k, u); }
      for (let i = 0; i < m.length; i++) u[i] = hide ? u[i] & ~m[i] : u[i] | m[i];
    }
    engine.invalidateChunks(delta.keys());
  }

  async function onBrushEnd() {
    const delta = pending, hide = pendingHide, who = brushTarget;
    pending = new Map();
    if (!delta.size || !who) return;
    localApply(who, delta, hide); // rebuilds union + outlines through fog.version
    saving++;
    try { await applyFog(who, delta, hide); }
    catch (e: any) { flash('❌ ' + (e?.message ?? e)); }
    saving--;
  }

  // ---------------- Clicks ----------------
  async function onClick(x: number, y: number) {
    popup = null;
    if (tool === 'pin' && isAdmin()) {
      newPin = { x, y }; pinTitle = ''; pinIcon = '📍'; pinNote = null;
    } else if (tool === 'place' && placeRuneId && isAdmin()) {
      const { error } = await supabase.from('glyphs').update({ loc_x: Math.round(x), loc_y: Math.round(y) }).eq('id', placeRuneId);
      if (error) return flash('❌ ' + error.message);
      await glyphs.reload();
      if (engine) engine.focus = placeRuneId;
      flash('🔣 ' + t('map.runePlaced'));
      tool = 'pan'; placeRuneId = null;
    } else if (tool === 'place' && placeBookId && isAdmin()) {
      const { error } = await supabase.from('books').update({ loc_x: Math.round(x), loc_y: Math.round(y) }).eq('id', placeBookId);
      if (error) return flash('❌ ' + error.message);
      await books.reload();
      if (engine) engine.focus = placeBookId;
      flash('📖 ' + t('map.bookPlaced'));
      tool = 'pan'; placeBookId = null;
    }
  }

  async function savePin(e: SubmitEvent) {
    e.preventDefault();
    if (!newPin || !pinTitle.trim()) return;
    const row = await addTranslations({
      x: Math.round(newPin.x), y: Math.round(newPin.y), title: pinTitle.trim(), icon: pinIcon, note_id: pinNote, lang: i18n.lang,
    } as Record<string, any>, ['title'], i18n.lang);
    const { error } = await supabase.from('pins').insert(row);
    if (error) return flash('❌ ' + error.message);
    await pins.reload();
    newPin = null;
    tool = 'pan';
  }

  async function deletePin(id: string) {
    if (!confirm(t('map.deletePin'))) return;
    const { error } = await supabase.from('pins').delete().eq('id', id);
    if (error) return flash('❌ ' + error.message);
    await pins.reload();
    popup = null;
  }

  // ---------------- Engine lifecycle ----------------
  let urlTimer: ReturnType<typeof setTimeout> | null = null;
  onMount(() => {
    engine = new MapEngine(canvas, {
      brush: onBrush,
      brushEnd: onBrushEnd,
      click: onClick,
      marker: (m, s) => { popup = { m, x: s.x, y: s.y }; },
      hover: (x, y) => { cursor = { x, y }; },
      view: () => { popup = null; },
    });
    const qx = Number(route.query.get('x')), qy = Number(route.query.get('y'));
    if (route.query.has('x') && isFinite(qx) && isFinite(qy)) engine.centerOn(qx, qy, 0.8);
    const focus = route.query.get('book') ?? route.query.get('rune');
    if (focus) { engine.focus = focus; setTimeout(() => { if (engine?.focus === focus) { engine.focus = null; engine.draw(); } }, 8000); }
    const place = route.query.get('place');
    if (place && isAdmin()) { placeBookId = place; tool = 'place'; }
    const placeR = route.query.get('placeRune');
    if (placeR && isAdmin()) { placeRuneId = placeR; tool = 'place'; }
    return () => { engine?.destroy(); engine = null; if (urlTimer) clearTimeout(urlTimer); };
  });

  // Fog + outlines whenever data or the visible set changes
  let fitted = false;
  $effect(() => {
    fog.version; // dependency
    const vis = visible;
    const colors = Object.fromEntries(people.state.items.map((p) => [p.id, p.color]));
    if (!engine) return;
    engine.union = unionOf(vis);
    engine.unionVersion++;
    engine.outlines = vis
      .filter((id) => grids.has(id))
      .map((id) => ({ color: colors[id] ?? '#c8a44d', path: outlinePath(grids.get(id)!) }));
    engine.draw();
    if (!fitted && fog.loaded && !untrack(() => route.query.has('x') || route.query.has('quest'))) {
      fitted = true;
      const b = boundsOf(engine.union, CELL);
      if (b) engine.fit(b);
    }
  });

  // Markers
  const TRAIL_LEN = 40;
  const trailPts = new Map<string, { x: number; y: number }[]>(); // not reactive on purpose
  $effect(() => {
    const list: Marker[] = [];
    if (showPins) for (const p of pins.state.items) list.push({ id: p.id, x: p.x, y: p.y, icon: p.icon, title: lt(p, 'title'), kind: 'pin' });
    if (showRunes) {
      const stoneId = [...glyphs.state.items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))[0]?.id;
      for (const g of glyphs.state.items)
        if (g.id !== stoneId && g.loc_x !== null && g.loc_y !== null)
          list.push({ id: g.id, x: g.loc_x, y: g.loc_y, icon: '🔣', title: excerpt(lt(g, 'meaning'), 28) || '?', kind: 'rune' });
    }
    const routes: { color: string; points: { x: number; y: number }[] }[] = [];
    for (const q of questSteps) {
      const dim = !!questId && q.note !== questId;
      routes.push({ color: dim ? 'rgba(226,180,80,0.35)' : '#e2b450', points: q.places });
      for (const p of q.places) list.push({
        id: `quest:${q.note}:${p.step}`, x: p.x, y: p.y, icon: String(p.step + 1), kind: 'quest',
        title: excerpt(p.label || p.title, 28), color: p.done ? '#9fd27a' : dim ? '#8f7232' : '#e2b450',
      });
    }
    if (engine) engine.routes = routes;
    if (showBooks) for (const b of books.state.items)
      if (b.loc_x !== null && b.loc_y !== null) list.push({ id: b.id, x: b.loc_x, y: b.loc_y, icon: '📖', title: lt(b, 'title'), kind: 'book' });
    // live players (in the shown set, signal < 2 min)
    positions.now;
    const trails: { color: string; points: { x: number; y: number }[] }[] = [];
    for (const pid of visible) {
      const pos = positions.items[pid];
      if (!pos || !isLive(pid)) { trailPts.delete(pid); continue; }
      const pr = people.get(pid);
      list.push({ id: `player:${pid}`, x: pos.x, y: pos.y, icon: '', title: pr?.username ?? '?', kind: 'player', color: pr?.color });
      // remember where they went while this page is open (a teleport starts a new trail)
      let tr = trailPts.get(pid);
      if (!tr) trailPts.set(pid, (tr = []));
      const last = tr[tr.length - 1];
      const d = last ? Math.hypot(pos.x - last.x, pos.y - last.y) : Infinity;
      if (d > 1500) tr.length = 0;
      if (d >= 24) { tr.push({ x: pos.x, y: pos.y }); if (tr.length > TRAIL_LEN) tr.shift(); }
      if (tr.length > 1) trails.push({ color: pr?.color ?? '#ffd97a', points: tr.slice(0, -1) });
    }
    if (engine) { engine.markers = list; engine.trails = trails; engine.draw(); }
  });

  // Follow my live position
  $effect(() => {
    const me = auth.profile?.id;
    const pos = me ? positions.items[me] : undefined;
    if (follow && pos && engine) engine.centerOn(pos.x, pos.y, Math.max(engine.scale, 0.5));
  });

  let questFitted: string | null = null;
  $effect(() => {
    const q = questSteps.find((x) => x.note === questId);
    if (!engine || !q || questFitted === questId) return;
    questFitted = questId;
    const xs = q.places.map((p) => p.x), ys = q.places.map((p) => p.y);
    engine.fit({ x0: Math.min(...xs) - 500, y0: Math.min(...ys) - 500, x1: Math.max(...xs) + 500, y1: Math.max(...ys) + 500 });
  });

  $effect(() => { if (engine) { engine.tool = tool; engine.brushPx = brushPx; engine.draw(); } });

  const pinOf = (id: string): Pin | undefined => pins.get(id);
  const placingBook = $derived(placeBookId ? books.get(placeBookId) : undefined);
  const unplacedBooks = $derived(books.state.items.filter((b) => b.loc_x === null));

  function fitAll() {
    if (!engine) return;
    const b = boundsOf(engine.union, CELL);
    if (b) engine.fit(b); else flash(t('map.nothing'));
  }
  function setSingle(id: string | null) { go(id ? `/map?player=${id}` : '/map'); }
</script>

<div class="mapwrap">
  <canvas bind:this={canvas} class:brush={tool === 'reveal' || tool === 'hide'} class:cross={tool === 'pin' || tool === 'place'}></canvas>

  <!-- ===== Side panel ===== -->
  <aside class="panel">
    <h2>🗺️ {single ? t('map.mapOf', { name: single.username }) : t('map.global')}</h2>

    <div class="block">
      <label for="view">{t('map.view')}</label>
      <select id="view" value={singleId ?? ''} onchange={(e) => setSingle((e.target as HTMLSelectElement).value || null)}>
        <option value="">🌍 {t('map.global')}</option>
        {#each members as p (p.id)}<option value={p.id}>🧙 {p.username}</option>{/each}
      </select>
    </div>

    {#if !singleId}
      <div class="block players">
        {#each globalPlayers as p (p.id)}
          <label class="check">
            <input type="checkbox" checked={!hiddenSet.has(p.id)} onchange={() => togglePlayer(p.id)} />
            <span class="swatch" style:background={p.color}></span>{p.username}
            {#if isLive(p.id)}<span class="livedot" title={t('trk.live')}></span>{/if}
            {#if p.role === 'reader'}<span class="muted small">({t('role.reader')})</span>{/if}
          </label>
        {/each}
        <label class="check sub"><input type="checkbox" checked={includeReaders} onchange={(e) => setMapPrefs({ includeReaders: e.currentTarget.checked })} /> {t('map.includeReaders')}</label>
      </div>
    {/if}

    <div class="block">
      <label class="check"><input type="checkbox" checked={showPins} onchange={(e) => setMapPrefs({ showPins: e.currentTarget.checked })} /> 📍 {t('map.pins')} ({pins.state.items.length})</label>
      <label class="check"><input type="checkbox" checked={showBooks} onchange={(e) => setMapPrefs({ showBooks: e.currentTarget.checked })} /> 📖 {t('nav.library')}</label>
      <label class="check"><input type="checkbox" checked={showRunes} onchange={(e) => setMapPrefs({ showRunes: e.currentTarget.checked })} /> 🔣 {t('map.runes')}</label>
      <label class="check"><input type="checkbox" checked={showQuests} onchange={(e) => setMapPrefs({ showQuests: e.currentTarget.checked })} /> 🎯 {t('quest.layer')}</label>
      {#if focusedQuest}
        <div class="qfocus">
          <a href={`#/notes/${focusedQuest.id}`}>🎯 {lt(focusedQuest, 'title')}</a>
          <button class="small ghost" title={t('quest.showAll')} onclick={() => go('/map')}>✕</button>
        </div>
      {/if}
      {#if auth.profile && positions.items[auth.profile.id]}
        <label class="check"><input type="checkbox" bind:checked={follow} /> 🎯 {t('map.follow')}</label>
      {/if}
    </div>

    <div class="block">
      <span class="lbl">{t('map.tools')}</span>
      <div class="tools">
        <button class:on={tool === 'pan'} onclick={() => (tool = 'pan')} title={t('map.tool.pan')}>🖐</button>
        {#if canEdit(brushTarget)}
          <button class:on={tool === 'reveal'} onclick={() => (tool = 'reveal')} title={t('map.tool.reveal')}>🖌️</button>
          <button class:on={tool === 'hide'} onclick={() => (tool = 'hide')} title={t('map.tool.hide')}>🧽</button>
        {/if}
        {#if isAdmin()}
          <button class:on={tool === 'pin'} onclick={() => (tool = 'pin')} title={t('map.tool.pin')}>📍</button>
        {/if}
        <button onclick={fitAll} title={t('map.fit')}>🎯</button>
      </div>
      <p class="muted small help">{t(`map.help.${tool}` as Key)}</p>

      {#if tool === 'reveal' || tool === 'hide'}
        <label for="bs">{t('map.brushSize')} : {brushPx}px</label>
        <input id="bs" type="range" min="5" max="150" bind:value={brushPx} />
        {#if !singleId && isAdmin()}
          <label for="tg">{t('map.brushTarget')}</label>
          <select id="tg" value={target ?? auth.profile?.id} onchange={(e) => (target = (e.target as HTMLSelectElement).value)}>
            {#each members as p (p.id)}<option value={p.id}>{p.username}</option>{/each}
          </select>
        {:else}
          <p class="muted small">{t('map.brushOn', { name: people.get(brushTarget ?? '')?.username ?? '—' })}</p>
        {/if}
      {/if}

      {#if isAdmin()}
        <label for="pb">📖 {t('map.placeBook')}</label>
        <select id="pb" value={placeBookId ?? ''} onchange={(e) => { placeBookId = (e.target as HTMLSelectElement).value || null; placeRuneId = null; tool = placeBookId ? 'place' : 'pan'; }}>
          <option value="">—</option>
          {#if placingBook && placingBook.loc_x !== null}<option value={placingBook.id}>{lt(placingBook, 'title')} ({t('map.move')})</option>{/if}
          {#each unplacedBooks as b (b.id)}<option value={b.id}>{lt(b, 'title')}</option>{/each}
        </select>
      {/if}
    </div>

    <div class="foot muted small">
      {#if cursor}X {Math.round(cursor.x)} · Y {Math.round(cursor.y)}{/if}
      {#if saving}<span> · 💾…</span>{/if}
      {#if !fog.loaded}<span> · {t('common.loading')}</span>{/if}
    </div>
  </aside>

  {#if tool === 'place' && placeRuneId}
    <div class="banner">🔣 {t('map.clickToPlaceRune')}
      <button class="small ghost" onclick={() => { tool = 'pan'; placeRuneId = null; }}>✕</button>
    </div>
  {/if}
  {#if tool === 'place' && placingBook}
    <div class="banner">📖 {t('map.clickToPlace', { title: lt(placingBook, 'title') })}
      <button class="small ghost" onclick={() => { tool = 'pan'; placeBookId = null; }}>✕</button>
    </div>
  {/if}
  {#if toast}<div class="toast">{toast}</div>{/if}

  <!-- ===== Marker popup ===== -->
  {#if popup}
    <div class="popup card" style:left={`${popup.x}px`} style:top={`${popup.y}px`}>
      {#if popup.m.kind === 'rune'}
        {@const g = glyphs.get(popup.m.id)}
        {#if g?.image_path}<div class="runepic"><StorageImage path={g.image_path} pixel alt="" /></div>{/if}
        <strong class="runetr">🔣 {excerpt(lt(g, 'meaning'), 140) || '?'}</strong>
        <div class="row">
          <a class="btn small" href={`#/rosetta?g=${popup.m.id}`}>{t('map.openRune')}</a>
          {#if isAdmin()}<button class="small" onclick={() => { placeRuneId = popup!.m.id; placeBookId = null; tool = 'place'; popup = null; }}>↔ {t('map.move')}</button>{/if}
        </div>
      {:else if popup.m.kind === 'quest'}
        {@const [, qid, qstep] = popup.m.id.split(':')}
        {@const qn = notes.get(qid)}
        {@const qs = qn ? displayQuest(qn.body, lt(qn, 'body')).steps[Number(qstep)] : undefined}
        <span class="muted small">🎯 {lt(qn, 'title')}</span>
        <strong>{t('quest.step', { n: Number(qstep) + 1 })} — {qs?.title ?? ''}</strong>
        {#if popup.m.title && popup.m.title !== qs?.title}<span class="small">📍 {popup.m.title}</span>{/if}
        <div class="row">
          <a class="btn small" href={`#/notes/${qid}?step=${Number(qstep) + 1}`}>{t('quest.openStep')}</a>
          {#if questId !== qid}<a class="btn small" href={`#/map?quest=${qid}`}>🗺️ {t('quest.showRoute')}</a>{/if}
        </div>
      {:else if popup.m.kind === 'book'}
        <strong>📖 {popup.m.title}</strong>
        <div class="row">
          <a class="btn small" href={`#/library/${popup.m.id}`}>{t('map.openBook')}</a>
          {#if isAdmin()}<button class="small" onclick={() => { placeBookId = popup!.m.id; placeRuneId = null; tool = 'place'; popup = null; }}>↔ {t('map.move')}</button>{/if}
        </div>
      {:else}
        {@const pin = pinOf(popup.m.id)}
        <strong>{popup.m.icon} {popup.m.title}</strong>
        <div class="row">
          {#if pin?.note_id}<a class="btn small" href={`#/notes/${pin.note_id}`}>📜 {lt(notes.get(pin.note_id), 'title') || t('nav.notes')}</a>{/if}
          {#if isAdmin()}<button class="small danger" onclick={() => deletePin(popup!.m.id)}>🗑</button>{/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- ===== New pin form ===== -->
  {#if newPin}
    <div class="modal-bg">
      <form class="card modal" onsubmit={savePin}>
        <h2>📍 {t('map.newPin')}</h2>
        <label for="pt">{t('notes.title')}</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="pt" bind:value={pinTitle} maxlength="80" autofocus />
        <span class="lbl">{t('map.icon')}</span>
        <div class="icons">
          {#each ICONS as ic}<button type="button" class:on={pinIcon === ic} onclick={() => (pinIcon = ic)}>{ic}</button>{/each}
        </div>
        <label for="pn">{t('map.linkNote')}</label>
        <select id="pn" bind:value={pinNote}>
          <option value={null}>—</option>
          {#each notes.state.items as n (n.id)}<option value={n.id}>{lt(n, 'title')}</option>{/each}
        </select>
        <div class="row actions">
          <button class="primary" type="submit" disabled={!pinTitle.trim()}>💾 {t('common.save')}</button>
          <button type="button" class="ghost" onclick={() => (newPin = null)}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  {/if}
</div>

<style>
  .mapwrap { position: relative; height: 100vh; overflow: hidden; background: #000; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; }
  canvas:active { cursor: grabbing; }
  canvas.brush { cursor: none; }
  canvas.cross { cursor: crosshair; }

  .panel {
    position: absolute; top: 0.8rem; right: 0.8rem; width: 270px; max-height: calc(100% - 1.6rem); overflow: auto;
    background-color: rgba(23, 17, 31, 0.94); border: 2px solid transparent; border-image: var(--px-gold) 3 / 6px stretch;
    background-clip: padding-box; padding: 0.8rem 0.9rem; box-shadow: var(--shadow); backdrop-filter: blur(4px);
  }
  .panel h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }
  .block { padding: 0.5rem 0; border-top: 1px solid rgba(212, 175, 85, 0.2); }
  .block label:not(.check), .lbl { display: block; margin: 0.3rem 0 0.25rem; font-size: 0.9rem; color: var(--text-dim); }
  .check { display: flex; align-items: center; gap: 0.45rem; margin: 0.2rem 0; color: var(--text); font-weight: 400; cursor: pointer; }
  .check input { width: auto; }
  .check.sub { margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-dim); }
  .swatch { width: 0.9rem; height: 0.9rem; border-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.4); }
  .livedot { width: 0.55rem; height: 0.55rem; border-radius: 50%; background: #7fd35a; box-shadow: 0 0 6px #7fd35a; }
  .tools { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .tools button { padding: 0.35rem 0.55rem; font-size: 1.05rem; }
  .on { border-color: var(--gold-bright) !important; background: rgba(212, 175, 85, 0.3) !important; }
  .help { margin: 0.4rem 0 0; }
  .small { font-size: 0.85rem; }
  select, input:not([type='checkbox']) { padding: 0.35rem 0.55rem; font-size: 0.92rem; }
  .foot { border-top: 1px solid rgba(212, 175, 85, 0.2); padding-top: 0.5rem; font-variant-numeric: tabular-nums; }

  .banner, .toast {
    position: absolute; left: 50%; transform: translateX(-50%);
    background-color: rgba(23, 17, 31, 0.96); border: 2px solid transparent; border-image: var(--px-bright) 3 / 6px stretch; background-clip: padding-box;
    padding: 0.4rem 1rem; box-shadow: var(--shadow); display: flex; gap: 0.5rem; align-items: center;
  }
  .banner { top: 0.8rem; }
  .toast { bottom: 1.2rem; }

  .popup { position: absolute; transform: translate(-50%, calc(-100% - 30px)); padding: 0.6rem 0.8rem; display: grid; gap: 0.4rem; min-width: 180px; z-index: 5; }
  .qfocus { display: flex; align-items: center; gap: 0.3rem; margin-top: 0.3rem; padding: 0.2rem 0.4rem; border: 1px solid var(--gold-dim); border-radius: 2px; }
  .qfocus a { flex: 1; font-size: 0.9rem; }
  .runepic { display: grid; place-items: center; background: #07050b; padding: 0.4rem; }
  .runepic :global(img) { max-width: 240px; max-height: 120px; image-rendering: pixelated; }
  .runetr { max-width: 260px; font-weight: 500; }
  .modal-bg { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.5); z-index: 10; }
  .modal { width: min(380px, 92%); }
  .icons { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .icons button { padding: 0.25rem 0.4rem; font-size: 1.15rem; background: transparent; }
  .actions { margin-top: 1rem; }

  @media (max-width: 820px) {
    .panel { top: auto; bottom: 0.5rem; right: 0.5rem; left: 0.5rem; width: auto; max-height: 45%; }
  }
</style>
