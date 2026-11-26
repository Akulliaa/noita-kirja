<script lang="ts">
  // Step-by-step editor for quests. Reads and writes the markdown body (see lib/quest.ts).
  import { untrack } from 'svelte';
  import { parseQuest, serializeQuest, guessSteps, type Quest, type QuestStep } from '../lib/quest';
  import { t } from '../lib/i18n.svelte';
  import MarkdownEditor from './MarkdownEditor.svelte';
  import MapPicker from './MapPicker.svelte';

  let { body = $bindable('') }: { body: string } = $props();

  const original = untrack(() => body);
  const parsed = parseQuest(original);
  const initial = serializeQuest(parsed);
  let quest = $state<Quest>(parsed);
  let showIntro = $state(!!parsed.intro || parsed.steps.length === 0);
  let closed = $state(new Set<QuestStep>());
  let picking = $state<{ step: QuestStep; loc: number } | null>(null);

  // Keep the note body in sync (only once something actually changed, so opening the editor isn't an edit).
  $effect(() => {
    const s = serializeQuest(quest);
    body = s === initial ? original : s;
  });

  const guess = $derived(quest.steps.length === 0 ? guessSteps(quest.intro) : null);
  const doneCount = $derived(quest.steps.filter((s) => s.done).length);

  function newStep(): QuestStep { return { title: '', done: false, locs: [{ label: '', x: null, y: null }], body: '' }; }
  function addStep(at = quest.steps.length) {
    quest.steps.splice(at, 0, newStep());
    queueMicrotask(() => document.getElementById(`step-title-${at}`)?.focus());
  }
  function removeStep(i: number) {
    const s = quest.steps[i];
    if ((s.title.trim() || s.body.trim()) && !confirm(t('quest.deleteStep', { n: i + 1 }))) return;
    quest.steps.splice(i, 1);
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= quest.steps.length) return;
    const [s] = quest.steps.splice(i, 1);
    quest.steps.splice(j, 0, s);
  }
  function toggle(s: QuestStep) {
    const c = new Set(closed);
    if (c.has(s)) c.delete(s); else c.add(s);
    closed = c;
  }
  const allClosed = $derived(quest.steps.length > 0 && quest.steps.every((s) => closed.has(s)));
  function toggleAll() { closed = allClosed ? new Set() : new Set(quest.steps); }

  function applyGuess() {
    const g = guess; // derived: becomes null as soon as steps exist
    if (!g) return;
    quest.intro = g.intro;
    quest.steps = g.steps;
    showIntro = !!g.intro;
  }

  function setCoord(s: QuestStep, j: number, k: 'x' | 'y', v: string) {
    const n = v.trim() === '' ? null : Number(v);
    s.locs[j][k] = n !== null && isFinite(n) ? Math.round(n) : null;
  }

  const others = $derived.by(() => {
    if (!picking) return [];
    const p = picking;
    return quest.steps.flatMap((s, i) => s.locs
      .filter((l, j) => l.x !== null && l.y !== null && !(s === p.step && j === p.loc))
      .map((l) => ({ x: l.x!, y: l.y!, label: `${i + 1}. ${l.label || s.title}` })));
  });
</script>

<div class="quest">
  <div class="row qbar">
    <strong>🎯 {t('quest.steps')}</strong>
    {#if quest.steps.length}<span class="muted small">{t('quest.progress', { done: doneCount, total: quest.steps.length })}</span>{/if}
    <span class="spacer"></span>
    {#if !showIntro}<button type="button" class="small ghost" onclick={() => (showIntro = true)}>＋ {t('quest.intro')}</button>{/if}
    {#if quest.steps.length > 1}<button type="button" class="small ghost" onclick={toggleAll}>{allClosed ? '▾ ' + t('quest.expandAll') : '▸ ' + t('quest.collapseAll')}</button>{/if}
  </div>

  {#if showIntro}
    <div class="intro">
      <span class="lbl">{t('quest.intro')} <span class="muted small">— {t('quest.introHint')}</span></span>
      <MarkdownEditor bind:value={quest.intro} folder="notes" rows={4} compact />
    </div>
  {/if}

  {#if guess}
    <div class="guess">
      💡 {t('quest.guess', { n: guess.steps.length })}
      <button type="button" class="small primary" onclick={applyGuess}>✂ {t('quest.split')}</button>
    </div>
  {/if}

  <ol class="steps">
    {#each quest.steps as s, i (s)}
      <li class="step" class:done={s.done}>
        <div class="shead">
          <button type="button" class="num" title={closed.has(s) ? t('quest.expand') : t('quest.collapse')} onclick={() => toggle(s)}>
            {s.done ? '✓' : i + 1}
          </button>
          <input id={`step-title-${i}`} class="stitle" bind:value={s.title} placeholder={t('quest.stepTitle', { n: i + 1 })} maxlength="300" />
          <label class="check" title={t('quest.markDone')}><input type="checkbox" bind:checked={s.done} /> {t('quest.done')}</label>
          <div class="tools">
            <button type="button" class="small ghost" title="↑" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
            <button type="button" class="small ghost" title="↓" disabled={i === quest.steps.length - 1} onclick={() => move(i, 1)}>↓</button>
            <button type="button" class="small ghost" title={t('quest.insertAfter')} onclick={() => addStep(i + 1)}>＋</button>
            <button type="button" class="small ghost danger" title={t('admin.delete')} onclick={() => removeStep(i)}>🗑</button>
          </div>
        </div>

        {#if closed.has(s)}
          <p class="muted small summary">
            {#each s.locs.filter((l) => l.label || l.x !== null) as l}<span class="chip">📍 {l.label || `${l.x}, ${l.y}`}</span>{/each}
            {#if s.body.trim()}<span>· {t('quest.hasDetails')}</span>{/if}
          </p>
        {:else}
          <div class="locs">
            {#each s.locs as l, j}
              <div class="loc">
                <span class="pin">📍</span>
                <input class="llabel" bind:value={l.label} placeholder={t('quest.placeLabel')} />
                <input class="xy" type="number" step="1" placeholder="X" value={l.x ?? ''} oninput={(e) => setCoord(s, j, 'x', e.currentTarget.value)} />
                <input class="xy" type="number" step="1" placeholder="Y" value={l.y ?? ''} oninput={(e) => setCoord(s, j, 'y', e.currentTarget.value)} />
                <button type="button" class="small" class:set={l.x !== null} onclick={() => (picking = { step: s, loc: j })}>🗺️ {l.x !== null ? t('map.move') : t('lib.pickOnMap')}</button>
                <button type="button" class="small ghost" title={t('admin.delete')} onclick={() => s.locs.splice(j, 1)}>✕</button>
              </div>
            {/each}
            <button type="button" class="small ghost addloc" onclick={() => s.locs.push({ label: '', x: null, y: null })}>＋ 📍 {t('quest.addPlace')}</button>
          </div>
          <MarkdownEditor bind:value={s.body} folder="notes" rows={5} compact placeholder={t('quest.details')} />
        {/if}
      </li>
    {/each}
  </ol>

  <button type="button" class="addstep" onclick={() => addStep()}>＋ {t('quest.addStep', { n: quest.steps.length + 1 })}</button>
</div>

{#if picking}
  {@const p = picking}
  {@const l = p.step.locs[p.loc]}
  <MapPicker x={l?.x ?? null} y={l?.y ?? null} {others}
    title={`${quest.steps.indexOf(p.step) + 1}. ${p.step.title || ''}`}
    onclose={() => (picking = null)}
    onpick={(x, y) => { if (l) { l.x = x; l.y = y; } picking = null; }} />
{/if}

<style>
  .quest { display: grid; gap: 0.7rem; }
  .qbar { gap: 0.6rem; }
  .small { font-size: 0.85rem; }
  .lbl { display: block; margin-bottom: 0.3rem; color: var(--text-dim); }
  .guess {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; padding: 0.6rem 0.8rem;
    border: 1px dashed var(--gold); background: rgba(212, 175, 85, 0.08); border-radius: 2px;
  }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.7rem; counter-reset: none; }
  .step {
    position: relative; padding: 0.6rem 0.7rem 0.7rem; border: 1px solid rgba(212, 175, 85, 0.35);
    border-left: 4px solid var(--gold); border-radius: 2px; background: rgba(0, 0, 0, 0.18); display: grid; gap: 0.5rem;
  }
  .step.done { border-left-color: #9fd27a; }
  .shead { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .num {
    flex: none; width: 2rem; height: 2rem; padding: 0; justify-content: center; border-radius: 50%;
    background: var(--gold); color: var(--ink); font-weight: 700; border: 2px solid #1a1008;
  }
  .step.done .num { background: #9fd27a; }
  .stitle { flex: 1 1 16rem; font-weight: 600; font-size: 1.02rem; }
  .check { display: flex; align-items: center; gap: 0.3rem; white-space: nowrap; margin: 0; font-size: 0.9rem; }
  .check input { width: auto; }
  .tools { display: flex; gap: 0.15rem; }
  .tools button { padding: 0.15rem 0.45rem; }
  .locs { display: grid; gap: 0.35rem; }
  .loc { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
  .pin { flex: none; }
  .llabel { flex: 1 1 12rem; }
  .xy { width: 6.5rem; flex: none; }
  .set { border-color: rgba(120, 170, 210, 0.7); }
  .addloc { justify-self: start; }
  .summary { margin: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .chip { padding: 0 0.4rem; border: 1px solid rgba(120, 170, 210, 0.45); border-radius: 2px; }
  .addstep { justify-self: start; border-style: dashed; }
  .danger:hover { color: #e57b67; }
</style>
