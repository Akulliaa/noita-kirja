<script lang="ts">
  import { auth, isMember } from './lib/auth.svelte';
  import { route } from './lib/router.svelte';
  import { t } from './lib/i18n.svelte';
  import Login from './pages/Login.svelte';
  import Pending from './pages/Pending.svelte';
  import Layout from './components/Layout.svelte';
  import Home from './pages/Home.svelte';
  import Admin from './pages/Admin.svelte';
  import Soon from './pages/Soon.svelte';
  import Elements from './pages/Elements.svelte';
  import Mixtures from './pages/Mixtures.svelte';
  import { startAlchemy } from './lib/alchemy.svelte';

  const page = $derived(route.parts[0] ?? '');

  // Start live alchemy sync once the user is an approved member.
  $effect(() => { if (auth.profile && isMember()) startAlchemy(); });
</script>

{#if !auth.ready}
  <div class="center muted">{t('common.loading')}</div>
{:else if !auth.session}
  <Login />
{:else if !auth.profile}
  <div class="center muted">{t('common.loading')}</div>
{:else if !isMember()}
  <Pending />
{:else}
  <Layout>
    {#if page === ''}
      <Home />
    {:else if page === 'admin'}
      <Admin />
    {:else if page === 'elements'}
      <Elements />
    {:else if page === 'mixtures'}
      <Mixtures />
    {:else if page === 'notes' || page === 'library' || page === 'rosetta'}
      <Soon phase={3} />
    {:else if page === 'map' || page === 'players'}
      <Soon phase={4} />
    {:else}
      <Home />
    {/if}
  </Layout>
{/if}

<style>
  .center { min-height: 100vh; display: grid; place-items: center; }
</style>
