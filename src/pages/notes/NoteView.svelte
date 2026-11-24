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
  import StatusBadge from '../../components/StatusBadge.svelte';

  let { id }: { id: string } = $props();
  const note = $derived(notes.get(id));

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
  <article class="card">
    <header>
      <div class="row">
        <span class="kind">{KIND_ICON[note.kind]}</span>
        <h1>{note.title}</h1>
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
    {#if note.body.trim()}<Markdown source={note.body} />{:else}<p class="muted">{t('md.empty')}</p>{/if}
  </article>
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
  .history { margin-top: 1rem; padding: 0.8rem; border: 1px dashed var(--gold-dim); border-radius: 8px; }
  .history ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
  .history li { display: flex; gap: 0.5rem; align-items: center; }
  .history li.sel button.ghost { color: var(--gold-bright); }
  .old { margin-top: 0.8rem; padding: 0.8rem; background: rgba(0, 0, 0, 0.2); border-radius: 8px; opacity: 0.9; }
</style>
