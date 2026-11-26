<script lang="ts">
  // Wax seal pressed on confirmed / done notes (original artwork).
  // `stamp` plays the pressing animation once.
  let { kind = 'confirmed', stamp = false, title = '' }: { kind?: 'confirmed' | 'done'; stamp?: boolean; title?: string } = $props();
  const wax = $derived(kind === 'done' ? { a: '#7b4fc9', b: '#5a3696', c: '#a07ae6' } : { a: '#b3242c', b: '#7e161c', c: '#d9545a' });
</script>

<div class="seal" class:stamp {title} aria-label={title}>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <!-- irregular wax blob -->
    <path fill={wax.b} d="M50 3 C60 4 63 9 71 9 C80 10 84 18 89 24 C95 31 92 39 96 47 C99 56 94 62 92 70 C89 79 81 82 75 88 C68 94 60 92 51 97 C42 99 37 93 29 91 C20 88 15 82 10 75 C5 67 8 60 4 51 C1 42 7 36 9 28 C12 19 21 16 28 10 C35 5 41 3 50 3 Z" />
    <path fill={wax.a} d="M50 9 C59 10 64 13 70 15 C78 18 82 24 86 31 C90 39 89 46 90 53 C91 62 86 68 82 74 C77 81 69 84 61 88 C53 91 45 90 38 87 C29 84 22 80 17 73 C12 65 11 58 11 50 C11 41 14 34 19 27 C25 19 32 14 40 11 C43 10 46 9 50 9 Z" />
    <!-- pressed ring -->
    <circle cx="50" cy="50" r="29" fill="none" stroke={wax.b} stroke-width="3" />
    <circle cx="50" cy="50" r="25" fill="none" stroke={wax.c} stroke-width="1" opacity="0.6" />
    <!-- emblem -->
    {#if kind === 'done'}
      <path fill={wax.b} d="M50 31 L55 45 L70 45 L58 54 L62 69 L50 60 L38 69 L42 54 L30 45 L45 45 Z" />
      <path fill={wax.c} opacity="0.55" d="M50 33 L54 45 L50 44 Z" />
    {:else}
      <path fill="none" stroke={wax.b} stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M36 51 L46 61 L65 39" />
      <path fill="none" stroke={wax.c} stroke-width="2" stroke-linecap="round" opacity="0.6" d="M37 49 L46 58 L64 37" />
    {/if}
    <!-- shine -->
    <ellipse cx="34" cy="26" rx="10" ry="5" fill="#fff" opacity="0.18" transform="rotate(-30 34 26)" />
  </svg>
</div>

<style>
  .seal { width: 84px; height: 84px; transform: rotate(-12deg); filter: drop-shadow(2px 3px 2px rgba(40, 20, 5, 0.45)); }
  svg { width: 100%; height: 100%; display: block; }
  .stamp { animation: press 0.55s cubic-bezier(0.3, 0.7, 0.4, 1.4) both; }
  @keyframes press {
    0% { transform: rotate(-30deg) scale(2.6); opacity: 0; }
    55% { transform: rotate(-10deg) scale(0.9); opacity: 1; }
    75% { transform: rotate(-13deg) scale(1.05); }
    100% { transform: rotate(-12deg) scale(1); }
  }
</style>
