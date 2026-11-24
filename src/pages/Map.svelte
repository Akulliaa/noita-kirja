<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { MapEngine, outlinePath, type Marker, type Tool } from '../lib/mapEngine';
  import { fog, grids, startFog, unionOf, localApply, boundsOf } from '../lib/fogStore.svelte';
  import { applyFog, rasterizeCircle, CELL, type FogGrid } from '../lib/fog';
  import { people } from '../lib/live.svelte';
  import { pins, books, notes } from '../lib/stores';
  import { auth, isAdmin } from '../lib/auth.svelte';
  import { route, go } from '../lib/router.svelte';
  import { t, type Key } from '../lib/i18n.svelte';
  import type { Pin } from '../lib/types';
  import { positions, startPositions, isLive } from '../lib/positions.svelte';

  startFog(); pins.start(); books.start(); notes.start(); startPositions();
  let follow = $state(false);

  let canvas: HTMLCanvasElement;
  let engine: MapEngine | null = null;

  // ---------------- What is shown ----------------
  const singleId = $derived(route.query.get('player'));
  const single = $derived(singleId ? people.get(singleId) ?? null : null);
  const members = $derived(people.state.items.filter((p) => p.role !== 'pending'));
  let includeReaders = $state(false);
  let hidden = $state<Record<string, boolean>>({});
  let showPins = $state(true);
  let showBooks = $state(true);

  const globalPlayers = $derived(members.filter((p) => p.role === 'admin' || includeReaders));
  const visible = $derived(singleId ? [singleId] : globalPlayers.filter((p) => !hidden[p.id]).map((p) => p.id));

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
    const { error } = await supabase.from('pins').insert({
      x: Math.round(newPin.x), y: Math.round(newPin.y), title: pinTitle.trim(), icon: pinIcon, note_id: pinNote,
    });
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
    const focus = route.query.get('book');
    if (focus) { engine.focus = focus; setTimeout(() => { if (engine?.focus === focus) { engine.focus = null; engine.draw(); } }, 8000); }
    const place = route.query.get('place');
    if (place && isAdmin()) { placeBookId = place; tool = 'place'; }
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
    if (!fitted && fog.loaded && !untrack(() => route.query.has('x'))) {
      fitted = true;
      const b = boundsOf(engine.union, CELL);
      if (b) engine.fit(b);
    }
  });

  // Markers
  $effect(() => {
    const list: Marker[] = [];
    if (showPins) for (const p of pins.state.items) list.push({ id: p.id, x: p.x, y: p.y, icon: p.icon, title: p.title, kind: 'pin' });
    if (showBooks) for (const b of books.state.items)
      if (b.loc_x !== null && b.loc_y !== null) list.push({ id: b.id, x: b.loc_x, y: b.loc_y, icon: '📖', title: b.title, kind: 'book' });
    // live players (in the shown set, signal < 2 min)
    positions.now;
    for (const pid of visible) {
      const pos = positions.items[pid];
      if (!pos || !isLive(pid)) continue;
      const pr = people.get(pid);
      list.push({ id: `player:${pid}`, x: pos.x, y: pos.y, icon: '', title: pr?.username ?? '?', kind: 'player', color: pr?.color });
    }
    if (engine) { engine.markers = list; engine.draw(); }
  });

  // Follow my live position
  $effect(() => {
    const me = auth.profile?.id;
    const pos = me ? positions.items[me] : undefined;
    if (follow && pos && engine) engine.centerOn(pos.x, pos.y, Math.max(engine.scale, 0.5));
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
            <input type="checkbox" checked={!hidden[p.id]} onchange={() => (hidden[p.id] = !hidden[p.id])} />
            <span class="swatch" style:background={p.color}></span>{p.username}
            {#if isLive(p.id)}<span class="livedot" title={t('trk.live')}></span>{/if}
            {#if p.role === 'reader'}<span class="muted small">({t('role.reader')})</span>{/if}
          </label>
        {/each}
        <label class="check sub"><input type="checkbox" bind:checked={includeReaders} /> {t('map.includeReaders')}</label>
      </div>
    {/if}

    <div class="block">
      <label class="check"><input type="checkbox" bind:checked={showPins} /> 📍 {t('map.pins')} ({pins.state.items.length})</label>
      <label class="check"><input type="checkbox" bind:checked={showBooks} /> 📖 {t('nav.library')}</label>
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
        <select id="pb" value={placeBookId ?? ''} onchange={(e) => { placeBookId = (e.target as HTMLSelectElement).value || null; tool = placeBookId ? 'place' : 'pan'; }}>
          <option value="">—</option>
          {#if placingBook && placingBook.loc_x !== null}<option value={placingBook.id}>{placingBook.title} ({t('map.move')})</option>{/if}
          {#each unplacedBooks as b (b.id)}<option value={b.id}>{b.title}</option>{/each}
        </select>
      {/if}
    </div>

    <div class="foot muted small">
      {#if cursor}X {Math.round(cursor.x)} · Y {Math.round(cursor.y)}{/if}
      {#if saving}<span> · 💾…</span>{/if}
      {#if !fog.loaded}<span> · {t('common.loading')}</span>{/if}
    </div>
  </aside>

  {#if tool === 'place' && placingBook}
    <div class="banner">📖 {t('map.clickToPlace', { title: placingBook.title })}
      <button class="small ghost" onclick={() => { tool = 'pan'; placeBookId = null; }}>✕</button>
    </div>
  {/if}
  {#if toast}<div class="toast">{toast}</div>{/if}

  <!-- ===== Marker popup ===== -->
  {#if popup}
    <div class="popup card" style:left={`${popup.x}px`} style:top={`${popup.y}px`}>
      {#if popup.m.kind === 'book'}
        <strong>📖 {popup.m.title}</strong>
        <div class="row">
          <a class="btn small" href={`#/library/${popup.m.id}`}>{t('map.openBook')}</a>
          {#if isAdmin()}<button class="small" onclick={() => { placeBookId = popup!.m.id; tool = 'place'; popup = null; }}>↔ {t('map.move')}</button>{/if}
        </div>
      {:else}
        {@const pin = pinOf(popup.m.id)}
        <strong>{popup.m.icon} {popup.m.title}</strong>
        <div class="row">
          {#if pin?.note_id}<a class="btn small" href={`#/notes/${pin.note_id}`}>📜 {notes.get(pin.note_id)?.title ?? t('nav.notes')}</a>{/if}
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
          {#each notes.state.items as n (n.id)}<option value={n.id}>{n.title}</option>{/each}
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
    background: rgba(30, 21, 16, 0.92); border: 1px solid var(--gold-dim); border-radius: 10px;
    padding: 0.8rem 0.9rem; box-shadow: var(--shadow); backdrop-filter: blur(4px);
  }
  .panel h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }
  .block { padding: 0.5rem 0; border-top: 1px solid rgba(212, 175, 85, 0.2); }
  .block label:not(.check), .lbl { display: block; margin: 0.3rem 0 0.25rem; font-size: 0.9rem; color: var(--text-dim); }
  .check { display: flex; align-items: center; gap: 0.45rem; margin: 0.2rem 0; color: var(--text); font-weight: 400; cursor: pointer; }
  .check input { width: auto; }
  .check.sub { margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-dim); }
  .swatch { width: 0.9rem; height: 0.9rem; border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.4); }
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
    background: rgba(30, 21, 16, 0.95); border: 1px solid var(--gold); border-radius: 999px;
    padding: 0.4rem 1rem; box-shadow: var(--shadow); display: flex; gap: 0.5rem; align-items: center;
  }
  .banner { top: 0.8rem; }
  .toast { bottom: 1.2rem; }

  .popup { position: absolute; transform: translate(-50%, calc(-100% - 30px)); padding: 0.6rem 0.8rem; display: grid; gap: 0.4rem; min-width: 180px; z-index: 5; }
  .modal-bg { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.5); z-index: 10; }
  .modal { width: min(380px, 92%); }
  .icons { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .icons button { padding: 0.25rem 0.4rem; font-size: 1.15rem; background: transparent; }
  .actions { margin-top: 1rem; }

  @media (max-width: 820px) {
    .panel { top: auto; bottom: 0.5rem; right: 0.5rem; left: 0.5rem; width: auto; max-height: 45%; }
  }
</style>
