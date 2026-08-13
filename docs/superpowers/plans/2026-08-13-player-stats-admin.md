# Player Stats (Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Player Stats" tab to the admin dashboard showing aggregate player behaviour across all users — engagement, difficulty, starter choice, and economy — filterable by region and date range.

**Architecture:** Four SECURITY DEFINER Postgres RPCs aggregate across all users (both source tables are RLS-locked own-row-only, so definer rights are required). A pure transform module converts RPC rows to display shapes. A new `PlayerStatsPanel` component renders four panels, mounted as a third tab inside the existing `BalanceDashboard`. A new `runs.region` column plus a best-effort backfill script make per-region filtering possible.

**Tech Stack:** React 19, Vite 8, Vitest 4, Supabase (PostgREST + Postgres functions), plain inline styles (no CSS framework beyond Tailwind utility classes for layout).

## Deviation from the spec — read before Task 6

The spec (`docs/superpowers/specs/2026-08-12-player-stats-admin-design.md` §4) says to add a **fourth top-level tab** to `Stats.jsx`, and spends a section on mobile header overflow.

**The codebase has changed since that was written.** `Stats.jsx`'s admin button now reads **"Admin"** (not "Balance"), and `BalanceDashboard.jsx` has grown its own internal tab row — `Difficulty & Odds` / `Shop` (`BalanceDashboard.jsx:441-444`) — a pattern that did not exist when the spec was approved.

**This plan therefore mounts Player Stats as a THIRD TAB INSIDE the Admin dashboard**, beside Shop. Consequences, all favourable:

- No fifth top-level button, so the spec's mobile header-overflow section (§4 "The header tab row and mobile") is **moot and not implemented**.
- The `Stats.jsx` reset-effect fix (§4 touchpoint 3) is **already satisfied** — `tab` never becomes `'playerstats'`, so the existing `t === 'balance'` reset still covers it. **Task 6 verifies this rather than changing it.**
- `src/lib/useAdminTheme.js` (§3) is **not needed** — the panel renders inside `BalanceDashboard`, which already builds the `theme` bundle (`:327-336`) and passes it down, exactly as it does to `ShopPricesPanel`. One theme, no drift, no new module.

Everything else in the spec stands as written.

## Global Constraints

- **Every SQL function argument carries a `p_` prefix.** In `language sql`, an argument whose name matches a column loses to the column, silently. `r.region = region` would resolve to `r.region = r.region` — always true — and the region filter would no-op with no error. Precedent: `increment_badge(p_region text, …)`, called from `App.jsx:881`.
- **Every SQL function:** `language sql`, `security definer`, `stable`, `set search_path = public, pg_temp`, all table references schema-qualified.
- **Admin gate is server-side**, in the WHERE clause: `exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')`. A non-admin gets zero rows. Client-side `isAdmin` only hides UI.
- **Grants:** `authenticated` only. Never `anon`.
- **`p_unknown_only = true` overrides `p_region` entirely.** ANDing them yields `region = 'Kanto' and region is null`, unsatisfiable, rendering as a false "no data".
- **bigint arrives as a string over PostgREST.** Coerce with `Number()` in the transform layer, never trust it as a number.
- **Every rate needs a zero-denominator guard.** Return 0, never `NaN` or `Infinity`.
- **Deepest map reached** = `maps_cleared + (result <> 'win' ? 1 : 0)`. A loss with `maps_cleared = 3` reached map 4.
- **Test commands:** `npx vitest run <path>` for one file, `npx vitest run` for all, `npx eslint <paths>` for lint.
- **Pre-existing lint baseline:** `Stats.jsx` has 2 `react-hooks/set-state-in-effect` errors and `BalanceDashboard.jsx` has some too. Do not "fix" these; only ensure you add none.
- **Pre-existing test failures:** `src/game/metaProfile.test.js` has 3 failures from an uncommitted payout retune, unrelated to this work. Everything else passes.

## File Structure

**Created:**
- `supabase/catches.sql` — authoritative DDL + RLS for the `catches` table (documents an existing table)
- `supabase/player_stats.sql` — the four admin RPCs
- `src/lib/playerStats.js` — pure transforms, rate helpers
- `src/lib/playerStats.test.js` — unit tests
- `src/components/admin/PlayerStatsPanel.jsx` — the four panels + controls
- `src/components/admin/PlayerStatsPanel.test.jsx` — component tests
- `scripts/backfillRunRegions.mjs` — one-time region backfill, dry-run by default

**Modified:**
- `supabase/runs_tracking.sql:13-24` — add `elapsed_ms`, `starter_id`, `region` columns + indexes
- `src/App.jsx:756-774` — add `region` to the `recordRunEnd` payload
- `src/components/BalanceDashboard.jsx:441-455` — third tab button + branch

**Deliberately NOT modified:** `src/components/Stats.jsx` (see "Deviation from the spec" above). `Panel`/`Bar` stay in `BalanceDashboard.jsx` — the new panel lives in the same render tree and receives the same `theme` prop, so no extraction is needed. The spec's `AdminPanels.jsx` move was only required by the now-abandoned separate-top-level-tab design.

---

### Task 1: Schema — repair drift, add region, add indexes

Repairs pre-existing drift (`runs.elapsed_ms`, `runs.starter_id`, and the whole `catches` table are read by shipped code but defined by no file), then adds what this feature needs.

**Files:**
- Modify: `supabase/runs_tracking.sql:13-24`
- Create: `supabase/catches.sql`

**Interfaces:**
- Produces: `runs.region text` (nullable), `runs.elapsed_ms bigint`, `runs.starter_id integer`, table `public.catches`, indexes `runs_region_created_idx`, `runs_created_idx`, `catches_user_caught_idx`.

- [ ] **Step 1: Add the three columns to the existing `alter table` in `runs_tracking.sql`**

Find the `alter table public.runs` block at line 13. It currently ends with `created_at`. Add three columns to it. `elapsed_ms` and `starter_id` are NOT new features — they are read by `supabase/player_profile.sql` and written by `App.jsx` today, but no file in this repo ever creates them:

```sql
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
```

- [ ] **Step 2: Verify `runs` has a primary key, and record what you find**

`runs_tracking.sql` contains only `alter table` — there is no `create table public.runs` anywhere in this repo, so the table's primary key is undocumented like the columns above. The backfill in Task 7 updates rows by `id`, so this must be confirmed before that script is written.

Run this in the Supabase SQL editor:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'runs'
order by ordinal_position;
```

- If an `id` column exists (expected — `catches` has `id bigserial primary key` and these tables were made together), continue.
- **If there is no `id`**, Task 7's `.eq('id', a.id)` will not work. Update Task 7 to match rows on a composite of `user_id` and `created_at` instead, and note it in the commit message.

This is a read-only check. Do not add a primary key to a live table as part of this work.

- [ ] **Step 3: Add the two `runs` indexes at the end of `runs_tracking.sql`**

```sql
-- The admin Player Stats panels filter by region and date on every control
-- change. Two indexes, not one: the composite leads on `region`, so it cannot
-- serve the default "All regions" view where only created_at is constrained —
-- a composite index with an unconstrained leading column is not usable for
-- that scan.
create index if not exists runs_region_created_idx
  on public.runs (region, created_at);
create index if not exists runs_created_idx
  on public.runs (created_at);
```

- [ ] **Step 4: Create `supabase/catches.sql`**

```sql
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
```

- [ ] **Step 5: Verify the SQL parses**

There is no local Postgres in this project, so this is a read-through, not an execution. Confirm by eye:
- Every statement ends with `;`
- Every `create` uses `if not exists`, every `policy` is preceded by `drop policy if exists`
- No trailing comma before the final `;` in the `alter table` block

Run: `git diff --stat supabase/`
Expected: two files changed/created, no other files touched.

- [ ] **Step 6: Commit**

```bash
git add supabase/runs_tracking.sql supabase/catches.sql
git commit -m "feat(db): add runs.region, repair schema drift, commit catches DDL

runs.elapsed_ms and runs.starter_id are read by player_profile.sql and
written by App.jsx, but no file in this repo ever created them — they
existed only in the live database, so a rebuilt environment silently
broke the shipped profile RPCs. Same for the entire catches table, whose
shape lived only in an App.jsx comment.

runs.region is new, and nullable by design: null means 'region unknown',
which is the honest state for every run recorded before today.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The four admin RPCs

**Files:**
- Create: `supabase/player_stats.sql`

**Interfaces:**
- Consumes: `runs.region`, `runs.elapsed_ms`, `runs.starter_id` from Task 1.
- Produces: four RPCs callable from the client:
  - `admin_player_engagement(p_region text, p_since timestamptz, p_unknown_only boolean)` → one row: `total_runs, active_players, new_players, returning_players bigint`
  - `admin_player_difficulty(p_region, p_since, p_unknown_only)` → one row: `total_runs, wins, avg_maps numeric, avg_elapsed_ms numeric` plus `admin_player_depth(...)` → many rows: `deepest_map integer, runs bigint`
  - `admin_player_starters(p_region, p_since, p_unknown_only, p_starter_ids integer[])` → many rows: `starter_id integer, picks bigint, wins bigint`
  - `admin_player_economy(p_region, p_since, p_unknown_only)` → one row: `total_runs, avg_cash numeric, avg_catches numeric, runs_with_shiny bigint, runs_with_legendary bigint`

- [ ] **Step 1: Create `supabase/player_stats.sql` with the header and the engagement function**

Note there are **five** functions, not four: the Difficulty panel needs both scalar figures and a distribution, which are different row shapes and cannot share one return type.

```sql
-- Admin-only aggregate player statistics for the Player Stats dashboard tab.
--
-- These read EVERY user's runs. `runs` is RLS-locked to own-row-only
-- (runs_tracking.sql), so each function is SECURITY DEFINER to cross it — and
-- therefore each carries its own admin check, because a definer function
-- bypasses the very policies that would otherwise enforce one.
--
-- The admin predicate lives in the WHERE clause rather than a plpgsql guard:
-- every function in this repo is `language sql`, and a non-admin getting zero
-- rows degrades into the same empty state the UI already renders for a region
-- with no runs. The security property is identical to raising; only the noise
-- differs.
--
-- ARGUMENT NAMING IS LOAD-BEARING. Every argument is p_-prefixed because in a
-- `language sql` function, an argument whose name matches a column in the query
-- LOSES to the column, silently and with no error. An argument named `region`
-- would make `r.region = region` resolve to `r.region = r.region` — always true
-- — and the region filter would quietly no-op, showing identical all-region
-- numbers under every region heading. (plpgsql shadows the other way; the
-- functions in player_profile.sql escape this only because `uname` and
-- `starter_ids` happen not to collide with column names.)
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

-- Engagement: is anyone playing this region?
--
-- Every figure is scoped to [p_since, now). "New players" is the exception
-- that needs care: it asks whether a player's FIRST-EVER run (across all
-- time, unfiltered) falls inside the window. Scoping the min() to the window
-- too would make every player look new in any range that excludes their debut.
create or replace function public.admin_player_engagement(
  p_region       text        default null,
  p_since        timestamptz default null,
  p_unknown_only boolean     default false
)
returns table (
  total_runs        bigint,
  active_players    bigint,
  new_players       bigint,
  returning_players bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with scoped as (
    select r.user_id, r.created_at
    from public.runs r
    where exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
          )
      and (p_since is null or r.created_at >= p_since)
      -- p_unknown_only overrides p_region entirely. ANDing the two would
      -- produce `region = 'Kanto' and region is null`, which is unsatisfiable
      -- and would render as a convincing but false "no data" state.
      and (
        (p_unknown_only and r.region is null)
        or (not p_unknown_only and (p_region is null or r.region = p_region))
      )
  ),
  per_player as (
    select user_id, count(*)::bigint as runs
    from scoped
    group by user_id
  ),
  -- First-ever run per player, deliberately NOT filtered by p_since.
  debut as (
    select r.user_id, min(r.created_at) as first_run
    from public.runs r
    group by r.user_id
  )
  select
    coalesce((select sum(runs) from per_player), 0)::bigint            as total_runs,
    (select count(*) from per_player)::bigint                          as active_players,
    (select count(*) from debut
      where p_since is null or debut.first_run >= p_since)::bigint     as new_players,
    (select count(*) from per_player where runs >= 2)::bigint          as returning_players;
$$;
```

- [ ] **Step 2: Append the difficulty and depth functions**

```sql
-- Difficulty: scalar figures. The depth distribution is a separate function
-- below because it returns many rows and cannot share this return type.
create or replace function public.admin_player_difficulty(
  p_region       text        default null,
  p_since        timestamptz default null,
  p_unknown_only boolean     default false
)
returns table (
  total_runs     bigint,
  wins           bigint,
  avg_maps       numeric,
  avg_elapsed_ms numeric
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    count(*)::bigint                                         as total_runs,
    count(*) filter (where r.result = 'win')::bigint         as wins,
    -- round() keeps the client from rendering 3.4000000000000004; the client
    -- still coerces, since numeric arrives as a string over PostgREST.
    round(avg(r.maps_cleared)::numeric, 2)                   as avg_maps,
    round(avg(r.elapsed_ms)::numeric, 0)                     as avg_elapsed_ms
  from public.runs r
  where exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
    and (p_since is null or r.created_at >= p_since)
    and (
      (p_unknown_only and r.region is null)
      or (not p_unknown_only and (p_region is null or r.region = p_region))
    );
$$;

-- Deepest map REACHED, as a distribution.
--
-- This is NOT maps_cleared. A run that cleared 3 maps and then lost reached
-- map 4 — it died there. Plotting raw maps_cleared under a "reached" label
-- would shift every losing run one bin left and make the game read as harder,
-- earlier, than it is. A win reached exactly what it cleared, so it takes no
-- increment.
--
-- It is labelled "reached", not "died on", because nothing records a quit: an
-- abandoned run is indistinguishable from a lost one, so a true death curve is
-- a claim this data cannot support.
create or replace function public.admin_player_depth(
  p_region       text        default null,
  p_since        timestamptz default null,
  p_unknown_only boolean     default false
)
returns table (
  deepest_map integer,
  runs        bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    (r.maps_cleared + case when r.result = 'win' then 0 else 1 end)::integer as deepest_map,
    count(*)::bigint                                                          as runs
  from public.runs r
  where exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
    and (p_since is null or r.created_at >= p_since)
    and (
      (p_unknown_only and r.region is null)
      or (not p_unknown_only and (p_region is null or r.region = p_region))
    )
  group by 1
  order by 1;
$$;
```

- [ ] **Step 3: Append the starters and economy functions, and all grants**

```sql
-- Starter picks and their win rates.
--
-- Counted over runs STARTED, matching player_favourite_starter()'s definition,
-- so the admin view and a player's own profile never disagree about what
-- "favourite" means.
--
-- p_starter_ids is a parameter, not a literal: REGION_STARTERS lives in
-- starters.js and changes when a region is added. A copy in SQL would drift
-- silently the next time the game gains a region.
create or replace function public.admin_player_starters(
  p_region       text        default null,
  p_since        timestamptz default null,
  p_unknown_only boolean     default false,
  p_starter_ids  integer[]   default '{}'
)
returns table (
  starter_id integer,
  picks      bigint,
  wins       bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    r.starter_id::integer                            as starter_id,
    count(*)::bigint                                 as picks,
    count(*) filter (where r.result = 'win')::bigint as wins
  from public.runs r
  where exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
    and r.starter_id is not null
    -- An empty array means "no filter" rather than "match nothing": the client
    -- always passes the real list, but a bare call from the SQL editor should
    -- still return something useful.
    and (cardinality(p_starter_ids) = 0 or r.starter_id = any (p_starter_ids))
    and (p_since is null or r.created_at >= p_since)
    and (
      (p_unknown_only and r.region is null)
      or (not p_unknown_only and (p_region is null or r.region = p_region))
    )
  group by r.starter_id
  order by picks desc, r.starter_id asc;
$$;

-- Economy and collection rates.
--
-- runs_with_shiny / runs_with_legendary are PER-RUN rates, not per-encounter.
-- pokemon_seen_shiny_ids is a deduped array per run, so a run that met two
-- shinies is indistinguishable from one that met one. The client labels these
-- "runs that saw a shiny", which is exactly what the column supports.
--
-- Legendary ids are passed in for the same reason starter ids are: the list
-- lives in regionRegistry.js and grows with each region.
create or replace function public.admin_player_economy(
  p_region        text        default null,
  p_since         timestamptz default null,
  p_unknown_only  boolean     default false,
  p_legendary_ids integer[]   default '{}'
)
returns table (
  total_runs           bigint,
  avg_cash             numeric,
  avg_catches          numeric,
  runs_with_shiny      bigint,
  runs_with_legendary  bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    count(*)::bigint                              as total_runs,
    round(avg(r.speed_cash_earned)::numeric, 0)   as avg_cash,
    round(avg(r.pokemon_caught)::numeric, 2)      as avg_catches,
    count(*) filter (
      where cardinality(r.pokemon_seen_shiny_ids) > 0
    )::bigint                                     as runs_with_shiny,
    count(*) filter (
      where cardinality(p_legendary_ids) > 0
        and r.pokemon_seen_ids && p_legendary_ids
    )::bigint                                     as runs_with_legendary
  from public.runs r
  where exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
    and (p_since is null or r.created_at >= p_since)
    and (
      (p_unknown_only and r.region is null)
      or (not p_unknown_only and (p_region is null or r.region = p_region))
    );
$$;

-- authenticated only, never anon. Unlike the public profile RPCs there is no
-- case for a logged-out caller; the admin predicate inside each function is
-- what actually gates the data.
grant execute on function public.admin_player_engagement(text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_player_difficulty(text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_player_depth(text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_player_starters(text, timestamptz, boolean, integer[]) to authenticated;
grant execute on function public.admin_player_economy(text, timestamptz, boolean, integer[]) to authenticated;
```

- [ ] **Step 4: Verify by eye**

Confirm across all five functions:
- Every argument is `p_`-prefixed. **Grep for it:** `grep -n "^  [a-z_]* *text\|^  [a-z_]* *timestamptz\|^  [a-z_]* *boolean\|^  [a-z_]* *integer\[\]" supabase/player_stats.sql` — every match must start with `p_`.
- Every function has `set search_path = public, pg_temp`
- Every function has the `exists (... p.role = 'admin')` predicate
- Grant signatures exactly match the argument type lists

Run: `grep -c "search_path = public, pg_temp" supabase/player_stats.sql`
Expected: `5`

Run: `grep -c "p.role = 'admin'" supabase/player_stats.sql`
Expected: `5`

- [ ] **Step 5: Commit**

```bash
git add supabase/player_stats.sql
git commit -m "feat(db): admin RPCs for aggregate player stats

Five SECURITY DEFINER functions reading across all users' runs, each
carrying its own admin check because a definer function bypasses the
policies that would otherwise enforce one.

Every argument is p_-prefixed. In language sql an argument whose name
matches a column loses to the column, silently — an argument named
'region' would make the region filter a no-op and show identical
all-region numbers under every heading.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Client writes `runs.region`

Small and separate because it is the one change with a **deploy-order hazard**: it must not ship before Task 1's SQL is applied.

**Files:**
- Modify: `src/App.jsx:756-774`

**Interfaces:**
- Consumes: `runs.region` column from Task 1.
- Produces: new runs carry their region.

- [ ] **Step 1: Add `region` to the `recordRunEnd` payload**

In `src/App.jsx`, find the `const payload = {` block (~line 756). It currently ends with `starter_id: selectedStarter?.id ?? null,`. Add one line after it:

```javascript
      elapsed_ms: Math.max(0, Date.now() - (runStartedAt.current || Date.now())),
      starter_id: selectedStarter?.id ?? null,
      // Which region this run was played in, for the admin Player Stats tab.
      // Same value recordCatch already writes and the daily-attempt submission
      // already sends. Null for a run with no selected region rather than a
      // guessed default — the dashboard shows nulls as an honest Unknown
      // bucket, and a wrong attribution is worse than a visible gap.
      region: selectedRegion?.name ?? null,
```

- [ ] **Step 2: Verify the app still builds**

Run: `npx vite build 2>&1 | grep -E "built in|error"`
Expected: `✓ built in <n>ms`, no errors.

- [ ] **Step 3: Verify no lint regression**

Run: `npx eslint src/App.jsx 2>&1 | tail -3`
Expected: the same error count as before this change (run `git stash && npx eslint src/App.jsx | tail -3 && git stash pop` to compare if unsure).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: record which region each run was played in

DEPLOY ORDER: supabase/runs_tracking.sql must be applied BEFORE this
ships. A PostgREST insert naming a column that does not exist fails the
ENTIRE insert — App.jsx:787 documents this having happened before, when
pokemon_seen_shiny_ids shipped ahead of its column and every run-end
write failed unnoticed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Pure transforms (`playerStats.js`) — TDD

The whole task is test-first. These transforms are where a bigint-as-string or a zero-denominator becomes a wrong number on an admin's screen.

**Files:**
- Create: `src/lib/playerStats.js`
- Test: `src/lib/playerStats.test.js`

**Interfaces:**
- Consumes: raw RPC row shapes from Task 2.
- Produces, all named exports:
  - `pct(part, whole)` → number, 0 when `whole` is 0
  - `toEngagement(row)` → `{ totalRuns, activePlayers, newPlayers, returningPlayers, runsPerPlayer, returningRate }`
  - `toDifficulty(row)` → `{ totalRuns, wins, winRate, avgMaps, avgElapsedMs }`
  - `toDepth(rows)` → `[{ deepestMap, runs, pct }]`
  - `toStarters(rows)` → `[{ starterId, picks, wins, pickPct, winRate }]`
  - `toEconomy(row)` → `{ totalRuns, avgCash, avgCatches, shinyRate, legendaryRate }`
  - `RANGES` → `[{ key, label, days }]`, where `days: null` means all time

- [ ] **Step 1: Write the failing tests**

Create `src/lib/playerStats.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import {
  pct, toEngagement, toDifficulty, toDepth, toStarters, toEconomy, RANGES,
} from './playerStats.js'

// Every fixture uses STRINGS for bigint columns, because that is what
// PostgREST actually sends. Fixtures with real numbers would hide the exact
// class of bug these transforms exist to prevent.

describe('pct', () => {
  it('returns a whole-number percentage', () => {
    expect(pct(5, 20)).toBe(25)
  })

  it('returns 0 rather than NaN when the denominator is zero', () => {
    // A region with no runs must report 0%, never NaN% or Infinity.
    expect(pct(0, 0)).toBe(0)
    expect(pct(5, 0)).toBe(0)
    expect(Number.isNaN(pct(1, 0))).toBe(false)
  })

  it('coerces bigint strings', () => {
    expect(pct('5', '20')).toBe(25)
  })

  it('rounds rather than truncating', () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(2, 3)).toBe(67)
  })
})

describe('toEngagement', () => {
  const row = {
    total_runs: '1284', active_players: '212',
    new_players: '44', returning_players: '144',
  }

  it('coerces every count to a number', () => {
    const e = toEngagement(row)
    expect(e.totalRuns).toBe(1284)
    expect(e.activePlayers).toBe(212)
    expect(e.newPlayers).toBe(44)
    expect(typeof e.totalRuns).toBe('number')
  })

  it('derives runs per player to one decimal', () => {
    expect(toEngagement(row).runsPerPlayer).toBe(6.1)
  })

  it('derives the returning rate as a share of active players', () => {
    expect(toEngagement(row).returningRate).toBe(68)
  })

  it('reports zeros for a region with no runs', () => {
    const e = toEngagement({
      total_runs: '0', active_players: '0', new_players: '0', returning_players: '0',
    })
    expect(e.runsPerPlayer).toBe(0)
    expect(e.returningRate).toBe(0)
    expect(Number.isNaN(e.runsPerPlayer)).toBe(false)
  })

  it('returns null for a missing row', () => {
    expect(toEngagement(null)).toBeNull()
    expect(toEngagement(undefined)).toBeNull()
  })
})

describe('toDifficulty', () => {
  it('derives win rate and coerces numerics', () => {
    const d = toDifficulty({
      total_runs: '100', wins: '9', avg_maps: '3.40', avg_elapsed_ms: '760000',
    })
    expect(d.winRate).toBe(9)
    expect(d.avgMaps).toBe(3.4)
    expect(d.avgElapsedMs).toBe(760000)
  })

  it('reports 0% win rate for zero runs rather than NaN', () => {
    const d = toDifficulty({ total_runs: '0', wins: '0', avg_maps: null, avg_elapsed_ms: null })
    expect(d.winRate).toBe(0)
    expect(d.avgMaps).toBe(0)
    expect(d.avgElapsedMs).toBe(0)
  })

  it('returns null for a missing row', () => {
    expect(toDifficulty(null)).toBeNull()
  })
})

describe('toDepth', () => {
  // The SQL already derives deepest_map as maps_cleared + (result <> 'win').
  // These fixtures are what that function returns, and pin the CONSEQUENCE:
  // a loss that cleared 3 arrives here as bin 4, a win that cleared 3 as bin 3.
  it('preserves the bin the SQL assigned', () => {
    const rows = [
      { deepest_map: 3, runs: '10' },   // wins that cleared 3
      { deepest_map: 4, runs: '30' },   // losses that cleared 3
    ]
    expect(toDepth(rows).map(d => d.deepestMap)).toEqual([3, 4])
  })

  it('gives each bin its share of the total', () => {
    const d = toDepth([
      { deepest_map: 1, runs: '41' },
      { deepest_map: 2, runs: '26' },
      { deepest_map: 3, runs: '33' },
    ])
    expect(d.map(x => x.pct)).toEqual([41, 26, 33])
  })

  it('coerces run counts', () => {
    expect(toDepth([{ deepest_map: 1, runs: '5' }])[0].runs).toBe(5)
  })

  it('returns an empty array for no rows, not a crash', () => {
    expect(toDepth([])).toEqual([])
    expect(toDepth(null)).toEqual([])
    expect(toDepth(undefined)).toEqual([])
  })
})

describe('toStarters', () => {
  const rows = [
    { starter_id: 4, picks: '44', wins: '5' },
    { starter_id: 7, picks: '31', wins: '2' },
    { starter_id: 1, picks: '25', wins: '3' },
  ]

  it('derives pick share against the total picks', () => {
    expect(toStarters(rows).map(s => s.pickPct)).toEqual([44, 31, 25])
  })

  it('derives win rate per starter against that starter own picks', () => {
    // Not against total picks — "how often does THIS starter win" is the
    // question, so the denominator is its own pick count.
    const s = toStarters(rows)
    expect(s[0].winRate).toBe(11)   // 5/44
    expect(s[1].winRate).toBe(6)    // 2/31
  })

  it('handles a single starter as 100% of picks', () => {
    const s = toStarters([{ starter_id: 4, picks: '10', wins: '1' }])
    expect(s[0].pickPct).toBe(100)
  })

  it('reports 0% rather than NaN for a starter with no picks', () => {
    const s = toStarters([{ starter_id: 4, picks: '0', wins: '0' }])
    expect(s[0].pickPct).toBe(0)
    expect(s[0].winRate).toBe(0)
  })

  it('returns an empty array for no rows', () => {
    expect(toStarters([])).toEqual([])
    expect(toStarters(null)).toEqual([])
  })
})

describe('toEconomy', () => {
  it('derives per-run rates and coerces numerics', () => {
    const e = toEconomy({
      total_runs: '1000', avg_cash: '612', avg_catches: '6.80',
      runs_with_shiny: '32', runs_with_legendary: '12',
    })
    expect(e.avgCash).toBe(612)
    expect(e.avgCatches).toBe(6.8)
    // Per-RUN rates: the share of runs that saw one, not an encounter rate.
    expect(e.shinyRate).toBe(3)
    expect(e.legendaryRate).toBe(1)
  })

  it('reports zeros for a region with no runs', () => {
    const e = toEconomy({
      total_runs: '0', avg_cash: null, avg_catches: null,
      runs_with_shiny: '0', runs_with_legendary: '0',
    })
    expect(e.avgCash).toBe(0)
    expect(e.shinyRate).toBe(0)
    expect(Number.isNaN(e.shinyRate)).toBe(false)
  })

  it('returns null for a missing row', () => {
    expect(toEconomy(null)).toBeNull()
  })
})

describe('RANGES', () => {
  it('offers all time plus three windows, all-time first', () => {
    expect(RANGES[0].days).toBeNull()
    expect(RANGES.map(r => r.days)).toEqual([null, 7, 30, 90])
  })

  it('gives every range a stable key and a label', () => {
    RANGES.forEach(r => {
      expect(typeof r.key).toBe('string')
      expect(r.label.length).toBeGreaterThan(0)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/playerStats.test.js`
Expected: FAIL — `Failed to resolve import "./playerStats.js"`. The module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/playerStats.js`:

```javascript
// Pure transforms from the admin Player Stats RPC rows to display shapes.
//
// Its own module, not part of PlayerStatsPanel.jsx, for two reasons: this is
// where a bigint-as-string or a zero denominator turns into a wrong number on
// an admin's screen, and that deserves tests that run without a database — and
// a .jsx file exporting both components and plain functions loses Fast Refresh
// (react-refresh/only-export-components).
//
// EVERY numeric column arrives as a STRING over PostgREST (bigint and numeric
// both), so everything here coerces rather than trusting. The fixtures in the
// test file use strings for exactly this reason.

// Coerce a PostgREST numeric to a real number. Null, undefined and unparseable
// values all resolve to 0 — these feed dashboard tiles, and a NaN on screen is
// worse than an honest zero.
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// A whole-number percentage, guarded against a zero denominator.
//
// The guard is the point: a region with no runs would otherwise divide by zero
// and render "NaN%" on every rate in the panel.
export function pct(part, whole) {
  const w = num(whole)
  if (w === 0) return 0
  return Math.round((num(part) / w) * 100)
}

// One decimal, same zero guard.
function per(part, whole) {
  const w = num(whole)
  if (w === 0) return 0
  return Math.round((num(part) / w) * 10) / 10
}

// The date ranges the dashboard offers. `days: null` means all time.
//
// Every range ends at now — there is no end bound, by design. A custom range
// with a past end date would need a second argument on every RPC and is out of
// scope; this shape should not be mistaken for one.
export const RANGES = [
  { key: 'all', label: 'All time', days: null },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
]

// A range key to the ISO timestamp the RPCs take as p_since, or null for all
// time.
export function sinceFor(rangeKey) {
  const range = RANGES.find(r => r.key === rangeKey)
  if (!range || range.days == null) return null
  return new Date(Date.now() - range.days * 86400000).toISOString()
}

export function toEngagement(row) {
  if (!row) return null
  const totalRuns = num(row.total_runs)
  const activePlayers = num(row.active_players)
  const returningPlayers = num(row.returning_players)
  return {
    totalRuns,
    activePlayers,
    newPlayers: num(row.new_players),
    returningPlayers,
    runsPerPlayer: per(totalRuns, activePlayers),
    returningRate: pct(returningPlayers, activePlayers),
  }
}

export function toDifficulty(row) {
  if (!row) return null
  const totalRuns = num(row.total_runs)
  const wins = num(row.wins)
  return {
    totalRuns,
    wins,
    winRate: pct(wins, totalRuns),
    avgMaps: num(row.avg_maps),
    avgElapsedMs: num(row.avg_elapsed_ms),
  }
}

// The depth distribution. The bins are already correct when they arrive: the
// SQL derives deepest_map as maps_cleared + (result <> 'win'), so a run that
// cleared 3 and lost is in bin 4. This only adds each bin's share of the total.
export function toDepth(rows) {
  const list = rows ?? []
  const total = list.reduce((s, r) => s + num(r.runs), 0)
  return list.map(r => ({
    deepestMap: num(r.deepest_map),
    runs: num(r.runs),
    pct: pct(r.runs, total),
  }))
}

// Starter picks. Two different denominators, deliberately:
//   pickPct — share of ALL picks, so the bars sum to 100%
//   winRate — share of THAT starter's own picks, because "how often does this
//             starter win" is a question about that starter, not about the
//             field
export function toStarters(rows) {
  const list = rows ?? []
  const totalPicks = list.reduce((s, r) => s + num(r.picks), 0)
  return list.map(r => ({
    starterId: num(r.starter_id),
    picks: num(r.picks),
    wins: num(r.wins),
    pickPct: pct(r.picks, totalPicks),
    winRate: pct(r.wins, r.picks),
  }))
}

export function toEconomy(row) {
  if (!row) return null
  const totalRuns = num(row.total_runs)
  return {
    totalRuns,
    avgCash: num(row.avg_cash),
    avgCatches: num(row.avg_catches),
    // PER-RUN rates. pokemon_seen_shiny_ids is deduped per run, so a run that
    // met two shinies is indistinguishable from one that met one — these are
    // "share of runs that saw one", which is what the column supports.
    shinyRate: pct(row.runs_with_shiny, totalRuns),
    legendaryRate: pct(row.runs_with_legendary, totalRuns),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/playerStats.test.js`
Expected: PASS, 26 tests.

- [ ] **Step 5: Verify lint is clean**

Run: `npx eslint src/lib/playerStats.js src/lib/playerStats.test.js`
Expected: no output (zero errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/playerStats.js src/lib/playerStats.test.js
git commit -m "feat: pure transforms for admin player stats

Every numeric column arrives as a string over PostgREST, and every rate
has a zero-denominator guard — a region with no runs must report 0%, not
NaN%. Test fixtures use strings deliberately, so a coercion regression
fails the suite instead of reaching an admin's screen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The Player Stats panel component

**Files:**
- Create: `src/components/admin/PlayerStatsPanel.jsx`
- Test: `src/components/admin/PlayerStatsPanel.test.jsx`

**Interfaces:**
- Consumes: every export of `src/lib/playerStats.js` (Task 4); the five RPCs (Task 2); the `theme` bundle prop that `BalanceDashboard` already builds (`BalanceDashboard.jsx:327-336`) with keys `{ textColor, mutedColor, innerBg, panelBorder, trackBg, accentColor, shadow, titleSize, labelWidth }`.
- Produces: `export default function PlayerStatsPanel({ theme })`, mounted by Task 6.

- [ ] **Step 1: Write the failing component tests**

Create `src/components/admin/PlayerStatsPanel.test.jsx`:

```jsx
import { test, expect, beforeAll, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../lib/theme'

// Supabase is mocked at the module boundary: these tests pin the WIRING —
// controls, per-panel error isolation, stale-data clearing — not the database.
const rpc = vi.fn()
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { default: PlayerStatsPanel } = await import('./PlayerStatsPanel.jsx')

beforeAll(() => {
  if (typeof localStorage !== 'undefined') return
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  }
})

// Mirrors the bundle BalanceDashboard builds and passes to its panels.
const theme = {
  textColor: '#DBDBDB', mutedColor: '#9a9a9a', innerBg: '#1a1a1a',
  panelBorder: '2px solid #121212', trackBg: '#333', accentColor: '#facc15',
  shadow: '-2px 3px 0 0 #121212', titleSize: '15px', labelWidth: '130px',
}

const ENGAGEMENT = { total_runs: '1284', active_players: '212', new_players: '44', returning_players: '144' }
const DIFFICULTY = { total_runs: '1284', wins: '115', avg_maps: '3.40', avg_elapsed_ms: '760000' }
const DEPTH = [{ deepest_map: 1, runs: '500' }, { deepest_map: 2, runs: '400' }]
const STARTERS = [{ starter_id: 4, picks: '44', wins: '5' }]
const ECONOMY = { total_runs: '1284', avg_cash: '612', avg_catches: '6.80', runs_with_shiny: '32', runs_with_legendary: '12' }

function mockAll({ failing = null } = {}) {
  rpc.mockImplementation(name => {
    if (name === failing) return Promise.resolve({ data: null, error: new Error('boom') })
    if (name === 'admin_player_engagement') return Promise.resolve({ data: [ENGAGEMENT], error: null })
    if (name === 'admin_player_difficulty') return Promise.resolve({ data: [DIFFICULTY], error: null })
    if (name === 'admin_player_depth') return Promise.resolve({ data: DEPTH, error: null })
    if (name === 'admin_player_starters') return Promise.resolve({ data: STARTERS, error: null })
    if (name === 'admin_player_economy') return Promise.resolve({ data: [ECONOMY], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
}

const renderPanel = () =>
  render(<ThemeProvider><PlayerStatsPanel theme={theme} /></ThemeProvider>)

test('renders every panel figure once the queries land', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())   // total runs
  expect(screen.getByText('212')).toBeTruthy()                          // active players
  expect(screen.getByText('6.1')).toBeTruthy()                          // runs per player
  expect(screen.getByText('9%')).toBeTruthy()                           // win rate
  expect(screen.getByText('$612')).toBeTruthy()                         // avg cash
})

test('one failed query leaves the other panels standing', async () => {
  // The whole point of per-panel error state: an empty Economy panel and a
  // broken one lead to opposite tuning decisions, so they must look different.
  mockAll({ failing: 'admin_player_economy' })
  renderPanel()

  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())
  expect(screen.getByText(/didn't load/)).toBeTruthy()
  // The healthy panels still rendered.
  expect(screen.getByText('212')).toBeTruthy()
  expect(screen.getByText('9%')).toBeTruthy()
})

test('a region with no runs reads as empty, not as a failure', async () => {
  rpc.mockImplementation(name => {
    if (name === 'admin_player_depth' || name === 'admin_player_starters') {
      return Promise.resolve({ data: [], error: null })
    }
    return Promise.resolve({
      data: [{
        total_runs: '0', active_players: '0', new_players: '0', returning_players: '0',
        wins: '0', avg_maps: null, avg_elapsed_ms: null,
        avg_cash: null, avg_catches: null, runs_with_shiny: '0', runs_with_legendary: '0',
      }],
      error: null,
    })
  })
  renderPanel()

  await waitFor(() => expect(screen.getAllByText(/No runs recorded/).length).toBeGreaterThan(0))
  expect(screen.queryByText('NaN%')).toBeNull()
  expect(screen.queryByText(/didn't load/)).toBeNull()
})

test('changing region clears the previous figures while loading', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  // Hold the next round of requests open.
  rpc.mockImplementation(() => new Promise(() => {}))
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Johto' } })

  // Stale figures under a new region's heading would misattribute one region's
  // numbers to another.
  await waitFor(() => expect(screen.queryByText('1,284')).toBeNull())
  expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
})

test('selecting Unknown asks for unattributed runs, not a region named Unknown', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  rpc.mockClear()
  mockAll()
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: '__unknown__' } })

  await waitFor(() => expect(rpc).toHaveBeenCalled())
  const [, args] = rpc.mock.calls.find(c => c[0] === 'admin_player_engagement')
  // p_unknown_only overrides p_region; sending both would be unsatisfiable.
  expect(args.p_unknown_only).toBe(true)
  expect(args.p_region).toBeNull()
})

test('changing the range sends a p_since, and All time sends null', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  const firstCall = rpc.mock.calls.find(c => c[0] === 'admin_player_engagement')
  expect(firstCall[1].p_since).toBeNull()   // defaults to all time

  rpc.mockClear()
  mockAll()
  fireEvent.change(screen.getByLabelText('Range'), { target: { value: '30d' } })

  await waitFor(() => expect(rpc).toHaveBeenCalled())
  const [, args] = rpc.mock.calls.find(c => c[0] === 'admin_player_engagement')
  expect(typeof args.p_since).toBe('string')
  expect(Number.isNaN(Date.parse(args.p_since))).toBe(false)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/admin/PlayerStatsPanel.test.jsx`
Expected: FAIL — cannot resolve `./PlayerStatsPanel.jsx`.

- [ ] **Step 3: Write the component**

Create `src/components/admin/PlayerStatsPanel.jsx`:

```jsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { regionNames } from '../../game/regionRegistry.js'
import { REGION_STARTERS } from '../../game/starters.js'
import { allLegendaryIds } from '../../game/regionRegistry.js'
import { fmtRunTime } from '../../lib/formatRunTime.js'
import {
  RANGES, sinceFor, toEngagement, toDifficulty, toDepth, toStarters, toEconomy,
} from '../../lib/playerStats.js'

// Aggregate player statistics across ALL users, for tuning feedback. The
// Difficulty & Odds tab sets the knobs; this tab shows what the knobs did.
//
// Every figure comes from a SECURITY DEFINER RPC that carries its own
// server-side admin check (supabase/player_stats.sql). Mounting this component
// behind an isAdmin branch hides the UI; it is not what protects the data.

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

// Sentinel for the region <select> only — never sent as a region name. It maps
// to p_unknown_only: true with p_region: null, because "no region recorded" is
// a different kind of thing from "this region".
const UNKNOWN = '__unknown__'

// Passed into the RPCs rather than hardcoded in SQL: both lists live in JS
// config and grow when a region is added, and a copy in the database would
// drift silently the next time that happens.
const STARTER_IDS = [...new Set(Object.values(REGION_STARTERS).flat())]
const LEGENDARY_IDS = [...allLegendaryIds()]

// The fifteen starters by name, so the Starters panel can label a bar without
// waiting on the species cache to warm.
const STARTER_NAMES = {
  1: 'Bulbasaur', 4: 'Charmander', 7: 'Squirtle',
  152: 'Chikorita', 155: 'Cyndaquil', 158: 'Totodile',
  252: 'Treecko', 255: 'Torchic', 258: 'Mudkip',
  387: 'Turtwig', 390: 'Chimchar', 393: 'Piplup',
  495: 'Snivy', 498: 'Tepig', 501: 'Oshawott',
}

// One figure tile. Module scope, not nested: a component declared during render
// gets a new identity every pass, which defeats reconciliation
// (react-hooks/static-components).
function Figure({ label, value, theme }) {
  return (
    <div style={{
      backgroundColor: theme.innerBg, border: theme.panelBorder, boxShadow: theme.shadow,
      padding: '8px 6px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '2px', minWidth: 0,
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: theme.accentColor }}>
        {value}
      </span>
      <span style={{
        fontFamily: 'Upheaval', fontSize: '10px', color: theme.mutedColor,
        textAlign: 'center', lineHeight: 1.2,
      }}>
        {label}
      </span>
    </div>
  )
}

// A titled section with its own loading / error / empty states.
//
// Per-panel error handling is the point: an empty Economy panel and a broken
// Economy panel lead to opposite tuning decisions, so they must never look the
// same. This is deliberately stricter than GuestProfile, which swallows a
// failed collection query into a silent empty section.
function Section({ title, subtitle, loading, error, empty, theme, children }) {
  return (
    <div style={{
      backgroundColor: theme.innerBg, border: theme.panelBorder, boxShadow: theme.shadow,
      padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: theme.titleSize, color: theme.accentColor }}>
        {title}
      </span>
      {subtitle && (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: theme.mutedColor, lineHeight: 1.4 }}>
          {subtitle}
        </span>
      )}
      {loading ? (
        <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: theme.textColor }}>Loading...</span>
      ) : error ? (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: theme.mutedColor, lineHeight: 1.4 }}>
          This panel didn&apos;t load. Change the region or range to retry.
        </span>
      ) : empty ? (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: theme.mutedColor }}>
          No runs recorded for this selection yet.
        </span>
      ) : children}
    </div>
  )
}

// A labelled percentage bar. Same shape as BalanceDashboard's Bar, kept local
// so this panel does not reach into that file's internals.
function StatBar({ label, pct, valueLabel, icon, theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {icon && <img src={icon} alt="" style={{ width: '20px', height: '20px', imageRendering: 'pixelated', flexShrink: 0 }} />}
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '14px', color: theme.textColor,
        width: theme.labelWidth, flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, height: '9px', backgroundColor: theme.trackBg }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, backgroundColor: theme.accentColor }} />
      </div>
      <span style={{
        fontFamily: 'Upheaval', fontSize: '10px', color: theme.textColor,
        width: '52px', textAlign: 'right', flexShrink: 0,
      }}>
        {valueLabel}
      </span>
    </div>
  )
}

const GRID4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }

export default function PlayerStatsPanel({ theme }) {
  const regions = useMemo(() => regionNames({ playableOnly: true }), [])
  const [region, setRegion] = useState('')       // '' = all regions
  const [rangeKey, setRangeKey] = useState('all')

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    engagement: null, difficulty: null, depth: [], starters: [], economy: null,
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let cancelled = false
    // Deliberate: this effect re-runs on every control change, and without
    // clearing here the PREVIOUS region's figures stay on screen under the new
    // region's heading until the requests land. Misattributing one region's
    // numbers to another is the exact failure this dashboard must not have.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setErrors({})
    setData({ engagement: null, difficulty: null, depth: [], starters: [], economy: null })

    ;(async () => {
      const unknownOnly = region === UNKNOWN
      const base = {
        p_region: unknownOnly || region === '' ? null : region,
        p_since: sinceFor(rangeKey),
        p_unknown_only: unknownOnly,
      }

      // All five together — they are independent, and serialising them would
      // multiply time-to-paint by five.
      const [engagement, difficulty, depth, starters, economy] = await Promise.all([
        supabase.rpc('admin_player_engagement', base),
        supabase.rpc('admin_player_difficulty', base),
        supabase.rpc('admin_player_depth', base),
        supabase.rpc('admin_player_starters', { ...base, p_starter_ids: STARTER_IDS }),
        supabase.rpc('admin_player_economy', { ...base, p_legendary_ids: LEGENDARY_IDS }),
      ])
      if (cancelled) return

      setErrors({
        engagement: !!engagement.error,
        difficulty: !!difficulty.error || !!depth.error,
        starters: !!starters.error,
        economy: !!economy.error,
      })
      setData({
        engagement: toEngagement(engagement.data?.[0] ?? null),
        difficulty: toDifficulty(difficulty.data?.[0] ?? null),
        depth: toDepth(depth.data),
        starters: toStarters(starters.data),
        economy: toEconomy(economy.data?.[0] ?? null),
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [region, rangeKey])

  const selectStyle = {
    fontFamily: 'Upheaval', fontSize: '12px', color: theme.textColor,
    backgroundColor: theme.innerBg, border: theme.panelBorder,
    padding: '6px 8px', cursor: 'pointer',
  }

  const { engagement, difficulty, depth, starters, economy } = data
  const noRuns = s => !loading && s != null && s.totalRuns === 0

  return (
    <div className="flex flex-col gap-4">
      {/* Controls apply to every panel below. */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: theme.mutedColor }}>Region</span>
          <select
            aria-label="Region"
            value={region}
            onChange={e => setRegion(e.target.value)}
            style={selectStyle}
          >
            <option value="">All regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
            {/* Runs recorded before runs.region existed, plus any the backfill
                could not attribute. Shown rather than hidden: a visible bucket
                is honest about how much of the picture is inferred. */}
            <option value={UNKNOWN}>Unknown</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: theme.mutedColor }}>Range</span>
          <select
            aria-label="Range"
            value={rangeKey}
            onChange={e => setRangeKey(e.target.value)}
            style={selectStyle}
          >
            {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
      </div>

      <Section
        title="Engagement"
        subtitle="Is anyone playing this region? Every figure covers the selected range."
        loading={loading} error={errors.engagement} empty={noRuns(engagement)} theme={theme}
      >
        {engagement && (
          <div style={GRID4}>
            <Figure label="Total runs" value={engagement.totalRuns.toLocaleString()} theme={theme} />
            <Figure label="Active players" value={engagement.activePlayers.toLocaleString()} theme={theme} />
            <Figure label="Runs / player" value={engagement.runsPerPlayer} theme={theme} />
            <Figure label="New players" value={engagement.newPlayers.toLocaleString()} theme={theme} />
          </div>
        )}
      </Section>

      <Section
        title="Difficulty"
        subtitle="Deepest map reached, not where runs died — nothing records a quit, so an abandoned run and a lost one look the same."
        loading={loading} error={errors.difficulty} empty={noRuns(difficulty)} theme={theme}
      >
        {difficulty && (
          <>
            <div style={GRID4}>
              <Figure label="Avg maps" value={difficulty.avgMaps} theme={theme} />
              <Figure label="Win rate" value={`${difficulty.winRate}%`} theme={theme} />
              <Figure label="Avg length" value={fmtRunTime(difficulty.avgElapsedMs) ?? '—'} theme={theme} />
              <Figure label="Wins" value={difficulty.wins.toLocaleString()} theme={theme} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              {depth.map(d => (
                <StatBar
                  key={d.deepestMap}
                  label={`Map ${d.deepestMap}`}
                  pct={d.pct}
                  valueLabel={`${d.pct}%`}
                  theme={theme}
                />
              ))}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Starters"
        subtitle="Counted over runs started — what players reach for, not what worked."
        loading={loading} error={errors.starters} empty={!loading && starters.length === 0} theme={theme}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {starters.map(s => (
            <StatBar
              key={s.starterId}
              label={STARTER_NAMES[s.starterId] ?? `#${s.starterId}`}
              icon={SPRITE(s.starterId)}
              pct={s.pickPct}
              valueLabel={`${s.pickPct}% · ${s.winRate}%`}
              theme={theme}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Economy"
        subtitle="Shiny and legendary figures are the share of runs that SAW one — the columns are deduped per run, so two in one run counts once."
        loading={loading} error={errors.economy} empty={noRuns(economy)} theme={theme}
      >
        {economy && (
          <div style={GRID4}>
            <Figure label="Avg cash" value={`$${economy.avgCash.toLocaleString()}`} theme={theme} />
            <Figure label="Avg catches" value={economy.avgCatches} theme={theme} />
            <Figure label="Runs w/ shiny" value={`${economy.shinyRate}%`} theme={theme} />
            <Figure label="Runs w/ legendary" value={`${economy.legendaryRate}%`} theme={theme} />
          </div>
        )}
      </Section>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/admin/PlayerStatsPanel.test.jsx`
Expected: PASS, 6 tests.

If the "no runs" test fails because `getAllByText` finds nothing, check that `noRuns()` is reached — `totalRuns === 0` requires the transform to have run, so a null row would skip it.

- [ ] **Step 5: Verify lint**

Run: `npx eslint src/components/admin/PlayerStatsPanel.jsx src/components/admin/PlayerStatsPanel.test.jsx`
Expected: at most ONE error — the `react-hooks/set-state-in-effect` on the deliberate `setLoading(true)`, which carries an inline disable comment. If that disable is working, expect zero output.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/PlayerStatsPanel.jsx src/components/admin/PlayerStatsPanel.test.jsx
git commit -m "feat: Player Stats admin panel

Four panels over five parallel RPCs, filterable by region and range.

Per-panel error state is deliberately stricter than GuestProfile, which
swallows a failed query into a silent empty section: here an empty
Economy panel and a broken one would lead to opposite tuning decisions,
so they must look different.

Selecting Unknown sends p_unknown_only rather than a region named
'Unknown' — 'no region recorded' is a different kind of thing from a
region, and ANDing the two would be unsatisfiable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Mount as a third Admin dashboard tab

**Files:**
- Modify: `src/components/BalanceDashboard.jsx:441-455`

**Interfaces:**
- Consumes: `PlayerStatsPanel` (Task 5).
- Produces: the tab is reachable in the running app.

- [ ] **Step 1: Import the panel**

At the top of `src/components/BalanceDashboard.jsx`, after the other component imports, add:

```javascript
import PlayerStatsPanel from './admin/PlayerStatsPanel.jsx'
```

- [ ] **Step 2: Add the third tab button**

Find the `header` block (~line 436). It currently has two buttons. Add a third:

```jsx
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button style={tabButtonStyle(dashTab === 'tuning')} onClick={() => setDashTab('tuning')}>Difficulty &amp; Odds</button>
        <button style={tabButtonStyle(dashTab === 'shop')} onClick={() => setDashTab('shop')}>Shop</button>
        <button style={tabButtonStyle(dashTab === 'players')} onClick={() => setDashTab('players')}>Player Stats</button>
      </div>
```

- [ ] **Step 3: Add the branch**

Immediately after the existing `if (dashTab === 'shop') { … }` block (~line 448-455), add:

```jsx
  if (dashTab === 'players') {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <PlayerStatsPanel theme={theme} />
      </div>
    )
  }
```

- [ ] **Step 4: Verify the whole suite and the build**

Run: `npx vitest run 2>&1 | tail -5`
Expected: only the 3 pre-existing `metaProfile.test.js` failures. Every other test passes.

Run: `npx vite build 2>&1 | grep -E "built in|error"`
Expected: `✓ built in <n>ms`.

- [ ] **Step 5: Verify the Stats.jsx reset effect needs no change**

This plan mounts Player Stats INSIDE the Admin dashboard, so `Stats.jsx`'s `tab` state never takes the value `'playerstats'` — it only ever becomes `'balance'`. The existing reset at `Stats.jsx:63` therefore already covers losing admin mid-session.

Run: `grep -n "t === 'balance'" src/components/Stats.jsx`
Expected: one match, on the reset-effect line. **Confirm it is unchanged.** If a future change moves Player Stats to its own top-level tab, that line must gain `|| t === 'playerstats'`.

- [ ] **Step 6: Verify lint**

Run: `npx eslint src/components/BalanceDashboard.jsx 2>&1 | tail -3`
Expected: the same error count as before this task. Compare with `git stash && npx eslint src/components/BalanceDashboard.jsx | tail -3 && git stash pop` if unsure.

- [ ] **Step 7: Commit**

```bash
git add src/components/BalanceDashboard.jsx
git commit -m "feat: mount Player Stats as a third Admin dashboard tab

The spec called for a fourth top-level tab in Stats.jsx, but the admin
surface has since grown its own internal tab row (Difficulty & Odds /
Shop). A third tab there is consistent with what exists, avoids a fifth
top-level button on a header the codebase already warns overflows on
mobile, and reuses the theme bundle BalanceDashboard already builds.

Stats.jsx is deliberately untouched: tab never becomes 'playerstats', so
the existing admin-lost reset already covers this surface.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Region backfill script

Last, because it is the only irreversible step. Dry-run by default.

**Files:**
- Create: `scripts/backfillRunRegions.mjs`

**Interfaces:**
- Consumes: `runs.region` (Task 1), `catches` (Task 1), and **`runs.id`** — whose existence Task 1 Step 2 confirms. If that step found no `id` column, the update below must match on `user_id` + `created_at` instead.
- Produces: a CLI script. No code depends on it.

- [ ] **Step 1: Check how existing scripts read config**

Run: `ls scripts/ && head -20 scripts/buildPokedex.mjs`
Note the conventions used (argument parsing, env access, output style) and follow them where they apply.

- [ ] **Step 2: Write the script**

Create `scripts/backfillRunRegions.mjs`:

```javascript
// One-time backfill of runs.region for runs recorded before the column existed.
//
// NOT part of supabase/player_stats.sql, deliberately: schema files here are
// idempotent and safe to re-run, a data migration is neither, and mixing them
// invites someone to re-run this months later over rows that are already right.
//
// METHOD. A run has no region, but its CATCHES do. For each unattributed run,
// take its time window (created_at back by elapsed_ms) and read that user's
// catches inside it. If every catch in the window names the same region, that
// is the run's region.
//
// THREE TIERS, because the middle one is what keeps Unknown honest:
//   1. catches in window, all agreeing        -> assign
//   2. window empty but pokemon_caught > 0    -> DO NOT assign, count as
//      needs-review. A non-zero count here means elapsed_ms does not mean what
//      this window assumes, and the rule needs revisiting before any write.
//   3. everything else                        -> leave null (Unknown)
//
// Only ever writes rows where region is null, so re-running never overwrites a
// directly-recorded value.
//
// USAGE:
//   node scripts/backfillRunRegions.mjs            # dry run, writes nothing
//   node scripts/backfillRunRegions.mjs --write    # actually writes
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment: it
// reads every user's catches and writes every user's runs, so it must bypass
// RLS. NEVER commit the key.

import { createClient } from '@supabase/supabase-js'

const WRITE = process.argv.includes('--write')
const BATCH = 500

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  console.log(WRITE ? 'WRITE MODE — this will modify runs.region' : 'DRY RUN — nothing will be written')

  const { data: runs, error } = await db
    .from('runs')
    .select('id, user_id, created_at, elapsed_ms, pokemon_caught')
    .is('region', null)
  if (error) throw error

  console.log(`${runs.length} runs with no region.`)

  const assign = []                    // { id, region }
  let needsReview = 0
  let unknown = 0
  const byRegion = new Map()

  for (const run of runs) {
    // Tier 3: no window to search.
    if (run.elapsed_ms == null) { unknown++; continue }

    const end = new Date(run.created_at)
    const start = new Date(end.getTime() - Number(run.elapsed_ms))

    const { data: catches, error: cErr } = await db
      .from('catches')
      .select('region')
      .eq('user_id', run.user_id)
      .gte('caught_at', start.toISOString())
      .lte('caught_at', end.toISOString())
    if (cErr) throw cErr

    if (catches.length === 0) {
      // Tier 2: the run says it caught something, but nothing lands in the
      // window. Do not guess — this is the signal that elapsed_ms is not what
      // the window assumes.
      if ((run.pokemon_caught ?? 0) > 0) needsReview++
      else unknown++
      continue
    }

    const names = [...new Set(catches.map(c => c.region).filter(Boolean))]
    if (names.length === 1) {
      assign.push({ id: run.id, region: names[0] })
      byRegion.set(names[0], (byRegion.get(names[0]) ?? 0) + 1)
    } else {
      // Tier 3: two regions in one window — ambiguous, so leave it null rather
      // than pick one.
      unknown++
    }
  }

  console.log('')
  console.log(`  assign:       ${assign.length}`)
  for (const [region, n] of [...byRegion].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${region}: ${n}`)
  }
  console.log(`  needs-review: ${needsReview}   (window empty but pokemon_caught > 0)`)
  console.log(`  unknown:      ${unknown}`)
  console.log('')

  if (needsReview > 0) {
    console.log('needs-review is non-zero: elapsed_ms may not cover the whole run.')
    console.log('Investigate before trusting the assignments above.')
  }

  if (!WRITE) {
    console.log('Dry run complete. Re-run with --write to apply.')
    return
  }

  for (let i = 0; i < assign.length; i += BATCH) {
    const slice = assign.slice(i, i + BATCH)
    // One update per row, batched only in how many are in flight: PostgREST has
    // no multi-row update-with-different-values, and a single giant statement
    // would lock the table.
    await Promise.all(slice.map(a =>
      db.from('runs').update({ region: a.region }).eq('id', a.id).is('region', null)
    ))
    console.log(`  wrote ${Math.min(i + BATCH, assign.length)} / ${assign.length}`)
  }
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Verify it parses and refuses to run without credentials**

Run: `node scripts/backfillRunRegions.mjs`
Expected: `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.` and exit code 1. This confirms the file parses and the credential guard works.

- [ ] **Step 4: Verify lint**

Run: `npx eslint scripts/backfillRunRegions.mjs 2>&1 | tail -3`
Expected: no errors. If eslint does not cover `scripts/`, skip this step.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfillRunRegions.mjs
git commit -m "feat: one-time backfill for runs.region

Infers a historical run's region from the catches inside its time window.
Dry-run by default; --write to apply.

Three tiers, and the middle one is the point: a run whose window is empty
but which recorded catches is counted as needs-review rather than being
dumped into Unknown. A non-zero count there means elapsed_ms is not what
the window assumes, and the rule needs revisiting before any write.

Only writes rows where region is null, so re-running never overwrites a
directly-recorded value.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none modified.

- [ ] **Step 1: Full test suite**

Run: `npx vitest run 2>&1 | tail -6`
Expected: only the 3 pre-existing `metaProfile.test.js` failures. All new tests pass (26 in `playerStats.test.js`, 6 in `PlayerStatsPanel.test.jsx`).

- [ ] **Step 2: Lint delta**

Run: `npx eslint src/lib/playerStats.js src/components/admin/ 2>&1 | tail -3`
Expected: zero errors in the new files.

- [ ] **Step 3: Build**

Run: `npx vite build 2>&1 | grep -E "built in|error"`
Expected: `✓ built in <n>ms`.

- [ ] **Step 4: Write the deploy runbook**

Create `docs/superpowers/plans/2026-08-13-player-stats-deploy.md`:

```markdown
# Player Stats — Deploy Runbook

THE ORDER MATTERS. Reversing steps 1 and 2 discards every finished run
until the SQL lands: a PostgREST insert naming a column that does not
exist fails the ENTIRE insert, and App.jsx:787 documents this having
happened before with pokemon_seen_shiny_ids.

## 1. Apply the SQL (Supabase Dashboard -> SQL Editor)

In this order, all idempotent:

1. `supabase/runs_tracking.sql`  — adds elapsed_ms, starter_id, region + indexes
2. `supabase/catches.sql`        — VERIFY against the live table first; if the
                                   live shape differs, the live shape wins and
                                   the file is corrected to match
3. `supabase/player_stats.sql`   — the five admin RPCs

## 2. Verify the region filter actually filters

The parameter-shadowing trap produces no error and no crash, only wrong
numbers that look right, so it cannot be caught by any unit test. Check
by hand, once, in the SQL editor:

    select * from admin_player_engagement(null, null, false);
    select * from admin_player_engagement('Kanto', null, false);

THE TWO RESULTS MUST DIFFER (assuming Kanto has runs and is not the only
region with any). If they match, an argument is being shadowed by a
column and every panel is reporting all-region figures under a single
region heading.

## 3. Deploy the client

Only now does recordRunEnd start sending `region`, into a column that
already exists.

## 4. Backfill (last — the only irreversible step)

    export SUPABASE_URL=...
    export SUPABASE_SERVICE_ROLE_KEY=...
    node scripts/backfillRunRegions.mjs           # dry run

READ THE needs-review COUNT. If it is non-zero, elapsed_ms does not cover
the whole run and the matching rule needs revisiting before writing.

    node scripts/backfillRunRegions.mjs --write
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-13-player-stats-deploy.md
git commit -m "docs: deploy runbook for Player Stats

Includes the manual region-filter check: the parameter-shadowing trap
produces no error, only wrong numbers that look right, so it cannot be
caught by any unit test and must be verified by hand once.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: schema drift + region + indexes → Task 1; the RPCs, admin gate, `p_` prefix, precedence, `search_path` → Task 2; client write → Task 3; transforms, rate guards, bigint coercion, deepest-map → Task 4; four panels, controls, per-panel errors, stale clearing, empty states → Task 5; integration → Task 6; backfill with three tiers, dry-run, batching, credentials → Task 7; deploy order and the manual shadowing check → Task 8.

**Three spec items are deliberately not implemented**, all consequences of mounting inside the Admin dashboard instead of adding a fifth top-level tab (see "Deviation from the spec"): the `Stats.jsx` reset-effect change (already satisfied — Task 6 Step 5 verifies rather than changes), the mobile header-overflow handling (moot — no new top-level button), and `useAdminTheme.js` / the `AdminPanels.jsx` extraction (unnecessary — the panel receives the theme `BalanceDashboard` already builds).

**One spec item was split.** §2 lists four RPCs; this plan has five. The Difficulty panel needs both scalar figures and a distribution, which are different row shapes and cannot share a `returns table`. Named `admin_player_difficulty` and `admin_player_depth`.

**One addition beyond the spec.** `admin_player_economy` takes `p_legendary_ids`. The spec says legendary rate but does not say where the id list comes from; hardcoding it in SQL would drift when a region is added, the same reason `p_starter_ids` is a parameter.

**Type consistency.** `theme` keys used in Task 5 match what `BalanceDashboard.jsx:327-336` builds. Transform names in Task 5's imports match Task 4's exports exactly. RPC names and argument names in Task 5 match Task 2's definitions and grants.
