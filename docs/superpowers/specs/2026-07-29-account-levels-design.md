# Account Levels — Design

**Date:** 2026-07-29
**Status:** Design approved; ready for an implementation plan
**Builds on:** `2026-07-28-pokemart-economy-design.md`

## Problem

Every run ends and takes its progress with it. Speed Cash is per-run, the
roster is discarded, and the only lasting records are the Pokédex and the raw
counters on the Stats page. A player twenty runs in has nothing that says so.

`runs.speed_cash_earned` already accumulates lifetime earnings — 43 recorded
runs totalling 12,740 at the time of writing — and `Stats.jsx:88` already sums
it. The number exists and means something; nothing reads it as progression.

## Goal

An account level derived from lifetime Speed Cash earned. Level 1 to 100, with
the top end a long-haul target rather than a month's work.

**Scope is tracking and derivation only.** Where the level appears is a separate
design; this spec defines the numbers and the read path, nothing visual.

## Design

### 1. XP is lifetime Speed Cash earned

**XP = `SUM(runs.speed_cash_earned)` for the user.** Not a separate stat, not a
multiple — the same number the Stats page already shows.

Using cash directly rather than inventing an XP formula keeps one number doing
one job. A player who understands "money earned makes me level up" understands
the whole system, and every existing payout tuning decision (the $10 non-fight
floor, the $250 legendary, the grass-over-trainer bias) already shapes it.

Only *earned* counts. Purchases never reduce it — `cashEarned` is tracked
separately from the spendable balance for exactly this reason
(`App.jsx`), so shopping can never cost you levels.

### 2. Derived on read, never stored

**There is no `xp` column and no `level` column.** Level is a pure function of
the summed cash, computed wherever it's displayed.

This is the load-bearing decision:

- **No migration, no write path, nothing to keep in sync.** The sum is already
  being computed in `Stats.jsx`.
- **Self-correcting.** Retune a payout, delete a test run, backfill a column —
  the level recomputes from the truth instead of drifting from a stale counter.
- **One source.** A stored `profiles.xp` that disagrees with the runs it came
  from is a bug with no obvious right answer; this cannot produce that state.

Rejected: a `profiles.xp` column incremented at run end. It buys cheaper reads
and guest support, at the cost of a value that can silently diverge from its
own source data.

**Accepted consequence: guests earn no XP.** No account means no `runs` row,
so a signed-out player has no lifetime total and therefore no level. This
matches every other persistent stat in the game (Pokédex, badges, catches),
so it introduces no new asymmetry.

**Accepted consequence: levels are cash-only.** Nothing else can grant XP
without a second source to sum. If a future design wants "XP for beating the
Elite Four" independent of its payout, that needs a stored column and its own
spec.

### 3. The curve

**Quadratic: leaving level *n* costs `n × 100` XP.**

```
cost(n)  = 100 × n           XP to go from level n to n+1
total(L) = 100 × L(L-1)/2    XP required to REACH level L
```

Level 1 is the starting state at 0 XP — a new account is level 1, never level
0. Reaching level 2 takes 100.

| Level | Step cost | Total XP to reach | ≈ winning runs | ≈ average runs |
|---|---|---|---|---|
| 1 | 100 | 0 | 0 | 0 |
| 2 | 200 | 100 | 1 | 1 |
| 5 | 500 | 1,000 | 1 | 4 |
| 10 | 1,000 | 4,500 | 2 | 16 |
| 25 | 2,500 | 30,000 | 14 | 102 |
| 50 | 5,000 | 122,500 | 54 | 414 |
| 75 | 7,500 | 277,500 | 121 | 938 |
| 100 | — | 495,000 | 216 | 1,673 |

"Winning runs" assumes ~$2,300 for a full 8-map clear (~$293/map × 8, per the
economy spec). "Average runs" uses the $296 the 43 recorded runs actually
average — roughly one map, since most runs die early. Real play sits between
the two columns and drifts toward the left as a player improves.

**Why quadratic.** It is the classic RPG shape and it is trivially explainable:
*leaving level n costs n × 100.* A player can compute their own next threshold.
A gentle exponential was rejected because it makes the last ten levels punishing
in a way that reads as broken rather than aspirational; a hybrid
linear-then-steep curve was rejected as two rules where one suffices.

**The 100 multiplier is tuned for the early hook.** Every finished run levels a
new player up — even a first-map death earns ~$296 and clears level 2 — and one
win reaches level 7. Movement on the very first run is what a progression number
has to deliver before anyone trusts it. Multipliers of 1000 and 200 were both
tried on paper and put a first win at level 2 and level 5 respectively; at 1000
the number barely moves at all.

**Calibration check against real data.** 12,740 lifetime cash lands at level 16
of 100 — about a sixth of the way up for 43 mostly-losing runs. Enough to feel
earned, with the ceiling still far off.

**Level 100 remains a long-haul target: ~216 winning runs.** Reachable by a
dedicated player rather than nobody, which is the right call for a ceiling that
currently unlocks nothing — an unreachable number that grants no reward is just
decoration. If play-testing shows the mid-game stalls, the multiplier is the
single knob to turn (it scales every threshold linearly), not the curve's shape.

### 4. The module

A new leaf module, `src/game/level.js`, importing only `balance.js` (which is
itself import-free, so the pair stays Node-loadable with no bundler):

```js
export const MAX_LEVEL = 100
export function xpToReach(level)        // total XP required to reach `level`
export function levelForXp(xp)          // { level, xpIntoLevel, xpForNext, progress }
```

`levelForXp` returns everything a display needs in one call, so no consumer
re-derives thresholds:

- `level` — 1 to MAX_LEVEL, clamped both ends
- `xpIntoLevel` — XP earned past the current level's threshold
- `xpForNext` — the current level's step cost (`0` at MAX_LEVEL)
- `progress` — `0..1` fraction toward the next level (`1` at MAX_LEVEL)

Pure, in the sense `dailyScore.js` and `balance.js` are: no React, no Supabase,
no rng, and no import that reaches any of those. Node-testable in isolation,
which matters because an off-by-one in the
threshold arithmetic is the likeliest defect here.

Level 100 is terminal. XP past `xpToReach(100)` is retained in the sum but
grants nothing; `progress` reports 1 and `xpForNext` reports 0 so a progress
bar renders full rather than dividing by zero.

### 5. Where the numbers live

The multiplier and max level live in `src/game/balance.js` under a new
`levels` block, per the standing rule that numeric knobs belong there:

```js
levels: { maxLevel: 100, xpPerLevelStep: 100 },
```

`level.js` reads them. This is the one place a playtest tweak happens.

### 6. Reading it

`Stats.jsx` already computes `totalCashEarned` (line 88) from a query that
already selects `speed_cash_earned`. Deriving a level there is
`levelForXp(totalCashEarned)` — no new query, no new column, no extra round
trip.

Any future consumer (main menu, calling card, leaderboard row) needs the same
sum. If a second consumer appears, the sum should move into a shared helper in
`src/lib/` rather than being re-queried per component — but that is a
refactor to make when the second consumer exists, not before.

### 7. Where the level appears

Three surfaces. The nav bar and map HUD are deliberately excluded: levels are
meta-progression and a run is not, so putting a number you cannot change this
run beside numbers that only matter right now devalues both.

**The XP bar is shared.** Two of the three surfaces show progress toward the next
level, so it belongs in one component — `src/components/LevelBar.jsx` — rather
than being rebuilt twice. It takes `progress` (0..1) and a height, and uses the
`twoTone(STAT_BAR_LIGHT, STAT_BAR_DARK)` treatment the roster stat bars already
use. Those two constants are currently module-private in `Roster.jsx:17-18`; they
move to `src/lib/colors.js` beside `muted()` and `cash()` so both consumers read
one definition.

**1. Stats page** — a tile plus a bar.

The existing tile grid gains a level tile showing `LV 16`, and a full-width XP
bar sits directly beneath the grid with the remaining XP as its label:

```
┌────────────────────────────────────────────────────┐
│  LV 16                          860 XP to level 17 │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└────────────────────────────────────────────────────┘
┌───────────┬───────────┬───────────┬───────────┐
│    43     │    12     │    31     │    28%    │
│Total Runs │   Wins    │  Losses   │ Win Rate  │
├───────────┼───────────┼───────────┼───────────┤
│    88     │    2.0    │    41     │  $12,740  │
│  Badges   │ Avg / Run │  Catches  │Speed Cash │
└───────────┴───────────┴───────────┴───────────┘
```

**A full-width panel above the grid, not a ninth tile in it.** Three reasons,
in order of weight:

1. The level is what the tallies below it add up to. A summary belongs above its
   inputs rather than filed as one more equal-weight cell among them.
2. The bar must sit beside the number it describes, and a grid cell is roughly
   square. Full width gives the bar room without breaking that pairing.
3. The grid is `repeat(4, 1fr)` on desktop (`Stats.jsx:274`) and already holds 8
   tiles in two clean rows. A ninth would sit alone on a third row.

(Figures are the real 12,740 lifetime cash: level 16, 740 XP into a 1,600 XP
step, so 46% filled with 860 to go.)

The bar goes below the grid rather than inside the tile because a tile is
square-ish and a progress bar wants width — and because this bar summarizes the
whole page, which no single tile should.

**Note on the tile:** `react-hooks/static-components` fires once per `<Stat>`
call site, so an additional `<Stat>` grows this file's lint baseline. The Speed
Cash tile at `Stats.jsx:282` is inlined for exactly this reason; the level tile
follows that precedent and is inlined too, with a comment pointing at the same
rule.

**2. Desktop calling card** — the level joins the identity header, not the stats.

`RUNS`, `BEST`, and `SHINY` are things the player did. The level is what those
things made them, so filing it as a fourth row would bury the one number meant
to summarize the others. It goes in the yellow header band beside the username,
with the XP bar spanning the full card width immediately below:

```
┌────────────────────────────┐
│  GAGE                  16  │   yellow band, level right-aligned
├────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░   │   4px, full width
│  RUNS                  43  │
│  BEST              6 maps  │
│  SHINY                  2  │
└────────────────────────────┘
```

The bar is the only continuous element on a card otherwise made entirely of
discrete numbers, which is what makes the level read as momentum rather than one
more tally.

Cost: `CallingCard`'s existing runs query becomes
`.select('maps_cleared, speed_cash_earned')`. No new request.

Signed out, the level shows `—` like every other field, so the layout never
reflows between states.

**3. Daily Seed leaderboard** — a `LV n` badge immediately left of the username.

Left of the name rather than as a new right-hand column: the level is identity,
and the two right-hand columns (`maps`, `run n`) are the ranking, which the level
does not affect. Putting it among them would imply it ranks.

The row already carries rank, medal, sprite, name, maps, and run at 14px. The
badge costs ~34px, absorbed by the `flex: 1` name column. It does **not** show
on mobile widths — see the risk below.

### 8. The leaderboard needs a server-side level

**This is the one part of the feature that cannot be derived client-side.**

`runs` is protected by `runs_select_own` (`auth.uid() = user_id`), so a client
can sum its own cash and no one else's. `daily_attempts` is publicly readable,
which is why the board works at all — but it has no cash column, and adding one
would duplicate data that already exists.

**Solution: a `SECURITY DEFINER` RPC returning level only.**

```sql
create or replace function public.user_levels(p_user_ids uuid[])
returns table (user_id uuid, xp bigint)
language sql
security definer
set search_path = public
as $$
  select r.user_id, coalesce(sum(r.speed_cash_earned), 0)::bigint
  from public.runs r
  where r.user_id = any(p_user_ids)
  group by r.user_id
$$;
```

It returns **XP, not cash rows** — one aggregate integer per user, for a caller-
supplied set of ids. The client maps XP through `levelForXp`, so the curve stays
in one place (`level.js`) and a tuning change needs no migration.

Precedent: `increment_badge` and the `username_auth.sql` functions already use
`SECURITY DEFINER` in this project.

**Why not the alternatives.** A public view of `(user_id, total_cash)` publishes
everyone's lifetime earnings, which is strictly more than the feature needs. A
stored `profiles.level` column abandons §2's derived-only decision and
reintroduces the drift it exists to prevent.

`getLeaderboard` calls this once with the ids it already fetched — one extra
round trip per leaderboard load, not one per row.

## What this does NOT include

- **Rewards.** Levels unlock nothing. They are a number that goes up.
- **Guest levels.** Requires local storage and a merge story on sign-in.
- **XP from non-cash sources.** Requires stored XP.
- **Level-up detection.** Nothing knows the moment a level is crossed, because
  nothing stores the previous level. A "You reached level 17" moment needs a
  stored high-water mark and is a separate design.
- **Mobile calling card.** The CallingCard is desktop-only; mobile's menu is the
  stacked button column and has no equivalent surface. Mobile players see their
  level on the Stats page, which both platforms share.

## Risks

1. **The curve is calibrated on 43 runs, most of them early deaths.** The
   $2,300-per-win figure is derived from the economy spec's per-map average, not
   observed — no recorded run has actually won. The mid-game pacing is the least
   trustworthy part of this and should be revisited once wins exist in the data.
2. **Every level recomputes from a full table scan.** Summing all of a user's
   runs is fine at 43 rows and fine at a few thousand. At tens of thousands it
   wants a Postgres view or a materialized total. Watch the Stats page load
   time as the signal.
3. **Retuning payouts moves everyone's level.** Doubling the legendary reward
   retroactively raises the level of anyone who ever beat one. That is the
   correct behaviour for a derived value, but it does mean economy changes are
   also progression changes.
4. **The RPC is the one privileged surface.** `SECURITY DEFINER` bypasses RLS by
   design, so a bug there leaks more than a bug elsewhere. Mitigated by shape:
   it returns a single aggregate integer per user for a caller-supplied id list,
   never rows, never cash-per-run, and it cannot be coerced into returning
   anything else. `set search_path = public` is not optional — without it a
   definer function can be hijacked by a caller-controlled search path.
   Shape is not the only axis, though: `p_user_ids` is caller-supplied and
   execute is granted to `anon`, so this is a batch endpoint any visitor can
   call with an arbitrary array. The ids themselves are already public via
   `getLeaderboard` and the return is one integer each, so there is little to
   enumerate — but unbounded work per request is a separate property from a
   small payload, so the function caps the array at 100 ids (five times the
   leaderboard's default page) and returns nothing above that.
5. **The leaderboard's level does not survive a stale RPC.** If the call fails,
   the board must still render with levels omitted rather than showing zeros — a
   `LV 1` on every row is worse than no badge, because it reads as data rather
   than as a failure.
6. **The leaderboard row is at its width limit.** Rank, medal, sprite, name,
   maps, and run already share 14px rows inside a 440px modal. The badge is
   dropped on mobile widths rather than shrinking the name to an ellipsis; if
   even desktop feels tight in practice, the badge is the thing to cut, not the
   ranking columns.
7. **Two surfaces show the same level from different queries.** Stats sums the
   client's own rows; the leaderboard reads the RPC. They should always agree,
   but they are separate paths — if they ever disagree, the RPC is authoritative
   and the client sum is the one to suspect.

## Verification

No test framework; verification is lint, build, and a Node check of the pure
module.

1. `npm run lint` and `npm run build` clean, no growth past recorded baselines.
2. `levelForXp(0)` → level 1, `xpIntoLevel` 0, `progress` 0.
3. `levelForXp(99)` → level 1. `levelForXp(100)` → level 2 exactly on the
   boundary.
4. `levelForXp(999)` → level 4; `levelForXp(1000)` → level 5.
5. `xpToReach(100)` === 495,000.
6. `levelForXp(495_000)` → level 100, `xpForNext` 0, `progress` 1.
7. `levelForXp(999_999_999)` → level 100, not 101 or beyond.
8. `levelForXp(-5)` and `levelForXp(null)` → level 1, no throw.
9. Every level from 1 to 100: `levelForXp(xpToReach(n)).level === n`, and
   `levelForXp(xpToReach(n) - 1).level === n - 1`. This round-trip is the real
   test — it catches every off-by-one in one pass.

Then, per surface:

10. **Stats page** shows a level consistent with its own displayed lifetime cash,
    and the bar's fill matches `progress` (a level just reached reads near-empty,
    not near-full — the classic off-by-one here is filling from the wrong end).
11. **Stats bar label** reads the REMAINING XP, not the XP earned into the level:
    at 12,740 it says "860 XP to level 17", not "740". Both numbers are available
    from `levelForXp` and mixing them up is the easy mistake — `xpForNext -
    xpIntoLevel`, not `xpIntoLevel`.
12. **Calling card** shows the same level as the Stats page for the same account.
    Signed out, it shows `—` and the layout does not reflow.
13. **Leaderboard** shows a level for every row, including other players — this
    is what proves the RPC works, since RLS makes it impossible client-side.
14. **RPC returns nothing for an empty id array** and does not error.
15. **RPC failure degrades gracefully**: kill the call and confirm the board
    still renders with no badges rather than `LV 1` everywhere.
16. **A user with no runs** resolves to level 1, not a missing row that renders
    blank — `coalesce` in the SQL plus the client's own `?? 0`.
17. **375px width**: the leaderboard row drops the badge without ellipsising the
    username.
