<script lang="ts">
  // Textarea with a small toolbar, live preview, and image paste / drag & drop.
  import { uploadImage, imageFiles } from '../lib/images';
  import { t } from '../lib/i18n.svelte';
  import Markdown from './Markdown.svelte';

  let {
    value = $bindable(''),
    folder,
    rows = 14,
    id = undefined,
    placeholder = '',
    compact = false,
  }: { value: string; folder: string; rows?: number; id?: string; placeholder?: string; compact?: boolean } = $props();

  let ta: HTMLTextAreaElement;
  let mode = $state<'write' | 'preview' | 'split'>('split');
  let uploading = $state(0);
  let err = $state('');
  let dragging = $state(false);
  let fileInput: HTMLInputElement;

  function insert(before: string, after = '', placeholderText = '') {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = value.slice(s, e) || placeholderText;
    value = value.slice(0, s) + before + sel + after + value.slice(e);
    queueMicrotask(() => {
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + sel.length;
    });
  }

  function linePrefix(prefix: string) {
    const s = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    queueMicrotask(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + prefix.length; });
  }

  async function addImages(files: File[]) {
    err = '';
    for (const f of files) {
      uploading++;
      try {
        const path = await uploadImage(f, folder);
        const pos = ta?.selectionStart ?? value.length;
        const md = `\n![${f.name.replace(/[[\]]/g, '')}](kirja:${path})\n`;
        value = value.slice(0, pos) + md + value.slice(pos);
      } catch (e: any) {
        err = t('common.error', { msg: e?.message ?? String(e) });
      }
      uploading--;
    }
  }

  function paste(e: ClipboardEvent) {
    const files = imageFiles(e.clipboardData);
    if (files.length) { e.preventDefault(); addImages(files); }
  }
  function drop(e: DragEvent) {
    dragging = false;
    const files = imageFiles(e.dataTransfer);
    if (files.length) { e.preventDefault(); addImages(files); }
  }

  const tools: { label: string; title: string; run: () => void }[] = [
    { label: 'B', title: 'bold', run: () => insert('**', '**', 'texte') },
    { label: 'I', title: 'italic', run: () => insert('*', '*', 'texte') },
    { label: 'H', title: 'heading', run: () => linePrefix('## ') },
    { label: '•', title: 'list', run: () => linePrefix('- ') },
    { label: '☐', title: 'checklist', run: () => linePrefix('- [ ] ') },
    { label: '❝', title: 'quote', run: () => linePrefix('> ') },
    { label: '🔗', title: 'link', run: () => insert('[', '](https://)', 'lien') },
  ];
</script>

<div class="editor" class:dragging>
  <div class="bar">
    {#each tools as tool}
      <button type="button" class="small tool" title={tool.title} onclick={tool.run}>{tool.label}</button>
    {/each}
    <button type="button" class="small tool" title={t('md.addImage')} onclick={() => fileInput.click()}>🖼</button>
    <input bind:this={fileInput} type="file" accept="image/*" multiple hidden
      onchange={(e) => { addImages(Array.from((e.target as HTMLInputElement).files ?? [])); (e.target as HTMLInputElement).value = ''; }} />
    <span class="spacer"></span>
    {#if uploading}<span class="muted small">⏳ {t('md.uploading')}</span>{/if}
    <div class="modes">
      <button type="button" class="small" class:on={mode === 'write'} onclick={() => (mode = 'write')}>{t('md.write')}</button>
      <button type="button" class="small" class:on={mode === 'split'} onclick={() => (mode = 'split')}>◫</button>
      <button type="button" class="small" class:on={mode === 'preview'} onclick={() => (mode = 'preview')}>{t('md.preview')}</button>
    </div>
  </div>

  <div class="panes" class:split={mode === 'split'}>
    <textarea
      {id}
      bind:this={ta}
      bind:value
      {rows}
      {placeholder}
      class:hidden={mode === 'preview'}
      class:compact
      onpaste={paste}
      ondragover={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); dragging = true; } }}
      ondragleave={() => (dragging = false)}
      ondrop={drop}
    ></textarea>
    {#if mode !== 'write'}
      <div class="preview">
        {#if value.trim()}<Markdown source={value} />{:else}<p class="muted">{t('md.empty')}</p>{/if}
      </div>
    {/if}
  </div>
  <p class="muted small hint">{t('md.hint')}</p>
  {#if err}<p class="error">{err}</p>{/if}
</div>

<style>
  .editor { border: 1px solid var(--gold-dim); border-radius: 2px; overflow: hidden; background: var(--wood-1); }
  .editor.dragging { border-color: var(--gold-bright); box-shadow: 0 0 0 3px rgba(240, 207, 122, 0.3); }
  .bar { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; padding: 0.4rem; border-bottom: 1px solid rgba(212, 175, 85, 0.25); background: var(--wood-2); }
  .tool { min-width: 2rem; justify-content: center; padding: 0.2rem 0.5rem; }
  .modes { display: flex; gap: 0.2rem; }
  .modes .on { border-color: var(--gold-bright); background: rgba(212, 175, 85, 0.25); }
  .panes { display: grid; }
  .panes.split { grid-template-columns: 1fr 1fr; }
  @media (max-width: 900px) { .panes.split { grid-template-columns: 1fr; } }
  textarea { border: none; border-radius: 0; resize: vertical; min-height: 12rem; font-family: ui-monospace, Consolas, monospace; font-size: 0.92rem; line-height: 1.5; }
  textarea:focus { box-shadow: none; }
  textarea.compact { min-height: 5rem; }
  .hidden { display: none; }
  .preview { padding: 0.6rem 1rem; border-left: 1px solid rgba(212, 175, 85, 0.25); max-height: 70vh; overflow: auto; }
  .hint { margin: 0; padding: 0.3rem 0.6rem; font-size: 0.82rem; border-top: 1px solid rgba(212, 175, 85, 0.15); }
  .small { font-size: 0.85rem; }
  .error { padding: 0 0.6rem; }
</style>
