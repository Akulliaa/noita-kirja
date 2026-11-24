<script lang="ts">
  import { login, signup } from '../lib/auth.svelte';
  import { t } from '../lib/i18n.svelte';
  import { APP_NAME, USERNAME_RE } from '../lib/config';
  import Logo from '../components/Logo.svelte';
  import LangToggle from '../components/LangToggle.svelte';
  import Embers from '../components/Embers.svelte';

  let mode = $state<'login' | 'signup'>('login');
  let username = $state('');
  let password = $state('');
  let password2 = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!USERNAME_RE.test(username.trim())) return (error = t('auth.err.username'));
    if (password.length < 8) return (error = t('auth.err.password'));
    if (mode === 'signup' && password !== password2) return (error = t('auth.err.mismatch'));

    busy = true;
    const { error: err } = mode === 'login' ? await login(username, password) : await signup(username, password);
    busy = false;
    if (!err) return;
    const msg = err.message.toLowerCase();
    if (msg.includes('invalid login')) error = t('auth.err.credentials');
    else if (msg.includes('already registered') || msg.includes('database error')) error = t('auth.err.taken');
    else error = t('auth.err.generic', { msg: err.message });
  }
</script>

<Embers density={110} />
<div class="wrap">
  <div class="top"><LangToggle /></div>
  <div class="panel parchment">
    <div class="head">
      <Logo size={84} />
      <h1>{APP_NAME}</h1>
      <p>{t('app.tagline')}</p>
    </div>

    <div class="tabs">
      <button class:active={mode === 'login'} onclick={() => { mode = 'login'; error = ''; }}>{t('auth.login')}</button>
      <button class:active={mode === 'signup'} onclick={() => { mode = 'signup'; error = ''; }}>{t('auth.signup')}</button>
    </div>

    <form onsubmit={submit}>
      <label for="u">{t('auth.username')}</label>
      <input id="u" bind:value={username} autocomplete="username" maxlength="20" required />

      <label for="p">{t('auth.password')}</label>
      <input id="p" type="password" bind:value={password}
        autocomplete={mode === 'login' ? 'current-password' : 'new-password'} required />

      {#if mode === 'signup'}
        <label for="p2">{t('auth.password2')}</label>
        <input id="p2" type="password" bind:value={password2} autocomplete="new-password" required />
      {/if}

      {#if error}<p class="err">{error}</p>{/if}

      <button class="primary submit" type="submit" disabled={busy}>
        {mode === 'login' ? t('auth.submit.login') : t('auth.submit.signup')}
      </button>
      <p class="hint">{mode === 'signup' ? t('auth.hint') : t('auth.forgot')}</p>
    </form>
  </div>
</div>

<style>
  .wrap { position: relative; z-index: 2; min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
  .top { position: fixed; top: 0.8rem; right: 0.8rem; z-index: 3; }
  .panel { width: min(420px, 100%); padding: 2rem; }
  .head { text-align: center; margin-bottom: 1.2rem; }
  .head h1 { color: var(--ink); margin: 0.5rem 0 0.2rem; font-size: 2.4rem; text-shadow: 2px 2px 0 rgba(255, 255, 255, 0.4); }
  .head p { margin: 0; color: var(--ink-soft); font-style: italic; }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-bottom: 0.4rem; }
  .tabs button {
    justify-content: center; background-color: rgba(90, 65, 40, 0.12); color: var(--ink-soft); border-image-source: var(--px-ink);
    box-shadow: none; font-size: 0.95rem; padding: 0.45rem 0.3rem;
  }
  .tabs button:hover { background-color: rgba(90, 65, 40, 0.22); color: var(--ink); border-image-source: var(--px-ink); }
  .tabs button.active { background-color: var(--ink); color: var(--gold-bright); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.4); }
  input { background-color: #f6ecd2; color: var(--ink); border-image-source: var(--px-ink); box-shadow: inset 0 3px 0 rgba(90, 65, 40, 0.18); }
  input:focus { border-image-source: var(--px-ink); box-shadow: inset 0 3px 0 rgba(90, 65, 40, 0.18), 0 0 0 3px rgba(90, 65, 40, 0.2); }
  .submit { width: 100%; justify-content: center; margin-top: 1.2rem; padding: 0.7rem; }
  .err { color: #8f2a18; font-weight: 700; margin: 0.8rem 0 0; }
  .hint { color: var(--ink-soft); font-size: 0.9rem; text-align: center; margin: 0.8rem 0 0; }
</style>
