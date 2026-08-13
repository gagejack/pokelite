# Player Stats (Admin) — Design

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning

## Summary

A fourth admin tab beside Stats / Hall of Fame / Balance, showing aggregate
player behaviour **across all users**: engagement, difficulty, starter choice,
and economy. Every figure is filterable by region and by date range.

Its purpose is tuning feedback. The Balance tab sets the knobs; this tab shows
what the knobs did. That split is why it is a separate surface rather than a
fifth section inside Balance.

Two facts shape the whole design:

- **`runs` does not record a region today.** Every per-region figure depends on
  a new column, plus a best-effort backfill of history. Until runs accumulate,
  per-region panels are thin, and some history is permanently unattributable.
- **These queries read every user's rows.** `runs` and `catches` are both
  RLS-locked to own-row-only, so the tab needs SECURITY DEFINER RPCs with a
  server-side admin check. The client-side `isAdmin` flag hides UI; it is not a
  security boundary.

## Naming

Player-facing tab label: **Player Stats**. Code identifier: `'playerstats'`,
matching the existing `'balance'` tab key in `Stats.jsx`.

## Architecture

Three layers, mirroring the guest-profile work already in the tree.

### 1. Schema

Two changes to `runs`:

```sql
alter table public.runs
  add column if not exists region text;
```

`region` is nullable by design. A null means "region unknown", which is a real
state for historical rows and must stay distinguishable from any actual region
name — never defaulted to 'Kanto'.

`App.jsx recordRunEnd` writes `region: selectedRegion?.name ?? null` into the
existing payload. This is the same value `recordCatch` already writes and the
same one the daily-attempt submission already sends, so no new plumbing is
needed to obtain it.

### 2. SQL — `supabase/player_stats.sql`

Four SECURITY DEFINER functions, one per panel:

| Function | Feeds |
|---|---|
| `admin_player_engagement(region, since)` | Engagement panel |
| `admin_player_difficulty(region, since)` | Difficulty panel |
| `admin_player_starters(region, since, starter_ids)` | Starters panel |
| `admin_player_economy(region, since)` | Economy panel |

Every one is admin-gated with the same role predicate the repo already uses in
`game_tuning.sql`, `region_balance.sql` and `meta_shop_prices.sql`:

```sql
exists (select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin')
```

**One deliberate departure from existing practice.** In those three files that
predicate appears inside an RLS *policy*. There is no `plpgsql` and no `raise
exception` anywhere in this repo today — every function is `language sql`. These
RPCs are the first place the check has to live inside a function body, because a
SECURITY DEFINER function bypasses RLS by definition and therefore cannot lean
on a policy to enforce it.

Two ways to write that, and the choice matters:

- **`language sql`, predicate in the WHERE clause.** A non-admin gets zero rows.
  Keeps every function in the repo's existing one-language style; the client
  already renders "no data" states, so an empty result degrades safely.
- **`language plpgsql`, guard then `raise exception`.** A non-admin gets a loud
  error. Clearer during development, but introduces a second function language
  to the codebase for a path the UI already makes unreachable.

**Recommendation: `language sql` with the predicate in the WHERE clause.** It
keeps the codebase to one function language, and the failure mode — an empty
dashboard — is both safe and already handled by the zero-runs empty state. The
security property is identical either way: a non-admin sees nothing.

Granted to `authenticated` only, never `anon`. Unlike the public profile RPCs,
there is no case for a logged-out caller here.

**Shared parameters.**

- `region text default null` — null means "all regions"; a region name filters
  to it.
- `unknown_only boolean default false` — when true, selects rows where `region
  is null`, so the Unknown bucket is inspectable rather than merely counted.
  A separate boolean rather than a sentinel string like `'__unknown__'`: a
  sentinel is a value that could one day collide with a real region name, and
  "no region recorded" is a different kind of thing from "this region", not
  another member of the same list.
- `since timestamptz default null` — null means "all time".

**Starter ids are a parameter**, not a literal, for the same reason as
`player_collections`: `REGION_STARTERS` lives in `starters.js` and changes when
a region is added. A copy in SQL would drift silently.

### 3. Client

- `src/components/PlayerStats.jsx` — the tab. Owns the region and range
  controls, fires the four RPCs, renders four panels.
- `src/lib/playerStats.js` — pure transforms from RPC rows to display shapes,
  plus rate/percentage helpers. Separate module so it is testable without a
  database, and so `PlayerStats.jsx` keeps Fast Refresh
  (`react-refresh/only-export-components`).
- `src/components/admin/AdminPanels.jsx` — **new home for `Panel` and `Bar`**,
  moved out of `BalanceDashboard.jsx`. Both already take a `theme` bundle and
  both are already at module scope, so this is a move, not a rewrite.
  `BalanceDashboard.jsx` imports them from the new location.

**Why a sibling file, not a section of BalanceDashboard.** `BalanceDashboard.jsx`
is 660 lines and is a *tuning-knob editor* — every panel writes. This tab is
*read-only observation*. Four more panels would push that file past 900 lines
and mix two jobs in one component.

## The four panels

A region dropdown and a range selector sit above all four and apply to every
one. The region picker uses `regionNames({ playableOnly: true })`, the same
source BalanceDashboard's picker already uses, plus an explicit **All regions**
and **Unknown** entry.

### Engagement

Total runs · active players · runs per player · new players in range ·
returning-player rate (players with 2+ runs).

Answers: is anyone playing this region?

### Difficulty

Average maps cleared · win rate · average run length · **deepest map reached**
distribution as `Bar` rows.

**The distribution is labelled "Deepest map reached", not "where runs die."**
`maps_cleared` counts maps *cleared*, and an abandoned run is indistinguishable
from a lost one — nothing records a quit. A death curve is a claim this data
cannot support; the deepest-reached distribution is the same shape without the
false precision.

### Starters

Pick % per starter (`Bar` with the species sprite) · win rate per starter ·
most-used species on winning teams.

Answers: is one starter dominant?

Pick % is counted over runs **started**, matching the existing
`player_favourite_starter` definition, so the two surfaces never disagree about
what "favourite" means.

### Economy

Average Speed Cash per run · average catches per run · **% of runs that saw a
shiny** · **% of runs that saw a legendary**.

**Those last two are per-run rates, not per-encounter rates.**
`pokemon_seen_shiny_ids` is a deduped array per run, so a run that met two
shinies is indistinguishable from one that met one. The label says "runs that
saw", which is exactly what the column supports.

## The backfill

A **separate, manually-run script** — `scripts/backfillRunRegions.mjs` — not
part of `player_stats.sql`. Schema files in this repo are idempotent and safe to
re-run; a one-time data migration is neither, and mixing them invites someone to
re-run a backfill months later over rows that are already correct.

**Method.** For each run with `region is null`, take its time window
(`created_at` back by `elapsed_ms`) and read that user's `catches` whose
`caught_at` falls inside it. If every catch in the window names the same region,
assign it. Otherwise leave the run null.

**Accepted limitations**, stated plainly because the dashboard reports on them:

- A run with **zero catches** cannot be attributed and stays `Unknown`.
- Two runs in **different regions within one session** may be ambiguous at the
  boundary; the all-catches-agree rule leaves those null rather than guessing.
- Runs recorded before `elapsed_ms` existed have no window and stay `Unknown`.

The `Unknown` count is **shown in the dashboard**, not hidden. A visible bucket
is honest about how much of the picture is inferred; a silently-dropped one
would make every region figure quietly overconfident.

The script is idempotent in the sense that matters: it only ever writes rows
where `region is null`, so re-running it never overwrites a directly-recorded
value.

## Data flow

On mount, and on any change to region or range, the four RPCs fire together via
`Promise.all` — the same pattern `GuestProfile` uses. They are independent, and
serialising them would multiply time-to-paint by four.

Each panel owns its own error state. One failed RPC renders that panel's error
and leaves the other three standing, matching the collections fail-soft
behaviour already in `GuestProfile`.

Switching region or range clears the previous result before the new request
lands, so stale figures are never shown under a new region's heading — the same
defect the `GuestProfile` switching test pins.

## Error handling

- **Failed RPC** — that panel shows "This panel didn't load. Change the region
  or range to retry." The others render normally.
- **Non-admin caller** — the RPC returns zero rows, which renders as the same
  empty state a region with no runs produces. Unreachable through the UI (the
  tab is gated on `isAdmin`), so it needs no dedicated message; what matters is
  that it leaks nothing.
- **Zero runs in scope** — "No runs recorded for this region yet." Never `NaN%`,
  never an empty panel with no explanation.
- **Division guards on every rate.** A region with zero runs must report 0%, not
  `NaN` — the same class of bug the existing `winRate` guard prevents.
- **bigint coercion.** Postgres `bigint` arrives as a string over PostgREST.
  Every count is coerced in `playerStats.js`, as `toProfileStats` already does.

## Testing

**Unit — `src/lib/playerStats.test.js`:**
- Rate helpers: zero-denominator returns 0, not `NaN` or `Infinity`
- bigint strings coerce to numbers
- Percentage rows sum to ~100% and handle a single-starter case
- The `Unknown` bucket survives transform and is never merged into a named region
- Empty result sets produce empty panels, not crashes

**Component — `src/components/PlayerStats.test.jsx`:**
- Changing region clears the previous figures while loading
- One failed RPC leaves the other three panels rendered
- A zero-run region renders its empty state

**Not tested:** the SQL itself and the backfill script, neither of which can run
without a live database. The backfill's matching rule is the risky part and
should be checked against a real table before it is run in anger.

## Out of scope

- Per-encounter shiny/legendary rates (the data is deduped per run)
- A true death curve (nothing records quits)
- Charts over time; every figure is a snapshot over the selected range
- Exporting or downloading the data
- Any non-admin visibility of these figures

## Open risk

`runs.region` records only from the day it ships. Combined with a best-effort
backfill, per-region panels will be sparse at first and firm up as runs
accumulate. This is expected behaviour, not a defect — the `Unknown` bucket is
what makes it visible rather than misleading.
