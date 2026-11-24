<script lang="ts">
  import { elementName } from '../lib/alchemy.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { Mixture } from '../lib/types';

  let { mix, highlight = null }: { mix: Pick<Mixture, 'ingredients' | 'result_id' | 'no_reaction'>; highlight?: string | null } = $props();

  const sorted = $derived([...mix.ingredients].sort((a, b) => elementName(a).localeCompare(elementName(b))));
</script>

<span class="formula">
  {#each sorted as id, i (id + i)}
    {#if i > 0}<span class="op">+</span>{/if}
    <a class="el" class:hl={id === highlight} href={`#/elements/${id}`}>{elementName(id)}</a>
  {/each}
  <span class="op arrow">→</span>
  {#if mix.no_reaction}
    <span class="none">✗ {t('alc.noReaction')}</span>
  {:else if mix.result_id}
    <a class="el result" class:hl={mix.result_id === highlight} href={`#/elements/${mix.result_id}`}>{elementName(mix.result_id)}</a>
  {:else}
    <span class="none">?</span>
  {/if}
</span>

<style>
  .formula { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
  .el {
    padding: 0.1rem 0.55rem; border-radius: 2px; text-decoration: none; font-weight: 500;
    background: rgba(212, 175, 85, 0.1); border: 1px solid rgba(212, 175, 85, 0.3); color: var(--text);
  }
  .el:hover { border-color: var(--gold); color: var(--gold-bright); }
  .el.result { background: rgba(111, 154, 74, 0.18); border-color: rgba(140, 190, 100, 0.5); }
  .el.hl { box-shadow: 0 0 0 2px var(--gold); }
  .op { color: var(--gold); font-weight: 700; }
  .arrow { margin: 0 0.15rem; }
  .none { color: var(--text-dim); font-style: italic; }
</style>
