-- Public player profiles for Speedmon.
--
-- The leaderboard lets you click a name to open that player's profile. That
-- profile has to read someone ELSE's runs, but `runs` is locked own-row-only by
-- RLS (runs_tracking.sql) and `profiles` is locked own-row-only because it
-- holds signup emails (username_auth.sql). Both must stay that way.
--
-- So this exposes one SECURITY DEFINER function that aggregates a single named
-- player's runs and returns only the figures the profile panel draws. Same
-- pattern and the same discipline as leaderboard(): definer rights to cross
-- RLS, a narrow return type so nothing else leaks.
--
-- WHAT IS DELIBERATELY NOT HERE, and why:
--   * email, user id — never selected. The whole reason profiles is RLS-locked.
--   * winning_roster — the Hall of Fame stays a private trophy case. It is the
--     only remaining private section, and the one thing a guest profile says
--     out loud that it will not show.
--   * caught_at, region — a catch's timestamp says when someone was playing.
--     The counts below say what they caught, which is what the profile asks.
--
-- Collections (Most Caught, Favourite Starter, Legendaries, Shinies) ARE public:
-- they are species counts, and nothing in them identifies a person.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New
-- query). Idempotent — safe to re-run. Re-run it after changing the signature:
-- this file now defines TWO functions, and the collections one is new.

-- One row for the named player, or no rows if the username does not exist or
-- has no recorded runs. The client renders "no rows" as an empty-profile state,
-- which is also what a made-up username gets — so this never confirms or denies
-- that an account exists beyond what the leaderboard already shows.
--
-- `xp` is lifetime Speed Cash earned, exactly as leaderboard() returns it.
-- Level is NOT computed here: level.js owns the curve, and duplicating the
-- threshold arithmetic in SQL is how two surfaces drift apart.
--
-- Every figure below is derived from the same `runs` columns Stats.jsx already
-- sums client-side for the signed-in player, so the two profiles report the
-- same numbers computed the same way.
create or replace function public.player_profile(uname text)
returns table (
  username        text,
  xp              bigint,
  total_runs      bigint,
  wins            bigint,
  losses          bigint,
  total_badges    bigint,
  total_catches   bigint,
  best_maps       integer,
  best_elapsed_ms bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with player as (
    -- lower() on both sides so a name clicked off the board resolves
    -- regardless of how it was cased at signup. The board sorts by
    -- lower(username) already, so this matches the ordering players see.
    select p.id, p.username
    from public.profiles p
    where lower(p.username) = lower(uname)
    limit 1
  ),
  -- The deepest single run, and how long THAT run took. Ranked on depth
  -- alone, with elapsed_ms carried along as a detail of the winning row —
  -- not min(elapsed_ms), which would pair a deep run's badge count with some
  -- other run's clock. Mirrors the `best` reduce in Stats.jsx.
  best as (
    select r.maps_cleared, r.elapsed_ms
    from public.runs r
    join player on r.user_id = player.id
    order by r.maps_cleared desc nulls last, r.elapsed_ms asc nulls last
    limit 1
  )
  select
    player.username,
    coalesce(sum(r.speed_cash_earned), 0)::bigint            as xp,
    count(r.*)::bigint                                       as total_runs,
    count(*) filter (where r.result = 'win')::bigint          as wins,
    count(*) filter (where r.result = 'loss')::bigint         as losses,
    coalesce(sum(r.maps_cleared), 0)::bigint                 as total_badges,
    coalesce(sum(r.pokemon_caught), 0)::bigint               as total_catches,
    (select maps_cleared from best)                          as best_maps,
    (select elapsed_ms from best)::bigint                    as best_elapsed_ms
  from player
  join public.runs r on r.user_id = player.id
  group by player.username;
$$;

-- Anonymous callers may read a profile for the same reason they may read the
-- board: it is public standing, and a logged-out visitor browsing the ladder is
-- a reason to sign up.
grant execute on function public.player_profile(text) to anon, authenticated;

-- 2. Collections --------------------------------------------------------------
-- Per-species catch counts for the named player: the Most Caught grid, the
-- Legendaries and Shinies popups, and the favourite starter.
--
-- Separate from player_profile() rather than bolted onto it. The figures above
-- are one row of scalars; this is three variable-length lists, and merging them
-- would mean either array columns on a scalar row or one query returning a
-- ragged shape. Two RPCs also mean the headline figures paint without waiting
-- on the collection aggregation.
--
-- WHY THE ID LISTS ARE PARAMETERS, not literals in this file:
-- `legendary_ids` comes from regionRegistry.js and `starter_ids` from
-- starters.js. Both change when a region is added. Hardcoding them here would
-- create a second source of truth that drifts silently the next time the game
-- gains a region — the profile would quietly stop counting a new legendary, and
-- nothing would fail loudly. The client passes what it already knows.
--
-- Returns one row per species, tagged by which list it belongs to. `kind` is
-- 'caught' | 'legendary' | 'shiny'; a species can appear under more than one
-- (a shiny legendary is both), exactly as the client's three maps do.
-- The earlier two-argument version is dropped FIRST: `create or replace` does
-- not replace a function whose signature changed, it adds an overload. Two
-- versions differing only by a defaulted trailing argument make a two-argument
-- call ambiguous, and PostgREST fails it. This must run before the create
-- below, or it would drop the function this file just defined. Safe if the old
-- version never existed.
drop function if exists public.player_collections(text, integer[]);

-- `limit_n` is what the profile grid shows (10) versus what the "View all"
-- popup shows (the whole list). The cap exists so the grid keeps its shape on
-- the profile, not because the rest of the data is withheld — passing a larger
-- number returns more, and 0 or null returns everything.
create or replace function public.player_collections(
  uname       text,
  starter_ids integer[] default '{}',
  limit_n     integer default 10
)
returns table (
  kind       text,
  species_id integer,
  name       text,
  count      bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with player as (
    select p.id
    from public.profiles p
    where lower(p.username) = lower(uname)
    limit 1
  ),
  -- One row per species with its total, plus the flags the three lists filter
  -- on. Aggregating once and slicing it three ways rather than three scans.
  --
  -- The NAME is max(c.name), not an arbitrary pick: a species can be stored
  -- under slightly different names across rows, and an aggregate needs a
  -- deterministic choice so the same profile renders the same name twice.
  per_species as (
    select
      c.species_id,
      max(c.name)      as name,
      count(*)::bigint as total
    from public.catches c
    join player on c.user_id = player.id
    group by c.species_id
  )
  -- Most caught, starters EXCLUDED and capped at 10. A starter is chosen, not
  -- caught, so counting it would put whatever you pick most at the top of a
  -- list about catching — a different question, answered by
  -- player_favourite_starter() below. Mirrors the topCaught slice in Stats.jsx.
  select 'caught'::text, species_id, name, total
  from per_species
  where not (species_id = any (starter_ids))
  order by total desc, species_id asc
  -- null (or 0, or a negative) means "no cap" — the popup asks for the whole
  -- list that way rather than passing a magic large number that a prolific
  -- player could one day exceed.
  limit case when coalesce(limit_n, 0) > 0 then limit_n else null end
$$;

-- The three lists are unioned client-side rather than in one statement: a
-- single SQL union with a per-branch LIMIT needs subqueries that PostgREST
-- cannot order predictably, and the client already merges them. Splitting the
-- legendary and shiny lists into their own function keeps each one a plain
-- ordered select.
create or replace function public.player_collection_rares(
  uname         text,
  legendary_ids integer[] default '{}'
)
returns table (
  kind       text,
  species_id integer,
  name       text,
  count      bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with player as (
    select p.id
    from public.profiles p
    where lower(p.username) = lower(uname)
    limit 1
  ),
  per_species as (
    select
      c.species_id,
      max(c.name)                             as name,
      count(*)::bigint                        as total,
      count(*) filter (where c.shiny)::bigint as shiny_total
    from public.catches c
    join player on c.user_id = player.id
    group by c.species_id
  )
  -- Legendaries: every catch of a species on the passed list, shiny or not.
  select 'legendary'::text, species_id, name, total
  from per_species
  where species_id = any (legendary_ids)
  union all
  -- Shinies: only the shiny catches, so the count is shinies-of-that-species
  -- rather than total catches of a species you once caught a shiny of.
  select 'shiny'::text, species_id, name, shiny_total
  from per_species
  where shiny_total > 0
  order by 4 desc, 2 asc
$$;

-- Favourite starter, counted over runs STARTED — the honest reading of
-- "favourite". Counting wins would answer "most successful", a different stat.
-- It reads `runs`, not `catches`, which is why it is not in the functions
-- above.
create or replace function public.player_favourite_starter(uname text)
returns table (
  starter_id integer,
  count      bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select r.starter_id, count(*)::bigint as count
  from public.runs r
  join public.profiles p on p.id = r.user_id
  where lower(p.username) = lower(uname)
    and r.starter_id is not null
  group by r.starter_id
  -- Ties break on the lower species id, matching the client's sort so the same
  -- history never shows two different favourites on two surfaces.
  order by count desc, r.starter_id asc
  limit 1;
$$;

grant execute on function public.player_collections(text, integer[], integer) to anon, authenticated;
grant execute on function public.player_collection_rares(text, integer[]) to anon, authenticated;
grant execute on function public.player_favourite_starter(text) to anon, authenticated;
