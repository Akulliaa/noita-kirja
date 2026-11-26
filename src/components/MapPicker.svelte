<script lang="ts">
  // Modal map: click to pick a world position. Fog = everything explored by members.
  import { onMount } from 'svelte';
  import { MapEngine, type Marker } from '../lib/mapEngine';
  import { fog, grids, startFog, unionOf, boundsOf } from '../lib/fogStore.svelte';
  import { CELL } from '../lib/fog';
  import { t } from '../lib/i18n.svelte';

  let { x = null, y = null, others = [], title = '', onpick, onclose }: {
    x?: number | null; y?: number | null;
    others?: { x: number; y: number; label: string }[];
    title?: string;
    onpick: (x: number, y: number) => void;
    onclose: () => void;
  } = $props();

  startFog();
  let canvas: HTMLCanvasElement;
  let engine: MapEngine | null = null;
  let picked = $state<{ x: number; y: number } | null>(null);
  let cursor = $state<{ x: number; y: number } | null>(null);

  function markers() {
    if (!engine) return;
    const list: Marker[] = others.map((o, i) => ({ id: `o${i}`, x: o.x, y: o.y, icon: '🎯', title: o.label, kind: 'pin' }));
    const p = picked ?? (x !== null && y !== null ? { x, y } : null);
    if (p) list.push({ id: 'picked', x: p.x, y: p.y, icon: '📍', title: '', kind: 'pin' });
    engine.markers = list;
    engine.focus = picked ? 'picked' : null;
    engine.draw();
  }

  onMount(() => {
    engine = new MapEngine(canvas, {
      click: (wx, wy) => { picked = { x: Math.round(wx), y: Math.round(wy) }; markers(); },
      hover: (wx, wy) => { cursor = { x: wx, y: wy }; },
    });
    engine.tool = 'place';
    if (x !== null && y !== null) engine.centerOn(x, y, 0.8);
    else if (others.length) {
      const xs = others.map((o) => o.x), ys = others.map((o) => o.y);
      engine.fit({ x0: Math.min(...xs) - 600, y0: Math.min(...ys) - 600, x1: Math.max(...xs) + 600, y1: Math.max(...ys) + 600 });
    }
    markers();
    return () => { engine?.destroy(); engine = null; };
  });

  let fitted = false;
  $effect(() => {
    fog.version;
    if (!engine) return;
    engine.union = unionOf([...grids.keys()]);
    engine.unionVersion++;
    engine.draw();
    if (!fitted && fog.loaded && x === null && !others.length) {
      fitted = true;
      const b = boundsOf(engine.union, CELL);
      if (b) engine.fit(b);
    }
  });

  // Render under <body>: a transformed ancestor (.card) would trap position: fixed.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onclose(); }
    if (e.key === 'Enter' && picked) { e.preventDefault(); onpick(picked.x, picked.y); }
  }
</script>

<svelte:window onkeydown={keys} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="bg" use:portal onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="box card">
    <div class="row head">
      <strong>🗺️ {title || t('quest.pickTitle')}</strong>
      <span class="spacer"></span>
      <button type="button" class="ghost small" onclick={onclose}>✕</button>
    </div>
    <!-- canvas is absolutely positioned so its pixel size (CSS size × display scaling) can't grow the layout -->
    <div class="mapbox"><canvas bind:this={canvas}></canvas></div>
    <div class="row foot">
      <span class="muted small">
        {#if picked}📍 {picked.x}, {picked.y}{:else}{t('quest.pickHelp')}{/if}
        {#if cursor} · <span class="coords">{Math.round(cursor.x)}, {Math.round(cursor.y)}</span>{/if}
      </span>
      <span class="spacer"></span>
      <button type="button" class="ghost" onclick={onclose}>{t('common.cancel')}</button>
      <button type="button" class="primary" disabled={!picked} onclick={() => picked && onpick(picked.x, picked.y)}>✔ {t('quest.pickOk')}</button>
    </div>
  </div>
</div>

<style>
  .bg {
    position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.7);
    display: flex; align-items: center; justify-content: center; padding: 1rem;
  }
  .box {
    width: min(1100px, 100%); height: min(800px, calc(100vh - 2rem)); height: min(800px, calc(100dvh - 2rem));
    display: flex; flex-direction: column; gap: 0.5rem; padding: 0.7rem; overflow: hidden;
  }
  .mapbox { position: relative; flex: 1 1 auto; min-height: 120px; border: 1px solid var(--gold-dim); border-radius: 2px; background: #000; overflow: hidden; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: crosshair; touch-action: none; }
  .head, .foot { gap: 0.5rem; flex: none; }
  .small { font-size: 0.85rem; }
  .coords { font-family: ui-monospace, Consolas, monospace; }
</style>
