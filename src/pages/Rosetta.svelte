<script lang="ts">
  import { supabase } from '../lib/supabase';
  import { glyphs } from '../lib/stores';
  import { isAdmin } from '../lib/auth.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import { uploadImage, deleteImage, imageFiles } from '../lib/images';
  import type { Confidence, Glyph } from '../lib/types';
  import StorageImage from '../components/StorageImage.svelte';
  import Markdown from '../components/Markdown.svelte';

  glyphs.start();

  const CONF: Confidence[] = ['unknown', 'guess', 'likely', 'sure'];
  const CONF_COLOR: Record<Confidence, string> = {
    unknown: '#7d6e58', guess: '#e0a96d', likely: '#8fc1e3', sure: '#9fd27a',
  };

  let search = $state('');
  let conf = $state<Confidence | 'all'>('all');
  let selectedId = $state<string | null>(null);
  let creating = $state(false);

  const sorted = $derived([...glyphs.state.items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)));
  const list = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((g) =>
      (conf === 'all' || g.confidence === conf) &&
      (!q || [g.meaning, g.symbol ?? '', g.notes].join(' ').toLowerCase().includes(q)));
  });
  const selected = $derived(selectedId ? glyphs.get(selectedId) ?? null : null);
  const stats = $derived(Object.fromEntries(CONF.map((c) => [c, glyphs.state.items.filter((g) => g.confidence === c).length])));

  // ---------------- Editor ----------------
  let fImage = $state<string | null>(null);
  let fSymbol = $state('');
  let fMeaning = $state('');
  let fConf = $state<Confidence>('guess');
  let fNotes = $state('');
  let editing = $state(false);
  let busy = $state(false);
  let err = $state('');
  let dragging = $state(false);
  let uploadedNow: string[] = [];

  function openNew() {
    selectedId = null; creating = true; editing = true;
    fImage = null; fSymbol = ''; fMeaning = ''; fConf = 'guess'; fNotes = ''; err = ''; uploadedNow = [];
  }
  function openGlyph(g: Glyph) {
    selectedId = g.id; creating = false; editing = false; err = '';
  }
  function startEdit(g: Glyph) {
    editing = true;
    fImage = g.image_path; fSymbol = g.symbol ?? ''; fMeaning = g.meaning; fConf = g.confidence; fNotes = g.notes; uploadedNow = [];
  }
  // Images uploaded during an edit that was never saved are removed from storage.
  function discardUploads() {
    for (const p of uploadedNow) deleteImage(p);
    uploadedNow = [];
  }
  function cancelEdit() {
    discardUploads();
    if (creating) close(); else editing = false;
  }
  function close() {
    discardUploads();
    selectedId = null; creating = false; editing = false;
  }

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
    if (!fImage && !fSymbol.trim()) return (err = t('ros.err.needGlyph'));
    busy = true;
    const row = {
      image_path: fImage, symbol: fSymbol.trim() || null, meaning: fMeaning.trim(),
      confidence: fConf, notes: fNotes, lang: i18n.lang,
    };
    let res;
    if (creating) {
      const max = glyphs.state.items.reduce((m, g) => Math.max(m, g.sort_order), 0);
      res = await supabase.from('glyphs').insert({ ...row, sort_order: max + 1 }).select().single();
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
    selectedId = g.id; creating = false; editing = false;
  }

  async function remove(g: Glyph) {
    if (!confirm(t('ros.deleteConfirm'))) return;
    const { error } = await supabase.from('glyphs').delete().eq('id', g.id);
    if (error) return alert(error.message);
    if (g.image_path) await deleteImage(g.image_path);
    selectedId = null;
  }

  async function move(g: Glyph, dir: -1 | 1) {
    const i = sorted.findIndex((x) => x.id === g.id);
    const other = sorted[i + dir];
    if (!other) return;
    // normalise orders if equal
    const a = g.sort_order === other.sort_order ? i : g.sort_order;
    const b = g.sort_order === other.sort_order ? i + dir : other.sort_order;
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
</script>

<svelte:window onpaste={paste} onkeydown={(e) => e.key === 'Escape' && (selectedId || creating) && close()} />

<div class="row head">
  <h1>🔣 {t('nav.rosetta')}</h1>
  <span class="spacer"></span>
  {#if isAdmin()}<button class="primary" onclick={openNew}>＋ {t('ros.new')}</button>{/if}
</div>
<p class="muted intro">{t('ros.intro')}</p>

<div class="row filters">
  <input class="grow" bind:value={search} placeholder={'🔍 ' + t('ros.search')} />
  <div class="row confs">
    <button class="small" class:on={conf === 'all'} onclick={() => (conf = 'all')}>{t('ros.all')} {glyphs.state.items.length}</button>
    {#each CONF as c}
      <button class="small" class:on={conf === c} style:--c={CONF_COLOR[c]} onclick={() => (conf = c)}>
        <span class="dot" style:background={CONF_COLOR[c]} style:color={CONF_COLOR[c]}></span>
        {t(`conf.${c}` as Key)} {stats[c]}
      </button>
    {/each}
  </div>
</div>

<div class="layout" class:open={!!selected || creating}>
  <div>
    {#if !glyphs.state.loaded}
      <p class="muted">{t('common.loading')}</p>
    {:else if list.length === 0}
      <div class="card empty muted">{glyphs.state.items.length ? t('notes.noMatch') : t('ros.empty')}</div>
    {:else}
      <div class="grid">
        {#each list as g (g.id)}
          <button class="glyph" class:sel={g.id === selectedId} style:--c={CONF_COLOR[g.confidence]} onclick={() => openGlyph(g)}>
            <span class="pic">
              {#if g.image_path}<StorageImage path={g.image_path} pixel alt={g.symbol ?? ''} />
              {:else}<span class="sym">{g.symbol}</span>{/if}
            </span>
            <span class="meaning" class:unknown={!g.meaning}>{g.meaning || '?'}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if selected || creating}
    <aside class="card panel">
      <div class="row">
        <h2>{creating ? t('ros.new') : editing ? t('ros.edit') : (selected?.meaning || '?')}</h2>
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
              <button type="button" class="small ghost" onclick={() => (fImage = null)}>✕ {t('ros.removeImage')}</button>
            {:else}
              <p class="muted">{busy ? '⏳' : t('ros.dropHint')}</p>
            {/if}
            <label class="btn small pick">🖼 {t('md.addImage')}
              <input type="file" accept="image/*" hidden onchange={(e) => setImage(Array.from((e.target as HTMLInputElement).files ?? []))} />
            </label>
          </div>

          <label for="sym">{t('ros.symbol')}</label>
          <input id="sym" bind:value={fSymbol} maxlength="20" placeholder={t('ros.symbolPlaceholder')} />

          <label for="mean">{t('ros.meaning')}</label>
          <input id="mean" bind:value={fMeaning} maxlength="100" placeholder={t('ros.meaningPlaceholder')} />

          <label for="conf">{t('ros.confidence')}</label>
          <div class="row confpick" id="conf">
            {#each CONF as c}
              <button type="button" class="small" class:on={fConf === c} style:--c={CONF_COLOR[c]} onclick={() => (fConf = c)}>
                {t(`conf.${c}` as Key)}
              </button>
            {/each}
          </div>

          <label for="gnotes">{t('ros.notes')}</label>
          <textarea id="gnotes" rows="5" bind:value={fNotes} placeholder={t('ros.notesPlaceholder')}></textarea>

          {#if err}<p class="error">{err}</p>{/if}
          <div class="row actions">
            <button class="primary" type="submit" disabled={busy}>💾 {t('common.save')}</button>
            <button type="button" class="ghost" onclick={cancelEdit}>{t('common.cancel')}</button>
          </div>
        </form>
      {:else if selected}
        <div class="viewpic">
          {#if selected.image_path}<StorageImage path={selected.image_path} pixel class="big" />
          {:else}<span class="sym huge">{selected.symbol}</span>{/if}
        </div>
        {#if selected.symbol && selected.image_path}<p class="muted">{t('ros.symbol')} : <code>{selected.symbol}</code></p>{/if}
        <p><span class="badge" style:color={CONF_COLOR[selected.confidence]}>{t(`conf.${selected.confidence}` as Key)}</span></p>
        {#if selected.notes.trim()}<Markdown source={selected.notes} />{/if}
        {#if isAdmin()}
          <div class="divider"></div>
          <div class="row">
            <button class="small" onclick={() => startEdit(selected)}>✏️ {t('alc.edit')}</button>
            <button class="small" onclick={() => move(selected, -1)} title={t('ros.moveLeft')}>◀</button>
            <button class="small" onclick={() => move(selected, 1)} title={t('ros.moveRight')}>▶</button>
            <button class="small danger" onclick={() => remove(selected)}>🗑</button>
          </div>
        {/if}
      {/if}
    </aside>
  {/if}
</div>

<style>
  .head h1 { margin: 0; }
  .intro { margin-top: 0.4rem; }
  .filters { margin: 1rem 0; }
  .grow { flex: 1; min-width: 200px; }
  .confs { gap: 0.3rem; }
  .on { border-color: var(--c, var(--gold-bright)) !important; background: rgba(212, 175, 85, 0.2); }
  .layout { display: grid; gap: 1rem; }
  .layout.open { grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); align-items: start; }
  @media (max-width: 900px) { .layout.open { grid-template-columns: 1fr; } .panel { order: -1; } }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.7rem; }
  .glyph {
    display: flex; flex-direction: column; align-items: stretch; gap: 0; padding: 0; overflow: hidden;
    border: 2px solid var(--c); border-radius: 10px; background: var(--wood-2); color: var(--text);
  }
  .glyph.sel { box-shadow: 0 0 0 3px var(--gold-bright); }
  .pic { height: 90px; display: grid; place-items: center; background: radial-gradient(circle, #2b2118, #120c08); }
  .pic :global(img) { max-width: 80%; max-height: 76px; }
  .sym { font-size: 2.4rem; font-family: var(--font-title); color: var(--gold-bright); }
  .sym.huge { font-size: 5rem; }
  .meaning { padding: 0.35rem 0.4rem; font-weight: 700; font-size: 0.92rem; text-align: center; border-top: 1px solid var(--c); word-break: break-word; }
  .meaning.unknown { color: var(--text-dim); }
  .panel { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow: auto; }
  .panel h2 { margin: 0; }
  .viewpic { display: grid; place-items: center; padding: 1rem; margin: 0.8rem 0; border-radius: 10px; background: radial-gradient(circle, #2b2118, #120c08); }
  .panel :global(img.big) { max-width: 100%; max-height: 220px; min-width: 96px; image-rendering: pixelated; }
  .drop {
    display: grid; justify-items: center; gap: 0.5rem; padding: 1rem; margin-top: 0.8rem;
    border: 2px dashed var(--gold-dim); border-radius: 10px; background: rgba(0, 0, 0, 0.2); text-align: center;
  }
  .drop.dragging { border-color: var(--gold-bright); }
  .pick { margin: 0; cursor: pointer; }
  .confpick { gap: 0.3rem; }
  .actions { margin-top: 1rem; }
  .small { font-size: 0.85rem; }
  .empty { text-align: center; padding: 2.5rem; }
</style>
