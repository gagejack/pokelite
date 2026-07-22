# Seeded Runs — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily challenge — one shared region+seed per UTC day, up to 10 attempts (first 3 scored, best ranks), with a Supabase-backed leaderboard sorted by furthest progress then fastest time.

**Architecture:** Phase 1's deterministic seeded runs already exist (`rng.js`, `seed.js`, and App's `runMode`/`runSeed`/`runStartedAt`/`dailyDate` lifecycle). Phase 2 adds: a pure daily-derivation module (date → region + seed), a `daily_attempts` Supabase table with trust-client RLS, a `src/lib/daily.js` query layer, a `DailyChallenge.jsx` modal (attempts / best / leaderboard / countdown) opened from a Daily button on RegionSelect, and run-end submission wired into the existing `recordRunEnd`.

**Tech Stack:** React 19, Vite 8, Supabase JS (`@supabase/supabase-js` — already a dep), plain ES modules. No test framework is installed — pure-logic verification uses Node harness scripts under `scripts/` (repo convention). Supabase-touching code and UI are verified by build/lint + manual reasoning (the same standard Phase 1 used for App/UI tasks).

## Global Constraints

- **Login-required daily.** The ranked daily requires a logged-in user; guests still get normal runs and custom seeds. Gate the Daily view on `user`.
- **Trust-client model.** No server-side replay/verification. RLS scopes writes to the caller's own rows; reads are shared among authenticated users.
- **Scoring:** rank by `maps_cleared DESC, elapsed_ms ASC`. A user's leaderboard score is the **best of their first 3 attempts** (`attempt_no <= 3`). Attempts 4–10 are playable but never ranked.
- **Attempts:** up to **10** per user per `daily_date`. An attempt row is written **only at run-end** (death or clear) — abandoning mid-run does not consume an attempt.
- **Start-date submission:** the daily's `daily_date` is captured at run **start** (already in App's `dailyDate` ref) and used at submit time, so a run crossing UTC midnight or resumed later still counts for the day it began.
- **UTC day** = `new Date().toISOString().slice(0, 10)` ("YYYY-MM-DD"). Daily rolls over at 00:00 UTC globally.
- **Region rotation:** daily region = `playableRegions[dayNumber % playableRegions.length]` where `playableRegions = regionNames({ playableOnly: true })` and `dayNumber` = whole days since a fixed epoch. **Only Kanto + Unova are currently playable** (`hoenn.js`/`sinnoh.js` have `maps: []`), so the daily alternates between two regions until more ship — expected, not a bug. Task 1's test uses a 4-region mock list intentionally (pure-function test, not the live list).
- **Leaderboard names:** denormalized — `username` is stored on each attempt row at submit time (daily boards reset, so staleness is a non-issue).
- **`seed.js` stays a leaf module** (imports nothing). Daily derivation that needs the region list lives in `src/lib/daily.js` (app-side), NOT in `seed.js`.
- Run `npm run build` and `npm run lint` after each task; both clean (lint baseline is 46 pre-existing problems — add none).
- Commit after every task.

---

## File structure

**New:**
- `supabase/daily_attempts.sql` — table + constraints + RLS (run once in Supabase SQL editor).
- `src/game/dailyDerive.js` — **leaf module**, pure: `hashDateToSeed(dateStr)`, `dayNumber(dateStr)`, `pickDailyRegion(dateStr, regionList)`, `msUntilNextUtcDay(now)`. Imports nothing (so it's Node-testable and can't pull in region assets).
- `src/game/dailyScore.js` — **leaf module**, pure scoring reducers: `bestOfFirst3(rows)`, `rankLeaderboard(rows)`, and the `MAX_ATTEMPTS`/`SCORED_ATTEMPTS` constants. Imports nothing, so the highest-risk logic is Node-testable in isolation. (`daily.js` re-exports these so callers have one import site.)
- `src/lib/daily.js` — Supabase query layer + `dailyFor(dateStr)` (composes `dailyDerive` + `regionNames` + `seed.js`). App-side (imports regionRegistry/supabase — NOT Node-importable, which is why the pure reducers live in `dailyScore.js`).
- `src/components/SeedCodeChip.jsx` — the tap-to-copy seed chip, **extracted** from `BattleCard.jsx` so the daily modal can show today's code (spec §3: tap-to-copy applies to the Daily view). Extraction (not a direct import from BattleCard) keeps the initial chunk lean: BattleCard pulls in MoveAnimation + 78 animation sheets + framer-motion, which App deliberately lazy-loads via NodeMap.
- `src/components/DailyChallenge.jsx` — the daily modal.

**Modified:**
- `src/components/BattleCard.jsx` — remove the local `SeedCodeChip` definition; import it from `./SeedCodeChip` (one-line change, no behavior change).
- `src/components/RegionSelect.jsx` — Daily Challenge button (left of the Custom Seed row); accept `onOpenDaily` prop.
- `src/App.jsx` — daily modal state, `startDailyRun`, daily submission inside `recordRunEnd`, pass `onOpenDaily` + render `<DailyChallenge>`.

---

### Task 1: Pure daily-derivation module (`src/game/dailyDerive.js`)

**Files:**
- Create: `src/game/dailyDerive.js`
- Test: `scripts/verify-daily-derive.mjs`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `dayNumber(dateStr: string): number` — whole days from epoch `1970-01-01` to `dateStr` (UTC "YYYY-MM-DD").
  - `hashDateToSeed(dateStr: string): number` — deterministic uint32 from the date string (xmur3/FNV-style).
  - `pickDailyRegion(dateStr: string, regionList: string[]): string` — `regionList[dayNumber(dateStr) % regionList.length]`. Returns `regionList[0]` if the list has one entry; throws/returns undefined only on an empty list (caller guarantees non-empty).
  - `msUntilNextUtcDay(now: number = Date.now()): number` — milliseconds until the next 00:00 UTC.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-daily-derive.mjs`:

```js
// Node harness for src/game/dailyDerive.js — pure daily derivation.
import { dayNumber, hashDateToSeed, pickDailyRegion, msUntilNextUtcDay } from '../src/game/dailyDerive.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

// dayNumber is stable and increments by 1 per calendar day.
check('epoch day 0', dayNumber('1970-01-01') === 0)
check('one day later', dayNumber('1970-01-02') === 1)
check('consecutive diff is 1', dayNumber('2026-07-23') - dayNumber('2026-07-22') === 1)

// hashDateToSeed: deterministic, uint32, different dates differ.
check('hash deterministic', hashDateToSeed('2026-07-22') === hashDateToSeed('2026-07-22'))
check('hash is uint32', (() => { const h = hashDateToSeed('2026-07-22'); return h >= 0 && h <= 0xffffffff && Number.isInteger(h) })())
check('different dates differ', hashDateToSeed('2026-07-22') !== hashDateToSeed('2026-07-23'))

// pickDailyRegion rotates across consecutive days.
const regions = ['Kanto', 'Hoenn', 'Sinnoh', 'Unova']
const d0 = pickDailyRegion('2026-07-22', regions)
const d1 = pickDailyRegion('2026-07-23', regions)
check('picks from the list', regions.includes(d0))
check('rotates day to day', d0 !== d1) // adjacent days step by one index (list len 4 > 1)
check('wraps by modulo', pickDailyRegion('1970-01-01', regions) === regions[0])
check('single-region list ok', pickDailyRegion('2026-07-22', ['Kanto']) === 'Kanto')

// msUntilNextUtcDay: within (0, 24h], and correct at a known instant.
const noonUtc = Date.UTC(2026, 6, 22, 12, 0, 0)  // 2026-07-22T12:00:00Z
check('12h left at noon', msUntilNextUtcDay(noonUtc) === 12 * 3600 * 1000)
const almost = Date.UTC(2026, 6, 22, 23, 59, 59)
check('1s left before midnight', msUntilNextUtcDay(almost) === 1000)
check('in range', (() => { const m = msUntilNextUtcDay(Date.now()); return m > 0 && m <= 24 * 3600 * 1000 })())

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-daily-derive.mjs`
Expected: FAIL — `Cannot find module '../src/game/dailyDerive.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/dailyDerive.js`:

```js
// Pure daily-challenge derivation (Experimental Feature 2.3, Phase 2).
//
// LEAF module: imports nothing, so it's Node-testable and can never pull in
// region image assets (regionRegistry can't be imported here). The region
// LIST is passed in by the caller (src/lib/daily.js supplies it from
// regionNames). Everything here is a pure function of the UTC date string.

const MS_PER_DAY = 24 * 3600 * 1000

// Whole UTC days since 1970-01-01 for a "YYYY-MM-DD" string.
export function dayNumber(dateStr) {
  return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / MS_PER_DAY)
}

// Deterministic uint32 hash of the date string (xmur3-style mix). Same date →
// same seed on every machine, so everyone gets the same daily run.
export function hashDateToSeed(dateStr) {
  let h = 1779033703 ^ dateStr.length
  for (let i = 0; i < dateStr.length; i++) {
    h = Math.imul(h ^ dateStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  // Split finalizer (not `return (h ^= h >>> 16) >>> 0`): the compound
  // assignment inside a return trips eslint no-useless-assignment.
  h ^= h >>> 16
  return h >>> 0
}

// Region for the day: rotate through the playable list by day index.
export function pickDailyRegion(dateStr, regionList) {
  return regionList[((dayNumber(dateStr) % regionList.length) + regionList.length) % regionList.length]
}

// Milliseconds from `now` until the next 00:00 UTC.
export function msUntilNextUtcDay(now = Date.now()) {
  return MS_PER_DAY - (((now % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/verify-daily-derive.mjs`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/dailyDerive.js scripts/verify-daily-derive.mjs
git commit -m "feat(daily): pure daily derivation (date → region + seed + countdown)"
```

---

### Task 2: `daily_attempts` table + RLS (`supabase/daily_attempts.sql`)

**Files:**
- Create: `supabase/daily_attempts.sql`

**Interfaces:**
- Produces: a `public.daily_attempts` table the app writes at run-end and reads for the leaderboard. This SQL is run by a human in the Supabase SQL editor; the plan just authors the idempotent script matching the repo's existing pattern (`supabase/region_balance.sql`).

**Note:** This task has no automated test (it's SQL run against a live DB). The deliverable is the reviewed, idempotent script. Verification is a schema read-through against the constraints below.

- [ ] **Step 1: Write the SQL**

Create `supabase/daily_attempts.sql`:

```sql
-- Daily-challenge attempts + leaderboard for Speedmon (Experimental 2.3, Phase 2).
--
-- One row per FINISHED daily run (written at death/clear). A user gets up to 10
-- attempts per UTC day; only the first 3 (attempt_no <= 3) are ranked, best of
-- those is their leaderboard score. Ranking: maps_cleared DESC, elapsed_ms ASC.
--
-- Trust-client model: no server-side verification. RLS lets any authenticated
-- user READ the board and lets a user INSERT only their own rows.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.daily_attempts (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  username     text,
  daily_date   date        not null,
  region       text        not null,
  attempt_no   int         not null,
  maps_cleared int         not null default 0,
  elapsed_ms   bigint      not null default 0,
  created_at   timestamptz not null default now()
);

-- attempt_no must be 1..10.
alter table public.daily_attempts
  drop constraint if exists daily_attempts_attempt_range;
alter table public.daily_attempts
  add constraint daily_attempts_attempt_range
  check (attempt_no between 1 and 10);

-- One row per (user, day, attempt_no) — blocks duplicate attempts from two tabs.
create unique index if not exists daily_attempts_user_day_attempt
  on public.daily_attempts (user_id, daily_date, attempt_no);

-- Leaderboard reads filter by day and sort by score; index the day.
create index if not exists daily_attempts_day
  on public.daily_attempts (daily_date);

-- 2. Row Level Security -------------------------------------------------------
alter table public.daily_attempts enable row level security;

-- Any authenticated user may READ (the leaderboard is shared among players).
drop policy if exists "daily_attempts_select_authed" on public.daily_attempts;
create policy "daily_attempts_select_authed"
  on public.daily_attempts for select
  to authenticated
  using (true);

-- A user may INSERT only rows for themselves. No update/delete policies exist,
-- so rows are immutable once written (an attempt can't be edited after the fact).
drop policy if exists "daily_attempts_insert_own" on public.daily_attempts;
create policy "daily_attempts_insert_own"
  on public.daily_attempts for insert
  to authenticated
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Verify the script (schema read-through)**

Confirm by reading the file: (a) unique index on `(user_id, daily_date, attempt_no)`; (b) `attempt_no` CHECK 1..10; (c) RLS enabled; (d) select policy `to authenticated using (true)`; (e) insert policy `with check (user_id = auth.uid())`; (f) no update/delete policy; (g) `gen_random_uuid()` default (available in Supabase by default). The script mirrors `supabase/region_balance.sql`'s structure.

- [ ] **Step 3: Commit**

```bash
git add supabase/daily_attempts.sql
git commit -m "feat(daily): daily_attempts table + trust-client RLS"
```

---

### Task 3a: Pure scoring reducers (`src/game/dailyScore.js`)

**Files:**
- Create: `src/game/dailyScore.js`
- Test: `scripts/verify-daily-score.mjs`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `MAX_ATTEMPTS = 10`, `SCORED_ATTEMPTS = 3` (exported constants).
  - `bestOfFirst3(rows): { maps_cleared, elapsed_ms } | null` — **pure**: best of rows with `attempt_no <= SCORED_ATTEMPTS` by (maps DESC, elapsed ASC), or null if none.
  - `rankLeaderboard(rows): Array<{ user_id, username, maps_cleared, elapsed_ms }>` — **pure**: reduce rows to each user's best-of-first-3, sorted (maps DESC, elapsed ASC).

**Why a separate leaf module:** these reducers hold the actual scoring logic (highest bug risk) and must be Node-unit-testable. `src/lib/daily.js` imports `regionRegistry` (which transitively imports region image assets) and `supabase`, so it is NOT importable under plain Node. Keeping the reducers import-free here lets the harness test them directly; `daily.js` re-exports them so app callers still have a single import site.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-daily-score.mjs`:

```js
// Node harness for the pure scoring reducers in src/game/dailyScore.js.
import { bestOfFirst3, rankLeaderboard } from '../src/game/dailyScore.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

const row = (attempt_no, maps_cleared, elapsed_ms, user_id = 'u1', username = 'A') =>
  ({ attempt_no, maps_cleared, elapsed_ms, user_id, username })

// bestOfFirst3: best of attempts 1-3 (maps DESC, elapsed ASC); ignores 4-10.
check('null when no rows', bestOfFirst3([]) === null)
{
  const best = bestOfFirst3([row(1, 2, 5000), row(2, 4, 9000), row(3, 3, 4000)])
  check('best of first 3 = 4 maps', best.maps_cleared === 4 && best.elapsed_ms === 9000)
}
{
  // Attempt 4 with 6 maps must NOT replace the best-of-first-3 (which is 4).
  const best = bestOfFirst3([row(1, 2, 5000), row(2, 4, 9000), row(3, 3, 4000), row(4, 6, 1000)])
  check('attempts 4-10 excluded', best.maps_cleared === 4)
}
{
  // Tie on maps → fewer elapsed_ms wins.
  const best = bestOfFirst3([row(1, 3, 8000), row(2, 3, 6000)])
  check('tiebreak by time', best.elapsed_ms === 6000)
}

// rankLeaderboard: one best-of-first-3 row per user, sorted (maps DESC, time ASC).
{
  const rows = [
    row(1, 3, 5000, 'u1', 'Alice'), row(2, 5, 7000, 'u1', 'Alice'),
    row(1, 5, 6000, 'u2', 'Bob'),
    row(1, 5, 7000, 'u3', 'Cara'), row(4, 9, 100, 'u3', 'Cara'), // attempt 4 ignored
  ]
  const board = rankLeaderboard(rows)
  check('one entry per user', board.length === 3)
  check('sorted maps desc then time asc', board[0].user_id === 'u2' && board[1].user_id === 'u1' && board[2].user_id === 'u3')
  // u1 best-of-3 = attempt 2 (5 maps, 7000ms); u2 = 5 maps 6000ms (wins tie); u3 = 5 maps 7000ms (attempt-4's 9 ignored)
  check('u3 uses first-3 best not attempt 4', board[2].maps_cleared === 5)
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-daily-score.mjs`
Expected: FAIL — `Cannot find module '../src/game/dailyScore.js'`.

- [ ] **Step 3: Write the module**

Create `src/game/dailyScore.js`:

```js
// Pure daily-challenge scoring reducers (Experimental Feature 2.3, Phase 2).
//
// LEAF module: imports nothing, so this — the highest-risk logic (how attempts
// become a leaderboard score) — is Node-unit-testable in isolation. The
// Supabase query layer (src/lib/daily.js) re-exports these so app callers have
// one import site.
//
// Scoring: a user's score is the BEST of their first SCORED_ATTEMPTS attempts,
// ranked by maps_cleared DESC then elapsed_ms ASC. Attempts beyond that are
// playable but never scored.

export const MAX_ATTEMPTS = 10
export const SCORED_ATTEMPTS = 3

// Order two attempt-like objects: more maps first, then less time.
function betterScore(a, b) {
  if (!a) return b
  if (!b) return a
  if (b.maps_cleared !== a.maps_cleared) return b.maps_cleared > a.maps_cleared ? b : a
  return b.elapsed_ms < a.elapsed_ms ? b : a
}

// Best of a user's attempts 1..SCORED_ATTEMPTS (maps DESC, elapsed ASC), or null.
export function bestOfFirst3(rows) {
  let best = null
  for (const r of rows) {
    if (r.attempt_no > SCORED_ATTEMPTS) continue
    best = betterScore(best, r)
  }
  return best ? { maps_cleared: best.maps_cleared, elapsed_ms: best.elapsed_ms } : null
}

// Reduce all rows to one best-of-first-3 entry per user, sorted for display.
export function rankLeaderboard(rows) {
  const byUser = new Map()
  for (const r of rows) {
    if (r.attempt_no > SCORED_ATTEMPTS) continue
    const cur = byUser.get(r.user_id)
    const better = betterScore(cur, r)
    byUser.set(r.user_id, { ...better, user_id: r.user_id, username: r.username })
  }
  return [...byUser.values()]
    .map(e => ({ user_id: e.user_id, username: e.username, maps_cleared: e.maps_cleared, elapsed_ms: e.elapsed_ms }))
    .sort((a, b) => b.maps_cleared - a.maps_cleared || a.elapsed_ms - b.elapsed_ms)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/verify-daily-score.mjs`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/dailyScore.js scripts/verify-daily-score.mjs
git commit -m "feat(daily): pure scoring reducers (best-of-first-3, leaderboard rank)"
```

---

### Task 3b: Daily query layer (`src/lib/daily.js`)

**Files:**
- Create: `src/lib/daily.js`

**Interfaces:**
- Consumes: `hashDateToSeed`, `pickDailyRegion` (Task 1); `bestOfFirst3`, `rankLeaderboard`, `MAX_ATTEMPTS`, `SCORED_ATTEMPTS` (Task 3a); `encodeSeed` from `src/game/seed.js`; `regionNames` from `src/game/regionRegistry.js`; `supabase` from `src/lib/supabase.js`.
- Produces (in addition to re-exporting the Task 3a names):
  - `todayUtc(): string` — `new Date().toISOString().slice(0,10)`.
  - `dailyFor(dateStr: string): { date, region, seed, code }` — `region = pickDailyRegion(dateStr, regionNames({playableOnly:true}))`, `seed = hashDateToSeed(dateStr)`, `code = encodeSeed(region, seed)`.
  - `getTodayAttempts(userId, dateStr): Promise<{ used, best }>` — queries the day's rows for one user; `used` = count, `best` = `bestOfFirst3`. (No `attemptNo` field — the modal computes the X/10 display inline from `used`.)
  - `submitAttempt({ userId, username, dailyDate, region, maps_cleared, elapsed_ms }): Promise<{ ok } | { error }>` — computes the next `attempt_no` from the day's row count; no-op `{ ok: true, skipped: true }` at `MAX_ATTEMPTS`; inserts one row.
  - `getLeaderboard(dateStr, limit = 20): Promise<Array>` — queries the day's rows, returns `rankLeaderboard(...).slice(0, limit)`.

**Note on testing:** this module imports `regionRegistry` (→ region image assets) and `supabase`, so it is NOT Node-importable — the pure logic it relies on is already tested via Task 3a's `dailyScore.js`. This module is verified by build + lint + reasoning (same standard as App/UI tasks).

- [ ] **Step 1: Write the module**

Create `src/lib/daily.js`:

```js
// Daily-challenge data layer (Experimental Feature 2.3, Phase 2).
//
// Composes the pure derivation (dailyDerive.js) + scoring (dailyScore.js) with
// the region list and the seed codec, and owns the Supabase reads/writes for
// attempts + leaderboard. Trust-client model: RLS is the only guard (see
// supabase/daily_attempts.sql). Re-exports the pure reducers/constants so app
// callers have a single import site.

import { supabase } from './supabase'
import { regionNames } from '../game/regionRegistry'
import { hashDateToSeed, pickDailyRegion } from '../game/dailyDerive.js'
import { encodeSeed } from '../game/seed.js'
import { bestOfFirst3, rankLeaderboard, MAX_ATTEMPTS, SCORED_ATTEMPTS } from '../game/dailyScore.js'

export { bestOfFirst3, rankLeaderboard, MAX_ATTEMPTS, SCORED_ATTEMPTS }

// Current UTC day as "YYYY-MM-DD".
export function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

// The daily's region + seed + shareable code for a given UTC date.
export function dailyFor(dateStr) {
  const region = pickDailyRegion(dateStr, regionNames({ playableOnly: true }))
  const seed = hashDateToSeed(dateStr)
  return { date: dateStr, region, seed, code: encodeSeed(region, seed) }
}

// A user's attempt state for a given day.
export async function getTodayAttempts(userId, dateStr) {
  const { data, error } = await supabase
    .from('daily_attempts')
    .select('attempt_no, maps_cleared, elapsed_ms')
    .eq('user_id', userId)
    .eq('daily_date', dateStr)
  if (error || !data) return { used: 0, best: null }
  const used = data.length
  return {
    used,
    best: bestOfFirst3(data),
  }
}

// Insert one finished-run attempt for `dailyDate`. No-op once at MAX_ATTEMPTS.
export async function submitAttempt({ userId, username, dailyDate, region, maps_cleared, elapsed_ms }) {
  const { data, error: countErr } = await supabase
    .from('daily_attempts')
    .select('attempt_no')
    .eq('user_id', userId)
    .eq('daily_date', dailyDate)
  if (countErr) return { error: countErr.message }
  const used = data?.length ?? 0
  if (used >= MAX_ATTEMPTS) return { ok: true, skipped: true }
  const { error } = await supabase.from('daily_attempts').insert({
    user_id: userId,
    username: username ?? null,
    daily_date: dailyDate,
    region,
    attempt_no: used + 1,
    maps_cleared,
    elapsed_ms,
  })
  return error ? { error: error.message } : { ok: true }
}

// The day's leaderboard (best-of-first-3 per user, ranked), capped at `limit`.
export async function getLeaderboard(dateStr, limit = 20) {
  const { data, error } = await supabase
    .from('daily_attempts')
    .select('user_id, username, attempt_no, maps_cleared, elapsed_ms')
    .eq('daily_date', dateStr)
  if (error || !data) return []
  return rankLeaderboard(data).slice(0, limit)
}
```

- [ ] **Step 2: Verify build/lint**

```
npm run build   # clean
npm run lint    # no new problems vs 46 baseline
node scripts/verify-daily-score.mjs   # ALL PASS (the reducers this re-exports)
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/daily.js
git commit -m "feat(daily): daily query layer (dailyFor, attempts, leaderboard)"
```

---

### Task 4: Daily-mode run launch + submission in App.jsx

**Files:**
- Modify: `src/App.jsx` — imports; daily modal state; `startDailyRun`; submission block inside `recordRunEnd`; username fetch for the run.

**Interfaces:**
- Consumes: `dailyFor`, `submitAttempt`, `todayUtc` from `src/lib/daily.js` (Task 3b); existing `runSeed`/`runMode`/`runStartedAt`/`dailyDate`/`seedRng`/`prewarmCache`/`recordRunEnd`.
- Produces: `dailyOpen` state + `setDailyOpen`; `startDailyRun()` that seeds a daily run; daily submission in `recordRunEnd`; `onOpenDaily` handed to RegionSelect (Task 6) and `<DailyChallenge>` rendered (Task 5).

**Note:** `recordRunEnd` already fires at every run end and already early-returns for guests — the daily submit slots in right after the existing `runs` insert, guarded by `runMode === 'daily'`.

**Note (Play Again consumes an attempt):** `restartRun` keeps `runMode === 'daily'` and `dailyDate`, so "Play Again" after a daily defeat submits ANOTHER attempt at the next run-end (capped at `MAX_ATTEMPTS` by `submitAttempt`; `runStartedAt` resets per replay, so each attempt gets its own elapsed time). Intended per spec §5 (every finished daily-mode run is an attempt) — don't "fix" it.

- [ ] **Step 1: Add imports**

In `src/App.jsx`, add near the other `src/lib` imports:

```js
import { dailyFor, submitAttempt, todayUtc } from './lib/daily.js'
```

- [ ] **Step 2: Add daily modal state**

Near the other `useState` declarations (with `runSeed`/`runMode`):

```js
  const [dailyOpen, setDailyOpen] = useState(false)
```

- [ ] **Step 3: Add `startDailyRun`**

Add this function next to `startRun` in `src/App.jsx`. It mirrors the custom-seed launch but sets `runMode: 'daily'` and captures `dailyDate` at start:

```js
  // Launch today's daily challenge: derive region+seed from the UTC date,
  // seed the run, and record the start-date so the attempt submits under the
  // day it began (even across a midnight rollover). Called from DailyChallenge.
  function startDailyRun() {
    const date = todayUtc()
    const daily = dailyFor(date)                 // { date, region, seed, code }
    setRunSeed({ region: daily.region, seed: daily.seed, code: daily.code })
    setRunMode('daily')
    dailyDate.current = date
    setSelectedRegion({ name: daily.region })
    prewarmCache(getRegionConfig(daily.region))
    setDailyOpen(false)
    setScreen('starter')
  }
```

- [ ] **Step 4: Submit the attempt at run-end**

In `recordRunEnd`, after the existing `await supabase.from('runs').insert(payload)` line, add the daily submission. It fetches the username (for the denormalized leaderboard name) and submits under the captured start-date:

```js
    // Daily challenge: record this finished run as an attempt (trust-client).
    // Guarded so only daily-mode runs submit; guests already returned above.
    if (runMode === 'daily' && dailyDate.current) {
      const { data: prof } = await supabase
        .from('profiles').select('username').eq('id', user.id).maybeSingle()
      const res = await submitAttempt({
        userId: user.id,
        username: prof?.username ?? null,
        dailyDate: dailyDate.current,
        region: selectedRegion?.name ?? dailyFor(dailyDate.current).region,
        maps_cleared: mapsCleared.current,
        elapsed_ms: Math.max(0, Date.now() - (runStartedAt.current || Date.now())),
      })
      // Surface failures (e.g. a two-tab unique-index rejection) — same pattern
      // as recordCatch/recordBadgeEarned; never blocks the run.
      if (res?.error) console.warn('daily submitAttempt failed:', res.error)
    }
```

- [ ] **Step 5: Verify build/lint**

```
npm run build   # clean
npm run lint    # no new problems vs 46 baseline
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): daily-mode run launch + run-end attempt submission"
```

---

### Task 5: DailyChallenge modal (`src/components/DailyChallenge.jsx`)

**Files:**
- Create: `src/components/SeedCodeChip.jsx` — extract the existing chip from `BattleCard.jsx` (verbatim move, no behavior change).
- Modify: `src/components/BattleCard.jsx` — delete the local `SeedCodeChip` definition; add `import SeedCodeChip from './SeedCodeChip'`.
- Create: `src/components/DailyChallenge.jsx`
- Modify: `src/App.jsx` — render `<DailyChallenge>` when `dailyOpen`.

**Interfaces:**
- Consumes: `dailyFor`, `getTodayAttempts`, `getLeaderboard`, `MAX_ATTEMPTS`, `SCORED_ATTEMPTS`, `todayUtc` from `src/lib/daily.js` (Task 3b); `msUntilNextUtcDay` from `src/game/dailyDerive.js`; `SeedCodeChip` from `./SeedCodeChip`; props `user`, `onPlay` (= `startDailyRun`), `onClose`.
- Produces: the daily modal UI. Logged-out → "Sign in to play the daily" prompt (no Play). Shows today's seed code (tap-to-copy) per spec §3 ("Every displayed seed code is tap-to-copy … and the Daily view").

- [ ] **Step 1: Extract SeedCodeChip**

Cut the `function SeedCodeChip({ code, dark }) { … }` definition out of `src/components/BattleCard.jsx` (line ~741) into a new `src/components/SeedCodeChip.jsx`, adding the React import it needs and a default export:

```jsx
import { useState, useEffect, useRef } from 'react'

// Tap-to-copy seed code chip (🌱 KANTO-7Q2 → "Copied!"). Shared by the defeat
// and victory screens (BattleCard) and the Daily view — extracted from
// BattleCard so importing it here doesn't drag the battle stack (MoveAnimation
// sheets, framer-motion) into the initial chunk, which App lazy-loads via NodeMap.
export default function SeedCodeChip({ code, dark }) {
  // …verbatim body from BattleCard.jsx…
}
```

In `src/components/BattleCard.jsx`, delete the local definition and add `import SeedCodeChip from './SeedCodeChip'` with the other imports. (BattleCard already imports `useState`/`useRef`/`useEffect` for its own use — leave its React import as-is unless the chip was their only consumer; check before removing any name.)

- [ ] **Step 2: Create the component**

Create `src/components/DailyChallenge.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { dailyFor, getTodayAttempts, getLeaderboard, MAX_ATTEMPTS, SCORED_ATTEMPTS, todayUtc } from '../lib/daily.js'
import { msUntilNextUtcDay } from '../game/dailyDerive.js'
import SeedCodeChip from './SeedCodeChip'

// Format ms as "Hh Mm" for the reset countdown.
function fmtCountdown(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

// Format elapsed ms as "M:SS".
function fmtTime(ms) {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function DailyChallenge({ user, onPlay, onClose }) {
  const { dark } = useTheme()
  const date = todayUtc()
  const daily = dailyFor(date)
  const [attempts, setAttempts] = useState(null)   // { used, best } | null
  const [board, setBoard] = useState([])
  const [countdown, setCountdown] = useState(msUntilNextUtcDay())

  // Live countdown to the next daily.
  useEffect(() => {
    const t = setInterval(() => setCountdown(msUntilNextUtcDay()), 30000)
    return () => clearInterval(t)
  }, [])

  // Load this user's attempt state + the leaderboard.
  useEffect(() => {
    let cancelled = false
    if (!user) return
    getTodayAttempts(user.id, date).then(a => { if (!cancelled) setAttempts(a) })
    getLeaderboard(date).then(b => { if (!cancelled) setBoard(b) })
    return () => { cancelled = true }
  }, [user, date])

  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  const border = dark ? '2px solid #121212' : '2px solid #444444'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #444444'
  const text = dark ? '#DBDBDB' : '#333333'
  const used = attempts?.used ?? 0
  const canPlay = used < MAX_ATTEMPTS

  return (
    <div onClick={onClose} style={{
      // zIndex 200: must clear Layout's navbar (150) so nav buttons can't be
      // clicked "through" the modal (a Home tap would navigate away and leave
      // this modal open over a stale screen). Matches SettingsPanel's layer.
      position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: cardBg, border, boxShadow: shadow, padding: '18px',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '12px',
        width: '100%', maxWidth: '440px', maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '24px', color: text, textAlign: 'center' }}>
          🗓️ Daily Challenge
        </span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: text, textAlign: 'center' }}>
          {date} · {daily.region} · resets in {fmtCountdown(countdown)}
        </span>
        {/* Today's seed code, tap-to-copy (spec §3: the Daily view shows it too). */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SeedCodeChip code={daily.code} dark={dark} />
        </div>

        {!user ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: text, textAlign: 'center', padding: '12px' }}>
            Sign in to play the daily challenge.
          </span>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: cellBg, border, padding: '10px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: text }}>
                Attempt {Math.min(used + 1, MAX_ATTEMPTS)} / {MAX_ATTEMPTS}
                {'  '}(first {SCORED_ATTEMPTS} are scored)
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: text }}>
                Your best: {attempts?.best
                  ? `${attempts.best.maps_cleared} maps · ${fmtTime(attempts.best.elapsed_ms)}`
                  : '—'}
              </span>
            </div>

            <button
              type="button"
              disabled={!canPlay}
              onClick={() => canPlay && onPlay()}
              className={canPlay ? 'hover:opacity-70 transition-opacity' : ''}
              style={{
                fontFamily: 'Upheaval', fontSize: '14px', color: text, border, boxShadow: shadow,
                backgroundColor: canPlay ? (dark ? '#3a5a3a' : '#bfe0bf') : cellBg,
                padding: '10px', cursor: canPlay ? 'pointer' : 'default', opacity: canPlay ? 1 : 0.6,
              }}
            >
              {canPlay ? 'Play Daily' : 'Out of attempts today'}
            </button>

            <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: text, marginTop: '4px' }}>Leaderboard</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {board.length === 0 && (
                <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: text, opacity: 0.7 }}>
                  No entries yet — be the first.
                </span>
              )}
              {board.map((e, i) => {
                const me = e.user_id === user.id
                return (
                  <div key={e.user_id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: '8px',
                    backgroundColor: me ? (dark ? '#3a3a20' : '#e8e0b0') : cellBg,
                    border, padding: '5px 8px',
                    fontFamily: 'Orange Kid', fontSize: '14px', color: text,
                  }}>
                    <span style={{ width: '24px' }}>{i + 1}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.username ?? 'anon'}
                    </span>
                    <span style={{ width: '60px', textAlign: 'right' }}>{e.maps_cleared} maps</span>
                    <span style={{ width: '48px', textAlign: 'right' }}>{fmtTime(e.elapsed_ms)}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <button type="button" onClick={onClose} className="hover:opacity-70 transition-opacity"
          style={{ fontFamily: 'Upheaval', fontSize: '12px', color: text, border, boxShadow: shadow,
            backgroundColor: cellBg, padding: '8px 20px', marginTop: '4px' }}>
          Close
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Render it from App**

In `src/App.jsx`, add the modal render (near the other top-level overlays, e.g. after the `screen` blocks, before the closing `</Suspense>`). It renders whenever `dailyOpen`:

```jsx
      {dailyOpen && (
        <DailyChallenge
          user={user}
          onPlay={startDailyRun}
          onClose={() => setDailyOpen(false)}
        />
      )}
```

And add the import at the top of `src/App.jsx`:

```js
import DailyChallenge from './components/DailyChallenge'
```

- [ ] **Step 4: Verify build/lint**

```
npm run build   # clean
npm run lint    # no new problems
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/DailyChallenge.jsx src/components/SeedCodeChip.jsx src/components/BattleCard.jsx
git commit -m "feat(daily): DailyChallenge modal (attempts, best, leaderboard, countdown, seed chip)"
```

---

### Task 6: Daily button on RegionSelect

**Files:**
- Modify: `src/components/RegionSelect.jsx` — accept `onOpenDaily`; add the Daily button to the left of the Custom Seed input.
- Modify: `src/App.jsx` — pass `onOpenDaily={() => setDailyOpen(true)}` to `<RegionSelect>`.

**Interfaces:**
- Consumes: `onOpenDaily` (App opens the daily modal); `dailyOpen`/`setDailyOpen` from Task 4.
- Produces: a "🗓️ Daily Challenge" button in the seed row.

- [ ] **Step 1: Accept the prop**

In `src/components/RegionSelect.jsx`, add `onOpenDaily` to the destructured props of `export default function RegionSelect({ ... })`.

- [ ] **Step 2: Add the Daily button in the seed row**

Find the seed-entry row (the `<div>` whose comment reads `{/* Custom seed entry. Daily Challenge button goes here in Phase 2. */}`). Insert the Daily button as the FIRST child of that flex row, before the `Custom Seed:` span:

```jsx
          <button
            type="button"
            onClick={onOpenDaily}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '12px',
              color: cards ? '#DBDBDB' : '#333333',
              border: borderStyle, boxShadow: shadowStyle,
              backgroundColor: cards ? '#2e2e2e' : '#DBDBDB', padding: '8px 16px',
            }}
          >
            🗓️ Daily Challenge
          </button>
```

Also update the row comment to just `{/* Daily challenge + custom seed entry. */}` (it's no longer a Phase-2 placeholder).

- [ ] **Step 3: Pass the prop from App**

In `src/App.jsx`, in the `<RegionSelect ... />` render, add:

```jsx
          onOpenDaily={() => setDailyOpen(true)}
```

- [ ] **Step 4: Verify build/lint + manual reasoning**

```
npm run build   # clean
npm run lint    # no new problems
npm run dev
```
In the browser: region-select shows `[🗓️ Daily Challenge] [Custom Seed: ___] [Go]` above Back. Clicking Daily opens the modal; logged-out shows the sign-in prompt; logged-in shows attempts + leaderboard + Play.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/RegionSelect.jsx
git commit -m "feat(region-select): Daily Challenge button opens the daily modal"
```

---

### Task 7: Acceptance + docs

**Files:**
- Modify: `Experimental_Features.md` — mark 2.3 Phase 2 shipped.
- Modify: `Agents.md` — one line: daily challenge tables/derivation locations.
- Test: reuse the three harnesses.

- [ ] **Step 1: Full sweep**

```
node scripts/verify-daily-derive.mjs   # ALL PASS
node scripts/verify-daily-score.mjs    # ALL PASS
node scripts/verify-rng.mjs            # ALL PASS (Phase 1 regression)
node scripts/verify-seed.mjs           # ALL PASS (Phase 1 regression)
node scripts/verify-determinism.mjs    # ALL PASS (Phase 1 regression)
node scripts/verify-resume-rng.mjs     # ALL PASS (Phase 1 regression)
node scripts/verify-map-seed.mjs       # ALL PASS (Phase 1 regression)
npm run build && npm run lint          # clean, no new problems
```

- [ ] **Step 2: Manual end-to-end (requires the SQL run + a login)**

Confirm the operator has run `supabase/daily_attempts.sql` in the Supabase SQL editor. Then `npm run dev`, log in:
1. Region-select → Daily Challenge → modal shows today's region + countdown + `Attempt 1/10` + empty leaderboard.
2. Play Daily → starter select → a run with the 🌱 daily seed badge.
3. Lose/win → back to menu; reopen Daily → `Attempt 2/10`, "Your best" populated, your row on the leaderboard.
4. Verify a second run's result updates best only if it beats attempts 1-3.

- [ ] **Step 3: Update docs**

In `Experimental_Features.md`, under `### 2.3 Seeded runs / daily seed`: the Phase-1 blockquote's last line is currently `> defeat/victory + map badge). Phase 2 (daily challenge + leaderboard) pending.` — delete ONLY the trailing sentence `Phase 2 (daily challenge + leaderboard) pending.` (keep the rest of the Phase-1 entry intact, ending at `> defeat/victory + map badge).`), then append a NEW blockquote below it:

```
> ✅ Phase 2 shipped (2026-07-22): daily challenge + leaderboard
> (daily_attempts table, src/lib/daily.js, DailyChallenge modal, Daily button
> on region-select; rotating region + date-seeded run, 10 attempts / first 3
> scored, ranked by maps then time).
```

In `Agents.md`, add:

```
- Daily challenge (2.3 Phase 2): date→region+seed derivation in
  `src/game/dailyDerive.js` (pure) + `src/lib/daily.js` (queries); attempts in
  the `daily_attempts` table (see `supabase/daily_attempts.sql`, run manually).
```

- [ ] **Step 4: Commit**

```bash
git add Experimental_Features.md Agents.md
git commit -m "docs: mark 2.3 seeded-runs Phase 2 shipped"
```

---

## Self-Review

**Spec coverage (Phase 2 scope of SEEDED_RUNS_PLAN.md Sections 4-5 + review amendments):**
- Daily derivation (date → region rotation + seed) → Task 1 (`dailyDerive.js`) + Task 3b (`dailyFor` composition) ✅
- Pure scoring reducers (best-of-first-3, leaderboard rank), Node-testable → Task 3a (`dailyScore.js`) ✅
- `daily_attempts` table: cols, `attempt_no` CHECK 1..10, unique `(user_id,daily_date,attempt_no)`, RLS (authed select / own-insert) → Task 2 ✅
- `src/lib/daily.js`: `getTodayAttempts`, `submitAttempt` (start-date, ≤10 cap), `getLeaderboard` → Task 3b; best-of-first-3, rank by maps then time → Task 3a ✅
- Daily view: today's region+date, Play, countdown to next UTC day, attempt tracker (X/10, first 3 scored), your best, **today's seed code (tap-to-copy, spec §3)**, leaderboard (rank/name/maps/time, self-highlight), login gate → Task 5 ✅
- Daily button on region-select → Task 6 ✅
- Daily-mode launch + run-end submission under start-date (amendment 2) → Task 4 ✅
- Denormalized username (decision) → Task 4 fetch + Task 2 column ✅
- Two-tab unique index (amendment 3) → Task 2 ✅
- Login-required daily; guests keep normal/custom → Task 5 gate ✅
- Deferred to a later phase (correctly absent): server-side verification, difficulty modes (4.4), sims (4.1).

**Placeholder scan:** every code step contains complete code; SQL is complete and idempotent; no TBD/TODO. Task 2 has no unit test by nature (live SQL) — flagged explicitly with a schema read-through as its check, not a hidden gap.

**Type consistency:** `dailyFor` returns `{ date, region, seed, code }` — consumed consistently in Task 4 (`startDailyRun`) and Task 5 (modal, incl. the seed chip). `submitAttempt` param shape `{ userId, username, dailyDate, region, maps_cleared, elapsed_ms }` matches Task 4's call. `bestOfFirst3` → `{ maps_cleared, elapsed_ms } | null` consumed by `getTodayAttempts` and the modal's "Your best". `getTodayAttempts` → `{ used, best }` matches the modal (which computes the X/10 display from `used`). `MAX_ATTEMPTS`/`SCORED_ATTEMPTS` exported from `daily.js`, imported by the modal. `runMode === 'daily'` and `dailyDate.current` are the Phase-1 fields (already exist).

**One cross-task note for the implementer:** `startDailyRun` (Task 4) and the `<DailyChallenge>` render (Task 5) both live in App.jsx and reference `dailyOpen`/`setDailyOpen` (added in Task 4) — implement Task 4 before Task 5. Task 6's App edit adds `onOpenDaily` referencing `setDailyOpen` (Task 4) — also after Task 4. The task order already reflects this.
