-- Global (not per-region) gameplay tuning knobs for Speedmon (admin balance
-- dashboard, Difficulty section).
--
-- Key -> value, so any number of future global knobs can share this one
-- table without a schema change — the first (and, as of this writing, only)
-- row is 'starter_boost'. Deliberately NOT folded into region_balance: that
-- table is keyed BY REGION (its primary key), so a global value has no
-- honest row to live in there — a sentinel region like '__global__' would
-- corrupt what that table means and every query over it. This table exists
-- so a global knob has its own honest home instead.
--
-- starter_boost mirrors BALANCE.pokemon.starterBoost (src/game/balance.js) —
-- the ×stats multiplier applied to the run's starter. It applies to every
-- region; there is no per-region variant. A value below 1.0 is a legitimate
-- (harder) difficulty choice — see the CHECK constraint below — so it is
-- allowed, not just values >= 1.
--
-- Values are shared: every player reads them, only admins can write. The
-- in-code BALANCE default remains the fallback when a row is missing or the
-- fetch fails, so the game always has a sane number. Same shape and
-- reasoning as region_balance.sql / meta_shop_prices.sql — see those files
-- for the fuller rationale; this one only differs in being keyed by an
-- arbitrary tuning `key` instead of a region or catalog item id.
--
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.game_tuning (
  key        text        primary key,
  value      numeric     not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id) on delete set null
);

-- Keep values in a sane range so a fat-fingered edit can't zero out the
-- starter's stats (0 would make the run unwinnable) or produce an absurd
-- multiplier. Matches src/lib/gameTuning.js's client-side clamp
-- (STARTER_BOOST_MIN/MAX) so a client-side reject and a server-side reject
-- agree on the same range. Below 1.0 is allowed on purpose (see header) —
-- the floor exists to stop 0/negative, not to forbid "weaker than wild".
alter table public.game_tuning
  drop constraint if exists game_tuning_starter_boost_range;
alter table public.game_tuning
  add constraint game_tuning_starter_boost_range check (
    key <> 'starter_boost' or (value >= 0.5 and value <= 3)
  );

-- 2. Seed with today's shipped value so behaviour is unchanged on first run.
insert into public.game_tuning (key, value)
values
  ('starter_boost', 1.3)
on conflict (key) do nothing;

-- 3. Row Level Security -------------------------------------------------------
alter table public.game_tuning enable row level security;

-- Everyone (including anonymous players) may READ tuning values — every
-- player's run must reflect the tuned starter boost, not just admins'.
drop policy if exists "game_tuning_select_all" on public.game_tuning;
create policy "game_tuning_select_all"
  on public.game_tuning for select
  using (true);

-- Only admins may WRITE. Mirrors the role check region_balance.sql /
-- meta_shop_prices.sql use, enforced server-side — the client-side gate only
-- hides the UI, it is not a security boundary.
drop policy if exists "game_tuning_update_admin" on public.game_tuning;
create policy "game_tuning_update_admin"
  on public.game_tuning for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "game_tuning_insert_admin" on public.game_tuning;
create policy "game_tuning_insert_admin"
  on public.game_tuning for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
