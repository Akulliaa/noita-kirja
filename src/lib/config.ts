// Public values: safe to ship in the website. Data is protected by Row Level Security.
export const APP_NAME = 'Noita Kirja';
export const SUPABASE_URL = 'https://oqbsfukzpfhnmnnfsmdj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_1s5aTBk-o4j4ev88QR0xGQ_HRGzN0I3';

// Accounts are username-only. Supabase needs an email-shaped login, so we derive
// one that is never shown and never receives mail.
export const LOGIN_DOMAIN = 'users.noita-kirja.invalid';
export const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
