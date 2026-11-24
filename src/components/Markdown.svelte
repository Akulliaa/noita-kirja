<script lang="ts">
  import { renderMarkdown } from '../lib/markdown';
  import { signedUrls } from '../lib/images';

  let { source, pixel = false }: { source: string; pixel?: boolean } = $props();
  let box: HTMLDivElement;
  let zoom = $state<string | null>(null);

  const html = $derived(renderMarkdown(source));

  // Swap private image references for signed URLs after each render.
  $effect(() => {
    html;
    queueMicrotask(async () => {
      if (!box) return;
      const imgs = Array.from(box.querySelectorAll<HTMLImageElement>('img[data-kirja]'));
      if (!imgs.length) return;
      const urls = await signedUrls(imgs.map((i) => i.dataset.kirja!));
      for (const img of imgs) {
        const u = urls.get(img.dataset.kirja!);
        if (u) img.src = u;
        else img.alt = '⚠ ' + img.alt;
      }
    });
  });

  function click(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') zoom = (t as HTMLImageElement).src;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="md" class:pixel bind:this={box} onclick={click}>{@html html}</div>

{#if zoom}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="lightbox" onclick={() => (zoom = null)}><img src={zoom} alt="" /></div>
{/if}

<style>
  .md { line-height: 1.55; overflow-wrap: anywhere; }
  .md :global(img) {
    max-width: 100%; border-radius: 6px; border: 1px solid rgba(212, 175, 85, 0.3);
    cursor: zoom-in; vertical-align: middle; image-rendering: auto;
  }
  .md.pixel :global(img) { image-rendering: pixelated; }
  .md :global(h1), .md :global(h2), .md :global(h3) { margin: 1.1em 0 0.5em; }
  .md :global(p) { margin: 0.5em 0; }
  .md :global(blockquote) {
    margin: 0.6em 0; padding: 0.3em 1em; border-left: 3px solid var(--gold-dim);
    background: rgba(212, 175, 85, 0.06); color: var(--text-dim);
  }
  .md :global(code) { background: rgba(0, 0, 0, 0.3); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.92em; }
  .md :global(pre) { background: rgba(0, 0, 0, 0.3); padding: 0.8em; border-radius: 6px; overflow: auto; }
  .md :global(table) { margin: 0.6em 0; }
  .md :global(hr) { border: none; height: 1px; background: var(--gold-dim); margin: 1.2em 0; }
  .md :global(ul), .md :global(ol) { padding-left: 1.4em; }
  .md :global(input[type='checkbox']) { width: auto; }
  .lightbox {
    position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, 0.85);
    display: grid; place-items: center; cursor: zoom-out; padding: 2rem;
  }
  .lightbox img { max-width: 100%; max-height: 100%; image-rendering: pixelated; border-radius: 6px; }
</style>
