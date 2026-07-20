-- Per-region damage tuning for Speedmon (admin balance dashboard).
--
-- Replaces the single symmetric `damageMultiplier` in each region config with
-- two asymmetric knobs, so difficulty can be tuned independently of pacing:
--   player_damage_multiplier — how hard the PLAYER's Pokémon hit
--   enemy_damage_multiplier  — how hard ENEMY Pokémon hit
-- Lower enemy / higher player = easier; the reverse = harder. Setting both to
-- the same value reproduces the old behaviour (a pure battle-length knob).
--
-- Values are shared: every player reads them, only admins can write. The region
-- config's own values remain the fallback when a row is missing or the fetch
-- fails, so the game always has sane numbers.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.region_balance (
  region                    text        primary key,
  player_damage_multiplier  numeric     not null default 2,
  enemy_damage_multiplier   numeric     not null default 2,
  updated_at                timestamptz not null default now(),
  updated_by                uuid        references auth.users (id) on delete set null
);

-- Keep values in a sane range so a fat-fingered slider can't zero out damage
-- (0 would make battles unwinnable/endless) or make it absurd.
alter table public.region_balance
  drop constraint if exists region_balance_range;
alter table public.region_balance
  add constraint region_balance_range check (
    player_damage_multiplier > 0 and player_damage_multiplier <= 10 and
    enemy_damage_multiplier  > 0 and enemy_damage_multiplier  <= 10
  );

-- 2. Seed with today's shipped values so behaviour is unchanged on first run.
-- Both sides get the region's existing symmetric damageMultiplier.
insert into public.region_balance (region, player_damage_multiplier, enemy_damage_multiplier)
values
  ('Kanto',  2,   2),
  ('Hoenn',  2,   2),
  ('Sinnoh', 2,   2),
  ('Unova',  2.5, 2.5)
on conflict (region) do nothing;

-- 3. Row Level Security -------------------------------------------------------
alter table public.region_balance enable row level security;

-- Everyone (including anonymous players) may READ the tuning values — the game
-- needs them to run a battle.
drop policy if exists "region_balance_select_all" on public.region_balance;
create policy "region_balance_select_all"
  on public.region_balance for select
  using (true);

-- Only admins may WRITE. Mirrors the role check the client uses to show the
-- balance dashboard, but enforced server-side — the client-side gate only hides
-- the UI, it is not a security boundary.
drop policy if exists "region_balance_update_admin" on public.region_balance;
create policy "region_balance_update_admin"
  on public.region_balance for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "region_balance_insert_admin" on public.region_balance;
create policy "region_balance_insert_admin"
  on public.region_balance for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
