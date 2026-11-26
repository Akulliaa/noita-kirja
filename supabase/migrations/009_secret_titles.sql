-- 009: hidden secret titles. Unlocked by the server when the tracker mod reports the
-- player inside a secret area of the game (never by painting the map by hand).
-- The areas and titles are stored encoded below so nobody gets spoiled reading this
-- file, and clients can never read them: only titles somebody has unlocked are shown.
-- Safe to run again.

create table if not exists public.secret_groups (
  id     text primary key,
  icon   text not null,
  tiers  jsonb not null            -- [{n, fr, en}]: zones of the group needed per level
);
create table if not exists public.secret_zones (
  id   int primary key,
  grp  text not null references public.secret_groups (id) on delete cascade,
  x0 double precision not null, y0 double precision not null,
  x1 double precision not null, y1 double precision not null
);
create table if not exists public.player_secrets (
  player_id  uuid not null references public.profiles (id) on delete cascade,
  zone_id    int not null references public.secret_zones (id) on delete cascade,
  found_at   timestamptz not null default now(),
  primary key (player_id, zone_id)
);

alter table public.secret_groups enable row level security;
alter table public.secret_zones enable row level security;
alter table public.player_secrets enable row level security;
revoke all on public.secret_groups, public.secret_zones from public, anon, authenticated;
revoke all on public.player_secrets from public, anon;
grant select on public.player_secrets to authenticated;
drop policy if exists "player_secrets: members read" on public.player_secrets;
create policy "player_secrets: members read" on public.player_secrets
  for select to authenticated using (public.is_member());

do $$ begin
  alter publication supabase_realtime add table public.player_secrets;
exception when duplicate_object then null; end $$;

do $$
declare d jsonb := convert_from(decode(
'eyJncm91cHMiOlt7ImlkIjoib3JicyIsImljb24iOiLwn5SuIiwidGllcnMiOlt7Im4iOjEsImZyIjoiUG9ydGV1ciBkJ8OpY2xhdCIsImVuIjoiU2hhcmQgYmVhcmVyIn0seyJuIjo1LCJmciI6IkNoYXNzZXVyIGQnb3JiZXMiLCJlbiI6Ik9yYiBodW50ZXIifSx7Im4iOjExLCJmciI6IkdhcmRpZW4gZGVzIG9yYmVzIiwiZW4iOiJLZWVwZXIgb2YgdGhlIG9yYnMifV19LHsiaWQiOiJ0ZW1wbGVzIiwiaWNvbiI6IvCfj5vvuI8iLCJ0aWVycyI6W3sibiI6MSwiZnIiOiJQw6hsZXJpbiBkZXMgbnXDqWVzIiwiZW4iOiJDbG91ZCBwaWxncmltIn0seyJuIjo0LCJmciI6IlByw6p0cmUgZGVzIGNpZXV4IiwiZW4iOiJTa3kgcHJpZXN0In1dfSx7ImlkIjoiZXllcyIsImljb24iOiLwn5GB77iPIiwidGllcnMiOlt7Im4iOjEsImZyIjoiQ2VsdWkgcXVpIHZvaXQiLCJlbiI6IlRoZSBzZWVyIn0seyJuIjozLCJmciI6IsWSaWwgZGUgbCdhYsOubWUiLCJlbiI6IkV5ZSBvZiB0aGUgYWJ5c3MifV19LHsiaWQiOiJmdW5nYWwiLCJpY29uIjoi8J+NhCIsInRpZXJzIjpbeyJuIjoxLCJmciI6Ik15Y29waGlsZSIsImVuIjoiTXljb3BoaWxlIn0seyJuIjo1LCJmciI6IlByb3Bow6h0ZSBmb25naXF1ZSIsImVuIjoiRnVuZ2FsIHByb3BoZXQifV19LHsiaWQiOiJnZW1zIiwiaWNvbiI6IvCfko4iLCJ0aWVycyI6W3sibiI6MSwiZnIiOiJUYWlsbGV1ciBkZSBnZW1tZXMiLCJlbiI6IkdlbSBjdXR0ZXIifSx7Im4iOjQsImZyIjoiSm9haWxsaWVyIG9jY3VsdGUiLCJlbiI6Ik9jY3VsdCBqZXdlbGxlciJ9XX0seyJpZCI6ImxhaXJzIiwiaWNvbiI6IuKalO+4jyIsInRpZXJzIjpbeyJuIjoxLCJmciI6IkludHJ1cyBkZXMgYW50cmVzIiwiZW4iOiJMYWlyIGludHJ1ZGVyIn0seyJuIjo1LCJmciI6IlByb3ZvY2F0ZXVyIiwiZW4iOiJDaGFsbGVuZ2VyIn0seyJuIjoxMCwiZnIiOiJTZWlnbmV1ciBkZXMgYW50cmVzIiwiZW4iOiJMb3JkIG9mIGxhaXJzIn1dfSx7ImlkIjoic2hvcHMiLCJpY29uIjoi8J+bkiIsInRpZXJzIjpbeyJuIjoxLCJmciI6IkNsaWVudCBkZSBsJ2F1LWRlbMOgIiwiZW4iOiJPdGhlcndvcmxkbHkgY3VzdG9tZXIifSx7Im4iOjQsImZyIjoiTWFyY2hhbmQgZGVzIG1vbmRlcyIsImVuIjoiTWVyY2hhbnQgb2Ygd29ybGRzIn1dfSx7ImlkIjoiY29zbW9zIiwiaWNvbiI6IuKYgO+4jyIsInRpZXJzIjpbeyJuIjoxLCJmciI6IlZveWFnZXVyIGPDqWxlc3RlIiwiZW4iOiJDZWxlc3RpYWwgdm95YWdlciJ9LHsibiI6MiwiZnIiOiJNYcOudHJlIGR1IGNpZWwgZXQgZGUgbCdhYsOubWUiLCJlbiI6Ik1hc3RlciBvZiBoZWF2ZW4gYW5kIGFieXNzIn1dfSx7ImlkIjoid29yayIsImljb24iOiLwn4yAIiwidGllcnMiOlt7Im4iOjEsImZyIjoiVMOpbW9pbiBkZSBsJ8WSdXZyZSIsImVuIjoiV2l0bmVzcyBvZiB0aGUgV29yayJ9XX0seyJpZCI6ImVuZCIsImljb24iOiLimb7vuI8iLCJ0aWVycyI6W3sibiI6MSwiZnIiOiJBdSBib3V0IGRlIHRvdXQiLCJlbiI6IkF0IHRoZSBlbmQgb2YgZXZlcnl0aGluZyJ9XX0seyJpZCI6ImdvbGQiLCJpY29uIjoi8J+qmSIsInRpZXJzIjpbeyJuIjoxLCJmciI6IkNoZXJjaGV1ciBkJ29yIiwiZW4iOiJHb2xkIHNlZWtlciJ9LHsibiI6MiwiZnIiOiJNaWRhcyIsImVuIjoiTWlkYXMifV19LHsiaWQiOiJvZGRpdGllcyIsImljb24iOiLwn5ed77iPIiwidGllcnMiOlt7Im4iOjEsImZyIjoiQ3VyaWV1eCIsImVuIjoiQ3VyaW91cyJ9LHsibiI6NiwiZnIiOiJGb3VpbmV1ciIsImVuIjoiU25vb3AifSx7Im4iOjEyLCJmciI6IkdhcmRpZW4gZGVzIG15c3TDqHJlcyIsImVuIjoiS2VlcGVyIG9mIG15c3RlcmllcyJ9XX0seyJpZCI6IndvcmxkcyIsImljb24iOiLwn4yMIiwidGllcnMiOlt7Im4iOjEsImZyIjoiVm95YWdldXIgZGVzIG1vbmRlcyIsImVuIjoiV29ybGR3YWxrZXIifSx7Im4iOjIsImZyIjoiRXJyYW50IGRlcyBkZXV4IHJpdmVzIiwiZW4iOiJXYW5kZXJlciBvZiBib3RoIHNob3JlcyJ9XX1dLCJ6b25lcyI6W1sxLCJvcmJzIiw5NzMzLC0xNDcyLDEwMjMzLC05NzJdLFsyLCJvcmJzIiw1MzAsLTEzMzgsMTAzMCwtODM4XSxbMywib3JicyIsLTEwMjM1LDI2MzMsLTk3MzUsMzEzM10sWzQsIm9yYnMiLDMyMjIsMTYyOSwzNzIyLDIxMjldLFs1LCJvcmJzIiw5NzMyLDI2MzMsMTAyMzIsMzEzM10sWzYsIm9yYnMiLC00NjAzLDM2NjIsLTQxMDMsNDE2Ml0sWzcsIm9yYnMiLC00MDkxLDk4MDIsLTM1OTEsMTAzMDJdLFs4LCJvcmJzIiw0MTAwLDU4Niw0NjAwLDEwODZdLFs5LCJvcmJzIiwtNTA2LDE1OTU4LC02LDE2NDU4XSxbMTAsIm9yYnMiLC05MjEwLDE0NDE2LC04NzEwLDE0OTE2XSxbMTEsIm9yYnMiLDEwMjQ1LDE1OTQ1LDEwNzQ1LDE2NDQ1XSxbMTIsInRlbXBsZXMiLC01ODAzLC01NDU4LC01MTAzLC00NzU4XSxbMTMsInRlbXBsZXMiLC0yMTU2LC01MjMwLC0xNDU2LC00NTMwXSxbMTQsInRlbXBsZXMiLDI0MTAsLTUwMTAsMzExMCwtNDMxMF0sWzE1LCJ0ZW1wbGVzIiw3MDI5LC01MDA1LDc3MjksLTQzMDVdLFsxNiwiZXllcyIsNzExMCwtMTcwLDc2MTAsMzMwXSxbMTcsImV5ZXMiLDM2NDQsNDE1NSw0MTQ0LDQ2NTVdLFsxOCwiZXllcyIsLTQwOTAsNTEyNCwtMzU5MCw1NjI0XSxbMTksImZ1bmdhbCIsMTQ4NTQsMTU5OCwxNTM1NCwyMDk4XSxbMjAsImZ1bmdhbCIsMTI4MDYsOTc5MCwxMzMwNiwxMDI5MF0sWzIxLCJmdW5nYWwiLC0xNTMwLDk3OTAsLTEwMzAsMTAyOTBdLFsyMiwiZnVuZ2FsIiwtMzU3OCwxNTk4LC0zMDc4LDIwOThdLFsyMywiZnVuZ2FsIiw1NjgyLC01MDU4LDYxODIsLTQ1NThdLFsyNCwiZ2VtcyIsMTU4NzcsOTczNiwxNjM3NywxMDIzNl0sWzI1LCJnZW1zIiwxNTg3NiwzMDc4LDE2Mzc2LDM1NzhdLFsyNiwiZ2VtcyIsOTIyMiw0MDgwLDk3MjIsNDU4MF0sWzI3LCJnZW1zIiw5NzM0LDQxMDgsMTAyMzQsNDYwOF0sWzI4LCJsYWlycyIsLTUyNDAsNDUxLC00NDQwLDEyNTFdLFsyOSwibGFpcnMiLDEyMTczLDE0Nzc4LDEyOTczLDE1NTc4XSxbMzAsImxhaXJzIiwtMTE5MTUsMTI3MjMsLTExMTE1LDEzNTIzXSxbMzEsImxhaXJzIiwtMTQ0MjQsOTU5NCwtMTM2MjQsMTAzOTRdLFszMiwibGFpcnMiLDE0NTA0LDE2MDI4LDE1MzA0LDE2ODI4XSxbMzMsImxhaXJzIiwxMzU4NywxMDcyMywxNDM4NywxMTUyM10sWzM0LCJsYWlycyIsNjI2Nyw4MDQ4LDcwNjcsODg0OF0sWzM1LCJsYWlycyIsMzc2NSw0ODksNDU2NSwxMjg5XSxbMzYsImxhaXJzIiwtMTQwNzAsLTI2NiwtMTMyNzAsNTM0XSxbMzcsImxhaXJzIiw5NTg0LC0xMTg2LDEwMzg0LC0zODZdLFszOCwic2hvcHMiLC0zNjIzLDI4MTAwLC0zMDIzLDI4NzAwXSxbMzksInNob3BzIiwzMDEwLDM1Nzg2LDM2MTAsMzYzODZdLFs0MCwic2hvcHMiLC0zNjY0LC0yMTAyMiwtMzA2NCwtMjA0MjJdLFs0MSwic2hvcHMiLDMwMDksLTEzMzI0LDM2MDksLTEyNzI0XSxbNDIsImNvc21vcyIsLTU0MSwtMjY2NDcsMTA1OSwtMjUwNDddLFs0MywiY29zbW9zIiwtNTM5LDM2OTY0LDEwNjEsMzg1NjRdLFs0NCwid29yayIsNTk5NywxNDY3Miw2Nzk3LDE1NDcyXSxbNDUsImVuZCIsLTUxNjIsMTQ4MTAsLTQ1NjIsMTU0MTBdLFs0NiwiZ29sZCIsMTQzOTYsLTQwMzEsMTU3OTYsLTI2MzFdLFs0NywiZ29sZCIsLTE0NzcyLDE1OTE1LC0xMzM3MiwxNzMxNV0sWzQ4LCJvZGRpdGllcyIsLTE2Mzg0LC02NTYyLC0xNTg4NCwtNjA2Ml0sWzQ5LCJvZGRpdGllcyIsLTE0MzIzLC00NCwtMTM4MjMsNDU2XSxbNTAsIm9kZGl0aWVzIiwtMjQ3MSw0OTk3LC0xOTcxLDU0OTddLFs1MSwib2RkaXRpZXMiLC00NTk5LDIwNTMsLTQwOTksMjU1M10sWzUyLCJvZGRpdGllcyIsMzAwMCwyMDU5LDM1MDAsMjU1OV0sWzUzLCJvZGRpdGllcyIsODg0MSwtMjAzMyw5MzQxLC0xNTMzXSxbNTQsIm9kZGl0aWVzIiwtMTYyNiwtNjY1LC0xMTI2LC0xNjVdLFs1NSwib2RkaXRpZXMiLDEyODEwLC0yNDIsMTMzMTAsMjU4XSxbNTYsIm9kZGl0aWVzIiwxMjg3LDU3OTUsMTc4Nyw2Mjk1XSxbNTcsIm9kZGl0aWVzIiwxMzgyNCwtMTA2MCwxNDMyNCwtNTYwXSxbNTgsIm9kZGl0aWVzIiwxMzgzMCw3MjYwLDE0MzMwLDc3NjBdLFs1OSwib2RkaXRpZXMiLC0yMDQ2LDU0NywtMTU0NiwxMDQ3XSxbNjAsIndvcmxkcyIsMTg2MDAsLTYwMDAwLDEyMDAwMCw2MDAwMF0sWzYxLCJ3b3JsZHMiLC0xMjAwMDAsLTYwMDAwLC0xODYwMCw2MDAwMF1dfQ=='
, 'base64'), 'utf8')::jsonb;
begin
  insert into public.secret_groups (id, icon, tiers)
  select g ->> 'id', g ->> 'icon', g -> 'tiers' from jsonb_array_elements(d -> 'groups') g
  on conflict (id) do update set icon = excluded.icon, tiers = excluded.tiers;
  insert into public.secret_zones (id, grp, x0, y0, x1, y1)
  select (z ->> 0)::int, z ->> 1, (z ->> 2)::float8, (z ->> 3)::float8, (z ->> 4)::float8, (z ->> 5)::float8
    from jsonb_array_elements(d -> 'zones') z
  on conflict (id) do update set grp = excluded.grp, x0 = excluded.x0, y0 = excluded.y0, x1 = excluded.x1, y1 = excluded.y1;
end $$;

-- What the team has unlocked: only the titles at least one member found are described.
create or replace function public.secret_titles()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.secret_groups),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'icon', g.icon, 'tiers', g.tiers))
        from public.secret_groups g
       where exists (select 1 from public.player_secrets s join public.secret_zones z on z.id = s.zone_id where z.grp = g.id)
    ), '[]'::jsonb),
    'found', coalesce((
      select jsonb_agg(jsonb_build_object('player', f.player_id, 'grp', f.grp, 'n', f.n, 'at', f.at))
        from (select s.player_id, z.grp, count(*) as n, max(s.found_at) as at
                from public.player_secrets s join public.secret_zones z on z.id = s.zone_id
               group by s.player_id, z.grp) f
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.secret_titles() from public, anon;
grant execute on function public.secret_titles() to authenticated;

create or replace function public.track(p_key text, p_points jsonb, p_radius int default 200)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  r double precision := least(greatest(coalesce(p_radius, 200), 64), 400);
  cell constant int := 32;
  csize constant int := 64;
  pt jsonb;
  px double precision; py double precision;
  gx int; gy int; vcx int; vcy int; bitn int;
  keys text[] := '{}';
  masks bytea[] := '{}';
  k text; idx int; m bytea; cur bytea; prev bytea; i int;
  n int;
begin
  select player_id into pid from public.tracker_keys
   where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex');
  if pid is null then raise exception 'invalid tracker key'; end if;
  if not exists (select 1 from public.profiles where id = pid and role in ('reader', 'admin')) then
    raise exception 'account not approved';
  end if;

  n := coalesce(jsonb_array_length(p_points), 0);
  if n = 0 then return 0; end if;
  if n > 200 then raise exception 'too many points'; end if;

  for pt in select * from jsonb_array_elements(p_points) loop
    px := (pt ->> 0)::double precision;
    py := (pt ->> 1)::double precision;
    if px is null or py is null or abs(px) > 1000000 or abs(py) > 1000000 then continue; end if;
    for gy in floor((py - r) / cell)::int .. floor((py + r) / cell)::int loop
      for gx in floor((px - r) / cell)::int .. floor((px + r) / cell)::int loop
        if ((gx + 0.5) * cell - px) ^ 2 + ((gy + 0.5) * cell - py) ^ 2 > r * r then continue; end if;
        vcx := floor(gx::numeric / csize)::int;
        vcy := floor(gy::numeric / csize)::int;
        k := vcx || ',' || vcy;
        idx := array_position(keys, k);
        if idx is null then
          keys := keys || k;
          masks := masks || ('\x' || repeat('00', 512))::bytea;
          idx := array_length(keys, 1);
        end if;
        bitn := (gy - vcy * csize) * csize + (gx - vcx * csize);
        masks[idx] := set_bit(masks[idx], bitn, 1);
      end loop;
    end loop;
  end loop;

  -- OR every touched chunk into the stored fog
  for idx in 1 .. coalesce(array_length(keys, 1), 0) loop
    vcx := split_part(keys[idx], ',', 1)::int;
    vcy := split_part(keys[idx], ',', 2)::int;
    m := masks[idx];
    select bits into cur from public.fog_chunks where player_id = pid and fog_chunks.cx = vcx and fog_chunks.cy = vcy for update;
    if cur is null then
      cur := m;
    else
      prev := cur;
      for i in 0 .. 511 loop
        if get_byte(m, i) <> 0 then cur := set_byte(cur, i, get_byte(cur, i) | get_byte(m, i)); end if;
      end loop;
      -- nothing new revealed: no write, no realtime message
      if cur = prev then continue; end if;
    end if;
    insert into public.fog_chunks (player_id, cx, cy, bits, updated_at)
    values (pid, vcx, vcy, cur, now())
    on conflict (player_id, cx, cy) do update set bits = excluded.bits, updated_at = now();
  end loop;

  -- secret areas the player walked through (a no-op when nothing new)
  insert into public.player_secrets (player_id, zone_id)
  select distinct pid, z.id
    from jsonb_array_elements(p_points) p
    join public.secret_zones z
      on jsonb_typeof(p -> 0) = 'number' and jsonb_typeof(p -> 1) = 'number'
     and (p ->> 0)::float8 between z.x0 and z.x1
     and (p ->> 1)::float8 between z.y0 and z.y1
  on conflict do nothing;

  -- live position = last point
  px := (p_points -> -1 ->> 0)::double precision;
  py := (p_points -> -1 ->> 1)::double precision;
  if px is not null and py is not null then
    -- skip when standing still, except a heartbeat every 25 s (keeps the "live" dot)
    insert into public.player_positions (player_id, x, y, updated_at) values (pid, px, py, now())
    on conflict (player_id) do update set x = excluded.x, y = excluded.y, updated_at = now()
    where player_positions.x is distinct from excluded.x or player_positions.y is distinct from excluded.y
       or player_positions.updated_at < now() - interval '25 seconds';
  end if;
  return coalesce(array_length(keys, 1), 0);
end $$;

revoke execute on function public.track(text, jsonb, int) from public;
grant execute on function public.track(text, jsonb, int) to anon, authenticated;
