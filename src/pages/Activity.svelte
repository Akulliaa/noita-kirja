<script lang="ts">
  import { alchemy, elementName, elName } from '../lib/alchemy.svelte';
  import { notes, books, glyphs, pins } from '../lib/stores';
  import { people, personName, personColor } from '../lib/live.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import { lt } from '../lib/loc';
  import { KIND_ICON } from '../lib/noteMeta';

  notes.start(); books.start(); glyphs.start(); pins.start();

  type Kind = 'element' | 'mixture' | 'note' | 'book' | 'glyph' | 'pin';
  interface Ev { at: string; who: string | null; kind: Kind; icon: string; verb: Key; label: string; href: string }

  let kind = $state<Kind | 'all'>('all');
  let who = $state<string>('');
  let limit = $state(100);

  const events = $derived.by(() => {
    const out: Ev[] = [];
    for (const e of alchemy.elements)
      out.push({ at: e.created_at, who: e.created_by, kind: 'element', icon: '💧', verb: 'act.addedElement', label: elName(e), href: `#/elements/${e.id}` });
    for (const m of alchemy.mixtures) {
      const label = m.ingredients.map(elementName).join(' + ') + ' → ' + (m.no_reaction ? '✗' : elementName(m.result_id));
      out.push({ at: m.created_at, who: m.created_by, kind: 'mixture', icon: '⚗️', verb: 'act.addedMixture', label, href: '#/mixtures' });
    }
    for (const n of notes.state.items) {
      out.push({ at: n.created_at, who: n.created_by, kind: 'note', icon: KIND_ICON[n.kind], verb: 'act.addedNote', label: lt(n, 'title'), href: `#/notes/${n.id}` });
      if (new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 120_000)
        out.push({ at: n.updated_at, who: n.updated_by, kind: 'note', icon: '✏️', verb: 'act.editedNote', label: lt(n, 'title'), href: `#/notes/${n.id}` });
    }
    for (const b of books.state.items)
      out.push({ at: b.created_at, who: b.found_by ?? b.created_by, kind: 'book', icon: '📚', verb: 'act.foundBook', label: lt(b, 'title'), href: `#/library/${b.id}` });
    for (const g of glyphs.state.items)
      out.push({ at: g.created_at, who: g.created_by, kind: 'glyph', icon: '🔣', verb: 'act.addedGlyph', label: lt(g, 'meaning') || g.symbol || '?', href: '#/rosetta' });
    for (const p of pins.state.items)
      out.push({ at: p.created_at, who: p.created_by, kind: 'pin', icon: p.icon, verb: 'act.addedPin', label: lt(p, 'title'), href: `#/map?x=${Math.round(p.x)}&y=${Math.round(p.y)}` });
    return out
      .filter((e) => (kind === 'all' || e.kind === kind) && (!who || e.who === who))
      .sort((a, b) => b.at.localeCompare(a.at));
  });

  const shown = $derived(events.slice(0, limit));
  const loc = $derived(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
  const day = (s: string) => new Date(s).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (s: string) => new Date(s).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  const KINDS: { k: Kind; icon: string; key: Key }[] = [
    { k: 'element', icon: '💧', key: 'nav.elements' }, { k: 'mixture', icon: '⚗️', key: 'nav.mixtures' },
    { k: 'note', icon: '📜', key: 'nav.notes' }, { k: 'book', icon: '📚', key: 'nav.library' },
    { k: 'glyph', icon: '🔣', key: 'nav.rosetta' }, { k: 'pin', icon: '📍', key: 'map.pins' },
  ];
</script>

<h1>📰 {t('nav.activity')}</h1>

<div class="row filters">
  <select bind:value={kind}>
    <option value="all">{t('act.everything')}</option>
    {#each KINDS as k}<option value={k.k}>{k.icon} {t(k.key)}</option>{/each}
  </select>
  <select bind:value={who}>
    <option value="">{t('act.everyone')}</option>
    {#each people.state.items.filter((p) => p.role !== 'pending') as p (p.id)}<option value={p.id}>{p.username}</option>{/each}
  </select>
</div>

{#if shown.length === 0}
  <div class="card muted empty">{t('act.empty')}</div>
{:else}
  <div class="card feed">
    {#each shown as e, i (e.kind + e.href + e.at + i)}
      {#if i === 0 || day(shown[i - 1].at) !== day(e.at)}<h3 class="day">{day(e.at)}</h3>{/if}
      <a class="ev" href={e.href}>
        <span class="time muted">{time(e.at)}</span>
        <span class="who" style:color={personColor(e.who)}>{personName(e.who)}</span>
        <span class="verb muted">{t(e.verb)}</span>
        <span class="icon">{e.icon}</span>
        <span class="label">{e.label}</span>
      </a>
    {/each}
    {#if events.length > limit}
      <button class="more" onclick={() => (limit += 100)}>{t('act.more', { n: events.length - limit })}</button>
    {/if}
  </div>
{/if}

<style>
  .filters { margin-bottom: 1rem; }
  .filters select { width: auto; }
  .feed { display: grid; gap: 0.15rem; }
  .day { margin: 1rem 0 0.4rem; color: var(--gold); text-transform: capitalize; font-size: 1rem; }
  .day:first-child { margin-top: 0; }
  .ev {
    display: grid; grid-template-columns: 3.2rem auto auto 1.6rem 1fr; gap: 0.5rem; align-items: baseline;
    padding: 0.35rem 0.4rem; border-radius: 6px; text-decoration: none; color: var(--text);
  }
  .ev:hover { background: rgba(212, 175, 85, 0.08); }
  .time { font-variant-numeric: tabular-nums; font-size: 0.85rem; }
  .who { font-weight: 700; }
  .label { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .more { margin-top: 0.8rem; justify-self: center; }
  .empty { text-align: center; padding: 2.5rem; }
  @media (max-width: 600px) { .ev { grid-template-columns: 3rem auto 1.4rem 1fr; } .verb { display: none; } }
</style>
