-- Pokémon / run tracking for PokeLite.
--
-- The `runs` table exists but nothing is being saved: with RLS enabled and no
-- INSERT policy, every run-end insert is silently rejected (so the table stays
-- empty and the Pokédex has no catches to read). This file makes run tracking
-- work end-to-end.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run, and safe if some pieces already exist.

-- 1. Columns the client writes (App.jsx recordRunEnd) --------------------------
-- Adds any that are missing; leaves existing ones untouched.
alter table public.runs
  add column if not exists user_id            uuid    references auth.users (id) on delete cascade,
  add column if not exists result             text,
  add column if not exists maps_cleared       integer not null default 0,
  add column if not exists pokemon_caught      integer not null default 0,
  add column if not exists pokemon_caught_ids  integer[] not null default '{}',
  add column if not exists pokemon_seen_ids    integer[] not null default '{}',
  add column if not exists pokemon_seen_shiny_ids integer[] not null default '{}',
  add column if not exists speed_cash_earned   integer not null default 0,
  add column if not exists winning_roster      jsonb,
  add column if not exists created_at          timestamptz not null default now(),
  -- Read by player_profile.sql and written by App.jsx recordRunEnd, but never
  -- created by any file in this repo until now — they existed only in the live
  -- database. An environment rebuilt from supabase/*.sql was missing them, which
  -- silently broke the shipped profile RPCs.
  add column if not exists elapsed_ms          bigint,
  add column if not exists starter_id          integer,
  -- Which region a run was played in. Nullable by design: null means "region
  -- unknown", a real state for every run recorded before this column existed.
  -- Never default this to a region name — a wrong attribution is worse than an
  -- honest gap, and the dashboard shows the gap as an Unknown bucket.
  add column if not exists region              text;

-- 2. Row Level Security -------------------------------------------------------
alter table public.runs enable row level security;  -- no-op if already enabled

-- A user may INSERT only their own runs (the missing piece — this is why the
-- table stayed empty).
drop policy if exists "runs_insert_own" on public.runs;
create policy "runs_insert_own"
  on public.runs for insert
  with check (auth.uid() = user_id);

-- A user may READ only their own runs (so the Pokédex can aggregate catches).
drop policy if exists "runs_select_own" on public.runs;
create policy "runs_select_own"
  on public.runs for select
  using (auth.uid() = user_id);

-- 3. Indexes for admin dashboard filtering ------------------------------------
-- The admin Player Stats panels filter by region and date on every control
-- change. Two indexes, not one: the composite leads on `region`, so it cannot
-- serve the default "All regions" view where only created_at is constrained —
-- a composite index with an unconstrained leading column is not usable for
-- that scan.
create index if not exists runs_region_created_idx
  on public.runs (region, created_at);
create index if not exists runs_created_idx
  on public.runs (created_at);
