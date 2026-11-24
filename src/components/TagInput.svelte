<script lang="ts">
  let { tags = $bindable([]), suggestions = [], id = undefined, placeholder = '' }:
    { tags: string[]; suggestions?: string[]; id?: string; placeholder?: string } = $props();
  let q = $state('');
  const listId = `tags-${Math.random().toString(36).slice(2)}`;

  function add() {
    const v = q.trim().replace(/,$/, '').trim();
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) tags = [...tags, v];
    q = '';
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && !q && tags.length) tags = tags.slice(0, -1);
  }
</script>

<div class="tags">
  {#each tags as tag, i (tag)}
    <span class="tag">#{tag}<button type="button" onclick={() => (tags = tags.filter((_, j) => j !== i))} aria-label="remove">×</button></span>
  {/each}
  <input {id} bind:value={q} onkeydown={key} onblur={add} list={listId} {placeholder} />
  <datalist id={listId}>{#each suggestions.filter((s) => !tags.includes(s)) as s}<option value={s}></option>{/each}</datalist>
</div>

<style>
  .tags {
    display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; padding: 0.3rem;
    border: 1px solid var(--gold-dim); border-radius: 2px; background: var(--wood-1);
  }
  .tags input { flex: 1; min-width: 120px; border: none; padding: 0.25rem 0.4rem; background: transparent; }
  .tags input:focus { box-shadow: none; }
  .tag {
    display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.1rem 0.2rem 0.1rem 0.55rem;
    border-radius: 2px; background: rgba(90, 134, 168, 0.25); border: 1px solid rgba(120, 170, 210, 0.5); font-size: 0.9rem;
  }
  .tag button { border: none; background: none; padding: 0 0.3rem; color: var(--text-dim); }
</style>
