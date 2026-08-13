-- The `catches` table — one row per wild Pokémon caught.
--
-- THIS FILE DOCUMENTS AN EXISTING TABLE. The table has been live since the
-- Pokédex shipped, but no file in this repo ever defined it: its shape existed
-- only as a comment in App.jsx (`recordCatch`) and as an assumption in four
-- shipped SECURITY DEFINER RPCs (player_profile.sql). An environment rebuilt
-- from supabase/*.sql had no catches table at all.
--
-- VERIFY AGAINST THE LIVE TABLE BEFORE APPLYING. If the live shape differs,
-- the live shape wins and this file is corrected to match — do not "fix" a
-- live table to match this file.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

create table if not exists public.catches (
  id         bigserial primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  region     text,
  species_id integer,
  name       text,
  shiny      boolean not null default false,
  caught_at  timestamptz not null default now()
);

-- Own-row-only, mirroring runs_tracking.sql. Aggregate reads across users go
-- through SECURITY DEFINER functions (player_profile.sql, player_stats.sql),
-- which is why those functions need definer rights at all.
alter table public.catches enable row level security;

drop policy if exists "catches_insert_own" on public.catches;
create policy "catches_insert_own"
  on public.catches for insert
  with check (auth.uid() = user_id);

drop policy if exists "catches_select_own" on public.catches;
create policy "catches_select_own"
  on public.catches for select
  using (auth.uid() = user_id);

-- The region backfill (scripts/backfillRunRegions.mjs) scans this table by
-- user and time window.
create index if not exists catches_user_caught_idx
  on public.catches (user_id, caught_at);
