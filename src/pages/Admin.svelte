<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { auth, isAdmin } from '../lib/auth.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import type { Profile, Role } from '../lib/types';
  import { readLegacyFolder, runImport, summarize, type LegacyBundle } from '../lib/legacyImport';

  let users = $state<Profile[]>([]);
  let msg = $state('');
  let err = $state('');

  async function load() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) err = error.message;
    users = (data as Profile[]) ?? [];
  }

  onMount(() => {
    load();
    const ch = supabase
      .channel('admin-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  });

  async function update(u: Profile, patch: Partial<Profile>) {
    err = msg = '';
    const { error } = await supabase.from('profiles').update(patch).eq('id', u.id);
    if (error) err = error.message;
    await load();
  }

  async function resetPassword(u: Profile) {
    const pw = prompt(t('admin.resetpw.prompt', { name: u.username }));
    if (!pw) return;
    err = msg = '';
    const { error } = await supabase.rpc('admin_set_password', { target: u.id, new_password: pw });
    if (error) err = error.message;
    else msg = t('admin.resetpw.done', { name: u.username });
  }

  async function remove(u: Profile) {
    if (!confirm(t('admin.delete.confirm', { name: u.username }))) return;
    err = msg = '';
    const { error } = await supabase.rpc('admin_delete_user', { target: u.id });
    if (error) err = error.message;
    await load();
  }

  // ---- Import ----
  let bundle = $state<LegacyBundle | null>(null);
  let pickErr = $state('');
  let importing = $state(false);
  let logLines = $state<string[]>([]);
  const summary = $derived(bundle ? summarize(bundle) : null);

  async function pick(e: Event) {
    pickErr = '';
    logLines = [];
    const files = (e.target as HTMLInputElement).files;
    bundle = files ? await readLegacyFolder(files) : null;
    if (!bundle) pickErr = t('admin.import.missing');
  }

  async function doImport() {
    if (!bundle || !auth.profile) return;
    importing = true;
    logLines = [];
    try {
      await runImport(bundle, auth.profile.id, (m) => {
        if (m.startsWith('  map ') && logLines.at(-1)?.startsWith('  map ')) logLines[logLines.length - 1] = m;
        else logLines.push(m);
      });
      logLines.push('✅ ' + t('admin.import.done'));
    } catch (e: any) {
      logLines.push('❌ ' + t('common.error', { msg: e?.message ?? String(e) }));
    }
    importing = false;
  }

  const fmtDate = (s: string) => new Date(s).toLocaleDateString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
  const roles: Role[] = ['pending', 'reader', 'admin'];
</script>

{#if !isAdmin()}
  <p class="muted">—</p>
{:else}
  <h1>🔑 {t('nav.admin')}</h1>

  <section class="card">
    <h2>{t('admin.users')}</h2>
    {#if msg}<p class="success">{msg}</p>{/if}
    {#if err}<p class="error">{t('common.error', { msg: err })}</p>{/if}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>{t('admin.user')}</th>
            <th>{t('admin.role')}</th>
            <th>{t('admin.color')}</th>
            <th>{t('admin.since')}</th>
            <th>{t('admin.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each users as u (u.id)}
            {@const me = u.id === auth.profile?.id}
            <tr class:pending={u.role === 'pending'}>
              <td>
                <span class="dot" style:color={u.color} style:background={u.color}></span>
                <strong>{u.username}</strong>
                {#if me}<span class="muted">{t('admin.you')}</span>{/if}
              </td>
              <td>
                <select value={u.role} disabled={me}
                  onchange={(e) => update(u, { role: (e.target as HTMLSelectElement).value as Role })}>
                  {#each roles as r}<option value={r}>{t(`role.${r}` as Key)}</option>{/each}
                </select>
              </td>
              <td>
                <input type="color" value={u.color}
                  onchange={(e) => update(u, { color: (e.target as HTMLInputElement).value })} />
              </td>
              <td class="muted">{fmtDate(u.created_at)}</td>
              <td class="row">
                <button class="small" onclick={() => resetPassword(u)}>🔁 {t('admin.resetpw')}</button>
                {#if !me}<button class="small danger" onclick={() => remove(u)}>🗑 {t('admin.delete')}</button>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>📦 {t('admin.import')}</h2>
    <p class="muted">{t('admin.import.text')}</p>
    <div class="row">
      <label class="btn picker">
        📁 {t('admin.import.pick')}
        <input type="file" webkitdirectory multiple onchange={pick} hidden />
      </label>
      {#if bundle}
        <button class="primary" onclick={doImport} disabled={importing}>⬆ {t('admin.import.run')}</button>
      {/if}
    </div>
    {#if pickErr}<p class="error">{pickErr}</p>{/if}
    {#if summary}<p>{t('admin.import.found', summary)}</p>{/if}
    {#if logLines.length}<pre class="log">{logLines.join('\n')}</pre>{/if}
  </section>
{/if}

<style>
  section { margin-bottom: 1.5rem; }
  .scroll { overflow-x: auto; }
  td select { width: auto; min-width: 8rem; }
  tr.pending td { background: rgba(224, 169, 109, 0.08); }
  .picker { margin: 0; cursor: pointer; }
  .log {
    background: var(--wood-0); border: 1px solid var(--gold-dim); border-radius: 8px;
    padding: 0.8rem; max-height: 300px; overflow: auto; font-size: 0.85rem; white-space: pre-wrap;
  }
</style>
