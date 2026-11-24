<script lang="ts">
  import { auth, loadProfile, logout } from '../lib/auth.svelte';
  import { t } from '../lib/i18n.svelte';
  import { supabase } from '../lib/supabase';
  import Logo from '../components/Logo.svelte';
  import LangToggle from '../components/LangToggle.svelte';

  // Refresh automatically when an admin approves this account.
  $effect(() => {
    const id = auth.profile?.id;
    if (!id) return;
    const ch = supabase
      .channel('my-profile')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${id}` }, () => loadProfile())
      .subscribe();
    const timer = setInterval(loadProfile, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(timer); };
  });
</script>

<div class="wrap">
  <div class="parchment panel">
    <Logo size={56} />
    <h2>⏳ {t('pending.title')}</h2>
    <p>{t('pending.text', { name: auth.profile?.username ?? '' })}</p>
    <div class="row center">
      <button onclick={loadProfile}>{t('pending.refresh')}</button>
      <button class="ghost" onclick={logout}>{t('nav.logout')}</button>
      <LangToggle />
    </div>
  </div>
</div>

<style>
  .wrap { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
  .panel { max-width: 460px; text-align: center; }
  .panel p { color: var(--ink-soft); }
  .center { justify-content: center; }
  .ghost { color: var(--ink-soft); }
</style>
