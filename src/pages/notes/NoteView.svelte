<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { notes } from '../../lib/stores';
  import { personName } from '../../lib/live.svelte';
  import { isAdmin } from '../../lib/auth.svelte';
  import { go } from '../../lib/router.svelte';
  import { t, i18n, type Key } from '../../lib/i18n.svelte';
  import { KIND_ICON } from '../../lib/noteMeta';
  import type { NoteVersion } from '../../lib/types';
  import Markdown from '../../components/Markdown.svelte';
  import QuestView from '../../components/QuestView.svelte';
  import { hasSteps } from '../../lib/quest';
  import StatusBadge from '../../components/StatusBadge.svelte';
  import { lt, untranslated } from '../../lib/loc';
  import { i18n as I } from '../../lib/i18n.svelte';
  import WaxSeal from '../../components/WaxSeal.svelte';
  import { takeStamp, reducedMotion } from '../../lib/fx';
  import { sfx } from '../../lib/sound.svelte';
  let showOriginal = $state(false);

  let { id }: { id: string } = $props();
  const note = $derived(notes.get(id));

  // Wax seal on confirmed / done notes; pressed with an animation when it just became so
  // (saved from the editor, ticked in the quest view, or changed live by someone else).
  const sealKind = $derived(note?.status === 'confirmed' || note?.status === 'done' ? note.status : null);
  let stampNow = $state(0);
  let lastStatus: string | undefined;
  $effect(() => {
    const s = note?.status;
    if (!s) return;
    const sealed = s === 'confirmed' || s === 'done';
    const fresh = lastStatus === undefined ? takeStamp(id) : lastStatus !== s;
    lastStatus = s;
    if (sealed && fresh && !reducedMotion()) {
      stampNow++;
      setTimeout(() => sfx('stamp'), 280);
    }
  });

  let showHistory = $state(false);
  let versions = $state<NoteVersion[]>([]);
  let picked = $state<NoteVersion | null>(null);

  async function loadHistory() {
    const { data } = await supabase.from('note_history').select('*').eq('note_id', id).order('edited_at', { ascending: false });
    versions = (data as NoteVersion[]) ?? [];
    picked = null;
  }
  $effect(() => { if (showHistory) loadHistory(); });

  async function restore(v: NoteVersion) {
    if (!confirm(t('notes.restoreConfirm'))) return;
    const { error } = await supabase.from('notes')
      .update({ title: v.title, body: v.body, status: v.status, tags: v.tags, kind: v.kind }).eq('id', id);
    if (error) return alert(error.message);
    await loadHistory();
  }

  async function remove() {
    if (!note || !confirm(t('notes.deleteConfirm', { title: note.title }))) return;
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) return alert(error.message);
    go('/notes');
  }

  const fmt = (s: string) =>
    new Date(s).toLocaleString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<a class="back" href="#/notes">← {t('nav.notes')}</a>

{#if !notes.state.loaded}
  <p class="muted">{t('common.loading')}</p>
{:else if !note}
  <div class="card muted">{t('notes.notFound')}</div>
{:else}
  <div class="torn-wrap">
  <article class="parchment torn kind-{note.kind}">
    {#if sealKind}
      {#key stampNow}
        <div class="sealpos"><WaxSeal kind={sealKind} stamp={stampNow > 0} title={t(`status.${sealKind}` as Key)} /></div>
      {/key}
    {/if}
    <header class:sealed={!!sealKind}>
      <div class="row">
        <span class="kind">{KIND_ICON[note.kind]}</span>
        <h1>{showOriginal ? note.title : lt(note, 'title')}</h1>
      </div>
      <div class="row meta">
        <span class="badge kindb">{t(`kind.${note.kind}` as Key)}</span>
        <StatusBadge status={note.status} />
        {#each note.tags as tg}<span class="tag">#{tg}</span>{/each}
        <span class="spacer"></span>
        <span class="muted small">
          {t('notes.by', { name: personName(note.created_by) })} · {t('notes.updated', { name: personName(note.updated_by), date: fmt(note.updated_at) })}
        </span>
      </div>
      <div class="row actions">
        {#if isAdmin()}
          <a class="btn small" href={`#/notes/${note.id}/edit`}>✏️ {t('alc.edit')}</a>
        {/if}
        <button class="small" class:on={showHistory} onclick={() => (showHistory = !showHistory)}>🕓 {t('notes.history')}</button>
        {#if isAdmin()}<button class="small danger" onclick={remove}>🗑 {t('admin.delete')}</button>{/if}
      </div>
    </header>

    {#if showHistory}
      <section class="history">
        {#if versions.length === 0}
          <p class="muted">{t('notes.noHistory')}</p>
        {:else}
          <ul>
            {#each versions as v (v.id)}
              <li class:sel={picked?.id === v.id}>
                <button class="ghost small" onclick={() => (picked = picked?.id === v.id ? null : v)}>
                  {fmt(v.edited_at)} — {personName(v.edited_by)}
                </button>
                {#if isAdmin()}<button class="small" onclick={() => restore(v)}>↩ {t('notes.restore')}</button>{/if}
              </li>
            {/each}
          </ul>
          {#if picked}
            <div class="old">
              <h3>{picked.title}</h3>
              <Markdown source={picked.body} />
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    <div class="divider"></div>
    {#if note.lang !== I.lang}
      <p class="muted small trline">
        {#if untranslated(note, 'body') || untranslated(note, 'title')}⏳ {t('tr.pending')}{:else}🌐 {t('tr.auto', { lang: note.lang.toUpperCase() })}{/if}
        <button class="ghost small" onclick={() => (showOriginal = !showOriginal)}>{showOriginal ? t('tr.showTranslation') : t('tr.showOriginal')}</button>
      </p>
    {/if}
    {#if note.kind === 'quest' && hasSteps(note.body)}
      <QuestView {note} {showOriginal} />
    {:else if note.body.trim()}<Markdown source={showOriginal ? note.body : lt(note, 'body')} />{:else}<p class="muted">{t('md.empty')}</p>{/if}
    {#if note.kind === 'quest' && !hasSteps(note.body) && isAdmin()}
      <p class="muted small tip">💡 {t('quest.tip')} <a href={`#/notes/${note.id}/edit`}>{t('alc.edit')}</a></p>
    {/if}
  </article>
  </div>
{/if}

<style>
  .back { display: inline-block; margin-bottom: 0.8rem; text-decoration: none; }
  header h1 { margin: 0; }
  .kind { font-size: 1.8rem; }
  .meta { margin-top: 0.6rem; gap: 0.45rem; }
  .kindb { color: var(--text-dim); }
  .tag { font-size: 0.85rem; color: #9cc3df; }
  .small { font-size: 0.85rem; }
  .actions { margin-top: 0.8rem; gap: 0.4rem; }
  .on { border-color: var(--gold-bright); background: rgba(212, 175, 85, 0.25); }
  .history { margin-top: 1rem; padding: 0.8rem; border: 1px dashed var(--gold-dim); border-radius: 2px; }
  .history ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
  .history li { display: flex; gap: 0.5rem; align-items: center; }
  .history li.sel button.ghost { color: var(--gold-bright); }
  .trline { margin: 0 0 0.6rem; }
  .tip { margin-top: 1rem; }
  .old { margin-top: 0.8rem; padding: 0.8rem; background: rgba(0, 0, 0, 0.2); border-radius: 2px; opacity: 0.9; }

  /* ---------- torn parchment ---------- */
  .torn-wrap { filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.6)); }
  .torn {
    --edge-top: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='14'%3E%3Cpath d='M0 14V6l12 3 10-6 13 5 12-4 11 6 13-5 12 3 13-6 12 5 13-3 12 6 13-5 12 3 13-5 12 6 13-4 12 3 13-6 12 5 7-2v9z'/%3E%3C/svg%3E");
    --edge-bot: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='14'%3E%3Cpath d='M0 0v8l9-3 12 5 13-6 11 4 14-3 11 6 12-5 13 4 12-6 13 5 11-3 14 5 12-4 12 6 13-5 11 3 14-5 12 4 13-3 9 4V0z'/%3E%3C/svg%3E");
    -webkit-mask:
      var(--edge-top) top left / 240px 14px repeat-x,
      linear-gradient(#000 0 0) center / 100% calc(100% - 26px) no-repeat,
      var(--edge-bot) bottom left / 240px 14px repeat-x;
    mask:
      var(--edge-top) top left / 240px 14px repeat-x,
      linear-gradient(#000 0 0) center / 100% calc(100% - 26px) no-repeat,
      var(--edge-bot) bottom left / 240px 14px repeat-x;
    border: 0; border-image: none;
    position: relative;
    padding: 2.2rem clamp(1rem, 3vw, 2.4rem) 2.4rem;
    /* readable ink colors for everything inside */
    --text: var(--ink);
    --text-dim: var(--ink-soft);
    --gold-bright: #6b3a0a;
    --gold-dim: #a8875a;
    --stone-1: var(--parchment);
    --stone-2: var(--parchment-2);
    --q-done: #3d6b1f;
    --q-panel: rgba(255, 250, 235, 0.28);
    color: var(--ink);
  }
  .torn h1 { color: var(--ink); }
  .kind-theory h1 { font-family: var(--font-hand); font-size: 2.6rem; font-weight: 600; letter-spacing: 0; line-height: 1.05; }
  .torn header.sealed { padding-right: 90px; }
  .sealpos { position: absolute; top: 22px; right: clamp(0.6rem, 2vw, 1.6rem); z-index: 3; pointer-events: none; }
  .torn :global(a:not(.btn):not(.maplink)) { color: #7a3f0c; }
  .torn :global(.btn), .torn header :global(button:not(.ghost):not(.danger)), .torn .history :global(button:not(.ghost)) { color: #ffd97a; }
  .torn .meta :global(.badge) { background: rgba(50, 30, 10, 0.8); }
  .torn .kindb { color: var(--parchment); }
  .torn .tag { color: #2f5a7a; }
  .torn :global(.maplink) { background: #2f5a7a; color: #fff; border-color: #2f5a7a; }
  .torn :global(.md code), .torn :global(.md pre) { background: rgba(60, 35, 10, 0.12); }
</style>
