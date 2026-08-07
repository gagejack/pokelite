-- Meta-progression profile storage for Speedmon (metacash, keys, owned
-- upgrades/sprites, vitamins, unlocked regions, streak).
--
-- One row per account, upserted whole (the client writes the entire `profile`
-- jsonb blob on every save — same shape as saved_runs, not a row-per-field
-- design) via src/lib/metaSave.js. RLS restricts every operation to the
-- owning user; there is no admin/shared read path like region_balance.sql
-- because a wallet is private, not shared tuning data.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.meta_profiles (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  profile     jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- 2. Row Level Security -------------------------------------------------------
alter table public.meta_profiles enable row level security;

-- A user may SELECT only their own profile.
drop policy if exists "meta_profiles_select_own" on public.meta_profiles;
create policy "meta_profiles_select_own"
  on public.meta_profiles for select
  using (auth.uid() = user_id);

-- A user may INSERT only a profile row for themselves (first save / upsert).
drop policy if exists "meta_profiles_insert_own" on public.meta_profiles;
create policy "meta_profiles_insert_own"
  on public.meta_profiles for insert
  with check (auth.uid() = user_id);

-- A user may UPDATE only their own profile (every subsequent save).
drop policy if exists "meta_profiles_update_own" on public.meta_profiles;
create policy "meta_profiles_update_own"
  on public.meta_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
