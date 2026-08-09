-- Global leaderboard for Speedmon.
--
-- The leaderboard has to read EVERY player's runs, but `runs` and `profiles`
-- are both locked to own-row-only by RLS (see runs_tracking.sql and
-- username_auth.sql) and must stay that way — `profiles` holds signup emails.
--
-- So this exposes one SECURITY DEFINER function that aggregates across users
-- and returns only the four public figures the board shows. It never returns
-- an email or a user id. Same pattern as get_email_for_username: definer
-- rights to cross RLS, a narrow return type so nothing else leaks.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New
-- query). Idempotent — safe to re-run.

-- 1. The function -------------------------------------------------------------
-- One row per player who has recorded at least one run.
--
-- `xp` is lifetime Speed Cash earned — the same number Stats.jsx sums client
-- side. Level is NOT computed here: level.js owns the curve, and duplicating
-- the threshold arithmetic in SQL is how the two surfaces drift apart. The
-- client passes this straight to levelForXp().
--
-- `is_self` lets the client mark the caller's own row without a second query,
-- and resolves to false for anonymous callers.
create or replace function public.leaderboard(limit_n integer default 100)
returns table (
  username    text,
  xp          bigint,
  maps_played bigint,
  champions   bigint,
  is_self     boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.username,
    coalesce(sum(r.speed_cash_earned), 0)::bigint            as xp,
    coalesce(sum(r.maps_cleared), 0)::bigint                 as maps_played,
    count(*) filter (where r.result = 'win')::bigint         as champions,
    (p.id = auth.uid())                                      as is_self
  from public.profiles p
  join public.runs r on r.user_id = p.id
  group by p.id, p.username
  -- Champions first, then lifetime XP as the tiebreak (the sort the board
  -- displays), then username so equal players hold a stable order between
  -- calls instead of shuffling.
  order by champions desc, xp desc, lower(p.username) asc
  limit greatest(1, least(coalesce(limit_n, 100), 500));
$$;

-- Anonymous callers may read the board too — it is public information, and a
-- logged-out player seeing the ladder is a reason to sign up.
grant execute on function public.leaderboard(integer) to anon, authenticated;

-- 2. Rank lookup for the caller ----------------------------------------------
-- A player below the fetched window still needs to see where they stand. This
-- returns their rank over the WHOLE table rather than the visible slice, so the
-- pinned self-row shows a true position (e.g. #212 of 340), not #100.
--
-- Returns null for a caller who is anonymous or has no recorded runs.
create or replace function public.leaderboard_self_rank()
returns table (
  username    text,
  xp          bigint,
  maps_played bigint,
  champions   bigint,
  rank        bigint,
  total       bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with board as (
    select
      p.id,
      p.username,
      coalesce(sum(r.speed_cash_earned), 0)::bigint    as xp,
      coalesce(sum(r.maps_cleared), 0)::bigint         as maps_played,
      count(*) filter (where r.result = 'win')::bigint as champions
    from public.profiles p
    join public.runs r on r.user_id = p.id
    group by p.id, p.username
  ),
  ranked as (
    -- row_number, not rank: the board is a strict ordering with username as the
    -- final tiebreak, so no two players share a position and the displayed
    -- rank always matches the row's index in leaderboard().
    select
      board.*,
      row_number() over (order by champions desc, xp desc, lower(username) asc) as rank,
      count(*) over () as total
    from board
  )
  select username, xp, maps_played, champions, rank, total
  from ranked
  where id = auth.uid();
$$;

grant execute on function public.leaderboard_self_rank() to authenticated;
