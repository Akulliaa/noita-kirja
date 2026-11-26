<script lang="ts">
  // Quest shown as a timeline of steps with their places on the map.
  import { untrack } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { notes } from '../lib/stores';
  import { isAdmin } from '../lib/auth.svelte';
  import { t } from '../lib/i18n.svelte';
  import { route } from '../lib/router.svelte';
  import { lt } from '../lib/loc';
  import { displayQuest, questPlaces, toggleStepIn } from '../lib/quest';
  import type { Note } from '../lib/types';
  import Markdown from './Markdown.svelte';
  import MapLink from './MapLink.svelte';
  import { sfx } from '../lib/sound.svelte';

  let { note, showOriginal = false }: { note: Note; showOriginal?: boolean } = $props();

  const quest = $derived(displayQuest(note.body, showOriginal ? note.body : lt(note, 'body')));
  const done = $derived(quest.steps.filter((s) => s.done).length);
  const pct = $derived(quest.steps.length ? Math.round((done / quest.steps.length) * 100) : 0);
  const current = $derived(quest.steps.findIndex((s) => !s.done));
  const located = $derived(questPlaces(quest).length);

  let closed = $state(new Set<number>());
  let busy = $state(-1);
  function toggle(i: number) {
    const c = new Set(closed);
    if (c.has(i)) c.delete(i); else c.add(i);
    closed = c;
  }
  const allClosed = $derived(quest.steps.length > 0 && closed.size === quest.steps.length);
  function toggleAll() { closed = allClosed ? new Set() : new Set(quest.steps.map((_, i) => i)); }

  function jump(i: number) {
    if (closed.has(i)) toggle(i);
    document.getElementById(`step-${i + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // #/notes/<id>?step=3 (from the map) → scroll to that step
  $effect(() => {
    const n = Number(route.query.get('step'));
    if (n >= 1 && n <= untrack(() => quest.steps.length)) setTimeout(() => jump(n - 1), 50);
  });

  async function setDone(i: number, value: boolean) {
    const body = toggleStepIn(note.body, i, value);
    if (body === null) return;
    busy = i;
    // The translation gets the same flag (it isn't re-translated: only the checkbox changed).
    const row: Record<string, any> = { body };
    const tr = toggleStepIn(note.body_tr, i, value);
    if (tr !== null) row.body_tr = tr;
    const { data, error } = await supabase.from('notes').update(row).eq('id', note.id).select().single();
    busy = -1;
    if (error) return alert(error.message);
    const k = notes.state.items.findIndex((n) => n.id === note.id);
    if (k >= 0) notes.state.items[k] = data as Note;
    if (value) sfx('chime');
  }
</script>

<div class="qhead">
  <div class="row">
    <div class="bar" title={`${pct}%`}><div class="fill" style={`width:${pct}%`}></div></div>
    <span class="muted small nowrap">{t('quest.progress', { done, total: quest.steps.length })}</span>
  </div>
  <div class="row nav">
    {#each quest.steps as s, i}
      <button class="dot" class:done={s.done} class:cur={i === current} title={s.title} onclick={() => jump(i)}>{s.done ? '✓' : i + 1}</button>
    {/each}
    <span class="spacer"></span>
    {#if located}<a class="btn small" href={`#/map?quest=${note.id}`}>🗺️ {t('quest.showRoute')}</a>{/if}
    {#if quest.steps.length > 1}
      <button class="small ghost" onclick={toggleAll}>{allClosed ? '▾ ' + t('quest.expandAll') : '▸ ' + t('quest.collapseAll')}</button>
    {/if}
  </div>
</div>

{#if quest.intro}<div class="intro"><Markdown source={quest.intro} /></div>{/if}

<ol class="timeline">
  {#each quest.steps as s, i}
    <li id={`step-${i + 1}`} class="step" class:done={s.done} class:cur={i === current}>
      <div class="rail"><span class="num">{s.done ? '✓' : i + 1}</span></div>
      <div class="content">
        <div class="shead">
          <button class="ghost stitle" onclick={() => toggle(i)} aria-expanded={!closed.has(i)}>
            <span class="caret">{closed.has(i) ? '▸' : '▾'}</span>
            <span class="kicker">{t('quest.step', { n: i + 1 })}</span>
            <span class="ttl">{s.title}</span>
          </button>
          {#if i === current}<span class="badge curb">{t('quest.current')}</span>{/if}
          {#if isAdmin()}
            <label class="check" title={t('quest.markDone')}>
              <input type="checkbox" checked={s.done} disabled={busy === i} onchange={(e) => setDone(i, e.currentTarget.checked)} /> {t('quest.done')}
            </label>
          {/if}
        </div>
        {#if s.locs.length}
          <div class="row locs">
            {#each s.locs as l}<MapLink x={l.x} y={l.y} label={l.label} />{/each}
          </div>
        {/if}
        {#if !closed.has(i) && s.body}
          <div class="body"><Markdown source={s.body} /></div>
        {/if}
      </div>
    </li>
  {/each}
</ol>

<style>
  .small { font-size: 0.85rem; }
  .nowrap { white-space: nowrap; }
  .qhead {
    position: sticky; top: 0; z-index: 5; display: grid; gap: 0.5rem; padding: 0.6rem 0 0.7rem; margin-bottom: 0.4rem;
    background: var(--stone-1); border-bottom: 1px solid rgba(212, 175, 85, 0.25);
  }
  .bar { flex: 1; height: 8px; border-radius: 4px; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(212, 175, 85, 0.35); overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(90deg, var(--gold), #9fd27a); transition: width 0.3s; }
  .nav { gap: 0.3rem; }
  .dot {
    width: 1.9rem; height: 1.9rem; padding: 0; justify-content: center; border-radius: 50%;
    font-weight: 700; font-size: 0.85rem; background: var(--q-panel, rgba(0, 0, 0, 0.3));
  }
  .dot.done { background: rgba(159, 210, 122, 0.25); border-color: #9fd27a; color: var(--q-done, #cdeab8); }
  .dot.cur { background: var(--gold); color: var(--ink); border-color: var(--gold-bright); }
  .intro { margin: 0.4rem 0 1rem; padding: 0.4rem 0.9rem; border-left: 3px solid var(--gold-dim); background: rgba(212, 175, 85, 0.05); }

  .timeline { list-style: none; margin: 0.6rem 0 0; padding: 0; }
  .step { display: grid; grid-template-columns: 2.6rem 1fr; gap: 0.8rem; scroll-margin-top: 7rem; }
  .rail { position: relative; display: flex; justify-content: center; }
  .rail::after {
    content: ''; position: absolute; top: 2.6rem; bottom: -0.2rem; left: 50%; width: 2px; transform: translateX(-50%);
    background: repeating-linear-gradient(to bottom, var(--gold-dim) 0 6px, transparent 6px 11px);
  }
  .step:last-child .rail::after { display: none; }
  .step.done .rail::after { background: rgba(159, 210, 122, 0.55); }
  .num {
    position: relative; z-index: 1; display: grid; place-items: center; width: 2.4rem; height: 2.4rem; border-radius: 50%;
    background: var(--stone-2); border: 2px solid var(--gold); color: var(--gold-bright); font-weight: 700; font-size: 1.05rem;
  }
  .step.cur .num { background: var(--gold); color: var(--ink); box-shadow: 0 0 0 4px rgba(240, 207, 122, 0.2); }
  .step.done .num { background: #9fd27a; border-color: #9fd27a; color: #1a1008; }
  .content { min-width: 0; padding-bottom: 1.4rem; }
  .shead { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; min-height: 2.4rem; }
  .stitle {
    flex: 1 1 auto; display: flex; align-items: baseline; gap: 0.5rem; text-align: left; padding: 0.2rem 0.3rem;
    border: none; background: none; color: var(--gold-bright); font-family: var(--font-body); font-size: 1.15rem; font-weight: 700; min-width: 0;
  }
  .stitle:hover { background: rgba(212, 175, 85, 0.08); }
  .ttl { overflow-wrap: anywhere; }
  .caret { color: var(--text-dim); font-size: 0.85rem; }
  .kicker { flex: none; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
  .step.done .ttl { color: var(--q-done, #cdeab8); }
  .curb { background: rgba(240, 207, 122, 0.2); color: var(--gold-bright); border-color: var(--gold); }
  .check { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: 0.88rem; white-space: nowrap; }
  .check input { width: auto; }
  .locs { gap: 0.4rem; margin: 0.2rem 0 0.3rem 0.3rem; }
  .body {
    margin: 0.4rem 0 0 0.3rem; padding: 0.3rem 0.9rem; border: 1px solid rgba(212, 175, 85, 0.2);
    border-radius: 2px; background: var(--q-panel, rgba(0, 0, 0, 0.15));
  }
  @media (max-width: 600px) {
    .step { grid-template-columns: 2rem 1fr; gap: 0.5rem; }
    .num { width: 2rem; height: 2rem; font-size: 0.9rem; }
    .rail::after { top: 2.2rem; }
  }
</style>
