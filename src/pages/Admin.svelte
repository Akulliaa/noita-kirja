<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { auth, isAdmin } from '../lib/auth.svelte';
  import { t, i18n, type Key } from '../lib/i18n.svelte';
  import type { Profile, Role } from '../lib/types';
  import { readLegacyElements, importElements } from '../lib/legacyImport';
  import { translateMissing } from '../lib/translateAll';
  import { buildBackup } from '../lib/backup';
  import { download } from '../lib/trackerMod';

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

  // ---- Import (elements only) ----
  let names = $state<string[] | null>(null);
  let pickErr = $state('');
  let importing = $state(false);
  let result = $state('');

  async function pick(e: Event) {
    pickErr = result = '';
    const f = (e.target as HTMLInputElement).files?.[0];
    names = f ? await readLegacyElements(f) : null;
    if (!names) pickErr = t('admin.import.missing');
  }

  async function doImport() {
    if (!names) return;
    importing = true;
    try {
      const n = await importElements(names);
      result = '✅ ' + t('admin.import.done', { n });
    } catch (e: any) {
      result = '❌ ' + t('common.error', { msg: e?.message ?? String(e) });
    }
    importing = false;
  }

  // ---- Translate missing ----
  let trRunning = $state(false);
  let trStop = false;
  let trLog = $state<string[]>([]);
  async function runTranslate() {
    trRunning = true; trStop = false; trLog = [];
    const r = await translateMissing((m) => trLog.push(m), () => trStop);
    trLog.push(t('admin.tr.done', { done: r.done, failed: r.failed }));
    trRunning = false;
  }

  // ---- Backup ----
  let bkRunning = $state(false);
  let bkLog = $state<string[]>([]);
  async function runBackup() {
    bkRunning = true; bkLog = [];
    try {
      const zip = await buildBackup((m) => bkLog.push(m));
      download(zip, `noita-kirja-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      bkLog.push('✅ ' + t('admin.bk.done'));
    } catch (e: any) {
      bkLog.push('❌ ' + (e?.message ?? e));
    }
    bkRunning = false;
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
    <h2>🌐 {t('admin.tr.title')}</h2>
    <p class="muted">{t('admin.tr.text')}</p>
    <div class="row">
      <button class="primary" onclick={runTranslate} disabled={trRunning}>{trRunning ? '⏳' : '🌐'} {t('admin.tr.run')}</button>
      {#if trRunning}<button onclick={() => (trStop = true)}>⏹ {t('admin.tr.stop')}</button>{/if}
    </div>
    {#if trLog.length}<pre class="log">{trLog.join('\n')}</pre>{/if}
  </section>

  <section class="card">
    <h2>💾 {t('admin.bk.title')}</h2>
    <p class="muted">{t('admin.bk.text')}</p>
    <button class="primary" onclick={runBackup} disabled={bkRunning}>{bkRunning ? '⏳' : '⬇'} {t('admin.bk.run')}</button>
    {#if bkLog.length}<pre class="log">{bkLog.join('\n')}</pre>{/if}
  </section>

  <section class="card">
    <h2>📦 {t('admin.import')}</h2>
    <p class="muted">{t('admin.import.text')}</p>
    <div class="row">
      <label class="btn picker">
        📄 {t('admin.import.pick')}
        <input type="file" accept=".json,application/json" onchange={pick} hidden />
      </label>
      {#if names}
        <button class="primary" onclick={doImport} disabled={importing}>⬆ {t('admin.import.run')}</button>
      {/if}
    </div>
    {#if pickErr}<p class="error">{pickErr}</p>{/if}
    {#if names}
      <p>{t('admin.import.found', { n: names.length })}</p>
      <div class="chips">{#each names as n}<span class="chip">{n}</span>{/each}</div>
    {/if}
    {#if result}<p>{result}</p>{/if}
  </section>
{/if}

<style>
  section { margin-bottom: 1.5rem; }
  .scroll { overflow-x: auto; }
  td select { width: auto; min-width: 8rem; }
  tr.pending td { background: rgba(224, 169, 109, 0.08); }
  .picker { margin: 0; cursor: pointer; }
  .log {
    background: var(--wood-0); border: 1px solid var(--gold-dim); border-radius: 2px;
    padding: 0.8rem; max-height: 260px; overflow: auto; font-size: 0.85rem; white-space: pre-wrap; margin-top: 0.8rem;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; max-height: 220px; overflow: auto; margin: 0.5rem 0; }
  .chip { padding: 0.1rem 0.55rem; border-radius: 2px; border: 1px solid var(--gold-dim); font-size: 0.85rem; }
</style>
