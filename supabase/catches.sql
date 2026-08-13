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

-- Verified against the live table on 2026-08-13. `user_id` and `species_id` are
-- NOT NULL in production — stricter than this file first assumed, and correct:
-- a catch with no owner belongs to nobody, and a catch with no species is not a
-- record of anything. `region` and `name` are nullable, which matches rows
-- written before `recordCatch` sent them.
create table if not exists public.catches (
  id         bigserial   primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  region     text,
  species_id integer     not null,
  name       text,
  shiny      boolean     not null default false,
  caught_at  timestamptz not null default now()
);

-- Own-row-only, mirroring runs_tracking.sql. Aggregate reads across users go
-- through SECURITY DEFINER functions (player_profile.sql, player_stats.sql),
-- which is why those functions need definer rights at all.
alter table public.catches enable row level security;

-- The live table already carries a policy named "own catches" (verified
-- 2026-08-13): `for all` with `auth.uid() = user_id` on both USING and WITH
-- CHECK. It predates this file and is the real enforcement in production.
--
-- It is named here rather than dropped. Permissive policies are ORed, so a
-- second pair asserting the SAME predicate cannot widen access — and "own
-- catches" is broader in the direction that matters: `for all` also covers
-- UPDATE and DELETE, which the two policies below do not grant. Dropping it in
-- favour of them would LOOSEN nothing but would leave update/delete
-- unpoliced-by-name, and re-running this file on production would then be a
-- change rather than a no-op.
--
-- The two below exist so an environment rebuilt from supabase/*.sql alone is
-- still locked down. On production they are redundant, by design.
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
