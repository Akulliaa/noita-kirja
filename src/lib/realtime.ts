// Realtime channels that survive network drops, sleeping PCs and background tabs.
//
// Supabase Realtime can silently die (Firefox throttles background tabs, wifi blips,
// laptop sleep...). Every channel made here:
//  - re-subscribes by itself after an error / timeout / close (with backoff),
//  - resyncs its data when the connection comes back, when the tab becomes visible
//    again, when the network returns, and optionally on a regular poll.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface Opts {
  /** Called to fetch fresh data (missed events). */
  resync: () => void | Promise<void>;
  /** Also resync every N ms while the tab is visible (cheap safety net). */
  pollMs?: number;
}

const all: { kick: () => void }[] = [];
let globalHooks = false;

function installGlobalHooks() {
  if (globalHooks || typeof window === 'undefined') return;
  globalHooks = true;
  const kickAll = () => all.forEach((c) => c.kick());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kickAll(); });
  window.addEventListener('online', kickAll);
  window.addEventListener('focus', kickAll);
  window.addEventListener('pageshow', kickAll);
}

export function liveChannel(name: string, build: (ch: RealtimeChannel) => RealtimeChannel, opts: Opts) {
  let ch: RealtimeChannel | null = null;
  let gen = 0;
  let tries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSync = 0;
  let joinedOnce = false;

  const resync = () => {
    lastSync = Date.now();
    Promise.resolve(opts.resync()).catch(() => {});
  };

  function connect() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    const my = ++gen;
    const old = ch;
    ch = null;
    if (old) supabase.removeChannel(old).catch(() => {});
    ch = build(supabase.channel(`${name}-${my}`)).subscribe((status) => {
      if (my !== gen) return; // an older channel we already replaced
      if (status === 'SUBSCRIBED') {
        tries = 0;
        // After a (re)connection, fetch anything missed meanwhile.
        if (joinedOnce) resync();
        joinedOnce = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        scheduleRetry();
      }
    });
  }

  function scheduleRetry() {
    if (retryTimer) return;
    const delay = Math.min(60_000, 2_000 * 2 ** tries++);
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
  }

  /** Tab visible again / network back: make sure we are connected and up to date. */
  function kick() {
    const state = ch?.state;
    if (state !== 'joined' && state !== 'joining') { tries = 0; connect(); }
    if (Date.now() - lastSync > 5_000) resync();
  }

  installGlobalHooks();
  all.push({ kick });
  connect();
  if (opts.pollMs) {
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const state = ch?.state;
      if (state !== 'joined' && state !== 'joining') connect();
      if (Date.now() - lastSync >= opts.pollMs! - 500) resync();
    }, opts.pollMs);
  }
}
