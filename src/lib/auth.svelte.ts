import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { usernameToEmail } from './config';
import type { Profile } from './types';

export const auth = $state<{ ready: boolean; session: Session | null; profile: Profile | null }>({
  ready: false,
  session: null,
  profile: null,
});

export const isAdmin = () => auth.profile?.role === 'admin';
export const isMember = () => auth.profile?.role === 'admin' || auth.profile?.role === 'reader';

export async function loadProfile() {
  const uid = auth.session?.user.id;
  if (!uid) { auth.profile = null; return; }
  const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  auth.profile = (data as Profile) ?? null;
}

export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  auth.session = data.session;
  await loadProfile();
  auth.ready = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    const changed = session?.user.id !== auth.session?.user.id;
    auth.session = session;
    // Never await Supabase calls inside this callback (it would deadlock the client).
    if (changed) setTimeout(loadProfile, 0);
  });
}

export async function login(username: string, password: string) {
  return supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
}

export async function signup(username: string, password: string) {
  return supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });
}

export async function logout() {
  await supabase.auth.signOut();
  auth.profile = null;
}
