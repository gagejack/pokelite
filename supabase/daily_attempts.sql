-- Daily-challenge attempts + leaderboard for Speedmon (Experimental 2.3, Phase 2).
--
-- One row per FINISHED daily run (written at death/clear). A user gets up to 10
-- attempts per UTC day; only the first 3 (attempt_no <= 3) are ranked, best of
-- those is their leaderboard score. Ranking: maps_cleared DESC, elapsed_ms ASC.
--
-- Trust-client model: no server-side verification. RLS lets any authenticated
-- user READ the board and lets a user INSERT only their own rows.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.daily_attempts (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  username     text,
  daily_date   date        not null,
  region       text        not null,
  attempt_no   int         not null,
  maps_cleared int         not null default 0,
  elapsed_ms   bigint      not null default 0,
  created_at   timestamptz not null default now()
);

-- attempt_no must be 1..10.
alter table public.daily_attempts
  drop constraint if exists daily_attempts_attempt_range;
alter table public.daily_attempts
  add constraint daily_attempts_attempt_range
  check (attempt_no between 1 and 10);

-- One row per (user, day, attempt_no) — blocks duplicate attempts from two tabs.
create unique index if not exists daily_attempts_user_day_attempt
  on public.daily_attempts (user_id, daily_date, attempt_no);

-- Leaderboard reads filter by day and sort by score; index the day.
create index if not exists daily_attempts_day
  on public.daily_attempts (daily_date);

-- 2. Row Level Security -------------------------------------------------------
alter table public.daily_attempts enable row level security;

-- Any authenticated user may READ (the leaderboard is shared among players).
drop policy if exists "daily_attempts_select_authed" on public.daily_attempts;
create policy "daily_attempts_select_authed"
  on public.daily_attempts for select
  to authenticated
  using (true);

-- A user may INSERT only rows for themselves. No update/delete policies exist,
-- so rows are immutable once written (an attempt can't be edited after the fact).
drop policy if exists "daily_attempts_insert_own" on public.daily_attempts;
create policy "daily_attempts_insert_own"
  on public.daily_attempts for insert
  to authenticated
  with check (user_id = auth.uid());
