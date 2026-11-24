<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { auth } from '../lib/auth.svelte';
  import { t, i18n } from '../lib/i18n.svelte';
  import { positions, startPositions, ageSeconds } from '../lib/positions.svelte';
  import { buildModZip, download } from '../lib/trackerMod';

  startPositions();

  let keyDate = $state<string | null>(null);
  let radius = $state(200);
  let busy = $state(false);
  let err = $state('');
  let done = $state(false);

  onMount(async () => {
    const { data } = await supabase.rpc('tracker_key_created_at');
    keyDate = (data as string | null) ?? null;
  });

  const me = $derived(auth.profile?.id ?? '');
  const age = $derived((positions.now, positions.items[me], ageSeconds(me)));
  const myPos = $derived(positions.items[me]);

  async function make() {
    if (keyDate && !confirm(t('trk.replaceConfirm'))) return;
    busy = true; err = ''; done = false;
    const { data, error } = await supabase.rpc('create_tracker_key');
    busy = false;
    if (error || !data) return (err = t('common.error', { msg: error?.message ?? '?' }));
    download(buildModZip(data as string, radius), 'noita_kirja_tracker.zip');
    keyDate = new Date().toISOString();
    done = true;
  }

  function ago(s: number) {
    if (s < 60) return t('trk.secondsAgo', { n: Math.round(s) });
    if (s < 3600) return t('trk.minutesAgo', { n: Math.round(s / 60) });
    if (s < 86400) return t('trk.hoursAgo', { n: Math.round(s / 3600) });
    return new Date(Date.now() - s * 1000).toLocaleDateString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB');
  }
</script>

<h1>🎮 {t('nav.tracker')}</h1>
<p class="muted">{t('trk.intro')}</p>

<section class="card status" class:live={age !== null && age < 120}>
  <h2>📡 {t('trk.status')}</h2>
  {#if age === null}
    <p>⚪ {t('trk.never')}</p>
  {:else if age < 120}
    <p>🟢 <strong>{t('trk.live')}</strong> — {t('trk.lastSignal', { when: ago(age) })}</p>
  {:else}
    <p>⚫ {t('trk.lastSignal', { when: ago(age) })}</p>
  {/if}
  {#if myPos}
    <a class="btn small" href={`#/map?player=${me}&x=${Math.round(myPos.x)}&y=${Math.round(myPos.y)}`}>🗺️ {t('trk.seeOnMap')}</a>
  {/if}
</section>

<section class="card">
  <h2>1. {t('trk.step1')}</h2>
  <p>{t('trk.step1text')}</p>
  <div class="row">
    <label for="rad" class="inline">{t('trk.radius')}</label>
    <select id="rad" bind:value={radius}>
      <option value={150}>{t('trk.radius.small')}</option>
      <option value={200}>{t('trk.radius.normal')}</option>
      <option value={300}>{t('trk.radius.large')}</option>
    </select>
    <button class="primary" onclick={make} disabled={busy}>⬇ {t('trk.download')}</button>
  </div>
  {#if keyDate}<p class="muted small">{t('trk.keyExists', { date: new Date(keyDate).toLocaleString(i18n.lang === 'fr' ? 'fr-FR' : 'en-GB') })}</p>{/if}
  {#if done}<p class="success">✔ {t('trk.downloaded')}</p>{/if}
  {#if err}<p class="error">{err}</p>{/if}
  <p class="muted small">🔒 {t('trk.secret')}</p>
</section>

<section class="card">
  <h2>2. {t('trk.step2')}</h2>
  <ol>
    <li>{t('trk.step2a')}</li>
    <li>{t('trk.step2b')} <code>noita_kirja_tracker</code> → <code>…\Noita\mods\noita_kirja_tracker\</code></li>
  </ol>
  <p class="muted small">{t('trk.step2hint')}</p>
</section>

<section class="card">
  <h2>3. {t('trk.step3')}</h2>
  <ol>
    <li>{t('trk.step3a')}</li>
    <li>{t('trk.step3b')}</li>
    <li>{t('trk.step3c')}</li>
  </ol>
</section>

<section class="card">
  <h2>❓ {t('trk.help')}</h2>
  <ul>
    <li>{t('trk.help1')}</li>
    <li>{t('trk.help2')}</li>
    <li>{t('trk.help3')}</li>
    <li>{t('trk.help4')}</li>
  </ul>
</section>

<style>
  section { margin-top: 1rem; }
  .status.live { border-color: #6f9a4a; box-shadow: var(--shadow), 0 0 18px rgba(111, 154, 74, 0.35); }
  .inline { display: inline; margin: 0; }
  select { width: auto; }
  .small { font-size: 0.88rem; }
  li { margin: 0.35rem 0; }
  code { background: rgba(0, 0, 0, 0.35); padding: 0.1em 0.35em; border-radius: 4px; }
</style>
