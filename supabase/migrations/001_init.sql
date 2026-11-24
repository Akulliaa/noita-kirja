-- ============================================================================
-- Noita Kirja — 001 initial schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe model: every table has RLS; readers can only read, admins can write.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('pending', 'reader', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_-]{3,20}$'),
  role        public.user_role not null default 'pending',
  color       text not null default '#c8a44d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  lang        text not null default 'fr' check (lang in ('fr', 'en')),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- Helpers used by every policy (security definer = can read profiles regardless of RLS)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role in ('reader', 'admin'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'admin');
$$;

-- Create a profile for every new account. The very first account becomes admin,
-- everybody else waits for approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  palette text[] := array['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4',
                          '#42d4f4','#f032e6','#bfef45','#fabed4','#469990',
                          '#dcbeff','#9a6324','#fffac8','#aaffc3','#ffd8b1'];
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, username, role, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    case when is_first then 'admin'::public.user_role else 'pending'::public.user_role end,
    palette[1 + floor(random() * array_length(palette, 1))::int]
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins may edit their own color/lang, never their role or username.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    new.role := old.role;
    new.username := old.username;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

alter table public.profiles enable row level security;

drop policy if exists "profiles: members read, self read" on public.profiles;
create policy "profiles: members read, self read" on public.profiles
  for select to authenticated using (public.is_member() or id = (select auth.uid()));

drop policy if exists "profiles: self or admin update" on public.profiles;
create policy "profiles: self or admin update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- Admin tools (no email exists, so admins reset passwords)
create or replace function public.admin_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if length(new_password) < 8 then raise exception 'password too short'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target;
end $$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if target = (select auth.uid()) then raise exception 'cannot delete yourself'; end if;
  delete from auth.users where id = target;
end $$;

revoke execute on function public.admin_set_password(uuid, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Alchemy
-- ---------------------------------------------------------------------------
create table if not exists public.elements (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  name_tr     text,                      -- translation in the other language
  lang        text not null default 'fr' check (lang in ('fr', 'en')),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create unique index if not exists elements_name_lower_key on public.elements (lower(name));

-- A mixture = 2..N ingredients (element ids, kept sorted) → one result, or "no reaction".
create table if not exists public.mixtures (
  id           uuid primary key default gen_random_uuid(),
  ingredients  uuid[] not null check (cardinality(ingredients) >= 2),
  result_id    uuid references public.elements (id) on delete set null,
  no_reaction  boolean not null default false,
  note         text,
  note_tr      text,
  lang         text not null default 'fr' check (lang in ('fr', 'en')),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists mixtures_ingredients_key on public.mixtures (ingredients);
create index if not exists mixtures_ingredients_gin on public.mixtures using gin (ingredients);

create or replace function public.mixtures_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.ingredients := array(select x from unnest(new.ingredients) as x order by x);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists mixtures_normalize on public.mixtures;
create trigger mixtures_normalize before insert or update on public.mixtures
  for each row execute function public.mixtures_normalize();

-- Deleting an element removes the mixtures that use it as an ingredient.
create or replace function public.elements_cascade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.mixtures where old.id = any (ingredients);
  return old;
end $$;

drop trigger if exists elements_cascade on public.elements;
create trigger elements_cascade after delete on public.elements
  for each row execute function public.elements_cascade();

-- ---------------------------------------------------------------------------
-- Notes (quests, theories, misc)
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'quest' check (kind in ('quest', 'theory', 'misc')),
  title       text not null check (length(trim(title)) > 0),
  title_tr    text,
  body        text not null default '',  -- markdown, images as ![](kirja:path)
  body_tr     text,
  lang        text not null default 'fr' check (lang in ('fr', 'en')),
  status      text not null default 'idea'
              check (status in ('idea', 'testing', 'in_progress', 'confirmed', 'wrong', 'done')),
  tags        text[] not null default '{}',
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.notes_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.notes_touch();

-- ---------------------------------------------------------------------------
-- Exploration fog: per player, chunks of 64×64 cells, 1 cell = 32 world px.
-- bits = 512 bytes, row-major, bit i of cell (x,y) = y*64+x, LSB first.
-- ---------------------------------------------------------------------------
create table if not exists public.fog_chunks (
  player_id   uuid not null references public.profiles (id) on delete cascade,
  cx          int not null,
  cy          int not null,
  bits        bytea not null check (length(bits) = 512),
  updated_at  timestamptz not null default now(),
  primary key (player_id, cx, cy)
);

-- Apply many chunk masks at once. chunks = [{"cx":0,"cy":0,"mask":"<hex 1024 chars>"}]
-- hide=false → OR (reveal), hide=true → AND NOT (hide).
create or replace function public.fog_apply(p_player uuid, p_chunks jsonb, p_hide boolean default false)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  m bytea;
  cur bytea;
  i int;
  n int := 0;
begin
  if not (public.is_admin() or (p_player = (select auth.uid()) and public.is_member())) then
    raise exception 'forbidden';
  end if;
  for c in select * from jsonb_array_elements(p_chunks) loop
    m := decode(c ->> 'mask', 'hex');
    if length(m) <> 512 then raise exception 'bad mask length'; end if;
    select bits into cur from public.fog_chunks
     where player_id = p_player and cx = (c ->> 'cx')::int and cy = (c ->> 'cy')::int
     for update;
    if cur is null then
      if p_hide then continue; end if;
      cur := m;
    else
      for i in 0..511 loop
        if p_hide then
          cur := set_byte(cur, i, get_byte(cur, i) & ~get_byte(m, i) & 255);
        else
          cur := set_byte(cur, i, get_byte(cur, i) | get_byte(m, i));
        end if;
      end loop;
    end if;
    insert into public.fog_chunks (player_id, cx, cy, bits, updated_at)
    values (p_player, (c ->> 'cx')::int, (c ->> 'cy')::int, cur, now())
    on conflict (player_id, cx, cy) do update set bits = excluded.bits, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.fog_apply(uuid, jsonb, boolean) from public, anon;
grant execute on function public.fog_apply(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS for content tables: members read, admins write.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['elements', 'mixtures', 'notes', 'fog_chunks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: members read" on public.%I', t, t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_member())', t, t);
  end loop;
  foreach t in array array['elements', 'mixtures', 'notes'] loop
    execute format('drop policy if exists "%s: admins write" on public.%I', t, t);
    execute format('create policy "%s: admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;
-- fog_chunks are written only through fog_apply() (and admins may delete).
drop policy if exists "fog_chunks: admins delete" on public.fog_chunks;
create policy "fog_chunks: admins delete" on public.fog_chunks
  for delete to authenticated using (public.is_admin());

-- Nothing is readable without being logged in.
revoke all on public.profiles, public.elements, public.mixtures, public.notes, public.fog_chunks from anon;

-- ---------------------------------------------------------------------------
-- Image storage (private bucket)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "images: members read" on storage.objects;
create policy "images: members read" on storage.objects
  for select to authenticated using (bucket_id = 'images' and public.is_member());

drop policy if exists "images: admins insert" on storage.objects;
create policy "images: admins insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'images' and public.is_admin());

drop policy if exists "images: admins update" on storage.objects;
create policy "images: admins update" on storage.objects
  for update to authenticated using (bucket_id = 'images' and public.is_admin());

drop policy if exists "images: admins delete" on storage.objects;
create policy "images: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime (live updates for everyone)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'elements', 'mixtures', 'notes', 'fog_chunks'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Keep-alive endpoint (used by the GitHub Action so the free project never pauses)
-- ---------------------------------------------------------------------------
create or replace function public.ping() returns int
language sql stable set search_path = '' as $$ select 1 $$;
grant execute on function public.ping() to anon, authenticated;
