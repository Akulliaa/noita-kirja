<script lang="ts">
  import { untrack } from 'svelte';
  import { supabase } from '../../lib/supabase';
  import { notes } from '../../lib/stores';
  import { go } from '../../lib/router.svelte';
  import { t, i18n, type Key } from '../../lib/i18n.svelte';
  import { KINDS, KIND_ICON, STATUSES, STATUS_ICON } from '../../lib/noteMeta';
  import type { Note, NoteKind, NoteStatus } from '../../lib/types';
  import MarkdownEditor from '../../components/MarkdownEditor.svelte';
  import TagInput from '../../components/TagInput.svelte';
  import TranslationBox from '../../components/TranslationBox.svelte';
  import { addTranslations } from '../../lib/translate';

  let { id = null }: { id?: string | null } = $props();

  const existing = untrack(() => (id ? notes.get(id) : undefined));
  let title = $state(existing?.title ?? '');
  let kind = $state<NoteKind>(existing?.kind ?? 'quest');
  let status = $state<NoteStatus>(existing?.status ?? 'idea');
  let tags = $state<string[]>([...(existing?.tags ?? [])]);
  let body = $state(existing?.body ?? '');
  let saving = $state(false);
  const lang = untrack(() => existing?.lang ?? i18n.lang);
  let tr = $state<Record<string, string>>(untrack(() => ({ title: existing?.title_tr ?? '', body: existing?.body_tr ?? '' })));
  let manual = $state<string[]>([]);
  let err = $state('');

  const initial = untrack(() => JSON.stringify({ title, kind, status, tags, body }));
  const dirty = $derived(JSON.stringify({ title, kind, status, tags, body }) !== initial);
  const allTags = $derived([...new Set(notes.state.items.flatMap((n) => n.tags))].sort());

  $effect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty && !saving) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  async function save(e?: Event) {
    e?.preventDefault();
    err = '';
    if (!title.trim()) return (err = t('notes.err.title'));
    saving = true;
    const row: Record<string, any> = { title: title.trim(), kind, status, tags, body, lang };
    for (const f of manual) row[`${f}_tr`] = tr[f]?.trim() || null;
    await addTranslations(row, ['title', 'body'], lang, existing ?? null, manual);
    const res = id
      ? await supabase.from('notes').update(row).eq('id', id).select().single()
      : await supabase.from('notes').insert(row).select().single();
    saving = false;
    if (res.error) return (err = t('common.error', { msg: res.error.message }));
    const saved = res.data as Note;
    const i = notes.state.items.findIndex((n) => n.id === saved.id);
    if (i >= 0) notes.state.items[i] = saved; else notes.state.items.unshift(saved);
    go(`/notes/${saved.id}`);
  }

  function cancel() {
    if (dirty && !confirm(t('common.discard'))) return;
    go(id ? `/notes/${id}` : '/notes');
  }

  function keys(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  }
</script>

<svelte:window onkeydown={keys} />

<form class="card" onsubmit={save}>
  <h1>{id ? t('notes.edit') : t('notes.new')}</h1>

  <label for="title">{t('notes.title')}</label>
  <input id="title" bind:value={title} maxlength="200" />

  <div class="grid3">
    <div>
      <label for="kind">{t('notes.kind')}</label>
      <select id="kind" bind:value={kind}>
        {#each KINDS as k}<option value={k}>{KIND_ICON[k]} {t(`kind.${k}` as Key)}</option>{/each}
      </select>
    </div>
    <div>
      <label for="status">{t('notes.status')}</label>
      <select id="status" bind:value={status}>
        {#each STATUSES as s}<option value={s}>{STATUS_ICON[s]} {t(`status.${s}` as Key)}</option>{/each}
      </select>
    </div>
    <div>
      <label for="tags">{t('notes.tags')}</label>
      <TagInput id="tags" bind:tags suggestions={allTags} placeholder={t('notes.tagsPlaceholder')} />
    </div>
  </div>

  <label for="body">{t('notes.body')}</label>
  <MarkdownEditor id="body" bind:value={body} folder="notes" rows={18} />

  <TranslationBox {lang} values={{ title, body }} bind:tr bind:manual
    fields={[{ key: 'title', label: t('notes.title') }, { key: 'body', label: t('notes.body'), multiline: true }]} />

  {#if err}<p class="error">{err}</p>{/if}
  <div class="row actions">
    <button class="primary" type="submit" disabled={saving}>{saving ? '⏳' : '💾'} {saving ? t('tr.saving') : t('common.save')}</button>
    <button type="button" class="ghost" onclick={cancel}>{t('common.cancel')}</button>
    <span class="muted small">Ctrl+S</span>
  </div>
</form>

<style>
  h1 { margin-bottom: 0.2rem; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 0.8rem; }
  @media (max-width: 800px) { .grid3 { grid-template-columns: 1fr; } }
  .actions { margin-top: 1rem; }
  .small { font-size: 0.85rem; }
</style>
