-- ============================================================================
-- Noita Kirja — 005 adding a translation must not count as an edit
-- (keeps "edited by / date" and the activity feed meaningful)
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================

create or replace function public.notes_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.title, old.body, old.status, old.tags, old.kind) is distinct from
     (new.title, new.body, new.status, new.tags, new.kind) then
    new.updated_at := now();
    new.updated_by := coalesce((select auth.uid()), new.updated_by);
  end if;
  return new;
end $$;

create or replace function public.books_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.title, old.content, old.loc_x, old.loc_y, old.loc_label, old.tags, old.found_by) is distinct from
     (new.title, new.content, new.loc_x, new.loc_y, new.loc_label, new.tags, new.found_by) then
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.glyphs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.image_path, old.symbol, old.meaning, old.notes, old.confidence) is distinct from
     (new.image_path, new.symbol, new.meaning, new.notes, new.confidence) then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books
  for each row execute function public.books_touch();
drop trigger if exists glyphs_touch on public.glyphs;
create trigger glyphs_touch before update on public.glyphs
  for each row execute function public.glyphs_touch();

create or replace function public.mixtures_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.ingredients := array(select x from unnest(new.ingredients) as x order by x);
  if tg_op = 'INSERT' or (old.ingredients, old.result_id, old.no_reaction, old.note) is distinct from
     (new.ingredients, new.result_id, new.no_reaction, new.note) then
    new.updated_at := now();
  end if;
  return new;
end $$;
