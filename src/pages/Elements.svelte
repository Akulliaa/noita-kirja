<script lang="ts">
  import { supabase } from '../lib/supabase';
  import { alchemy, norm, byName } from '../lib/alchemy.svelte';
  import { isAdmin } from '../lib/auth.svelte';
  import { route, go } from '../lib/router.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { Element } from '../lib/types';
  import MixtureFormula from '../components/MixtureFormula.svelte';

  let search = $state('');
  let newName = $state('');
  let err = $state('');

  const selectedId = $derived(route.parts[1] ?? null);
  const selected = $derived(alchemy.elements.find((e) => e.id === selectedId) ?? null);

  const stats = $derived.by(() => {
    const made = new Map<string, number>(), used = new Map<string, number>();
    for (const m of alchemy.mixtures) {
      if (m.result_id && !m.no_reaction) made.set(m.result_id, (made.get(m.result_id) ?? 0) + 1);
      for (const id of m.ingredients) used.set(id, (used.get(id) ?? 0) + 1);
    }
    return { made, used };
  });

  const list = $derived(
    alchemy.elements.filter((e) => !search || norm(e.name).includes(norm(search))).sort(byName),
  );

  const madeFrom = $derived(selected ? alchemy.mixtures.filter((m) => m.result_id === selected.id && !m.no_reaction) : []);
  const usedIn = $derived(selected ? alchemy.mixtures.filter((m) => m.ingredients.includes(selected.id)) : []);
  const usedInReacting = $derived(usedIn.filter((m) => !m.no_reaction));
  const usedInNone = $derived(usedIn.filter((m) => m.no_reaction));

  async function add(e: SubmitEvent) {
    e.preventDefault();
    err = '';
    const n = newName.trim();
    if (!n) return;
    if (alchemy.elements.some((x) => norm(x.name) === norm(n))) return (err = t('el.exists'));
    const { error } = await supabase.from('elements').insert({ name: n });
    if (error) err = error.message;
    else newName = '';
  }

  async function rename(el: Element) {
    const n = prompt(t('el.renamePrompt'), el.name)?.trim();
    if (!n || n === el.name) return;
    if (alchemy.elements.some((x) => x.id !== el.id && norm(x.name) === norm(n))) return alert(t('el.exists'));
    const { error } = await supabase.from('elements').update({ name: n }).eq('id', el.id);
    if (error) alert(error.message);
  }

  async function remove(el: Element) {
    const n = alchemy.mixtures.filter((m) => m.ingredients.includes(el.id)).length;
    if (!confirm(t('el.deleteConfirm', { name: el.name, n }))) return;
    const { error } = await supabase.from('elements').delete().eq('id', el.id);
    if (error) alert(error.message);
    else go('/elements');
  }

  let mergeInto = $state<string>('');
  async function merge(el: Element) {
    const target = alchemy.elements.find((x) => x.id === mergeInto);
    if (!target) return;
    if (!confirm(t('el.mergeConfirm', { from: el.name, into: target.name }))) return;
    const { error } = await supabase.rpc('merge_elements', { p_from: el.id, p_into: target.id });
    if (error) return alert(error.message);
    mergeInto = '';
    go(`/elements/${target.id}`);
  }
</script>

<h1>💧 {t('nav.elements')}</h1>

<div class="layout" class:withDetail={!!selected}>
  <section class="card">
    <div class="row">
      <input class="grow" bind:value={search} placeholder={'🔍 ' + t('el.search')} />
      {#if isAdmin()}
        <form class="row addform" onsubmit={add}>
          <input bind:value={newName} placeholder={t('el.newPlaceholder')} />
          <button class="primary" type="submit">＋</button>
        </form>
      {/if}
    </div>
    {#if err}<p class="error">{err}</p>{/if}
    <p class="muted small">{t('el.count', { n: list.length })}</p>

    <div class="grid">
      {#each list as e (e.id)}
        <a class="tile" class:active={e.id === selectedId} href={`#/elements/${e.id}`}>
          <span class="name">{e.name}</span>
          <span class="meta">
            <span title={t('el.madeFrom')}>⬅ {stats.made.get(e.id) ?? 0}</span>
            <span title={t('el.usedIn')}>➡ {stats.used.get(e.id) ?? 0}</span>
          </span>
        </a>
      {/each}
    </div>
  </section>

  {#if selected}
    <aside class="card detail">
      <div class="row">
        <h2>{selected.name}</h2>
        <span class="spacer"></span>
        <a class="btn small" href="#/elements" title={t('common.close')}>✕</a>
      </div>

      <h3>⬅ {t('el.madeFrom')} ({madeFrom.length})</h3>
      {#if madeFrom.length}
        <ul>{#each madeFrom as m (m.id)}<li><MixtureFormula mix={m} highlight={selected.id} /></li>{/each}</ul>
      {:else}<p class="muted">{t('el.nothingYet')}</p>{/if}

      <h3>➡ {t('el.usedIn')} ({usedInReacting.length})</h3>
      {#if usedInReacting.length}
        <ul>{#each usedInReacting as m (m.id)}<li><MixtureFormula mix={m} highlight={selected.id} /></li>{/each}</ul>
      {:else}<p class="muted">{t('el.nothingYet')}</p>{/if}

      {#if usedInNone.length}
        <details>
          <summary>✗ {t('el.noReactionWith')} ({usedInNone.length})</summary>
          <ul>{#each usedInNone as m (m.id)}<li><MixtureFormula mix={m} highlight={selected.id} /></li>{/each}</ul>
        </details>
      {/if}

      {#if isAdmin()}
        <div class="divider"></div>
        <div class="row">
          <button class="small" onclick={() => rename(selected)}>✏️ {t('el.rename')}</button>
          <button class="small danger" onclick={() => remove(selected)}>🗑 {t('admin.delete')}</button>
        </div>
        <label for="merge">{t('el.mergeLabel')}</label>
        <div class="row">
          <select id="merge" class="grow" bind:value={mergeInto}>
            <option value="">—</option>
            {#each alchemy.elements.filter((x) => x.id !== selected.id).sort(byName) as x (x.id)}
              <option value={x.id}>{x.name}</option>
            {/each}
          </select>
          <button class="small" disabled={!mergeInto} onclick={() => merge(selected)}>🔗 {t('el.merge')}</button>
        </div>
        <p class="muted small">{t('el.mergeHint')}</p>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .layout { display: grid; gap: 1rem; }
  .layout.withDetail { grid-template-columns: minmax(0, 1fr) minmax(320px, 420px); align-items: start; }
  @media (max-width: 900px) { .layout.withDetail { grid-template-columns: 1fr; } .detail { order: -1; } }
  .grow { flex: 1; min-width: 160px; }
  .addform { flex-wrap: nowrap; }
  .addform input { width: 200px; }
  .small { font-size: 0.88rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.5rem; margin-top: 0.6rem; }
  .tile {
    display: flex; flex-direction: column; gap: 0.2rem; padding: 0.55rem 0.7rem; border-radius: 8px;
    border: 1px solid rgba(212, 175, 85, 0.25); background: rgba(0, 0, 0, 0.15);
    color: var(--text); text-decoration: none; transition: border-color 0.15s, transform 0.1s;
  }
  .tile:hover { border-color: var(--gold); transform: translateY(-1px); }
  .tile.active { border-color: var(--gold-bright); background: rgba(212, 175, 85, 0.15); }
  .name { font-weight: 700; word-break: break-word; }
  .meta { display: flex; gap: 0.8rem; font-size: 0.8rem; color: var(--text-dim); }
  .detail { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow: auto; }
  .detail h2 { margin: 0; }
  .detail h3 { margin-top: 1.1rem; color: var(--gold); }
  .detail ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.45rem; }
  details { margin-top: 1rem; }
  summary { cursor: pointer; color: var(--text-dim); margin-bottom: 0.5rem; }
</style>
