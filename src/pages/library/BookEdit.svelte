<script lang="ts">
  import { untrack } from 'svelte';
  import { supabase } from '../../lib/supabase';
  import { books } from '../../lib/stores';
  import { people } from '../../lib/live.svelte';
  import { auth } from '../../lib/auth.svelte';
  import { go } from '../../lib/router.svelte';
  import { t, i18n } from '../../lib/i18n.svelte';
  import type { Book } from '../../lib/types';
  import MarkdownEditor from '../../components/MarkdownEditor.svelte';
  import TagInput from '../../components/TagInput.svelte';
  import TranslationBox from '../../components/TranslationBox.svelte';
  import { addTranslations } from '../../lib/translate';

  let { id = null }: { id?: string | null } = $props();
  const existing = untrack(() => (id ? books.get(id) : undefined));

  let title = $state(existing?.title ?? '');
  let content = $state(existing?.content ?? '');
  let locLabel = $state(existing?.loc_label ?? '');
  let locX = $state<number | null>(existing?.loc_x ?? null);
  let locY = $state<number | null>(existing?.loc_y ?? null);
  let tags = $state<string[]>([...(existing?.tags ?? [])]);
  let foundBy = $state<string | null>(existing?.found_by ?? auth.profile?.id ?? null);
  let saving = $state(false);
  const lang = untrack(() => existing?.lang ?? i18n.lang);
  let tr = $state<Record<string, string>>(untrack(() => ({ title: existing?.title_tr ?? '', content: existing?.content_tr ?? '', loc_label: existing?.loc_label_tr ?? '' })));
  let manual = $state<string[]>([]);
  let err = $state('');

  const allTags = $derived([...new Set(books.state.items.flatMap((b) => b.tags))].sort());
  const members = $derived(people.state.items.filter((p) => p.role !== 'pending'));

  async function save(e?: Event) {
    e?.preventDefault();
    err = '';
    if (!title.trim()) return (err = t('notes.err.title'));
    const hasX = locX !== null && (locX as unknown) !== '', hasY = locY !== null && (locY as unknown) !== '';
    if (hasX !== hasY) return (err = t('lib.err.coords'));
    saving = true;
    const row = {
      title: title.trim(), content, tags, found_by: foundBy, lang,
      loc_label: locLabel.trim() || null,
      loc_x: hasX ? Number(locX) : null,
      loc_y: hasY ? Number(locY) : null,
    };
    for (const f of manual) (row as Record<string, any>)[`${f}_tr`] = tr[f]?.trim() || null;
    await addTranslations(row as Record<string, any>, ['title', 'content', 'loc_label'], lang, existing ?? null, manual);
    const res = id
      ? await supabase.from('books').update(row).eq('id', id).select().single()
      : await supabase.from('books').insert(row).select().single();
    saving = false;
    if (res.error) return (err = t('common.error', { msg: res.error.message }));
    const saved = res.data as Book;
    const i = books.state.items.findIndex((b) => b.id === saved.id);
    if (i >= 0) books.state.items[i] = saved; else books.state.items.unshift(saved);
    go(`/library/${saved.id}`);
  }

  function keys(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  }
</script>

<svelte:window onkeydown={keys} />

<form class="card" onsubmit={save}>
  <h1>{id ? t('lib.edit') : t('lib.new')}</h1>

  <label for="title">{t('lib.bookTitle')}</label>
  <input id="title" bind:value={title} maxlength="200" />

  <div class="grid2">
    <div>
      <label for="found">{t('lib.foundByLabel')}</label>
      <select id="found" bind:value={foundBy}>
        <option value={null}>—</option>
        {#each members as p (p.id)}<option value={p.id}>{p.username}</option>{/each}
      </select>
    </div>
    <div>
      <label for="tags">{t('notes.tags')}</label>
      <TagInput id="tags" bind:tags suggestions={allTags} placeholder={t('notes.tagsPlaceholder')} />
    </div>
  </div>

  <fieldset>
    <legend>📍 {t('lib.location')}</legend>
    <label for="loclabel">{t('lib.locLabel')}</label>
    <input id="loclabel" bind:value={locLabel} placeholder={t('lib.locLabelPlaceholder')} />
    <div class="grid2">
      <div><label for="lx">X</label><input id="lx" type="number" step="1" bind:value={locX} /></div>
      <div><label for="ly">Y</label><input id="ly" type="number" step="1" bind:value={locY} /></div>
    </div>
    {#if id}
      <a class="btn small pickmap" href={`#/map?place=${id}${locX !== null ? `&x=${locX}&y=${locY}` : ''}`}>🗺️ {t('lib.pickOnMap')}</a>
    {:else}
      <p class="muted small">{t('lib.pickAfterSave')}</p>
    {/if}
  </fieldset>

  <label for="content">{t('lib.content')}</label>
  <MarkdownEditor id="content" bind:value={content} folder="books" rows={16} placeholder={t('lib.contentPlaceholder')} />

  <TranslationBox {lang} values={{ title, content, loc_label: locLabel }} bind:tr bind:manual
    fields={[{ key: 'title', label: t('lib.bookTitle') }, { key: 'loc_label', label: t('lib.locLabel') }, { key: 'content', label: t('lib.content'), multiline: true }]} />

  {#if err}<p class="error">{err}</p>{/if}
  <div class="row actions">
    <button class="primary" type="submit" disabled={saving}>{saving ? '⏳' : '💾'} {saving ? t('tr.saving') : t('common.save')}</button>
    <button type="button" class="ghost" onclick={() => go(id ? `/library/${id}` : '/library')}>{t('common.cancel')}</button>
  </div>
</form>

<style>
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  @media (max-width: 700px) { .grid2 { grid-template-columns: 1fr; } }
  fieldset { margin-top: 1rem; border: 1px solid rgba(212, 175, 85, 0.35); border-radius: 2px; padding: 0.3rem 1rem 0.8rem; }
  legend { color: var(--gold); font-family: var(--font-title); padding: 0 0.4rem; }
  .small { font-size: 0.85rem; margin: 0.5rem 0 0; }
  .actions { margin-top: 1rem; }
  .pickmap { margin-top: 0.7rem; }
</style>
