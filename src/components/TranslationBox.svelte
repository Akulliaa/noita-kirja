<script lang="ts">
  // Collapsible editor for the stored translation of some fields.
  // Fields edited here are marked "manual" so saving won't overwrite them.
  import { t } from '../lib/i18n.svelte';
  import { translateText, otherLang } from '../lib/translate';
  import type { Lang } from '../lib/types';

  let {
    lang,
    fields,
    values,
    tr = $bindable({}),
    manual = $bindable([]),
  }: {
    lang: Lang;
    fields: { key: string; label: string; multiline?: boolean }[];
    values: Record<string, string>;
    tr: Record<string, string>;
    manual: string[];
  } = $props();

  let busy = $state(false);
  let failed = $state(false);
  const to = $derived(otherLang(lang));

  function touch(k: string) { if (!manual.includes(k)) manual = [...manual, k]; }

  async function retranslate() {
    busy = true; failed = false;
    for (const f of fields) {
      const v = values[f.key] ?? '';
      const r = v.trim() ? await translateText(v, lang, to) : '';
      if (r === null) { failed = true; continue; }
      tr[f.key] = r;
      touch(f.key);
    }
    busy = false;
  }
</script>

<details class="trbox">
  <summary>🌐 {t('tr.box', { from: lang.toUpperCase(), to: to.toUpperCase() })}</summary>
  <p class="muted small">{t('tr.boxHint')}</p>
  {#each fields as f (f.key)}
    <label for={`tr-${f.key}`}>{f.label} ({to.toUpperCase()})</label>
    {#if f.multiline}
      <textarea id={`tr-${f.key}`} rows="8" value={tr[f.key] ?? ''} oninput={(e) => { tr[f.key] = (e.target as HTMLTextAreaElement).value; touch(f.key); }}></textarea>
    {:else}
      <input id={`tr-${f.key}`} value={tr[f.key] ?? ''} oninput={(e) => { tr[f.key] = (e.target as HTMLInputElement).value; touch(f.key); }} />
    {/if}
  {/each}
  <div class="row">
    <button type="button" class="small" onclick={retranslate} disabled={busy}>{busy ? '⏳' : '🔁'} {t('tr.retranslate')}</button>
    {#if failed}<span class="error small">{t('tr.failed')}</span>{/if}
  </div>
</details>

<style>
  .trbox { margin-top: 1rem; border: 1px dashed var(--gold-dim); border-radius: 2px; padding: 0.5rem 0.9rem 0.8rem; }
  summary { cursor: pointer; color: var(--gold); font-weight: 700; }
  textarea { font-family: ui-monospace, Consolas, monospace; font-size: 0.9rem; }
  .row { margin-top: 0.6rem; }
  .small { font-size: 0.85rem; }
</style>
