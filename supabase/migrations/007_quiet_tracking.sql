-- 007: lighter tracking, so the mod can send every second.
-- Map chunks are only rewritten when something new is revealed, and the live
-- position is only rewritten when it moved (or every 25 s as a heartbeat).
-- Fewer writes = fewer Realtime messages (free tier quota). Safe to run again.

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
