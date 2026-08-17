-- Per-map / per-row enemy level tuning for Speedmon (admin balance dashboard).
--
-- Two datasets share this table, distinguished by `region`:
--   BAND ROWS   — region = a real region name, row_index = -1.
--                 min_level/max_level override that region's
--                 mapLevelRanges[map_index] (game/regions/*.teams.js).
--   OFFSET ROWS — region = '*', row_index = 0..8.
--                 "offset" is a jitter MAGNITUDE applied to every level rolled
--                 on that node row: the final level gets a uniform integer
--                 delta from [-offset, +offset]. Offsets are universal across
--                 regions by design, hence the '*' sentinel.
--
-- row_index uses -1 rather than NULL for band rows: NULL does not participate
-- in a composite primary key, which would break the upsert's onConflict target.
--
-- The table ships EMPTY. Every read falls back to the region config, so an
-- un-run migration, an offline client, or a failed fetch reproduces shipped
-- behaviour exactly — the same degradation contract region_balance.sql uses.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.map_level_balance (
  region      text        not null,
  map_index   smallint    not null,
  row_index   smallint    not null default -1,
  min_level   smallint,
  max_level   smallint,
  "offset"    smallint,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) on delete set null,
  primary key (region, map_index, row_index)
);

-- 2. Constraints --------------------------------------------------------------
-- Levels stay inside the game's own 1-100 range and never invert.
alter table public.map_level_balance
  drop constraint if exists map_level_balance_levels;
alter table public.map_level_balance
  add constraint map_level_balance_levels check (
    (min_level is null and max_level is null)
    or (min_level >= 1 and max_level <= 100 and min_level <= max_level)
  );

-- An offset ceiling stops a fat-fingered entry from flattening a map's level
-- curve into noise (a +-20 jitter on a 10-level band is pure randomness).
alter table public.map_level_balance
  drop constraint if exists map_level_balance_offset;
alter table public.map_level_balance
  add constraint map_level_balance_offset check (
    "offset" is null or ("offset" >= 0 and "offset" <= 20)
  );

-- INVARIANT: every region ships exactly 8 maps. If that ever stops being
-- true, this constraint and the dashboard's map dropdown (BalanceDashboard
-- TrainerLevelsPanel) both need widening — a 9-map region would otherwise be
-- untunable past map 8, and the write would fail server-side here.
alter table public.map_level_balance
  drop constraint if exists map_level_balance_map_index;
alter table public.map_level_balance
  add constraint map_level_balance_map_index check (
    map_index >= 0 and map_index <= 7
  );

-- 3. Row Level Security -------------------------------------------------------
alter table public.map_level_balance enable row level security;

-- Everyone (including anonymous players) may READ — map generation needs these
-- values to roll enemy levels.
drop policy if exists "map_level_balance_select_all" on public.map_level_balance;
create policy "map_level_balance_select_all"
  on public.map_level_balance for select
  using (true);

-- Only admins may WRITE. Mirrors the role check the client uses to show the
-- balance dashboard, but enforced server-side — the client-side gate only hides
-- the UI, it is not a security boundary.
drop policy if exists "map_level_balance_update_admin" on public.map_level_balance;
create policy "map_level_balance_update_admin"
  on public.map_level_balance for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "map_level_balance_insert_admin" on public.map_level_balance;
create policy "map_level_balance_insert_admin"
  on public.map_level_balance for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
