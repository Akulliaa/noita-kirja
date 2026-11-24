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

  const page = $derived(route.parts[0] ?? '');
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
    {:else if page === 'elements' || page === 'mixtures'}
      <Soon phase={2} />
    {:else if page === 'notes'}
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
