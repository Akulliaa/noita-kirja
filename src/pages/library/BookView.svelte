<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { books } from '../../lib/stores';
  import { personName } from '../../lib/live.svelte';
  import { isAdmin } from '../../lib/auth.svelte';
  import { go } from '../../lib/router.svelte';
  import { t, i18n } from '../../lib/i18n.svelte';
  import Markdown from '../../components/Markdown.svelte';
  import MapLink from '../../components/MapLink.svelte';
  import { lt, untranslated } from '../../lib/loc';
  let showOriginal = $state(false);
  const f = (field: string) => (book ? (showOriginal ? (book as any)[field] ?? '' : lt(book, field)) : '');

  let { id }: { id: string } = $props();
  const book = $derived(books.get(id));

  async function remove() {
    if (!book || !confirm(t('notes.deleteConfirm', { title: book.title }))) return;
    const { error } = await supabase.from('books').delete().eq('id', id);
    if (error) return alert(error.message);
    go('/library');
  }
  const fmt = (s: string) => new Date(s).toLocaleDateString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
</script>

<a class="back" href="#/library">← {t('nav.library')}</a>

{#if !books.state.loaded}
  <p class="muted">{t('common.loading')}</p>
{:else if !book}
  <div class="card muted">{t('notes.notFound')}</div>
{:else}
  <article class="parchment page">
    <h1>{f('title')}</h1>
    <div class="row meta">
      <MapLink x={book.loc_x} y={book.loc_y} label={f('loc_label')} book={book.id} />
      {#each book.tags as tg}<span class="tag">#{tg}</span>{/each}
      <span class="spacer"></span>
      <span class="who">{t('lib.foundBy', { name: personName(book.found_by) })} · {fmt(book.created_at)}</span>
    </div>
    {#if isAdmin()}
      <div class="row actions">
        <a class="btn small" href={`#/library/${book.id}/edit`}>✏️ {t('alc.edit')}</a>
        <button class="small danger" onclick={remove}>🗑 {t('admin.delete')}</button>
      </div>
    {/if}
    <div class="sep"></div>
    <div class="text">
      {#if book.lang !== i18n.lang}
        <p class="trline">
          {#if untranslated(book, 'content')}⏳ {t('tr.pending')}{:else}🌐 {t('tr.auto', { lang: book.lang.toUpperCase() })}{/if}
          <button class="small" onclick={() => (showOriginal = !showOriginal)}>{showOriginal ? t('tr.showTranslation') : t('tr.showOriginal')}</button>
        </p>
      {/if}
      {#if book.content.trim()}<Markdown source={f('content')} />{:else}<p>{t('md.empty')}</p>{/if}
    </div>
  </article>
{/if}

<style>
  .back { display: inline-block; margin-bottom: 0.8rem; text-decoration: none; }
  .page { max-width: 900px; margin: 0 auto; padding: 2rem 2.4rem; }
  .page h1 { color: var(--ink); text-align: center; }
  .meta { gap: 0.45rem; }
  .tag { font-size: 0.85rem; color: #2f5a7a; }
  .who { font-size: 0.85rem; color: var(--ink-soft); }
  .actions { margin-top: 0.6rem; }
  .small { font-size: 0.85rem; }
  .trline { font-size: 0.85rem; color: var(--ink-soft); }
  .sep { height: 2px; margin: 1.2rem 0; background: linear-gradient(90deg, transparent, var(--parchment-3), transparent); }
  .text { font-size: 1.08rem; }
  .text :global(.md) { color: var(--ink); }
  .page :global(.maplink) { background: #2f5a7a; color: #fff; border-color: #2f5a7a; }
</style>
