<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  let { x, y, label = '', book = null }: { x: number | null; y: number | null; label?: string | null; book?: string | null } = $props();
  const href = $derived(`#/map?x=${Math.round(x ?? 0)}&y=${Math.round(y ?? 0)}${book ? `&book=${book}` : ''}`);
</script>

{#if x !== null && y !== null}
  <a class="maplink" {href} title={t('lib.openMap')} onclick={(e) => e.stopPropagation()}>📍 {label || t('lib.onMap')}</a>
{:else if label}
  <span class="muted">📍 {label}</span>
{/if}

<style>
  .maplink {
    display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.1rem 0.55rem; border-radius: 999px;
    background: rgba(90, 134, 168, 0.2); border: 1px solid rgba(120, 170, 210, 0.55); color: #cfe6f7;
    text-decoration: none; font-size: 0.9rem;
  }
  .maplink:hover { background: rgba(90, 134, 168, 0.35); color: #fff; }
</style>
