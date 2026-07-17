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
  add column if not exists winning_roster      jsonb,
  add column if not exists created_at          timestamptz not null default now();

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
