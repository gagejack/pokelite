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

**Quadratic: leaving level *n* costs `n × 1000` XP.**

```
cost(n)  = 1000 × n           XP to go from level n to n+1
total(L) = 1000 × L(L-1)/2    XP required to REACH level L
```

Level 1 is the starting state at 0 XP — a new account is level 1, never level
0. Reaching level 2 takes 1,000.

| Level | Step cost | Total XP to reach | ≈ winning runs |
|---|---|---|---|
| 1 | 1,000 | 0 | 0 |
| 2 | 2,000 | 1,000 | 1 |
| 5 | 5,000 | 10,000 | 5 |
| 10 | 10,000 | 45,000 | 20 |
| 25 | 25,000 | 300,000 | 131 |
| 50 | 50,000 | 1,225,000 | 533 |
| 75 | 75,000 | 2,775,000 | 1,207 |
| 100 | — | 4,950,000 | 2,153 |

"Winning runs" assumes ~$2,300 for a full 8-map clear (~$293/map × 8, per the
economy spec). Most real runs earn far less: the 43 recorded runs average $296,
which is roughly one map — most runs die early.

**Why quadratic.** It is the classic RPG shape and it is trivially explainable:
*leaving level n costs n thousand.* A player can compute their own next
threshold. A gentle exponential was rejected because it makes the last ten
levels punishing in a way that reads as broken rather than aspirational; a
hybrid linear-then-steep curve was rejected as two rules where one suffices.

**Calibration check against real data.** 12,740 lifetime cash lands at level 5.
That feels right for 43 mostly-losing runs: enough movement to notice, nowhere
near the ceiling.

**Level 100 is deliberately unreachable for a casual player.** ~2,150 winning
runs is not a grind target, it is a number that exists so the scale has a top.
If play-testing shows the mid-game stalls, the fix is lowering the multiplier
(1000 → 500 halves every threshold) rather than reshaping the curve.

### 4. The module

A new leaf module, `src/game/level.js`, importing nothing:

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

Pure and leaf, matching `dailyScore.js` and `balance.js`: no React, no Supabase,
no rng. Node-testable in isolation, which matters because an off-by-one in the
threshold arithmetic is the likeliest defect here.

Level 100 is terminal. XP past `xpToReach(100)` is retained in the sum but
grants nothing; `progress` reports 1 and `xpForNext` reports 0 so a progress
bar renders full rather than dividing by zero.

### 5. Where the numbers live

The multiplier and max level live in `src/game/balance.js` under a new
`levels` block, per the standing rule that numeric knobs belong there:

```js
levels: { maxLevel: 100, xpPerLevelStep: 1000 },
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

## What this does NOT include

- **Any UI.** No badge, no bar, no level-up notification. Separate design.
- **Rewards.** Levels unlock nothing. They are a number that goes up.
- **Guest levels.** Requires local storage and a merge story on sign-in.
- **XP from non-cash sources.** Requires stored XP.
- **Level-up detection.** Nothing knows the moment a level is crossed, because
  nothing stores the previous level. A "You reached level 12" moment needs a
  stored high-water mark and belongs with the UI spec.

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
4. **Nothing surfaces the level yet.** Shipping derivation with no display means
   the feature is invisible until the UI spec lands — deliberate, but it means
   this cannot be play-tested on its own beyond a console check.

## Verification

No test framework; verification is lint, build, and a Node check of the pure
module.

1. `npm run lint` and `npm run build` clean, no growth past recorded baselines.
2. `levelForXp(0)` → level 1, `xpIntoLevel` 0, `progress` 0.
3. `levelForXp(999)` → level 1. `levelForXp(1000)` → level 2 exactly on the
   boundary.
4. `levelForXp(9999)` → level 4; `levelForXp(10000)` → level 5.
5. `xpToReach(100)` === 4,950,000.
6. `levelForXp(4_950_000)` → level 100, `xpForNext` 0, `progress` 1.
7. `levelForXp(999_999_999)` → level 100, not 101 or beyond.
8. `levelForXp(-5)` and `levelForXp(null)` → level 1, no throw.
9. Every level from 1 to 100: `levelForXp(xpToReach(n)).level === n`, and
   `levelForXp(xpToReach(n) - 1).level === n - 1`. This round-trip is the real
   test — it catches every off-by-one in one pass.
10. Stats page shows a level consistent with its own displayed lifetime cash.
