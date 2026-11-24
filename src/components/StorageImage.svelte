<script lang="ts">
  import { signedUrl } from '../lib/images';
  let { path, alt = '', pixel = false, class: cls = '' }: { path: string; alt?: string; pixel?: boolean; class?: string } = $props();
  let src = $state<string | null>(null);
  $effect(() => {
    const p = path;
    src = null;
    signedUrl(p).then((u) => { if (p === path) src = u; });
  });
</script>

{#if src}<img {src} {alt} class={cls} class:pixel />{:else}<span class="ph {cls}">⏳</span>{/if}

<style>
  .pixel { image-rendering: pixelated; }
  .ph { display: inline-grid; place-items: center; color: var(--text-dim); }
</style>
