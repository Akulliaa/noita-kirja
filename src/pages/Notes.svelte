<script lang="ts">
  import { route } from '../lib/router.svelte';
  import { isAdmin } from '../lib/auth.svelte';
  import { notes } from '../lib/stores';
  import { t } from '../lib/i18n.svelte';
  import NotesList from './notes/NotesList.svelte';
  import NoteView from './notes/NoteView.svelte';
  import NoteEdit from './notes/NoteEdit.svelte';

  notes.start();
  const sub = $derived(route.parts[1] ?? null);
  const action = $derived(route.parts[2] ?? null);
</script>

{#if sub === null}
  <NotesList />
{:else if sub === 'new' && isAdmin()}
  <NoteEdit />
{:else if action === 'edit' && isAdmin()}
  {#if notes.state.loaded}
    {#key sub}<NoteEdit id={sub} />{/key}
  {:else}<p class="muted">{t('common.loading')}</p>{/if}
{:else}
  {#key sub}<NoteView id={sub} />{/key}
{/if}
