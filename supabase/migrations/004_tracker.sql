-- ============================================================================
-- Noita Kirja — 004 live tracking from the game (tracker mod)
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================

-- One secret key per player. Only its SHA-256 hash is stored.
create table if not exists public.tracker_keys (
  player_id   uuid primary key references public.profiles (id) on delete cascade,
  key_hash    text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.tracker_keys enable row level security; -- no policy: only functions below touch it
revoke all on public.tracker_keys from anon, authenticated;

-- Last known position of each player (live dot on the map).
create table if not exists public.player_positions (
  player_id   uuid primary key references public.profiles (id) on delete cascade,
  x           double precision not null,
  y           double precision not null,
  updated_at  timestamptz not null default now()
);
alter table public.player_positions enable row level security;
drop policy if exists "player_positions: members read" on public.player_positions;
create policy "player_positions: members read" on public.player_positions
  for select to authenticated using (public.is_member());
revoke all on public.player_positions from anon;

do $$ begin
  alter publication supabase_realtime add table public.player_positions;
exception when duplicate_object then null; end $$;

-- Create (or replace) the caller's tracker key. Returns the plain key once.
create or replace function public.create_tracker_key() returns text
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not public.is_member() then raise exception 'forbidden'; end if;
  k := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.tracker_keys (player_id, key_hash)
  values ((select auth.uid()), encode(extensions.digest(k, 'sha256'), 'hex'))
  on conflict (player_id) do update set key_hash = excluded.key_hash, created_at = now();
  return k;
end $$;

create or replace function public.tracker_key_created_at() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select created_at from public.tracker_keys where player_id = (select auth.uid());
$$;

revoke execute on function public.create_tracker_key() from public, anon;
revoke execute on function public.tracker_key_created_at() from public, anon;
grant execute on function public.create_tracker_key() to authenticated;
grant execute on function public.tracker_key_created_at() to authenticated;

-- Called by the game mod (no login, the key identifies the player).
-- p_points = [[x, y], [x, y], ...] in world coordinates, most recent last.
-- Reveals a circle of p_radius world px around every point (same grid as fog_apply).
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
  k text; idx int; m bytea; cur bytea; i int;
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
      for i in 0 .. 511 loop
        cur := set_byte(cur, i, get_byte(cur, i) | get_byte(m, i));
      end loop;
    end if;
    insert into public.fog_chunks (player_id, cx, cy, bits, updated_at)
    values (pid, vcx, vcy, cur, now())
    on conflict (player_id, cx, cy) do update set bits = excluded.bits, updated_at = now();
  end loop;

  -- live position = last point
  px := (p_points -> -1 ->> 0)::double precision;
  py := (p_points -> -1 ->> 1)::double precision;
  if px is not null and py is not null then
    insert into public.player_positions (player_id, x, y, updated_at) values (pid, px, py, now())
    on conflict (player_id) do update set x = excluded.x, y = excluded.y, updated_at = now();
  end if;
  return coalesce(array_length(keys, 1), 0);
end $$;

revoke execute on function public.track(text, jsonb, int) from public;
grant execute on function public.track(text, jsonb, int) to anon, authenticated;
