<script lang="ts">
  import { route } from '../lib/router.svelte';
  import { alchemy, elementName } from '../lib/alchemy.svelte';
  import { notes, books, glyphs } from '../lib/stores';
  import { t } from '../lib/i18n.svelte';
  import { excerpt } from '../lib/markdown';
  import { KIND_ICON } from '../lib/noteMeta';
  import MixtureFormula from '../components/MixtureFormula.svelte';
  import { lt } from '../lib/loc';

  notes.start(); books.start(); glyphs.start();

  let q = $state(route.query.get('q') ?? '');
  $effect(() => { q = route.query.get('q') ?? ''; });

  const needle = $derived(q.trim().toLowerCase());
  const has = (...parts: (string | null | undefined)[]) => parts.join(' ').toLowerCase().includes(needle);

  const res = $derived(needle.length < 2 ? null : {
    elements: alchemy.elements.filter((e) => has(e.name, e.name_tr)),
    mixtures: alchemy.mixtures.filter((m) => has(...m.ingredients.map(elementName), m.no_reaction ? '' : elementName(m.result_id), m.note, m.note_tr)),
    notes: notes.state.items.filter((n) => has(n.title, n.body, n.title_tr, n.body_tr, n.tags.join(' '))),
    books: books.state.items.filter((b) => has(b.title, b.content, b.loc_label, b.title_tr, b.content_tr, b.loc_label_tr, b.tags.join(' '))),
    glyphs: glyphs.state.items.filter((g) => has(g.meaning, g.symbol, g.notes, g.meaning_tr, g.notes_tr)),
  });
  const total = $derived(res ? Object.values(res).reduce((n, l) => n + l.length, 0) : 0);

  function snippet(text: string) {
    const plain = excerpt(text, 100000);
    const i = plain.toLowerCase().indexOf(needle);
    if (i < 0) return excerpt(text, 140);
    const s = Math.max(0, i - 60);
    return (s > 0 ? '…' : '') + plain.slice(s, i + needle.length + 80) + '…';
  }
</script>

<h1>🔍 {t('search.title')}</h1>
<input class="big" bind:value={q} placeholder={t('search.placeholder')} />

{#if res}
  <p class="muted">{t('search.count', { n: total })}</p>

  {#if res.elements.length}
    <section class="card"><h2>💧 {t('nav.elements')}</h2>
      <div class="row">{#each res.elements as e (e.id)}<a class="chip" href={`#/elements/${e.id}`}>{lt(e, 'name')}</a>{/each}</div>
    </section>
  {/if}
  {#if res.mixtures.length}
    <section class="card"><h2>⚗️ {t('nav.mixtures')}</h2>
      <ul>{#each res.mixtures.slice(0, 50) as m (m.id)}<li><MixtureFormula mix={m} />{#if m.note}<span class="muted"> — {lt(m, 'note')}</span>{/if}</li>{/each}</ul>
    </section>
  {/if}
  {#if res.notes.length}
    <section class="card"><h2>📜 {t('nav.notes')}</h2>
      <ul>{#each res.notes as n (n.id)}<li><a href={`#/notes/${n.id}`}>{KIND_ICON[n.kind]} <strong>{lt(n, 'title')}</strong></a><p class="muted snip">{snippet(lt(n, 'body'))}</p></li>{/each}</ul>
    </section>
  {/if}
  {#if res.books.length}
    <section class="card"><h2>📚 {t('nav.library')}</h2>
      <ul>{#each res.books as b (b.id)}<li><a href={`#/library/${b.id}`}><strong>{lt(b, 'title')}</strong></a><p class="muted snip">{snippet(lt(b, 'content'))}</p></li>{/each}</ul>
    </section>
  {/if}
  {#if res.glyphs.length}
    <section class="card"><h2>🔣 {t('nav.rosetta')}</h2>
      <div class="row">{#each res.glyphs as g (g.id)}<a class="chip" href="#/rosetta">{g.symbol ?? '🖼'} = {lt(g, 'meaning') || '?'}</a>{/each}</div>
    </section>
  {/if}
{:else}
  <p class="muted">{t('search.hint')}</p>
{/if}

<style>
  .big { font-size: 1.15rem; padding: 0.75rem 1rem; margin-bottom: 1rem; }
  section { margin-bottom: 1rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
  .snip { margin: 0.2rem 0 0; font-size: 0.92rem; }
  .chip { padding: 0.15rem 0.6rem; border-radius: 2px; border: 1px solid var(--gold-dim); text-decoration: none; color: var(--text); }
  .chip:hover { border-color: var(--gold); color: var(--gold-bright); }
</style>
