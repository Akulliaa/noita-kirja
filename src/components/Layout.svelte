<script lang="ts">
  import type { Snippet } from 'svelte';
  import { auth, isAdmin, logout } from '../lib/auth.svelte';
  import { route, go } from '../lib/router.svelte';
  import { t, type Key } from '../lib/i18n.svelte';
  import { APP_NAME } from '../lib/config';
  import Logo from './Logo.svelte';
  import LangToggle from './LangToggle.svelte';

  let { children }: { children: Snippet } = $props();
  let menuOpen = $state(false);
  let q = $state('');
  function search(e: SubmitEvent) {
    e.preventDefault();
    if (q.trim()) { go(`/search?q=${encodeURIComponent(q.trim())}`); q = ''; menuOpen = false; }
  }

  const links: { path: string; key: Key; icon: string; admin?: boolean }[] = [
    { path: '', key: 'nav.home', icon: '🏠' },
    { path: 'elements', key: 'nav.elements', icon: '💧' },
    { path: 'mixtures', key: 'nav.mixtures', icon: '⚗️' },
    { path: 'notes', key: 'nav.notes', icon: '📜' },
    { path: 'library', key: 'nav.library', icon: '📚' },
    { path: 'rosetta', key: 'nav.rosetta', icon: '🔣' },
    { path: 'map', key: 'nav.map', icon: '🗺️' },
    { path: 'players', key: 'nav.players', icon: '🧙' },
    { path: 'tracker', key: 'nav.tracker', icon: '🎮' },
    { path: 'admin', key: 'nav.admin', icon: '🔑', admin: true },
  ];
  const current = $derived(route.parts[0] ?? '');
</script>

<div class="shell">
  <aside class:open={menuOpen}>
    <a class="brand" href="#/">
      <Logo size={40} />
      <span>{APP_NAME}</span>
    </a>
    <form class="search" onsubmit={search}>
      <input bind:value={q} placeholder={'🔍 ' + t('search.short')} />
    </form>
    <nav>
      {#each links.filter((l) => !l.admin || isAdmin()) as l}
        <a href={`#/${l.path}`} class:active={current === l.path} onclick={() => (menuOpen = false)}>
          <span class="icon">{l.icon}</span>{t(l.key)}
        </a>
      {/each}
    </nav>
    <div class="me">
      <div class="row">
        <span class="dot" style:color={auth.profile?.color} style:background={auth.profile?.color}></span>
        <strong>{auth.profile?.username}</strong>
        <span class="badge {auth.profile?.role}">{t(`role.${auth.profile?.role ?? 'pending'}` as Key)}</span>
      </div>
      <div class="row">
        <LangToggle />
        <button class="ghost small" onclick={logout}>{t('nav.logout')}</button>
      </div>
    </div>
  </aside>

  <button class="burger" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu">☰</button>

  <main class:full={current === 'map'}>
    {@render children()}
  </main>
</div>

<style>
  .shell { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; }
  aside {
    position: sticky; top: 0; height: 100vh;
    display: flex; flex-direction: column; gap: 1rem;
    padding: 1.2rem 1rem;
    background: linear-gradient(180deg, var(--wood-2), var(--wood-0));
    border-right: 1px solid var(--gold-dim);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.4);
    z-index: 20;
  }
  .brand {
    display: flex; align-items: center; gap: 0.6rem;
    font-family: var(--font-title); font-weight: 800; font-size: 1.3rem;
    color: var(--gold-bright); text-decoration: none; letter-spacing: 0.05em;
  }
  .search input { padding: 0.4rem 0.7rem; font-size: 0.95rem; }
  nav { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; }
  nav a {
    display: flex; align-items: center; gap: 0.7rem;
    padding: 0.55rem 0.8rem; border-radius: 8px;
    color: var(--text); text-decoration: none; font-weight: 500;
    border: 1px solid transparent; transition: background 0.15s;
  }
  nav a:hover { background: rgba(212, 175, 85, 0.08); color: var(--gold-bright); }
  nav a.active {
    background: linear-gradient(90deg, rgba(212, 175, 85, 0.22), transparent);
    border-color: rgba(212, 175, 85, 0.35); color: var(--gold-bright);
  }
  .icon { width: 1.4rem; text-align: center; }
  .me { border-top: 1px solid rgba(212, 175, 85, 0.25); padding-top: 0.8rem; display: grid; gap: 0.4rem; }
  main { padding: 2rem clamp(1rem, 3vw, 2.5rem); max-width: 1300px; width: 100%; }
  main.full { max-width: none; padding: 0; height: 100vh; }
  .burger { display: none; }

  @media (max-width: 820px) {
    .shell { grid-template-columns: 1fr; }
    aside { position: fixed; left: 0; width: 260px; transform: translateX(-100%); transition: transform 0.2s; }
    aside.open { transform: none; }
    .burger { display: inline-flex; position: fixed; top: 0.7rem; right: 0.7rem; z-index: 30; }
    main { padding-top: 3.5rem; }
    main.full { padding-top: 0; }
  }
</style>
