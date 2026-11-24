<script lang="ts">
  import { notes } from '../../lib/stores';
  import { personName } from '../../lib/live.svelte';
  import { isAdmin } from '../../lib/auth.svelte';
  import { t, i18n, type Key } from '../../lib/i18n.svelte';
  import { excerpt } from '../../lib/markdown';
  import { KINDS, KIND_ICON, STATUSES } from '../../lib/noteMeta';
  import type { NoteKind, NoteStatus } from '../../lib/types';
  import StatusBadge from '../../components/StatusBadge.svelte';

  let kind = $state<NoteKind | 'all'>('all');
  let status = $state<NoteStatus | 'all'>('all');
  let tag = $state<string>('');
  let search = $state('');

  const allTags = $derived([...new Set(notes.state.items.flatMap((n) => n.tags))].sort());
  const list = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return notes.state.items.filter((n) =>
      (kind === 'all' || n.kind === kind) &&
      (status === 'all' || n.status === status) &&
      (!tag || n.tags.includes(tag)) &&
      (!q || (n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase().includes(q)));
  });
  const count = (k: NoteKind | 'all') => notes.state.items.filter((n) => k === 'all' || n.kind === k).length;
  const fmt = (s: string) => new Date(s).toLocaleDateString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
</script>

<div class="row head">
  <h1>📜 {t('nav.notes')}</h1>
  <span class="spacer"></span>
  {#if isAdmin()}<a class="btn primary-link" href="#/notes/new">＋ {t('notes.new')}</a>{/if}
</div>

<div class="tabs">
  <button class:on={kind === 'all'} onclick={() => (kind = 'all')}>{t('notes.all')} <span>{count('all')}</span></button>
  {#each KINDS as k}
    <button class:on={kind === k} onclick={() => (kind = k)}>{KIND_ICON[k]} {t(`kind.${k}s` as Key)} <span>{count(k)}</span></button>
  {/each}
</div>

<div class="filters">
  <input bind:value={search} placeholder={'🔍 ' + t('notes.search')} />
  <select bind:value={status}>
    <option value="all">{t('notes.anyStatus')}</option>
    {#each STATUSES as s}<option value={s}>{t(`status.${s}` as Key)}</option>{/each}
  </select>
  <select bind:value={tag}>
    <option value="">{t('notes.anyTag')}</option>
    {#each allTags as tg}<option value={tg}>#{tg}</option>{/each}
  </select>
</div>

{#if notes.state.error}<p class="error">{notes.state.error}</p>{/if}
{#if !notes.state.loaded}
  <p class="muted">{t('common.loading')}</p>
{:else if list.length === 0}
  <div class="card empty muted">{notes.state.items.length ? t('notes.noMatch') : t('notes.empty')}</div>
{:else}
  <div class="grid">
    {#each list as n (n.id)}
      <a class="card note" href={`#/notes/${n.id}`}>
        <div class="row top">
          <span class="kind" title={t(`kind.${n.kind}` as Key)}>{KIND_ICON[n.kind]}</span>
          <h3>{n.title}</h3>
        </div>
        <p class="ex muted">{excerpt(n.body) || '…'}</p>
        <div class="row foot">
          <StatusBadge status={n.status} />
          {#each n.tags as tg}<span class="tag">#{tg}</span>{/each}
          <span class="spacer"></span>
          <span class="muted small">{personName(n.updated_by)} · {fmt(n.updated_at)}</span>
        </div>
      </a>
    {/each}
  </div>
{/if}

<style>
  .head { margin-bottom: 0.5rem; }
  .head h1 { margin: 0; }
  .primary-link { background: linear-gradient(180deg, var(--gold-bright), var(--gold)); color: var(--ink); }
  .tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.8rem 0; }
  .tabs button { background: transparent; color: var(--text-dim); }
  .tabs button.on { background: rgba(212, 175, 85, 0.2); color: var(--gold-bright); border-color: var(--gold); }
  .tabs span { font-size: 0.8rem; opacity: 0.7; }
  .filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 0.6rem; margin-bottom: 1rem; }
  @media (max-width: 700px) { .filters { grid-template-columns: 1fr; } }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
  .note { display: flex; flex-direction: column; gap: 0.4rem; text-decoration: none; color: var(--text); transition: transform 0.12s, border-color 0.12s; }
  .note:hover { transform: translateY(-2px); border-color: var(--gold); }
  .top { flex-wrap: nowrap; align-items: flex-start; }
  .top h3 { margin: 0; color: var(--gold-bright); }
  .kind { font-size: 1.3rem; }
  .ex { margin: 0; flex: 1; font-size: 0.95rem; }
  .foot { gap: 0.4rem; }
  .tag { font-size: 0.8rem; color: #9cc3df; }
  .small { font-size: 0.82rem; }
  .empty { text-align: center; padding: 2.5rem; }
</style>
