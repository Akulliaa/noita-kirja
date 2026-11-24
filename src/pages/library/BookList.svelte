<script lang="ts">
  import { books } from '../../lib/stores';
  import { personName } from '../../lib/live.svelte';
  import { isAdmin } from '../../lib/auth.svelte';
  import { go } from '../../lib/router.svelte';
  import { t, i18n } from '../../lib/i18n.svelte';
  import { excerpt } from '../../lib/markdown';
  import MapLink from '../../components/MapLink.svelte';
  import { lt } from '../../lib/loc';

  let search = $state('');
  let tag = $state('');
  let located = $state<'all' | 'yes' | 'no'>('all');

  const allTags = $derived([...new Set(books.state.items.flatMap((b) => b.tags))].sort());
  const list = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return books.state.items.filter((b) =>
      (!tag || b.tags.includes(tag)) &&
      (located === 'all' || (located === 'yes') === (b.loc_x !== null)) &&
      (!q || [b.title, b.content, b.loc_label ?? '', b.title_tr ?? '', b.content_tr ?? '', b.loc_label_tr ?? '', b.tags.join(' ')].join(' ').toLowerCase().includes(q)));
  });
  const fmt = (s: string) => new Date(s).toLocaleDateString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
</script>

<div class="row head">
  <h1>📚 {t('nav.library')}</h1>
  <span class="spacer"></span>
  {#if isAdmin()}<a class="btn primary-link" href="#/library/new">＋ {t('lib.new')}</a>{/if}
</div>

<div class="filters">
  <input bind:value={search} placeholder={'🔍 ' + t('lib.search')} />
  <select bind:value={located}>
    <option value="all">{t('lib.anyLocation')}</option>
    <option value="yes">📍 {t('lib.located')}</option>
    <option value="no">❔ {t('lib.notLocated')}</option>
  </select>
  <select bind:value={tag}>
    <option value="">{t('notes.anyTag')}</option>
    {#each allTags as tg}<option value={tg}>#{tg}</option>{/each}
  </select>
</div>

{#if books.state.error}<p class="error">{books.state.error}</p>{/if}
{#if !books.state.loaded}
  <p class="muted">{t('common.loading')}</p>
{:else if list.length === 0}
  <div class="card empty muted">{books.state.items.length ? t('notes.noMatch') : t('lib.empty')}</div>
{:else}
  <div class="shelf">
    {#each list as b (b.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="book" onclick={() => go(`/library/${b.id}`)}>
        <div class="spine"></div>
        <div class="body">
          <h3>{lt(b, 'title')}</h3>
          <p class="ex">{excerpt(lt(b, 'content'), 150) || '…'}</p>
          <div class="row foot">
            <MapLink x={b.loc_x} y={b.loc_y} label={lt(b, 'loc_label')} book={b.id} />
            {#each b.tags as tg}<span class="tag">#{tg}</span>{/each}
          </div>
          <p class="who">{t('lib.foundBy', { name: personName(b.found_by) })} · {fmt(b.created_at)}</p>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .head h1 { margin: 0; }
  .primary-link { background: linear-gradient(180deg, var(--gold-bright), var(--gold)); color: var(--ink); }
  .filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 0.6rem; margin: 1rem 0; }
  @media (max-width: 700px) { .filters { grid-template-columns: 1fr; } }
  .shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
  .book {
    display: flex; cursor: pointer; border-radius: 4px 10px 10px 4px; overflow: hidden;
    background: var(--parchment); color: var(--ink); box-shadow: var(--shadow);
    transition: transform 0.12s;
  }
  .book:hover { transform: translateY(-3px) rotate(-0.3deg); }
  .spine { width: 14px; background: linear-gradient(90deg, #5a2e1a, #8a4a2a 60%, #5a2e1a); border-right: 2px solid var(--gold-dim); }
  .body { padding: 0.9rem 1rem; flex: 1; display: flex; flex-direction: column; gap: 0.4rem; }
  .body h3 { margin: 0; color: var(--ink); }
  .ex { margin: 0; color: var(--ink-soft); font-size: 0.93rem; flex: 1; font-style: italic; }
  .foot { gap: 0.35rem; }
  .tag { font-size: 0.8rem; color: #2f5a7a; }
  .who { margin: 0; font-size: 0.8rem; color: var(--ink-soft); }
  .book :global(.maplink) { background: #2f5a7a; color: #fff; border-color: #2f5a7a; }
  .empty { text-align: center; padding: 2.5rem; }
</style>
