-- ============================================================================
-- Noita Kirja — 003 note history (keep every previous version of a note)
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================

create table if not exists public.note_history (
  id         bigint generated always as identity primary key,
  note_id    uuid not null references public.notes (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  status     text not null,
  tags       text[] not null default '{}',
  edited_by  uuid references public.profiles (id) on delete set null,
  edited_at  timestamptz not null
);
create index if not exists note_history_note_idx on public.note_history (note_id, edited_at desc);

-- Before a note changes, save the previous version (only if the content changed).
create or replace function public.notes_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.title, old.body, old.status, old.tags, old.kind) is distinct from
     (new.title, new.body, new.status, new.tags, new.kind) then
    insert into public.note_history (note_id, kind, title, body, status, tags, edited_by, edited_at)
    values (old.id, old.kind, old.title, old.body, old.status, old.tags, old.updated_by, old.updated_at);
  end if;
  return new;
end $$;

drop trigger if exists notes_history on public.notes;
create trigger notes_history before update on public.notes
  for each row execute function public.notes_history();

alter table public.note_history enable row level security;
drop policy if exists "note_history: members read" on public.note_history;
create policy "note_history: members read" on public.note_history
  for select to authenticated using (public.is_member());
drop policy if exists "note_history: admins delete" on public.note_history;
create policy "note_history: admins delete" on public.note_history
  for delete to authenticated using (public.is_admin());
revoke all on public.note_history from anon;
