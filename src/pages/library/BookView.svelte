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
  import { onMount } from 'svelte';
  import { sfx } from '../../lib/sound.svelte';
  let showOriginal = $state(false);
  const f = (field: string) => (book ? (showOriginal ? (book as any)[field] ?? '' : lt(book, field)) : '');

  let { id }: { id: string } = $props();
  const book = $derived(books.get(id));

  // Two-page spread: text on the left page, screenshots as illustrations on the right.
  const IMG = /!\[[^\]]*\]\([^)]*\)/g;
  const content = $derived(f('content'));
  const pictures = $derived(content.match(IMG) ?? []);
  const text = $derived(content.replace(IMG, '').replace(/\n{3,}/g, '\n\n').trim());

  onMount(() => sfx('page'));

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
  <div class="book" class:spread={pictures.length > 0}>
  <article class="parchment page left">
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
      {#if text}<Markdown source={text} />{:else if !pictures.length}<p>{t('md.empty')}</p>{/if}
    </div>
  </article>
  {#if pictures.length}
    <aside class="parchment page right">
      <div class="illus"><Markdown source={pictures.join('\n\n')} /></div>
    </aside>
  {/if}
  </div>
{/if}

<style>
  .back { display: inline-block; margin-bottom: 0.8rem; text-decoration: none; }
  .page { max-width: 900px; margin: 0 auto; padding: 2rem 2.4rem; }
  .book { perspective: 2200px; }
  .book.spread { display: grid; grid-template-columns: 1fr 1fr; max-width: 1280px; margin: 0 auto; }
  .book.spread .page { max-width: none; margin: 0; }
  /* the fold in the middle */
  .book.spread .left { box-shadow: var(--shadow), inset -28px 0 30px -18px rgba(70, 40, 10, 0.55), inset 0 0 50px rgba(110, 70, 20, 0.3); }
  .book.spread .right {
    box-shadow: var(--shadow), inset 28px 0 30px -18px rgba(70, 40, 10, 0.55), inset 0 0 50px rgba(110, 70, 20, 0.3);
    transform-origin: left center;
    animation: turn 0.75s cubic-bezier(0.3, 0.6, 0.3, 1) both;
  }
  @keyframes turn {
    from { transform: rotateY(-110deg); filter: brightness(0.7); }
    to { transform: none; filter: none; }
  }
  .illus { display: grid; gap: 1rem; align-content: start; }
  .illus :global(img) {
    display: block; margin: 0 auto; max-height: 70vh; width: auto;
    border: 3px solid #5a4128; box-shadow: 0 3px 8px rgba(60, 35, 10, 0.45); transform: rotate(-0.6deg);
  }
  .illus :global(p:nth-child(even) img) { transform: rotate(0.8deg); }
  @media (max-width: 900px) {
    .book.spread { grid-template-columns: 1fr; gap: 1rem; }
    .book.spread .right { animation: none; }
  }
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
