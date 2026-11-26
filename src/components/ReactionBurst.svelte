<script lang="ts">
  // Short cauldron reaction shown when a mixture is recorded.
  // new = a never-seen result, known = an existing element, none = no reaction (smoke).
  import { onMount, untrack } from 'svelte';
  import { portal } from '../lib/portal';
  import { t } from '../lib/i18n.svelte';
  import Cauldron from './Cauldron.svelte';

  let { kind, label = '', ondone }: { kind: 'new' | 'known' | 'none'; label?: string; ondone: () => void } = $props();

  const PALETTE = {
    new: ['#8dff6a', '#ffd97a', '#b6ff8e', '#fff1a8', '#5fd3ff'],
    known: ['#b46cff', '#d9a8ff', '#8fb8ff', '#ffd97a'],
    none: ['#8a8394', '#a8a0b3', '#6d6676'],
  };
  const k0 = untrack(() => kind); // particles are computed once (the component is re-created per reaction)
  const N = k0 === 'none' ? 9 : k0 === 'new' ? 22 : 14;
  const parts = Array.from({ length: N }, (_, i) => {
    const colors = PALETTE[k0];
    if (k0 === 'none') {
      return { dx: (Math.random() - 0.5) * 70, dy: -60 - Math.random() * 80, s: 10 + Math.random() * 12, c: colors[i % colors.length], d: Math.random() * 0.4 };
    }
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const r = 70 + Math.random() * (k0 === 'new' ? 120 : 80);
    return { dx: Math.cos(a) * r * 1.3, dy: Math.sin(a) * r * 1.3, s: 6 + Math.floor(Math.random() * 3) * 2, c: colors[i % colors.length], d: Math.random() * 0.15 };
  });

  onMount(() => { const tm = setTimeout(ondone, 1700); return () => clearTimeout(tm); });
</script>

<div class="burst {kind}" use:portal aria-live="polite">
  <div class="pot">
    <div class="flash"></div>
    {#each parts as p}
      <span class="p" style:--dx={`${p.dx}px`} style:--dy={`${p.dy}px`} style:--s={`${p.s}px`} style:--c={p.c} style:--d={`${p.d}s`}></span>
    {/each}
    <div class="cauldron"><Cauldron /></div>
  </div>
  <div class="msg">
    {kind === 'new' ? '✨ ' + t('fx.newElement') : kind === 'known' ? '⚗️ ' + t('alc.saved') : '💨 ' + t('alc.noReaction')}
    {#if label}<strong>{label}</strong>{/if}
  </div>
</div>

<style>
  .burst {
    position: fixed; left: 50%; bottom: 12vh; transform: translateX(-50%); z-index: 95; pointer-events: none;
    display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
    animation: life 1.7s ease-in both;
  }
  @keyframes life { 0% { opacity: 0; transform: translateX(-50%) translateY(20px); } 12% { opacity: 1; transform: translateX(-50%); } 80% { opacity: 1; } 100% { opacity: 0; } }
  .pot { position: relative; width: 160px; height: 140px; }
  .cauldron { position: absolute; inset: 0; animation: shake 0.35s steps(4) 2; }
  @keyframes shake { 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
  .flash {
    position: absolute; left: 50%; top: 32%; width: 20px; height: 20px; margin: -10px; border-radius: 50%;
    background: radial-gradient(circle, #fff, transparent 70%); animation: flash 0.6s ease-out both;
  }
  .new .flash { background: radial-gradient(circle, #f4ffd8, rgba(141, 255, 106, 0.6) 40%, transparent 70%); }
  .known .flash { background: radial-gradient(circle, #f3e6ff, rgba(180, 108, 255, 0.6) 40%, transparent 70%); }
  .none .flash { display: none; }
  @keyframes flash { from { transform: scale(0.2); opacity: 1; } to { transform: scale(9); opacity: 0; } }
  .p {
    position: absolute; left: 50%; top: 34%; width: var(--s); height: var(--s); margin: calc(var(--s) / -2);
    background: var(--c); box-shadow: 0 0 8px var(--c); image-rendering: pixelated;
    animation: fly 1s cubic-bezier(0.2, 0.7, 0.3, 1) var(--d) both;
  }
  @keyframes fly {
    from { transform: translate(0, 0) scale(1); opacity: 1; }
    to { transform: translate(var(--dx), calc(var(--dy) + 40px)) scale(0.4); opacity: 0; }
  }
  .none .p { border-radius: 50%; box-shadow: none; opacity: 0.7; animation: smoke 1.4s ease-out var(--d) both; filter: blur(1px); }
  @keyframes smoke {
    from { transform: translate(0, 0) scale(0.5); opacity: 0.75; }
    to { transform: translate(var(--dx), var(--dy)) scale(2.2); opacity: 0; }
  }
  .msg {
    font-family: var(--font-title); font-size: 1.1rem; color: var(--gold-bright); text-shadow: 2px 2px 0 #000, 0 0 12px rgba(0, 0, 0, 0.8);
    display: flex; gap: 0.4rem; align-items: baseline;
  }
  .new .msg { color: #b6ff8e; }
  .known .msg { color: #d9a8ff; }
  .none .msg { color: #c9c2d3; }
</style>
