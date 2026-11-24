-- ============================================================================
-- Noita Kirja — 002 merge duplicate elements
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================

-- Replace every use of p_from by p_into (ingredients and results), then delete p_from.
-- If a mixture becomes identical to an existing one, the duplicate is dropped.
create or replace function public.merge_elements(p_from uuid, p_into uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  new_ing uuid[];
  changed int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_from = p_into then raise exception 'cannot merge an element into itself'; end if;
  if not exists (select 1 from public.elements where id = p_into) then raise exception 'target not found'; end if;

  for r in select id, ingredients from public.mixtures where p_from = any (ingredients) loop
    new_ing := array(select x from unnest(array_replace(r.ingredients, p_from, p_into)) as x order by x);
    if exists (select 1 from public.mixtures where ingredients = new_ing and id <> r.id) then
      delete from public.mixtures where id = r.id;
    else
      update public.mixtures set ingredients = new_ing where id = r.id;
    end if;
    changed := changed + 1;
  end loop;

  update public.mixtures set result_id = p_into where result_id = p_from;
  delete from public.elements where id = p_from;
  return changed;
end $$;

revoke execute on function public.merge_elements(uuid, uuid) from public, anon;
grant execute on function public.merge_elements(uuid, uuid) to authenticated;
