<script lang="ts">
  import { i18n, setLang, t } from '../lib/i18n.svelte';
</script>

<button class="ghost small" onclick={() => setLang(i18n.lang === 'fr' ? 'en' : 'fr')} title={t('lang.switch')}>
  {i18n.lang === 'fr' ? '🇬🇧 English' : '🇫🇷 Français'}
</button>
