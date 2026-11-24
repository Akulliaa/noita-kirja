<script lang="ts">
  // Rosetta Stone tab:
  //  - the first entry (lowest order) is THE Rosetta Stone: shown big at the top
  //  - every other entry is an in-game runic text: screenshot + translation + map position
  import { untrack, tick } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { glyphs } from '../lib/stores';
  import { isAdmin } from '../lib/auth.svelte';
  import { route } from '../lib/router.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import { uploadImage, deleteImage, imageFiles, signedUrl } from '../lib/images';
  import { lt } from '../lib/loc';
  import { addTranslations, otherLang } from '../lib/translate';
  import { excerpt } from '../lib/markdown';
  import type { Confidence, Glyph } from '../lib/types';
  import StorageImage from '../components/StorageImage.svelte';
  import Markdown from '../components/Markdown.svelte';
  import MapLink from '../components/MapLink.svelte';

  glyphs.start();

  const CONF: Confidence[] = ['unknown', 'guess', 'likely', 'sure'];
  const CONF_COLOR: Record<Confidence, string> = {
    unknown: '#7d6e78', guess: '#ff8a3d', likely: '#5fd3ff', sure: '#8dff6a',
  };

  const sorted = $derived([...glyphs.state.items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)));
  const stone = $derived(sorted[0] ?? null);
  const texts = $derived(sorted.slice(1));

  let search = $state('');
  let conf = $state<Confidence | 'all'>('all');
  const list = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return texts.filter((g) =>
      (conf === 'all' || g.confidence === conf) &&
      (!q || [g.meaning, g.meaning_tr ?? '', g.symbol ?? '', g.notes, g.notes_tr ?? ''].join(' ').toLowerCase().includes(q)));
  });
  const stats = $derived(Object.fromEntries(CONF.map((c) => [c, texts.filter((g) => g.confidence === c).length])));

  // ---------------- Panel state ----------------
  let selectedId = $state<string | null>(untrack(() => route.query.get('g')));
  let creating = $state<null | 'stone' | 'text'>(null);
  let editing = $state(false);
  const selected = $derived(selectedId ? glyphs.get(selectedId) ?? null : null);
  const selectedIsStone = $derived(!!selected && selected.id === stone?.id);
  $effect(() => { const g = route.query.get('g'); if (g) { untrack(() => { selectedId = g; creating = null; editing = false; revealPanel(); }); } });

  // ---------------- Zoom ----------------
  let zoomUrl = $state<string | null>(null);
  let zoomFit = $state(true);
  async function openZoom(path: string) { zoomUrl = await signedUrl(path); zoomFit = true; }

  // ---------------- Editor ----------------
  let fImage = $state<string | null>(null);
  let fText = $state('');
  let fTextTr = $state('');
  let initialTextTr = '';
  let fConf = $state<Confidence>('likely');
  let fNotes = $state('');
  let fX = $state<number | null>(null);
  let fY = $state<number | null>(null);
  let busy = $state(false);
  let err = $state('');
  let dragging = $state(false);
  let uploadedNow: string[] = [];

  function openNew(kind: 'stone' | 'text') {
    selectedId = null; creating = kind; editing = true; err = ''; uploadedNow = [];
    fImage = null; fText = ''; fTextTr = initialTextTr = ''; fConf = 'likely'; fNotes = ''; fX = fY = null;
    revealPanel();
  }
  async function revealPanel() {
    await tick();
    const el = document.querySelector('.panel');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight - 120) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openItem(g: Glyph) { selectedId = g.id; creating = null; editing = false; err = ''; revealPanel(); }
  function startEdit(g: Glyph) {
    editing = true; err = ''; uploadedNow = [];
    fImage = g.image_path; fText = g.meaning; fTextTr = initialTextTr = g.meaning_tr ?? ''; fConf = g.confidence;
    fNotes = g.notes; fX = g.loc_x; fY = g.loc_y;
  }
  function discardUploads() { for (const p of uploadedNow) deleteImage(p); uploadedNow = []; }
  function cancelEdit() { discardUploads(); if (creating || selectedIsStone) close(); else editing = false; }
  function close() { discardUploads(); selectedId = null; creating = null; editing = false; }

  async function setImage(files: File[]) {
    if (!files.length) return;
    busy = true; err = '';
    try {
      const p = await uploadImage(files[0], 'glyphs', true);
      uploadedNow.push(p);
      fImage = p;
    } catch (e: any) { err = e?.message ?? String(e); }
    busy = false;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    err = '';
    if (!fImage) return (err = t('ros.err.needImage'));
    const hasX = fX !== null && (fX as unknown) !== '', hasY = fY !== null && (fY as unknown) !== '';
    if (hasX !== hasY) return (err = t('lib.err.coords'));
    busy = true;
    const isNew = !!creating;
    const lang = isNew ? i18n.lang : selected?.lang ?? i18n.lang;
    const row: Record<string, any> = {
      image_path: fImage, meaning: fText.trim(), confidence: fConf, notes: fNotes, lang,
      loc_x: hasX ? Number(fX) : null, loc_y: hasY ? Number(fY) : null,
    };
    const manual = fTextTr !== initialTextTr ? ['meaning'] : [];
    if (manual.length) row.meaning_tr = fTextTr.trim() || null;
    await addTranslations(row, ['meaning', 'notes'], lang, isNew ? null : selected, manual);
    let res;
    if (isNew) {
      const orders = glyphs.state.items.map((g) => g.sort_order);
      row.sort_order = creating === 'stone' ? Math.min(0, ...orders) - 1 : Math.max(0, ...orders) + 1;
      res = await supabase.from('glyphs').insert(row).select().single();
    } else {
      const old = selected?.image_path;
      res = await supabase.from('glyphs').update(row).eq('id', selectedId!).select().single();
      if (!res.error && old && old !== fImage) await deleteImage(old);
    }
    busy = false;
    if (res.error) return (err = res.error.message);
    const g = res.data as Glyph;
    const i = glyphs.state.items.findIndex((x) => x.id === g.id);
    if (i >= 0) glyphs.state.items[i] = g; else glyphs.state.items.push(g);
    uploadedNow = [];
    const wasStone = creating === 'stone' || selectedIsStone;
    creating = null; editing = false;
    selectedId = wasStone ? null : g.id;
  }

  async function remove(g: Glyph) {
    if (!confirm(t('ros.deleteConfirm'))) return;
    const { error } = await supabase.from('glyphs').delete().eq('id', g.id);
    if (error) return alert(error.message);
    if (g.image_path) await deleteImage(g.image_path);
    selectedId = null;
  }

  async function makeStone(g: Glyph) {
    if (!confirm(t('ros.makeStoneConfirm'))) return;
    const min = Math.min(...glyphs.state.items.map((x) => x.sort_order));
    const { error } = await supabase.from('glyphs').update({ sort_order: min - 1 }).eq('id', g.id);
    if (error) return alert(error.message);
    await glyphs.reload();
    selectedId = null;
  }

  async function move(g: Glyph, dir: -1 | 1) {
    const i = texts.findIndex((x) => x.id === g.id);
    const other = texts[i + dir];
    if (!other) return;
    let a = g.sort_order, b = other.sort_order;
    if (a === b) { a = other.sort_order + dir; }
    await Promise.all([
      supabase.from('glyphs').update({ sort_order: b }).eq('id', g.id),
      supabase.from('glyphs').update({ sort_order: a }).eq('id', other.id),
    ]);
    await glyphs.reload();
  }

  function paste(e: ClipboardEvent) {
    if (!editing) return;
    const files = imageFiles(e.clipboardData);
    if (files.length) { e.preventDefault(); setImage(files); }
  }
  function keys(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (zoomUrl) zoomUrl = null;
    else if (selectedId || creating) close();
  }

  const panelOpen = $derived((!!selected && (!selectedIsStone || editing)) || !!creating);
</script>

<svelte:window onpaste={paste} onkeydown={keys} />

<h1>🔣 {t('nav.rosetta')}</h1>

<!-- ================= THE ROSETTA STONE ================= -->
<section class="card stonecard">
  {#if !glyphs.state.loaded}
    <p class="muted">{t('common.loading')}</p>
  {:else if stone && stone.image_path}
    <div class="row stonehead">
      <h2>🗿 {t('ros.stone')}</h2>
      <span class="spacer"></span>
      <button class="small" onclick={() => openZoom(stone.image_path!)}>🔍 {t('ros.fullscreen')}</button>
      {#if isAdmin()}<button class="small" onclick={() => { openItem(stone); startEdit(stone); }}>✏️ {t('ros.replaceStone')}</button>{/if}
    </div>
    <button class="stoneimg" onclick={() => openZoom(stone.image_path!)} title={t('ros.fullscreen')}>
      <StorageImage path={stone.image_path} pixel alt={t('ros.stone')} />
    </button>
    {#if stone.notes.trim()}<div class="stonenotes"><Markdown source={lt(stone, 'notes')} /></div>{/if}
  {:else}
    <div class="emptystone">
      <p class="big">🗿</p>
      <p>{t('ros.noStone')}</p>
      {#if isAdmin()}<button class="primary" onclick={() => openNew('stone')}>＋ {t('ros.addStone')}</button>{/if}
    </div>
  {/if}
</section>

<!-- ================= IN-GAME TEXTS ================= -->
<div class="row texthead">
  <h2>📜 {t('ros.texts')} <span class="muted count">({texts.length})</span></h2>
  <span class="spacer"></span>
  {#if isAdmin() && stone}<button class="primary" onclick={() => openNew('text')}>＋ {t('ros.newText')}</button>{/if}
</div>
<p class="muted intro">{t('ros.textsIntro')}</p>

<div class="row filters">
  <input class="grow" bind:value={search} placeholder={'🔍 ' + t('ros.search')} />
  <div class="row confs">
    <button class="small" class:on={conf === 'all'} onclick={() => (conf = 'all')}>{t('ros.all')} {texts.length}</button>
    {#each CONF as c}
      <button class="small" class:on={conf === c} onclick={() => (conf = c)}>
        <span class="sw" style:background={CONF_COLOR[c]} style:color={CONF_COLOR[c]}></span>{t(`conf.${c}` as Key)} {stats[c]}
      </button>
    {/each}
  </div>
</div>

<div class="layout" class:open={panelOpen}>
  <div>
    {#if glyphs.state.loaded && list.length === 0}
      <div class="card empty muted">{texts.length ? t('notes.noMatch') : t('ros.emptyTexts')}</div>
    {:else}
      <div class="grid">
        {#each list as g (g.id)}
          <button class="thumb" class:sel={g.id === selectedId} style:--c={CONF_COLOR[g.confidence]} onclick={() => openItem(g)}>
            <span class="pic">
              {#if g.image_path}<StorageImage path={g.image_path} pixel alt="" />{:else}<span class="sym">{g.symbol}</span>{/if}
              {#if g.loc_x !== null}<span class="pinned" title={t('lib.located')}>📍</span>{/if}
            </span>
            <span class="tr" class:unknown={!g.meaning}>{g.meaning ? excerpt(lt(g, 'meaning'), 60) : '?'}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if panelOpen}
    <aside class="card panel">
      <div class="row">
        <h2>{creating === 'stone' ? t('ros.addStone') : creating ? t('ros.newText') : selectedIsStone ? t('ros.replaceStone') : editing ? t('ros.edit') : t('ros.text')}</h2>
        <span class="spacer"></span>
        <button class="small" onclick={close} aria-label={t('common.close')}>✕</button>
      </div>

      {#if editing}
        <form onsubmit={save}>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="drop" class:dragging
            ondragover={(e) => { e.preventDefault(); dragging = true; }}
            ondragleave={() => (dragging = false)}
            ondrop={(e) => { e.preventDefault(); dragging = false; setImage(imageFiles(e.dataTransfer)); }}>
            {#if fImage}
              <StorageImage path={fImage} pixel class="big" />
            {:else}
              <p class="muted">{busy ? '⏳' : t('ros.dropHint')}</p>
            {/if}
            <label class="btn small pick">🖼 {fImage ? t('ros.changeImage') : t('md.addImage')}
              <input type="file" accept="image/*" hidden onchange={(e) => setImage(Array.from((e.target as HTMLInputElement).files ?? []))} />
            </label>
          </div>

          {#if creating !== 'stone' && !selectedIsStone}
            <label for="txt">{t('ros.translation')}</label>
            <textarea id="txt" rows="4" bind:value={fText} placeholder={t('ros.translationPlaceholder')}></textarea>

            {#if !creating && selected}
              <label for="txttr">{t('ros.translation')} ({otherLang(selected.lang).toUpperCase()})</label>
              <textarea id="txttr" rows="3" bind:value={fTextTr} placeholder={t('tr.autoPlaceholder')}></textarea>
            {/if}

            <span class="lbl">{t('ros.confidence')}</span>
            <div class="row confpick">
              {#each CONF as c}
                <button type="button" class="small" class:on={fConf === c} onclick={() => (fConf = c)}>
                  <span class="sw" style:background={CONF_COLOR[c]} style:color={CONF_COLOR[c]}></span>{t(`conf.${c}` as Key)}
                </button>
              {/each}
            </div>

            <fieldset>
              <legend>📍 {t('lib.location')}</legend>
              <div class="grid2">
                <div><label for="gx">X</label><input id="gx" type="number" step="1" bind:value={fX} /></div>
                <div><label for="gy">Y</label><input id="gy" type="number" step="1" bind:value={fY} /></div>
              </div>
              {#if selected && !creating}
                <a class="btn small pickmap" href={`#/map?placeRune=${selected.id}${selected.loc_x !== null ? `&x=${selected.loc_x}&y=${selected.loc_y}` : ''}`}>🗺️ {t('lib.pickOnMap')}</a>
              {:else}
                <p class="muted small">{t('ros.pickAfterSave')}</p>
              {/if}
            </fieldset>
          {/if}

          <label for="gnotes">{t('ros.notes')}</label>
          <textarea id="gnotes" rows="3" bind:value={fNotes} placeholder={t('ros.notesPlaceholder')}></textarea>

          {#if err}<p class="error">{err}</p>{/if}
          <div class="row actions">
            <button class="primary" type="submit" disabled={busy}>{busy ? '⏳' : '💾'} {t('common.save')}</button>
            <button type="button" class="ghost" onclick={cancelEdit}>{t('common.cancel')}</button>
          </div>
        </form>
      {:else if selected}
        <button class="viewpic" onclick={() => selected.image_path && openZoom(selected.image_path)} title={t('ros.fullscreen')}>
          {#if selected.image_path}<StorageImage path={selected.image_path} pixel class="big" />
          {:else}<span class="sym huge">{selected.symbol}</span>{/if}
        </button>
        <span class="badge" style:color={CONF_COLOR[selected.confidence]}>{t(`conf.${selected.confidence}` as Key)}</span>
        <h3 class="trtitle">{t('ros.translation')}</h3>
        {#if selected.meaning}<p class="translation">{lt(selected, 'meaning')}</p>{:else}<p class="muted">?</p>{/if}
        <div class="row"><MapLink x={selected.loc_x} y={selected.loc_y} rune={selected.id} /></div>
        {#if selected.notes.trim()}<div class="divider"></div><Markdown source={lt(selected, 'notes')} />{/if}
        {#if isAdmin()}
          <div class="divider"></div>
          <div class="row">
            <button class="small" onclick={() => startEdit(selected)}>✏️ {t('alc.edit')}</button>
            <button class="small" onclick={() => move(selected, -1)} title={t('ros.moveLeft')}>◀</button>
            <button class="small" onclick={() => move(selected, 1)} title={t('ros.moveRight')}>▶</button>
            <button class="small" onclick={() => makeStone(selected)} title={t('ros.makeStone')}>🗿</button>
            <button class="small danger" onclick={() => remove(selected)}>🗑</button>
          </div>
        {/if}
      {/if}
    </aside>
  {/if}
</div>

{#if zoomUrl}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="zoom" class:fit={zoomFit} onclick={() => (zoomUrl = null)}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <img src={zoomUrl} alt="" onclick={(e) => { e.stopPropagation(); zoomFit = !zoomFit; }} />
    <p class="zoomhint">{t('ros.zoomHint')}</p>
  </div>
{/if}

<style>
  .stonecard { margin-bottom: 1.6rem; }
  .stonehead h2 { margin: 0; }
  .stoneimg {
    display: block; width: 100%; margin-top: 0.8rem; padding: 0.6rem; cursor: zoom-in;
    background: radial-gradient(ellipse at center, #241a2e, #07050b); border-image-source: var(--px-stone);
    box-shadow: inset 0 4px 0 rgba(0, 0, 0, 0.5);
  }
  .stoneimg:hover { border-image-source: var(--px-gold); background: radial-gradient(ellipse at center, #2c2038, #07050b); }
  .stoneimg:active { transform: none; }
  .stoneimg :global(img) { display: block; width: 100%; max-height: 78vh; object-fit: contain; image-rendering: pixelated; }
  .stonenotes { margin-top: 0.8rem; }
  .emptystone { text-align: center; padding: 1.5rem 1rem; }
  .emptystone .big { font-size: 3.5rem; margin: 0; }

  .texthead h2 { margin: 0; }
  .count { font-size: 0.9rem; text-shadow: none; }
  .intro { margin: 0.3rem 0 0; }
  .filters { margin: 1rem 0; }
  .grow { flex: 1; min-width: 200px; }
  .confs { gap: 0.3rem; }
  .sw { width: 0.7rem; height: 0.7rem; display: inline-block; box-shadow: 0 0 6px currentColor; }
  .on { border-image-source: var(--px-bright) !important; background-color: var(--stone-4) !important; }

  .layout { display: grid; gap: 1rem; }
  .layout.open { grid-template-columns: minmax(0, 1fr) minmax(320px, 420px); align-items: start; }
  @media (max-width: 900px) { .layout.open { grid-template-columns: 1fr; } .panel { order: -1; } }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.8rem; }
  .thumb {
    display: flex; flex-direction: column; align-items: stretch; padding: 0; overflow: hidden; gap: 0;
    border: 2px solid var(--c); background: var(--stone-1); color: var(--text); font-family: var(--font-body);
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.4), 0 0 12px color-mix(in srgb, var(--c) 25%, transparent);
  }
  .thumb:hover { transform: translateY(-2px); background: var(--stone-2); box-shadow: 0 6px 0 rgba(0, 0, 0, 0.4), 0 0 18px color-mix(in srgb, var(--c) 45%, transparent); }
  .thumb.sel { outline: 3px solid var(--gold-bright); outline-offset: 2px; }
  .pic { position: relative; height: 92px; display: grid; place-items: center; background: radial-gradient(circle, #241a2e, #07050b); }
  .pic :global(img) { max-width: 92%; max-height: 84px; image-rendering: pixelated; }
  .pinned { position: absolute; top: 3px; right: 4px; font-size: 0.85rem; filter: drop-shadow(1px 1px 0 #000); }
  .sym { font-size: 2.2rem; color: var(--gold-bright); }
  .sym.huge { font-size: 5rem; }
  .tr {
    padding: 0.35rem 0.45rem; font-weight: 500; font-size: 0.88rem; line-height: 1.25; text-align: left;
    border-top: 2px solid var(--c); min-height: 2.6em; word-break: break-word;
  }
  .tr.unknown { color: var(--text-dim); text-align: center; }

  .panel { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow: auto; }
  .panel h2 { margin: 0; }
  .viewpic {
    display: grid; place-items: center; width: 100%; padding: 0.8rem; margin: 0.8rem 0; cursor: zoom-in;
    background: radial-gradient(circle, #241a2e, #07050b); border-image-source: var(--px-stone); box-shadow: inset 0 4px 0 rgba(0, 0, 0, 0.5);
  }
  .viewpic:active { transform: none; }
  .panel :global(img.big) { max-width: 100%; max-height: 260px; min-width: 120px; image-rendering: pixelated; }
  .trtitle { margin: 0.9rem 0 0.3rem; color: var(--gold); font-size: 0.95rem; }
  .translation { margin: 0 0 0.6rem; font-size: 1.15rem; white-space: pre-wrap; color: #fff3d6; }
  .drop {
    display: grid; justify-items: center; gap: 0.5rem; padding: 1rem; margin-top: 0.8rem; text-align: center;
    border: 2px dashed var(--stone-4); background: rgba(0, 0, 0, 0.25);
  }
  .drop.dragging { border-color: var(--gold-bright); }
  .pick { margin: 0; cursor: pointer; }
  .lbl { display: block; margin: 0.8rem 0 0.3rem; color: var(--text-dim); font-weight: 500; }
  .confpick { gap: 0.3rem; }
  fieldset { margin-top: 1rem; border: 2px dashed var(--stone-3); padding: 0.2rem 0.9rem 0.8rem; }
  legend { color: var(--gold); font-family: var(--font-title); padding: 0 0.4rem; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .pickmap { margin-top: 0.7rem; }
  .actions { margin-top: 1rem; }
  .small { font-size: 0.85rem; }
  .empty { text-align: center; padding: 2rem; }

  .zoom {
    position: fixed; inset: 0; z-index: 100; background: rgba(5, 3, 8, 0.94); overflow: auto; cursor: zoom-out;
    display: flex; align-items: flex-start; justify-content: flex-start;
  }
  .zoom img { image-rendering: pixelated; cursor: zoom-out; margin: auto; }
  .zoom.fit { align-items: center; justify-content: center; }
  .zoom.fit img { max-width: 96vw; max-height: 92vh; width: auto; height: auto; cursor: zoom-in; min-width: min(96vw, 900px); object-fit: contain; }
  .zoomhint { position: fixed; bottom: 0.6rem; left: 50%; transform: translateX(-50%); margin: 0; color: var(--text-dim); font-size: 0.85rem; pointer-events: none; }
</style>
