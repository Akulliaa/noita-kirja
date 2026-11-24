<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  let { phase }: { phase: number } = $props();
</script>

<div class="card soon">
  <h1>🔮 {t('soon.title')}</h1>
  <p class="muted">{t('soon.text', { n: phase })}</p>
</div>

<style>
  .soon { max-width: 520px; margin: 10vh auto; text-align: center; }
</style>
