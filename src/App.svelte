<script lang="ts">
  import { auth, isMember } from './lib/auth.svelte';
  import { route } from './lib/router.svelte';
  import { t } from './lib/i18n.svelte';
  import Login from './pages/Login.svelte';
  import Pending from './pages/Pending.svelte';
  import Layout from './components/Layout.svelte';
  import Home from './pages/Home.svelte';
  import Admin from './pages/Admin.svelte';
  import Elements from './pages/Elements.svelte';
  import Mixtures from './pages/Mixtures.svelte';
  import { startAlchemy } from './lib/alchemy.svelte';
  import { people } from './lib/live.svelte';
  import Notes from './pages/Notes.svelte';
  import Library from './pages/Library.svelte';
  import Rosetta from './pages/Rosetta.svelte';
  import Search from './pages/Search.svelte';
  import MapPage from './pages/Map.svelte';
  import Players from './pages/Players.svelte';
  import Tracker from './pages/Tracker.svelte';

  const page = $derived(route.parts[0] ?? '');

  // Start live alchemy sync once the user is an approved member.
  $effect(() => { if (auth.profile && isMember()) { startAlchemy(); people.start(); } });
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
    {:else if page === 'notes'}
      <Notes />
    {:else if page === 'library'}
      <Library />
    {:else if page === 'rosetta'}
      <Rosetta />
    {:else if page === 'search'}
      <Search />
    {:else if page === 'map'}
      {#key route.query.get('player') ?? ''}<MapPage />{/key}
    {:else if page === 'players'}
      <Players />
    {:else if page === 'tracker'}
      <Tracker />
    {:else}
      <Home />
    {/if}
  </Layout>
{/if}

<style>
  .center { min-height: 100vh; display: grid; place-items: center; }
</style>
