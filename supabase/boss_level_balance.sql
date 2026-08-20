-- Per-Pokémon gym leader level tuning for Speedmon (admin balance dashboard).
--
-- Gym leader teams are AUTHORED, not generated: BOSS_TEAMS in each region's
-- game/regions/*.teams.js ships a fixed [{ id, level }] roster per leader, and
-- NodeMap's boss branch passes those specs through verbatim. They never call
-- pickLevel, so the map_level_balance bands/offsets do not affect them at all
-- (that is why the dashboard's old "Row 9 (boss)" line was inert). This table
-- is the boss-side counterpart: it overrides ONE Pokémon's level on ONE
-- leader's team.
--
-- Keyed by (region, boss, slot) rather than by species id: a leader may field
-- the same species twice, and slot is stable against a species swap in the
-- authored team. `slot` is the 0-based index into that leader's BOSS_TEAMS
-- array.
--
-- The table ships EMPTY. Every read falls back to the authored level, so an
-- un-run migration, an offline client, or a failed fetch reproduces shipped
-- behaviour exactly — same degradation contract as map_level_balance.sql.
--
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.boss_level_balance (
  region      text        not null,
  boss        text        not null,
  slot        smallint    not null,
  level       smallint    not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) on delete set null,
  primary key (region, boss, slot)
);

-- 2. Constraints --------------------------------------------------------------
-- Levels stay inside the game's own 1-100 range.
alter table public.boss_level_balance
  drop constraint if exists boss_level_balance_level;
alter table public.boss_level_balance
  add constraint boss_level_balance_level check (
    level >= 1 and level <= 100
  );

-- No authored gym leader team is anywhere near this long; the ceiling just
-- stops a malformed write from creating unbounded phantom slots.
alter table public.boss_level_balance
  drop constraint if exists boss_level_balance_slot;
alter table public.boss_level_balance
  add constraint boss_level_balance_slot check (
    slot >= 0 and slot <= 11
  );

-- 3. Row Level Security -------------------------------------------------------
alter table public.boss_level_balance enable row level security;

-- Everyone (including anonymous players) may READ — the boss fight needs these
-- values to build the enemy team.
drop policy if exists "boss_level_balance_select_all" on public.boss_level_balance;
create policy "boss_level_balance_select_all"
  on public.boss_level_balance for select
  using (true);

-- Only admins may WRITE. Mirrors the role check the client uses to show the
-- balance dashboard, but enforced server-side — the client-side gate only
-- hides the UI, it is not a security boundary.
drop policy if exists "boss_level_balance_update_admin" on public.boss_level_balance;
create policy "boss_level_balance_update_admin"
  on public.boss_level_balance for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "boss_level_balance_insert_admin" on public.boss_level_balance;
create policy "boss_level_balance_insert_admin"
  on public.boss_level_balance for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
