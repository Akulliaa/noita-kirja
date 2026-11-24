<script lang="ts">
  import { supabase } from '../lib/supabase';
  import { alchemy, elementName, elName, ensureElement, ingredientsKey, norm, byName } from '../lib/alchemy.svelte';
  import { addTranslations } from '../lib/translate';
  import { lt } from '../lib/loc';
  import { isAdmin } from '../lib/auth.svelte';
  import { t, i18n } from '../lib/i18n.svelte';
  import type { Mixture } from '../lib/types';
  import ElementPicker from '../components/ElementPicker.svelte';
  import MixtureFormula from '../components/MixtureFormula.svelte';

  type Pick = { id: string | null; name: string };

  // ---------------- Editor ----------------
  let editingId = $state<string | null>(null);
  let ingredients = $state<Pick[]>([]);
  let result = $state<Pick | null>(null);
  let noReaction = $state(false);
  let note = $state('');
  let saving = $state(false);
  let formErr = $state('');
  let formOk = $state('');

  function resetForm() {
    editingId = null; ingredients = []; result = null; noReaction = false; note = ''; formErr = '';
  }

  function addIngredient(p: Pick) {
    if (ingredients.some((x) => norm(x.name) === norm(p.name))) return;
    ingredients.push(p);
  }

  function edit(m: Mixture) {
    editingId = m.id;
    ingredients = m.ingredients.map((id) => ({ id, name: elementName(id) }));
    result = m.result_id ? { id: m.result_id, name: elementName(m.result_id) } : null;
    noReaction = m.no_reaction;
    note = m.note ?? '';
    formErr = formOk = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function prefill(ids: string[]) {
    resetForm();
    ingredients = ids.map((id) => ({ id, name: elementName(id) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    formErr = formOk = '';
    if (ingredients.length < 2) return (formErr = t('alc.err.twoIngredients'));
    if (!noReaction && !result) return (formErr = t('alc.err.result'));
    saving = true;
    try {
      const ids = [...new Set(await Promise.all(ingredients.map((p) => p.id ?? ensureElement(p.name))))];
      if (ids.length < 2) throw new Error(t('alc.err.twoIngredients'));
      const resultId = noReaction ? null : result!.id ?? (await ensureElement(result!.name));
      const before = editingId ? alchemy.mixtures.find((m) => m.id === editingId) ?? null : null;
      const lang = before?.lang ?? i18n.lang;
      const row = await addTranslations(
        { ingredients: ids, result_id: resultId, no_reaction: noReaction, note: note.trim() || null, lang } as Record<string, any>,
        ['note'], lang, before);

      const existing = alchemy.mixtures.find((m) => ingredientsKey(m.ingredients) === ingredientsKey(ids));
      let targetId = editingId;
      if (existing && existing.id !== editingId) {
        if (!confirm(t('alc.confirmReplace'))) { saving = false; return; }
        targetId = existing.id;
        if (editingId) await supabase.from('mixtures').delete().eq('id', editingId);
      }
      const { error } = targetId
        ? await supabase.from('mixtures').update(row).eq('id', targetId)
        : await supabase.from('mixtures').insert(row);
      if (error) throw error;
      formOk = t('alc.saved');
      resetForm();
    } catch (err: any) {
      formErr = t('common.error', { msg: err?.message ?? String(err) });
    }
    saving = false;
  }

  async function remove(m: Mixture) {
    if (!confirm(t('alc.confirmDeleteMix'))) return;
    const { error } = await supabase.from('mixtures').delete().eq('id', m.id);
    if (error) alert(error.message);
    if (editingId === m.id) resetForm();
  }

  // ---------------- Filters ----------------
  let search = $state('');
  let mustContain = $state<string[]>([]);
  let size = $state<'all' | '2' | '3' | '4'>('all');
  let outcome = $state<'all' | 'reaction' | 'none'>('all');
  let sort = $state<'new' | 'alpha'>('new');

  const rows = $derived.by(() => {
    const q = norm(search);
    let list = alchemy.mixtures.filter((m) => {
      if (mustContain.length && !mustContain.every((id) => m.ingredients.includes(id))) return false;
      if (size === '2' && m.ingredients.length !== 2) return false;
      if (size === '3' && m.ingredients.length !== 3) return false;
      if (size === '4' && m.ingredients.length < 4) return false;
      if (outcome === 'reaction' && m.no_reaction) return false;
      if (outcome === 'none' && !m.no_reaction) return false;
      if (q) {
        const hay = [...m.ingredients.map(elementName), m.no_reaction ? '' : elementName(m.result_id), m.note ?? '', m.note_tr ?? '']
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const label = (m: Mixture) => m.ingredients.map(elementName).sort().join('+');
    list = list.sort(sort === 'new'
      ? (a, b) => b.created_at.localeCompare(a.created_at)
      : (a, b) => label(a).localeCompare(label(b)));
    return list;
  });

  // ---------------- Untested pairs helper ----------------
  let pairBase = $state<string | null>(null);
  const untested = $derived.by(() => {
    if (!pairBase) return [];
    const tested = new Set(
      alchemy.mixtures
        .filter((m) => m.ingredients.length === 2 && m.ingredients.includes(pairBase!))
        .map((m) => m.ingredients.find((x) => x !== pairBase)),
    );
    return alchemy.elements.filter((e) => e.id !== pairBase && !tested.has(e.id)).sort(byName);
  });

  const fmt = (s: string) => new Date(s).toLocaleDateString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
</script>

<h1>⚗️ {t('nav.mixtures')}</h1>

{#if alchemy.error}<p class="error">{t('common.error', { msg: alchemy.error })}</p>{/if}

<div class="top">
  {#if isAdmin()}
    <form class="card editor" onsubmit={save}>
      <h2>{editingId ? t('alc.editMix') : t('alc.newMix')}</h2>

      <label for="ing">{t('alc.ingredients')}</label>
      <div class="chips">
        {#each ingredients as p, i (p.name)}
          <span class="chip">
            {p.name}{#if !p.id}<em class="new">{t('alc.new')}</em>{/if}
            <button type="button" class="x" onclick={() => ingredients.splice(i, 1)} aria-label="remove">×</button>
          </span>
        {/each}
      </div>
      <ElementPicker id="ing" allowCreate onpick={addIngredient}
        exclude={ingredients.map((p) => p.id).filter((x): x is string => !!x)}
        placeholder={t('alc.addIngredient')} />
      <p class="hint muted">{t('alc.ingredientsHint')}</p>

      <label for="res">{t('alc.result')}</label>
      <label class="check"><input type="checkbox" bind:checked={noReaction} /> {t('alc.noReaction')}</label>
      {#if !noReaction}
        {#if result}
          <span class="chip result">
            {result.name}{#if !result.id}<em class="new">{t('alc.new')}</em>{/if}
            <button type="button" class="x" onclick={() => (result = null)} aria-label="remove">×</button>
          </span>
        {:else}
          <ElementPicker id="res" allowCreate onpick={(p) => (result = p)} placeholder={t('alc.pickResult')} />
        {/if}
      {/if}

      <label for="note">{t('alc.note')}</label>
      <textarea id="note" rows="2" bind:value={note} placeholder={t('alc.notePlaceholder')}></textarea>

      {#if formErr}<p class="error">{formErr}</p>{/if}
      {#if formOk}<p class="success">{formOk}</p>{/if}
      <div class="row actions">
        <button class="primary" type="submit" disabled={saving}>💾 {t('common.save')}</button>
        {#if editingId || ingredients.length}
          <button type="button" class="ghost" onclick={resetForm}>{t('common.cancel')}</button>
        {/if}
      </div>
    </form>
  {/if}

  <div class="card helper">
    <h2>🧪 {t('alc.untested')}</h2>
    <p class="muted">{t('alc.untestedHint')}</p>
    <select bind:value={pairBase}>
      <option value={null}>—</option>
      {#each [...alchemy.elements].sort(byName) as e (e.id)}<option value={e.id}>{elName(e)}</option>{/each}
    </select>
    {#if pairBase}
      <p class="muted small">{t('alc.untestedCount', { n: untested.length })}</p>
      <div class="chips scroll">
        {#each untested as e (e.id)}
          {#if isAdmin()}
            <button class="chip clickable" onclick={() => prefill([pairBase!, e.id])}>{elName(e)}</button>
          {:else}
            <span class="chip">{elName(e)}</span>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<section class="card list">
  <div class="filters">
    <input class="search" bind:value={search} placeholder={'🔍 ' + t('alc.search')} />
    <select bind:value={size}>
      <option value="all">{t('alc.size.all')}</option>
      <option value="2">2 {t('alc.ingredientsShort')}</option>
      <option value="3">3 {t('alc.ingredientsShort')}</option>
      <option value="4">4+ {t('alc.ingredientsShort')}</option>
    </select>
    <select bind:value={outcome}>
      <option value="all">{t('alc.outcome.all')}</option>
      <option value="reaction">{t('alc.outcome.reaction')}</option>
      <option value="none">{t('alc.outcome.none')}</option>
    </select>
    <select bind:value={sort}>
      <option value="new">{t('alc.sort.new')}</option>
      <option value="alpha">{t('alc.sort.alpha')}</option>
    </select>
  </div>
  <div class="row contains">
    <span class="muted">{t('alc.containing')}</span>
    {#each mustContain as id, i (id)}
      <span class="chip">{elementName(id)}
        <button type="button" class="x" onclick={() => mustContain.splice(i, 1)} aria-label="remove">×</button>
      </span>
    {/each}
    <div class="mini"><ElementPicker onpick={(p) => p.id && mustContain.push(p.id)} exclude={mustContain} placeholder="+" /></div>
  </div>

  <p class="muted small">{t('alc.count', { n: rows.length, total: alchemy.mixtures.length })}</p>

  {#if !alchemy.loaded}
    <p class="muted">{t('common.loading')}</p>
  {:else if rows.length === 0}
    <p class="muted empty">{alchemy.mixtures.length ? t('alc.noMatch') : t('alc.empty')}</p>
  {:else}
    <ul class="mixes">
      {#each rows as m (m.id)}
        <li>
          <div class="main">
            <MixtureFormula mix={m} />
            {#if m.note}<p class="note">{lt(m, 'note')}</p>{/if}
          </div>
          <span class="date muted">{fmt(m.created_at)}</span>
          {#if isAdmin()}
            <div class="acts">
              <button class="small" onclick={() => edit(m)} title={t('alc.edit')}>✏️</button>
              <button class="small danger" onclick={() => remove(m)} title={t('admin.delete')}>🗑</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .top { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; margin-bottom: 1rem; }
  .top > .helper:only-child { grid-column: 1 / -1; }
  @media (max-width: 900px) { .top { grid-template-columns: 1fr; } }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem; }
  .chips.scroll { max-height: 260px; overflow: auto; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.6rem; border-radius: 999px;
    border: 1px solid var(--gold-dim); background: rgba(212, 175, 85, 0.1); font-weight: 500; font-size: 0.95rem; color: var(--text);
  }
  .chip.result { background: rgba(111, 154, 74, 0.2); border-color: rgba(140, 190, 100, 0.6); }
  .chip.clickable { cursor: pointer; }
  .chip.clickable:hover { border-color: var(--gold); color: var(--gold-bright); }
  .x { padding: 0 0.3rem; border: none; background: none; color: var(--text-dim); font-size: 1.1rem; line-height: 1; }
  .x:hover { color: var(--danger); }
  .new { font-size: 0.75rem; color: var(--gold-bright); font-style: normal; border: 1px dashed var(--gold); border-radius: 4px; padding: 0 0.25rem; }
  .hint, .small { font-size: 0.88rem; margin: 0.3rem 0 0; }
  .check { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.5rem; color: var(--text); font-weight: 400; }
  .check input { width: auto; }
  .actions { margin-top: 1rem; }
  .filters { display: grid; grid-template-columns: 2fr repeat(3, minmax(0, 1fr)); gap: 0.6rem; }
  @media (max-width: 700px) { .filters { grid-template-columns: 1fr 1fr; } .search { grid-column: 1 / -1; } }
  .contains { margin-top: 0.6rem; }
  .mini { width: 180px; }
  .mixes { list-style: none; margin: 0.5rem 0 0; padding: 0; }
  .mixes li {
    display: grid; grid-template-columns: 1fr auto auto; gap: 0.8rem; align-items: center;
    padding: 0.6rem 0.4rem; border-bottom: 1px solid rgba(212, 175, 85, 0.15);
  }
  .mixes li:hover { background: rgba(212, 175, 85, 0.04); }
  .note { margin: 0.3rem 0 0; color: var(--text-dim); font-size: 0.92rem; white-space: pre-wrap; }
  .date { font-size: 0.85rem; }
  .acts { display: flex; gap: 0.3rem; }
  .empty { text-align: center; padding: 2rem 0; }
</style>
