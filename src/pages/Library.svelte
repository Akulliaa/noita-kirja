<script lang="ts">
  import { route } from '../lib/router.svelte';
  import { isAdmin } from '../lib/auth.svelte';
  import { books } from '../lib/stores';
  import { t } from '../lib/i18n.svelte';
  import BookList from './library/BookList.svelte';
  import BookView from './library/BookView.svelte';
  import BookEdit from './library/BookEdit.svelte';

  books.start();
  const sub = $derived(route.parts[1] ?? null);
  const action = $derived(route.parts[2] ?? null);
</script>

{#if sub === null}
  <BookList />
{:else if sub === 'new' && isAdmin()}
  <BookEdit />
{:else if action === 'edit' && isAdmin()}
  {#if books.state.loaded}
    {#key sub}<BookEdit id={sub} />{/key}
  {:else}<p class="muted">{t('common.loading')}</p>{/if}
{:else}
  {#key sub}<BookView id={sub} />{/key}
{/if}
