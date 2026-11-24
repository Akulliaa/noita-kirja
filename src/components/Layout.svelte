<script lang="ts">
  import type { Snippet } from 'svelte';
  import { auth, isAdmin, logout } from '../lib/auth.svelte';
  import { route, go } from '../lib/router.svelte';
  import { t, type Key } from '../lib/i18n.svelte';
  import { APP_NAME } from '../lib/config';
  import Logo from './Logo.svelte';
  import LangToggle from './LangToggle.svelte';
  import Embers from './Embers.svelte';

  let { children }: { children: Snippet } = $props();
  let menuOpen = $state(false);
  let q = $state('');
  function search(e: SubmitEvent) {
    e.preventDefault();
    if (q.trim()) { go(`/search?q=${encodeURIComponent(q.trim())}`); q = ''; menuOpen = false; }
  }

  const links: { path: string; key: Key; icon: string; admin?: boolean }[] = [
    { path: '', key: 'nav.home', icon: '🏠' },
    { path: 'activity', key: 'nav.activity', icon: '📰' },
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

{#if current !== 'map'}<Embers />{/if}

<div class="shell">
  <aside class:open={menuOpen}>
    <a class="brand" href="#/">
      <Logo size={44} />
      <span class="name">{APP_NAME}<small>{t('app.tagline')}</small></span>
    </a>
    <form class="search" onsubmit={search}>
      <input bind:value={q} placeholder={'🔍 ' + t('search.short')} />
    </form>
    <nav>
      {#each links.filter((l) => !l.admin || isAdmin()) as l}
        <a href={`#/${l.path}`} class:active={current === l.path} onclick={() => (menuOpen = false)}>
          <span class="slot"><span class="icon">{l.icon}</span></span><span class="lbl">{t(l.key)}</span>
        </a>
      {/each}
    </nav>
    <div class="me">
      <div class="row">
        <span class="avatar" style:--c={auth.profile?.color}>{auth.profile?.username?.slice(0, 1).toUpperCase()}</span>
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
  .shell { position: relative; z-index: 2; display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
  aside {
    position: sticky; top: 0; height: 100vh;
    display: flex; flex-direction: column; gap: 0.9rem;
    padding: 1.1rem 0.9rem;
    background:
      linear-gradient(180deg, rgba(180, 108, 255, 0.07), transparent 30%),
      linear-gradient(180deg, var(--stone-1), var(--cave-0));
    border-right: 4px solid var(--cave-0);
    box-shadow: inset -2px 0 0 var(--stone-3), 6px 0 24px rgba(0, 0, 0, 0.5);
    z-index: 20;
    overflow-y: auto;
  }
  .brand {
    display: flex; align-items: center; gap: 0.65rem; text-decoration: none;
    padding: 0.2rem 0.2rem 0.8rem; border-bottom: 2px dashed var(--stone-3);
  }
  .name {
    display: flex; flex-direction: column; font-family: var(--font-title); font-weight: 700; font-size: 1.45rem;
    color: var(--gold-bright); line-height: 1.05; text-shadow: 0 0 14px rgba(255, 190, 80, 0.35), 2px 2px 0 #000;
  }
  .name small { font-family: var(--font-body); font-weight: 400; font-size: 0.72rem; color: var(--text-dim); text-shadow: none; margin-top: 0.2rem; }
  .search input { padding: 0.4rem 0.7rem; font-size: 0.95rem; }
  nav { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
  nav a {
    display: flex; align-items: center; gap: 0.7rem;
    padding: 0.28rem 0.45rem; text-decoration: none; color: var(--text);
    font-family: var(--font-title); font-size: 1.02rem; letter-spacing: 0.02em;
    border-left: 3px solid transparent; transition: background 0.12s, color 0.12s;
  }
  .slot {
    width: 34px; height: 34px; flex: none; display: grid; place-items: center;
    background: var(--cave-0);
    border: 2px solid transparent; border-image: var(--px-stone) 3 / 6px stretch; background-clip: padding-box;
    box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.5);
    transition: box-shadow 0.15s;
  }
  .icon { font-size: 1.05rem; filter: drop-shadow(1px 1px 0 #000); }
  nav a:hover { color: var(--gold-bright); background: rgba(255, 217, 122, 0.05); }
  nav a:hover .slot { border-image-source: var(--px-gold); }
  nav a.active { color: var(--gold-bright); border-left-color: var(--gold); background: linear-gradient(90deg, rgba(255, 190, 80, 0.14), transparent); }
  nav a.active .slot {
    border-image-source: var(--px-bright);
    box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.5), 0 0 14px rgba(255, 190, 80, 0.45);
  }
  .me { border-top: 2px dashed var(--stone-3); padding-top: 0.8rem; display: grid; gap: 0.4rem; }
  .avatar {
    width: 1.7rem; height: 1.7rem; display: grid; place-items: center; flex: none;
    background: var(--c); color: #111; font-family: var(--font-title); font-weight: 700;
    box-shadow: 0 0 10px var(--c), inset 0 -3px 0 rgba(0, 0, 0, 0.3);
  }
  main { position: relative; padding: 2rem clamp(1rem, 3vw, 2.5rem); max-width: 1300px; width: 100%; }
  main.full { max-width: none; padding: 0; height: 100vh; }
  .burger { display: none; }

  @media (max-width: 820px) {
    .shell { grid-template-columns: 1fr; }
    aside { position: fixed; left: 0; width: 270px; transform: translateX(-100%); transition: transform 0.2s; }
    aside.open { transform: none; }
    .burger { display: inline-flex; position: fixed; top: 0.7rem; right: 0.7rem; z-index: 30; }
    main { padding-top: 3.5rem; }
    main.full { padding-top: 0; }
  }
</style>
