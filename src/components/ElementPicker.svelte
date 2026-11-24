<script lang="ts">
  // Search-as-you-type element chooser. Enter picks the first match
  // (or the typed text when allowCreate is on).
  import { alchemy, norm, byName, elName, elMatches } from '../lib/alchemy.svelte';
  import { t } from '../lib/i18n.svelte';

  let {
    onpick,
    exclude = [],
    allowCreate = false,
    placeholder = '',
    id = undefined,
  }: {
    onpick: (pick: { id: string | null; name: string }) => void;
    exclude?: string[];
    allowCreate?: boolean;
    placeholder?: string;
    id?: string;
  } = $props();

  let q = $state('');
  let open = $state(false);
  let active = $state(0);

  const matches = $derived.by(() => {
    const n = norm(q);
    const ex = new Set(exclude);
    return alchemy.elements
      .filter((e) => !ex.has(e.id) && elMatches(e, n))
      .sort((a, b) => {
        // names starting with the query first
        const sa = norm(elName(a)).startsWith(n) ? 0 : 1, sb = norm(elName(b)).startsWith(n) ? 0 : 1;
        return sa - sb || byName(a, b);
      })
      .slice(0, 12);
  });
  const exact = $derived(alchemy.elements.some((e) => norm(e.name) === norm(q) || norm(e.name_tr ?? '') === norm(q)));
  const showCreate = $derived(allowCreate && q.trim() !== '' && !exact);

  function choose(pick: { id: string | null; name: string }) {
    onpick(pick);
    q = '';
    active = 0;
  }

  function key(e: KeyboardEvent) {
    const total = matches.length + (showCreate ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); open = true; active = Math.min(active + 1, total - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
    else if (e.key === 'Escape') { open = false; }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < matches.length && matches[active]) choose({ id: matches[active].id, name: elName(matches[active]) });
      else if (showCreate) choose({ id: null, name: q.trim() });
    }
  }
</script>

<div class="picker">
  <input
    {id}
    bind:value={q}
    {placeholder}
    autocomplete="off"
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
    oninput={() => { open = true; active = 0; }}
    onkeydown={key}
  />
  {#if open && (matches.length || showCreate)}
    <ul class="menu">
      {#each matches as m, i (m.id)}
        <li>
          <button type="button" class:active={i === active} onmousedown={() => choose({ id: m.id, name: elName(m) })}>
            {elName(m)}
          </button>
        </li>
      {/each}
      {#if showCreate}
        <li>
          <button type="button" class="create" class:active={active === matches.length}
            onmousedown={() => choose({ id: null, name: q.trim() })}>
            ✨ {t('alc.createNew', { name: q.trim() })}
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .picker { position: relative; }
  .menu {
    position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 4px);
    margin: 0; padding: 0.3rem; list-style: none;
    background: var(--wood-2); border: 1px solid var(--gold-dim); border-radius: 2px;
    box-shadow: var(--shadow); max-height: 300px; overflow: auto;
  }
  .menu button {
    width: 100%; justify-content: flex-start; background: none; border: 1px solid transparent;
    color: var(--text); font-weight: 500; padding: 0.35rem 0.6rem;
  }
  .menu button.active, .menu button:hover { background: rgba(212, 175, 85, 0.15); border-color: rgba(212, 175, 85, 0.3); }
  .create { color: var(--gold-bright) !important; }
</style>
