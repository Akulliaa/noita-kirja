-- 008: personal preferences (e.g. which players are hidden on the global map).
-- Private: each user can only read and write their own row. Safe to run again.

create table if not exists public.user_prefs (
  user_id     uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  prefs       jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and length(prefs::text) < 20000),
  updated_at  timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

drop policy if exists "user_prefs: own row" on public.user_prefs;
create policy "user_prefs: own row" on public.user_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_prefs to authenticated;
