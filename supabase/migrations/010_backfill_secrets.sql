-- 010: one-time catch-up for secret titles (run after 009).
-- Gives every player the secret areas already revealed on their explored map, so trips
-- made before 009 count too. Note: the map can't tell tracker trips from areas painted
-- by hand, so painted areas count as well. Safe to run again (adds only what's missing).

do $$
declare
  cell constant int := 32;   -- world px per fog cell
  csize constant int := 64;  -- cells per chunk side
  z record; c record;
  gx0 int; gy0 int; gx1 int; gy1 int;   -- zone, in cells
  ax0 int; ay0 int; ax1 int; ay1 int;   -- zone ∩ chunk, in cells
  gx int; gy int;
  hit boolean;
  added int := 0;
begin
  for z in select * from public.secret_zones loop
    -- The tracker reveals ~200 px around the player, so shrink the zone by that much:
    -- a revealed cell in the shrunk zone means the player really stood inside it.
    gx0 := floor((z.x0 + 192) / cell)::int; gx1 := floor((z.x1 - 192) / cell)::int;
    gy0 := floor((z.y0 + 192) / cell)::int; gy1 := floor((z.y1 - 192) / cell)::int;
    if gx0 > gx1 then gx0 := floor((z.x0 + z.x1) / 2 / cell)::int; gx1 := gx0; end if;
    if gy0 > gy1 then gy0 := floor((z.y0 + z.y1) / 2 / cell)::int; gy1 := gy0; end if;

    for c in
      select f.player_id, f.cx, f.cy, f.bits from public.fog_chunks f
       where f.cx between floor(gx0::numeric / csize)::int and floor(gx1::numeric / csize)::int
         and f.cy between floor(gy0::numeric / csize)::int and floor(gy1::numeric / csize)::int
         and not exists (select 1 from public.player_secrets s where s.player_id = f.player_id and s.zone_id = z.id)
    loop
      ax0 := greatest(gx0, c.cx * csize); ax1 := least(gx1, c.cx * csize + csize - 1);
      ay0 := greatest(gy0, c.cy * csize); ay1 := least(gy1, c.cy * csize + csize - 1);
      hit := false;
      if ax0 = c.cx * csize and ax1 = c.cx * csize + csize - 1 and ay0 = c.cy * csize and ay1 = c.cy * csize + csize - 1 then
        -- chunk entirely inside the zone: any revealed cell will do
        hit := c.bits <> ('\x' || repeat('00', 512))::bytea;
      else
        <<cells>>
        for gy in ay0 .. ay1 loop
          for gx in ax0 .. ax1 loop
            if get_bit(c.bits, (gy - c.cy * csize) * csize + (gx - c.cx * csize)) = 1 then
              hit := true; exit cells;
            end if;
          end loop;
        end loop;
      end if;
      if hit then
        insert into public.player_secrets (player_id, zone_id) values (c.player_id, z.id) on conflict do nothing;
        added := added + 1;
      end if;
    end loop;
  end loop;
  raise notice 'secret areas added: %', added;
end $$;
