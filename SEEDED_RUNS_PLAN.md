# Design — 2.3 Seeded Runs + Daily Challenge & Leaderboard

> Design doc for Experimental Feature 2.3. Adds deterministic (seeded) runs, a
> daily challenge with a leaderboard, and shareable custom seeds. Foundation for
> the headless simulator (4.1) and reproducible bug reports.

## Goal & scope

Ship two user-facing features on one deterministic foundation:

- **Daily Challenge (primary)** — one seed + region per UTC day, shared by
  everyone, with a leaderboard.
- **Custom / shareable seeds** — type a code like `KANTO-7Q2` to replay the
  exact same run someone else got.

Because the daily leaderboard requires the *whole* run (map, offers, catches,
battles) to be reproducible, the PRNG is threaded through every game-logic RNG
site. That also gets us reproducible bug reports and seedable sims (4.1) for
free later — but those are not built here.

### Decisions locked during brainstorming

| # | Decision | Choice |
|---|---|---|
| Goal | Which payoff first | Daily challenge (C) + shareable seeds (A) |
| Score | Leaderboard metric | **Furthest progress** (maps cleared), **tiebreak by time** |
| Time | Definition of elapsed time | Wall-clock, run start → run end (`Date.now()` pair) |
| Trust | Anti-cheat model | **Trust the client** — RLS scopes writes; no server verification |
| Format | Seed code shape | `REGION-XXX` (e.g. `KANTO-7Q2`), region embedded |
| Daily region | Same or rotate | **Rotate by day** across playable regions |
| Retries | Attempts per daily | Up to **10**; only **first 3 are scored**; best of those 3 ranks |
| Storage | Attempt/leaderboard state | **Supabase, login-required daily** (single source of truth) |
| Score lock | When an attempt is written | **On run-end only** (death or clear) — abandons don't consume an attempt |
| RNG arch | How sim files get randomness | **Module-level singleton `rng()`** (leaf module, like `balance.js`) |

Guests keep normal runs and custom seeds; only the **ranked daily** requires login.

---

## Section 1 — RNG core (`src/game/rng.js`)

New **zero-import leaf module**, sibling to `balance.js` (so plain Node/sim
tooling can import it with no bundler and no circular-import risk).

```js
// mulberry32: fast 32-bit seeded PRNG. Deterministic for a given seed.
function mulberry32(a) { /* returns () => float in [0,1) */ }

let _rng = Math.random            // active generator
export function rng()   { return _rng() }
export function seedRng(seed) { _rng = mulberry32(seed >>> 0) }
export function clearRng()    { _rng = Math.random }
export function isSeeded()    { return _rng !== Math.random }
```

**Sweep:** replace all 18 `Math.random()` calls across the six sim files with
`rng()` plus an import. Call sites (from grep):

- `src/game/nodeMap.js`
- `src/game/items.js`
- `src/game/catch.js`
- `src/game/battleTeams.js`
- `src/game/battle.js`
- `src/game/pokemon.js` (shiny / stage rolls)

**Critical constraint — preserve RNG call order exactly.** No reordering of
`Math.random()`/`rng()` calls (the balance-module plan already flagged
`pickTrainerCount`'s chained ternaries). Same seed → identical run only if the
consumption order is byte-stable.

**Determinism boundary:** the PRNG covers all *game-logic* randomness only. It
does **not** touch UI/animation timing (presentation) or network latency —
those don't affect run outcomes.

**Why singleton over threaded param:** smallest safe diff (find-replace + one
import per file, no signature churn up into `App.jsx`/components), mirrors the
existing `balance.js` leaf-module pattern. Global mutable state is a non-issue
because only one run is ever live at a time.

---

## Section 2 — Seed format & daily derivation (`src/game/seed.js`)

Leaf module; imports only the region registry (`regionNames`) for the rotation
list — still Node-friendly.

```js
// "KANTO-7Q2" ⇄ { region: 'kanto', seed: <uint32> }
export function encodeSeed(region, seed)   // → "KANTO-7Q2"
export function decodeSeed(code)           // → { region, seed } | null (invalid)
export function dailyFor(dateStr)          // → { region, seed, code }  (dateStr = UTC "YYYY-MM-DD")
```

- **Format:** `REGION-XXX`. Region name uppercased. Numeric part is the 32-bit
  seed in a compact alphabet **excluding ambiguous chars** (`0/O`, `1/I`).
  Decode is case-insensitive and dash-tolerant. Invalid → `null` (UI shows
  "invalid seed").
- **Daily seed:** `seed = hash32(dateStr)` via a small string hash (xmur3 /
  FNV-1a). Deterministic worldwide from the UTC date — no server call.
- **Daily region rotation:** `regionIndex = dayNumber % playableRegions.length`,
  `dayNumber` = whole days since a fixed epoch. Region cycles predictably;
  everyone on the same UTC day gets the same region.
- **UTC boundary:** day string = `new Date().toISOString().slice(0,10)` — daily
  rolls over at 00:00 UTC globally.

Region list comes from `regionNames({ playableOnly: true })`.

---

## Section 3 — Run modes & wiring (`App.jsx` + region-select)

Three run start paths funnel through one seeded entry point:

1. **Normal** — no seed. `clearRng()`, pure `Math.random`, today's behavior.
   Unranked.
2. **Custom seed** — user types `KANTO-7Q2`. `decodeSeed` → `seedRng(seed)`,
   loads that region. Replayable, unranked.
3. **Daily** — from the Daily view. `dailyFor(today)` seeds region + PRNG.
   Ranked (first 3 attempts).

**New run-state fields in `App.jsx`:**
- `runSeed` — active `{ region, seed, code }` or `null` for normal runs.
- `runMode` — `'normal' | 'custom' | 'daily'`.
- `runStartedAt` — `Date.now()` at run-start confirm (tiebreak clock).

**Lifecycle:**
- **Run start:** set the three fields; `seedRng` (custom/daily) or `clearRng`
  (normal).
- **Run end** (death or clear — existing `recordRunEnd` path): compute
  `maps_cleared` and `elapsed_ms = Date.now() - runStartedAt`; if
  `runMode === 'daily'`, write a `daily_attempts` row (Section 5). Always
  `clearRng()` after.
- **Abandon mid-run** (tab close): no row written → attempt **not** consumed.

**Seeded badge:** a subtle "🌱 Seeded" indicator on the map when a run is
seeded, distinguishing it from a normal run.

### UI placement (region-select screen)

A control row sits **between the region grid and the Back button**:

```
        [ region cards … ]

  [ 🗓️ Daily Challenge ]   [ Custom Seed: ________ ]

              [ Back ]
```

- **Daily Challenge button** — below the region cards, above Back. Opens the
  Daily view (Section 4) — a modal/panel, not a separate top-level menu screen.
- **Custom Seed input** — to the right of the Daily button. Type a code + submit
  to start a custom-seed run. Invalid code → inline "invalid seed" message.

### Defeat popup

The run's seed **code shows at the top of the defeat popup** (e.g.
`KANTO-7Q2`), easy to copy/share after a run ends. (Shown for any seeded run —
daily or custom. Normal runs have no code to show.)

---

## Section 4 — Daily Challenge view (opened by the Daily button)

A panel/modal, gated to logged-in users. Logged-out → "Sign in to play the
daily" prompt.

Contents:
- **Today's daily** — region + UTC date, and a **Play** button.
- **Attempt tracker** — `Attempt X / 10`, with a note: only the **first 3
  count**; best of those 3 is your ranked score; attempts 4–10 are practice
  (playable, unranked).
- **Your best (of first 3)** — maps cleared + time.
- **Leaderboard** — top N rows sorted `maps_cleared desc, elapsed_ms asc`;
  columns rank / name / maps / time; current user highlighted.

Play from here starts a daily-mode run (Section 3, path 3).

---

## Section 5 — Data layer (`daily_attempts` table + `src/lib/daily.js`)

### Table `daily_attempts`

| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | → `auth.users` |
| `username` | text | denormalized for leaderboard display |
| `daily_date` | date | UTC day |
| `region` | text | daily's region that day |
| `attempt_no` | int | 1..10 |
| `maps_cleared` | int | the score axis |
| `elapsed_ms` | bigint | tiebreak |
| `created_at` | timestamptz | default `now()` |

**RLS:**
- `select` — any authenticated user (leaderboard is shared among users).
- `insert` — only rows where `user_id = auth.uid()`.
- Trust-client model: no server-side replay/verification.

### `src/lib/daily.js`

- `getTodayAttempts(userId)` → today's rows → derives `attemptNo` (count + 1,
  display-capped at 10) and `bestOfFirst3` (min-none / best over
  `attempt_no <= 3`).
- `submitAttempt({ maps_cleared, elapsed_ms })` → inserts the next `attempt_no`
  for today. Called only at run-end when `runMode === 'daily'` and the user has
  fewer than 10 attempts today.
- `getLeaderboard(dateStr)` → today's rows reduced to each user's
  best-of-first-3, sorted `maps_cleared desc, elapsed_ms asc` for display.

**Scoring nuance (worked example):**
- Attempt 1: 2 maps · Attempt 2: 4 maps · Attempt 3: 3 maps → leaderboard shows
  **4 maps** (best of first 3).
- Attempts 4–10 even at 6 maps do **not** replace the 4 — practice only.

---

## Files touched

**New**
- `src/game/rng.js` — seeded PRNG leaf module.
- `src/game/seed.js` — encode/decode + daily derivation.
- `src/lib/daily.js` — attempts + leaderboard queries.
- `src/components/DailyChallenge.jsx` — the daily view/modal (+ leaderboard).
- `supabase/daily_attempts.sql` — table + RLS.

**Edited**
- `src/game/{nodeMap,items,catch,battleTeams,battle,pokemon}.js` — `Math.random`
  → `rng()` + import (order-preserving).
- `src/App.jsx` — run-state fields, seed lifecycle, run-end submission, custom
  seed / daily launch.
- Region-select component — Daily button + Custom Seed input row.
- Defeat popup component — show seed code at top.
- `Experimental_Features.md` — mark 2.3 shipped.

## Non-goals

- No server-side score verification (trust-client per decision).
- No headless simulator (4.1) — this only *enables* it.
- No reroll tokens (2.4) or other 2.x features.
- No change to non-daily run behavior when unseeded (byte-identical
  `Math.random` path preserved).

## Verification

1. `npm run build` + `eslint` on every touched file — clean.
2. **Determinism proof:** seed a run twice with the same code; assert the
   generated map, item/catch offers, and trainer teams are identical. A second
   Node harness imports `seedRng` + the pure sim functions and diffs two runs.
3. **Unseeded parity:** with no seed, confirm the `rng()` path is byte-identical
   to the old `Math.random` behavior (call order unchanged) — no gameplay drift.
4. **Seed codec round-trip:** `decodeSeed(encodeSeed(r, s))` === `{r, s}` for
   random samples; ambiguous chars never emitted; garbage → `null`.
5. **Daily derivation:** `dailyFor(date)` stable for a fixed date across
   machines; region rotates across consecutive days; UTC rollover correct.
6. **Leaderboard/attempts:** simulate 10 attempts; confirm attempt cap, first-3
   scoring, best-of-3 selection, and sort order (progress desc, time asc). RLS:
   a user cannot insert another user's row.
