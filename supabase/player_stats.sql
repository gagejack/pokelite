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
  -- First-ever run per player, deliberately NOT filtered by p_since or region:
  -- "new" asks whether a player's debut falls in the window, so the min() must
  -- see their whole history.
  --
  -- It DOES still carry the admin predicate. Without it this CTE was the one
  -- unguarded read in the function: `scoped` correctly returned nothing for a
  -- non-admin while `debut` counted every player, so the function reported
  -- "13 new players, 0 active" to a caller entitled to see neither. Every CTE
  -- that touches public.runs needs the gate, not just the one that feeds the
  -- headline figure.
  debut as (
    select r.user_id, min(r.created_at) as first_run
    from public.runs r
    where exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
          )
    group by r.user_id
  )
  select
    coalesce((select sum(runs) from per_player), 0)::bigint            as total_runs,
    (select count(*) from per_player)::bigint                          as active_players,
    (select count(*) from debut
      where p_since is null or debut.first_run >= p_since)::bigint     as new_players,
    (select count(*) from per_player where runs >= 2)::bigint          as returning_players;
$$;

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
--
-- Split by starter as well as depth: one row per (deepest_map, starter_id), so
-- the panel can colour each depth bar by which starter the run began with and
-- show how far players get per starter. Callers that only want the depth curve
-- sum the starters within a bin — the bins themselves are unchanged.
--
-- starter_id is NOT coalesced to a sentinel. Runs recorded before the column
-- existed leave it null, and folding those into a real starter would inflate
-- that starter's depth curve with runs it never played. The panel renders them
-- as their own unattributed segment instead.
create or replace function public.admin_player_depth(
  p_region       text        default null,
  p_since        timestamptz default null,
  p_unknown_only boolean     default false
)
returns table (
  deepest_map integer,
  starter_id  integer,
  runs        bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    (r.maps_cleared + case when r.result = 'win' then 0 else 1 end)::integer as deepest_map,
    r.starter_id::integer                                                     as starter_id,
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
  group by 1, 2
  order by 1, 2;
$$;

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
