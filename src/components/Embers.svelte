<script lang="ts">
  // Ambient pixel sparks drifting up from the bottom of the screen.
  // Cheap: ~70 squares on one canvas, paused when the tab is hidden, off with reduced motion.
  import { onMount } from 'svelte';

  let { density = 70 }: { density?: number } = $props();
  let canvas: HTMLCanvasElement;

  const COLORS = ['#ffb347', '#ff8a3d', '#ffd97a', '#b46cff', '#8dff6a', '#5fd3ff'];
  const WEIGHTS = [5, 4, 3, 2, 1, 1];

  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, raf = 0, last = performance.now();
    const pick = () => {
      let r = Math.random() * WEIGHTS.reduce((a, b) => a + b);
      for (let i = 0; i < COLORS.length; i++) { r -= WEIGHTS[i]; if (r <= 0) return COLORS[i]; }
      return COLORS[0];
    };
    type P = { x: number; y: number; vx: number; vy: number; s: number; c: string; life: number; max: number; ph: number };
    const ps: P[] = [];
    const spawn = (anywhere: boolean): P => {
      const max = 6 + Math.random() * 10;
      return {
        x: Math.random() * w, y: anywhere ? Math.random() * h : h + 10,
        vx: (Math.random() - 0.5) * 8, vy: -(10 + Math.random() * 28),
        s: Math.random() < 0.8 ? 2 : 3, c: pick(), life: anywhere ? Math.random() * max : 0, max, ph: Math.random() * 6.28,
      };
    };
    const resize = () => {
      w = canvas.width = Math.ceil(innerWidth / 2);   // half resolution = chunky pixels
      h = canvas.height = Math.ceil(innerHeight / 2);
    };
    resize();
    for (let i = 0; i < density; i++) ps.push(spawn(true));

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life += dt;
        p.ph += dt * 3;
        p.x += (p.vx + Math.sin(p.ph) * 6) * dt;
        p.y += p.vy * dt;
        if (p.life > p.max || p.y < -5) { ps[i] = spawn(false); continue; }
        const fade = Math.min(1, p.life / 1.5) * Math.min(1, (p.max - p.life) / 2);
        const flicker = 0.7 + 0.3 * Math.sin(p.ph * 2.3);
        ctx.globalAlpha = fade * flicker * 0.85;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis); };
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 0; pointer-events: none;
    image-rendering: pixelated; opacity: 0.9;
  }
</style>
