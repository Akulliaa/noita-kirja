-- ============================================================================
-- Noita Kirja — 006 Rosetta Stone: map position for in-game runic texts
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================

alter table public.glyphs add column if not exists loc_x double precision;
alter table public.glyphs add column if not exists loc_y double precision;

do $$ begin
  alter table public.glyphs add constraint glyphs_loc_both check ((loc_x is null) = (loc_y is null));
exception when duplicate_object then null; end $$;
