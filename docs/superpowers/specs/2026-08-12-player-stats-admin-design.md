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

**Pre-existing schema drift this work must repair first.** `runs.elapsed_ms`,
`runs.starter_id`, and the entire `catches` table are read by shipped code but
defined by no file in `supabase/`. They exist only in the live database. This
tab depends on all three, so committing their DDL is step one — not a tidy-up,
a prerequisite.

## Naming

Player-facing tab label: **Player Stats**. Code identifier: `'playerstats'`,
matching the existing `'balance'` tab key in `Stats.jsx`.

## Architecture

Three layers, mirroring the guest-profile work already in the tree.

### 1. Schema

**Repairing existing drift first.** `runs.elapsed_ms` and `runs.starter_id` are
read by `player_profile.sql` and written by `App.jsx`, but **no `alter table` in
this repo ever adds them**. They exist only in the live database. An environment
rebuilt from `supabase/*.sql` would break the shipped profile RPCs *and* this
tab's backfill and Starters panel. `runs_tracking.sql` gains them:

```sql
alter table public.runs
  add column if not exists elapsed_ms  bigint,
  add column if not exists starter_id  integer,
  add column if not exists region      text;
```

All three are nullable, matching what the live table already holds for
historical rows.

**`catches` has no DDL anywhere in the repo** — only a comment in `App.jsx:824`.
Every surface that reads it (the Pokédex, Stats, and four shipped SECURITY
DEFINER RPCs) assumes a shape no committed file defines. A new
`supabase/catches.sql` commits the authoritative table and its RLS policies:

```sql
create table if not exists public.catches (
  id         bigserial primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  region     text,
  species_id integer,
  name       text,
  shiny      boolean not null default false,
  caught_at  timestamptz not null default now()
);
alter table public.catches enable row level security;
-- own-row-only, mirroring runs_tracking.sql
```

This is documentation of an existing table, not a new one. It must be verified
against the live table before being applied — if the live shape differs, the
live shape wins and this file is corrected to match.

**Indexes.** The four RPCs filter `runs` by region and date on every control
change, and the backfill scans `catches` by user and time:

```sql
create index if not exists runs_region_created_idx
  on public.runs (region, created_at);
create index if not exists runs_created_idx
  on public.runs (created_at);
create index if not exists catches_user_caught_idx
  on public.catches (user_id, caught_at);
```

The second index is not redundant with the first. `runs_region_created_idx`
leads on `region`, so it cannot serve the **All regions** view — the most common
one, and the default — where `region` is unconstrained and only `created_at` is
filtered. A composite index with an unconstrained leading column is not usable
for that scan.

`region` is nullable by design. A null means "region unknown", a real state for
historical rows that must stay distinguishable from any actual region name —
never defaulted to 'Kanto'.

`App.jsx recordRunEnd` writes `region: selectedRegion?.name ?? null` into the
existing payload. This is the same value `recordCatch` already writes and the
same one the daily-attempt submission already sends, so no new plumbing is
needed to obtain it.

### 2. SQL — `supabase/player_stats.sql`

Four SECURITY DEFINER functions, one per panel:

| Function | Feeds |
|---|---|
| `admin_player_engagement(p_region, p_since, p_unknown_only)` | Engagement panel |
| `admin_player_difficulty(p_region, p_since, p_unknown_only)` | Difficulty panel |
| `admin_player_starters(p_region, p_since, p_unknown_only, p_starter_ids)` | Starters panel |
| `admin_player_economy(p_region, p_since, p_unknown_only)` | Economy panel |

Every argument is `p_`-prefixed. See **Shared parameters** below — in
`language sql` this is load-bearing, not cosmetic.

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

**Every argument carries a `p_` prefix. This is a correctness requirement, not
a style preference.**

In a `language sql` function, when an argument name matches a column name in
the query, **the column wins** — silently, with no error. An argument named
`region` would make `r.region = region` resolve to `r.region = r.region`, which
is always true, and `region is null` resolve against the column rather than the
argument. The region filter would quietly no-op and every region heading would
show identical all-region numbers: a confident wrong answer, which is the worst
possible failure for a tool whose entire purpose is informing tuning decisions.

(Note this is the opposite of `plpgsql`, where the argument shadows the column.
The existing `player_profile.sql` functions escape the trap only by accident —
`uname` and `starter_ids` happen not to collide with any column name.)

The repo already has this convention: `increment_badge(p_region text, …)`,
called from `App.jsx:881`.

- `p_region text default null` — null means "all regions"; a region name filters
  to it.
- `p_unknown_only boolean default false` — when true, selects rows where
  `region is null`, so the Unknown bucket is inspectable rather than merely
  counted. A separate boolean rather than a sentinel string like
  `'__unknown__'`: a sentinel is a value that could one day collide with a real
  region name, and "no region recorded" is a different kind of thing from "this
  region", not another member of the same list.
- `p_since timestamptz default null` — null means "all time".
- `p_starter_ids integer[]` — the Starters panel only.

**Precedence, stated so it cannot be guessed at.** `p_unknown_only = true`
**overrides `p_region` entirely**; `p_region` is ignored when it is set. The
alternative — ANDing them — produces `region = 'Kanto' and region is null`,
which is unsatisfiable and would render as a convincing but false "no data"
state. Written as a single branch in SQL:

```sql
where (p_unknown_only and r.region is null)
   or (not p_unknown_only and (p_region is null or r.region = p_region))
```

The UI cannot express the contradiction (the picker is one control whose
Unknown entry sets the boolean and clears the name), but the SQL must not depend
on the UI to stay correct.

**`p_since` has no end bound** — the range is always `[p_since, now)`. That
suits the preset ranges the UI offers (all time, last 7/30/90 days), all of
which end at the present. A custom range with a past end date would need a
second `p_until` argument; it is deliberately not in scope, and the single-bound
shape should not be mistaken for one.

**`set search_path = public, pg_temp` on every function**, and every table
reference schema-qualified. The existing functions in this repo already set
`search_path = public`; adding `pg_temp` closes the remaining hijack vector,
where an attacker-created temp object shadows an intended table inside a
SECURITY DEFINER body.

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

- `src/lib/useAdminTheme.js` — **the shared theme bundle**, currently built by a
  `useMemo` inside `BalanceDashboard` (`:327`). If `PlayerStats` built its own,
  the two admin surfaces would drift into slightly different panel styling, so
  one definition is exported and both dashboards call it.

  **It lives in `lib/`, not in `AdminPanels.jsx`**, for the same reason
  `playerStats.js` is its own module: `eslint.config.js:14` enables
  `reactRefresh.configs.vite`, and exporting a hook from a `.jsx` file that also
  exports components trips `react-refresh/only-export-components`. Putting it in
  `AdminPanels.jsx` would break the exact rule this spec invokes two paragraphs
  earlier. `AdminPanels.jsx` exports `Panel` and `Bar` and nothing else.

**Why a sibling file, not a section of BalanceDashboard.** `BalanceDashboard.jsx`
is 660 lines and is a *tuning-knob editor* — every panel writes. This tab is
*read-only observation*. Four more panels would push that file past 900 lines
and mix two jobs in one component.

### 4. Stats.jsx integration

Three touchpoints, all of which must change together — the third is the one
that is easy to miss and causes a real bug:

1. **Tab button** in the header row, beside Balance, gated on `isAdmin` and
   styled the same yellow.
2. **Body branch**: `tab === 'playerstats' && isAdmin ? <PlayerStats /> : …`.
   The `&& isAdmin` is not redundant with the button being hidden — it is the
   guard that keeps a stale tab value from rendering an admin surface.
3. **The admin-lost reset effect** (`Stats.jsx:63`) currently reads
   `t === 'balance' ? 'stats' : t`. It must become
   `(t === 'balance' || t === 'playerstats') ? 'stats' : t`. Without this, a
   role revoked mid-session while the tab is open leaves `tab` pointing at a
   surface whose button is gone and whose branch now fails its guard — a blank
   sheet with no way back.

**The header tab row and mobile.** `AGENTS.md` puts mobile layout first, and
`Stats.jsx:52` already carries a warning that the sub-tab row overflows on a
phone. This adds a **fourth** top-level tab, and "Player Stats" is the longest
label of the four.

The header row gets `overflow-x: auto` with `flex-shrink: 0` on each button, so
it scrolls horizontally rather than wrapping or clipping. Scrolling is chosen
over shortening the label because the two admin tabs are only ever visible to
admins — the common case is three tabs, which already fits — and an abbreviation
like "Players" would read as a *player list* rather than aggregate statistics.

## The four panels

A region dropdown and a range selector sit above all four and apply to every
one. The region picker uses `regionNames({ playableOnly: true })`, the same
source BalanceDashboard's picker already uses, plus an explicit **All regions**
and **Unknown** entry.

### Engagement

Total runs · active players · runs per player · new players · returning-player
rate.

Answers: is anyone playing this region?

**Every one of these is scoped to the selected range**, stated explicitly
because each has a second plausible reading that yields a different number:

| Figure | Definition |
|---|---|
| Total runs | Runs whose `created_at` is in range |
| Active players | Distinct `user_id` with ≥1 run in range |
| Runs per player | Total runs ÷ active players |
| New players | Players whose **first-ever** run (`min(created_at)` across all time) falls in range |
| Returning rate | Share of active players with **≥2 runs in range** |

"New players" deliberately looks at all-time history to decide *first-ever*,
then asks whether that first run lands in the window — otherwise every player
would count as new in any range that excludes their debut.

### Difficulty

Average maps cleared · win rate · average run length · **deepest map reached**
distribution as `Bar` rows.

**The distribution is labelled "Deepest map reached", not "where runs die."**
`maps_cleared` counts maps *cleared*, and an abandoned run is indistinguishable
from a lost one — nothing records a quit. A death curve is a claim this data
cannot support; the deepest-reached distribution is the same shape without the
false precision.

**"Deepest reached" is not `maps_cleared` — it is one more than that on any run
that did not win.** A loss with `maps_cleared = 3` cleared three maps and then
died on the fourth, so it *reached* map 4. Plotting raw `maps_cleared` under a
"reached" label would shift every losing run one bin left and make the game look
harder, earlier, than it is:

```sql
r.maps_cleared + case when r.result = 'win' then 0 else 1 end as deepest_map
```

A win reached exactly the maps it cleared, so it takes no increment.

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

**The empty-window case must be handled explicitly**, because it is the one that
silently inflates `Unknown`. A run can carry `pokemon_caught > 0` and still have
zero catches inside its computed window — if `elapsed_ms` measures something
narrower than wall-clock time, or a catch landed on the boundary. Treating that
as "no catches" would dump attributable runs into `Unknown` with no way to tell
them apart from genuinely unattributable ones.

The rule, in three tiers:

1. **Catches in window, all agreeing** → assign that region. High confidence.
2. **Window empty but `pokemon_caught > 0`** → do **not** assign. Count these
   separately and report them as `needs-review` in the dry-run summary. A
   non-zero count here means `elapsed_ms` does not mean what the window
   assumes, and the rule needs revisiting before the write pass runs.
3. **Everything else** (`pokemon_caught = 0`, no `elapsed_ms`, or catches in
   window disagreeing) → leave null, bucket as `Unknown`.

**Verify `elapsed_ms` semantics before trusting tier 1.** `App.jsx:772` computes
it as `Date.now() - runStartedAt`, which is wall-clock and should cover the whole
run — but that is an assumption this script depends on, and tier 2's count is
what proves or disproves it against real data.

**Accepted limitations**, stated plainly because the dashboard reports on them:

- A run with **zero catches** cannot be attributed and stays `Unknown`.
- Two runs in **different regions within one session** may be ambiguous at the
  boundary; the all-catches-agree rule leaves those null rather than guessing.
- Runs recorded before `elapsed_ms` existed have no window and stay `Unknown`.

**Credentials and safety.** The script reads every user's `catches` and writes
`runs.region`, so it needs the service-role key to bypass RLS:

- Key comes from an environment variable, **never committed** — same rule as
  `.env.local`.
- **Dry-run by default.** It prints the attribution counts (assigned /
  needs-review / unknown, broken down by region) and writes nothing unless
  explicitly passed a write flag.
- **Batched updates**, 500 rows per transaction, so a large table is never
  locked in one statement.

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
and leaves the other three standing.

**This is new behaviour, not an existing pattern to copy.** `GuestProfile` has
one whole-profile failure flag and *swallows* its collection errors into silent
empty sections (`GuestProfile.jsx:71-79`) — a failed collection query is
indistinguishable there from a player who has caught nothing. That is
acceptable when the missing piece is decorative detail; it is not acceptable
here, where an empty Economy panel and a broken Economy panel would lead to
opposite tuning decisions. Per-panel error UI must be built, not imitated.

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
- **Deepest-map derivation**: a loss with `maps_cleared = 3` lands in bin 4, a
  win with `maps_cleared = 3` lands in bin 3. This is the off-by-one the
  "reached" label depends on.

**Component — `src/components/PlayerStats.test.jsx`:**
- Changing region clears the previous figures while loading
- One failed RPC leaves the other three panels rendered
- A zero-run region renders its empty state

**Component — `Stats.test.jsx` (or an addition to an existing suite):**
- Losing the admin role while the Player Stats tab is open falls back to Stats
  rather than leaving a blank sheet. This is the reset-effect bug in touchpoint
  3 above, and it is invisible without a test.

**Manual verification, once against the live database.** The parameter-shadowing
trap produces no error and no crash — only wrong numbers that look right — so it
cannot be caught by the unit tests above and must be checked by hand before the
tab is trusted:

> Call one RPC with `p_region` set to a region that has runs, and again with
> `p_region => null`. **The two results must differ.** If they match, the filter
> has silently no-opped and every panel is reporting all-region figures under a
> single region's heading.

**Not otherwise tested:** the SQL bodies and the backfill script, neither of
which can run without a live database. The backfill's matching rule is the risky
part; its dry-run `needs-review` count is the intended substitute for a test,
and should be read before any write pass.

## Deploy order

**This sequence is not optional. Reversing the first two steps loses run data.**

A PostgREST insert naming a column that does not exist fails the **entire**
insert. `App.jsx:787-790` documents exactly this having happened before, when
`pokemon_seen_shiny_ids` shipped ahead of its column and every run-end write
failed unnoticed. If the client deploys first, every finished run is discarded
until the SQL is applied.

1. **Apply the SQL** — `runs_tracking.sql` (the three added columns),
   `catches.sql`, then `player_stats.sql`. All idempotent, all safe to re-run.
2. **Deploy the client** — only now does `recordRunEnd` start sending `region`,
   into a column that already exists.
3. **Run the backfill** — dry-run first, read the `needs-review` count, then
   write. Last, because it is the only irreversible step and the only one that
   benefits from the other two being settled.

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
