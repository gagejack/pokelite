# Trainer Level Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin Difficulty-tab panel that tunes enemy level pacing — per-region editable map level bands plus a per-row uniform jitter offset — with a table showing the level range each node row actually produces.

**Architecture:** Keep the existing derived-level math (`pickLevel` interpolating inside a per-map band by node position). Make the band admin-editable per region via a new Supabase table, and add a per-row jitter magnitude applied at every `pickLevel` call site. The dashboard table is a read-only derived view with two real inputs: the band (header strip) and the offset (row column).

**Tech Stack:** React 19, Vite, Vitest, Supabase (postgres + RLS), plain inline-style components (no CSS framework in this file beyond Tailwind utility classes on wrappers).

**Spec:** `docs/superpowers/specs/2026-08-16-trainer-level-balance-design.md`

## Global Constraints

- **Offset is a jitter magnitude, not a signed shift.** Offset `N` draws a uniform integer delta from `[-N, +N]` inclusive (`2N + 1` outcomes).
- **Offset `0` must be byte-identical to today**, including rng draw count. Guard the `rng()` call behind `offset > 0` so existing seeds reproduce exactly.
- **Level clamp is `[1, 100]`** after jitter.
- **SQL offset range is `0..20`**; band range is `min_level >= 1`, `max_level <= 100`, `min_level <= max_level`.
- **The table ships empty.** Every read falls back to the region config, so an un-run migration / offline client / failed fetch reproduces shipped behaviour.
- **Only playable regions appear.** Use `regionNames({ playableOnly: true })` — never a hardcoded region list. Today that is Kanto and Unova; Hoenn and Sinnoh have `maps: []`.
- **Row count is 9**: `BALANCE.map.rowWidths` = `[1, 2, 3, 4, 3, 4, 3]` (rows 0–6), plus the appended Pokécenter/Pokémart row (row 7, 2 nodes) and boss row (row 8, 1 node).
- **Row 0 is the pre-cleared START node** — display it, but disable its offset input.
- **`catchLevelRanges` stays config-only.** Catch offers receive the row offset but their band is not editable from the dashboard.
- Test command: `npx vitest run <path>`. Full suite: `npm test`.
- Tests use `import { test, expect } from 'vitest'` and live beside the module as `*.test.js`.

---

### Task 1: `pickLevel` offset parameter

**Files:**
- Modify: `src/game/battleTeams.js:20-40`
- Test: `src/game/battleTeams.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `pickLevel(band: [number, number], positionWeight?: number, offset?: number): number` — third param defaults to `0`.
  - `buildTrainerTeamSpec(pool: number[], band: [number, number], count: number, positionWeight?: number, offset?: number): Array<{id: number, level: number}>` — fifth param defaults to `0`.

- [ ] **Step 1: Write the failing test**

Create `src/game/battleTeams.test.js`:

```js
import { test, expect } from 'vitest'
import { pickLevel, buildTrainerTeamSpec } from './battleTeams.js'
import { seedRng, clearRng } from './rng.js'

// Offset 0 must be byte-identical to today, INCLUDING the rng draw count.
// Two runs from the same seed — one omitting the arg, one passing 0 — must
// agree, and a following draw must also agree, proving no extra rng() was
// consumed by the jitter branch.
test('offset 0 consumes the same rng stream as omitting the argument', () => {
  seedRng(1234)
  const a = pickLevel([10, 20], 0.5)
  const aNext = pickLevel([10, 20], 0.5)
  clearRng()

  seedRng(1234)
  const b = pickLevel([10, 20], 0.5, 0)
  const bNext = pickLevel([10, 20], 0.5, 0)
  clearRng()

  expect(b).toBe(a)
  expect(bNext).toBe(aNext)
})

test('offset N keeps the result within N of the unjittered level', () => {
  const N = 3
  for (let seed = 0; seed < 50; seed++) {
    seedRng(seed)
    const base = pickLevel([30, 50], 0.5)
    clearRng()

    seedRng(seed)
    const jittered = pickLevel([30, 50], 0.5, N)
    clearRng()

    expect(Math.abs(jittered - base)).toBeLessThanOrEqual(N)
  }
})

test('offset spans the full [-N, +N] range across seeds', () => {
  const deltas = new Set()
  for (let seed = 0; seed < 400; seed++) {
    seedRng(seed)
    const base = pickLevel([30, 50], 0.5)
    clearRng()

    seedRng(seed)
    const jittered = pickLevel([30, 50], 0.5, 2)
    clearRng()

    deltas.add(jittered - base)
  }
  // Uniform over 5 outcomes — every one must be reachable.
  expect([...deltas].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2])
})

test('jitter cannot push a level below 1 or above 100', () => {
  for (let seed = 0; seed < 100; seed++) {
    seedRng(seed)
    const low = pickLevel([1, 1], 0, 10)
    clearRng()
    seedRng(seed)
    const high = pickLevel([100, 100], 1, 10)
    clearRng()

    expect(low).toBeGreaterThanOrEqual(1)
    expect(high).toBeLessThanOrEqual(100)
  }
})

test('buildTrainerTeamSpec forwards the offset to every spec', () => {
  seedRng(77)
  const plain = buildTrainerTeamSpec([1, 4, 7], [40, 40], 3, 0.5)
  clearRng()
  // A zero-width band pins the unjittered level to exactly 40, so any
  // deviation is the offset and nothing else.
  expect(plain.every(s => s.level === 40)).toBe(true)

  seedRng(77)
  const jittered = buildTrainerTeamSpec([1, 4, 7], [40, 40], 3, 0.5, 5)
  clearRng()
  expect(jittered.every(s => Math.abs(s.level - 40) <= 5)).toBe(true)
  expect(jittered.some(s => s.level !== 40)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/battleTeams.test.js`
Expected: FAIL — the offset tests fail because `pickLevel` ignores the third argument (jittered results equal base results, so the `[-2..2]` span assertion gets `[0]`).

- [ ] **Step 3: Write minimal implementation**

In `src/game/battleTeams.js`, replace `pickLevel`:

```js
// Pick a level from a band, scaled by position down the map.
// positionWeight 0.0 = early node (near the band floor) → 1.0 = late node (near
// the band ceiling, approaching the map's gym leader). Position dominates, with
// a loose random spread so nodes still vary.
//
// `offset` is the row's admin-tuned jitter MAGNITUDE (not a signed shift): the
// result gets a uniform integer delta from [-offset, +offset]. The rng() draw
// is guarded behind offset > 0 so an all-zero offset table consumes exactly
// the same rng stream as before this parameter existed — existing seeds must
// keep reproducing identically. Clamped to [1, 100] because jitter, unlike the
// interpolation above it, can leave the band.
export function pickLevel([min, max], positionWeight = 0.5, offset = 0) {
  const span = max - min
  const { posFactor, randSpan, randOffset } = BALANCE.trainers.level
  const t = Math.max(0, Math.min(1, positionWeight * posFactor + rng() * randSpan - randOffset))
  const level = Math.round(min + span * t)
  const jitter = offset > 0 ? Math.floor(rng() * (2 * offset + 1)) - offset : 0
  return Math.min(100, Math.max(1, level + jitter))
}
```

Then update `buildTrainerTeamSpec` to take and forward the offset:

```js
export function buildTrainerTeamSpec(pool, band, count, positionWeight = 0.5, offset = 0) {
  const src = pool && pool.length > 0 ? pool : [504]
  const specs = []
  const usedIds = new Set()
  for (let i = 0; i < count; i++) {
    const available = src.filter(id => !usedIds.has(id))
    const id = available.length > 0 ? pick(available) : pick(src)
    usedIds.add(id)
    specs.push({ id, level: pickLevel(band, positionWeight, offset) })
  }
  return specs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/battleTeams.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Verify no existing test regressed**

Run: `npm test`
Expected: PASS — the offset defaults to 0 everywhere, so every existing seeded test still produces its recorded values.

- [ ] **Step 6: Commit**

```bash
git add src/game/battleTeams.js src/game/battleTeams.test.js
git commit -m "feat(balance): add jitter offset parameter to pickLevel"
```

---

### Task 2: `rowIndexForNodeId` helper

**Files:**
- Modify: `src/game/nodeMap.js` (add export near `buildRows`)
- Test: `src/game/nodeMap.test.js:1-3` (extend imports), append tests

**Interfaces:**
- Consumes: `BALANCE.map.rowWidths` (already imported in `nodeMap.js`).
- Produces: `rowIndexForNodeId(nodeId: number): number` — 0-based row index, clamped to the last row for out-of-range ids.

- [ ] **Step 1: Write the failing test**

Append to `src/game/nodeMap.test.js` (and add `rowIndexForNodeId` to the existing import from `./nodeMap.js` on line 2):

```js
test('rowIndexForNodeId maps every generated node id to the row containing it', () => {
  seedRng(42)
  const rows = buildRows([1, 4, 7], 'Brock', 0, { megaStoneAvailable: false })
  clearRng()

  rows.forEach((row, expectedRow) => {
    row.forEach(node => {
      expect(rowIndexForNodeId(node.id)).toBe(expectedRow)
    })
  })
})

test('rowIndexForNodeId covers the appended pokecenter and boss rows', () => {
  // rowWidths [1,2,3,4,3,4,3] = 20 nodes (ids 0-19), then the pokecenter row
  // (ids 20-21, row 7) and the boss (id 22, row 8).
  expect(rowIndexForNodeId(19)).toBe(6)
  expect(rowIndexForNodeId(20)).toBe(7)
  expect(rowIndexForNodeId(21)).toBe(7)
  expect(rowIndexForNodeId(22)).toBe(8)
})

test('rowIndexForNodeId clamps out-of-range ids to the last row', () => {
  expect(rowIndexForNodeId(999)).toBe(8)
  expect(rowIndexForNodeId(-1)).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/nodeMap.test.js`
Expected: FAIL with "rowIndexForNodeId is not a function" (or an import error).

- [ ] **Step 3: Write minimal implementation**

Add to `src/game/nodeMap.js`, immediately after `buildRows`:

```js
// Row index containing a node id, for the layout buildRows produces:
// BALANCE.map.rowWidths, then the appended Pokécenter/Pokémart fork (2 nodes)
// and the boss (1 node). Call sites downstream of generation hold only
// `node.id` but need the row to look up its admin-tuned level offset, and ids
// are assigned in row order by buildRows, so the row is recoverable by walking
// cumulative widths. Out-of-range ids clamp to the last row rather than
// returning -1: a lookup miss must degrade to a real offset, never undefined.
export function rowIndexForNodeId(nodeId) {
  const widths = [...BALANCE.map.rowWidths, 2, 1] // + pokecenter row + boss row
  if (nodeId < 0) return 0
  let seen = 0
  for (let row = 0; row < widths.length; row++) {
    seen += widths[row]
    if (nodeId < seen) return row
  }
  return widths.length - 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/nodeMap.test.js`
Expected: PASS — the 3 new tests plus every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/game/nodeMap.js src/game/nodeMap.test.js
git commit -m "feat(balance): add rowIndexForNodeId helper"
```

---

### Task 3: Supabase table

**Files:**
- Create: `supabase/map_level_balance.sql`

**Interfaces:**
- Consumes: nothing (SQL only, not imported by JS).
- Produces: table `public.map_level_balance` with columns `region`, `map_index`, `row_index`, `min_level`, `max_level`, `offset`, `updated_at`, `updated_by`; primary key `(region, map_index, row_index)`.

Note: `offset` is a reserved word in postgres, so the column is quoted as `"offset"` in DDL. The supabase-js client refers to it as the plain string `offset` — no quoting needed from JS.

- [ ] **Step 1: Write the migration**

Create `supabase/map_level_balance.sql`:

```sql
-- Per-map / per-row enemy level tuning for Speedmon (admin balance dashboard).
--
-- Two datasets share this table, distinguished by `region`:
--   BAND ROWS   — region = a real region name, row_index = -1.
--                 min_level/max_level override that region's
--                 mapLevelRanges[map_index] (game/regions/*.teams.js).
--   OFFSET ROWS — region = '*', row_index = 0..8.
--                 "offset" is a jitter MAGNITUDE applied to every level rolled
--                 on that node row: the final level gets a uniform integer
--                 delta from [-offset, +offset]. Offsets are universal across
--                 regions by design, hence the '*' sentinel.
--
-- row_index uses -1 rather than NULL for band rows: NULL does not participate
-- in a composite primary key, which would break the upsert's onConflict target.
--
-- The table ships EMPTY. Every read falls back to the region config, so an
-- un-run migration, an offline client, or a failed fetch reproduces shipped
-- behaviour exactly — the same degradation contract region_balance.sql uses.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.map_level_balance (
  region      text        not null,
  map_index   smallint    not null,
  row_index   smallint    not null default -1,
  min_level   smallint,
  max_level   smallint,
  "offset"    smallint,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) on delete set null,
  primary key (region, map_index, row_index)
);

-- 2. Constraints --------------------------------------------------------------
-- Levels stay inside the game's own 1-100 range and never invert.
alter table public.map_level_balance
  drop constraint if exists map_level_balance_levels;
alter table public.map_level_balance
  add constraint map_level_balance_levels check (
    (min_level is null and max_level is null)
    or (min_level >= 1 and max_level <= 100 and min_level <= max_level)
  );

-- An offset ceiling stops a fat-fingered entry from flattening a map's level
-- curve into noise (a +-20 jitter on a 10-level band is pure randomness).
alter table public.map_level_balance
  drop constraint if exists map_level_balance_offset;
alter table public.map_level_balance
  add constraint map_level_balance_offset check (
    "offset" is null or ("offset" >= 0 and "offset" <= 20)
  );

alter table public.map_level_balance
  drop constraint if exists map_level_balance_map_index;
alter table public.map_level_balance
  add constraint map_level_balance_map_index check (
    map_index >= 0 and map_index <= 7
  );

-- 3. Row Level Security -------------------------------------------------------
alter table public.map_level_balance enable row level security;

-- Everyone (including anonymous players) may READ — map generation needs these
-- values to roll enemy levels.
drop policy if exists "map_level_balance_select_all" on public.map_level_balance;
create policy "map_level_balance_select_all"
  on public.map_level_balance for select
  using (true);

-- Only admins may WRITE. Mirrors the role check the client uses to show the
-- balance dashboard, but enforced server-side — the client-side gate only hides
-- the UI, it is not a security boundary.
drop policy if exists "map_level_balance_update_admin" on public.map_level_balance;
create policy "map_level_balance_update_admin"
  on public.map_level_balance for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "map_level_balance_insert_admin" on public.map_level_balance;
create policy "map_level_balance_insert_admin"
  on public.map_level_balance for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
```

- [ ] **Step 2: Verify it parses**

There is no local postgres in this project, so verification is a read-through against `supabase/region_balance.sql`. Confirm all four hold:
1. `create table if not exists` — re-runnable.
2. Every `alter table ... add constraint` is preceded by a matching `drop constraint if exists`.
3. Every `create policy` is preceded by a matching `drop policy if exists`.
4. `offset` is quoted as `"offset"` in every DDL reference (reserved word).

- [ ] **Step 3: Commit**

```bash
git add supabase/map_level_balance.sql
git commit -m "feat(balance): add map_level_balance table"
```

---

### Task 4: `mapLevelBalance` client module

**Files:**
- Create: `src/lib/mapLevelBalance.js`
- Test: `src/lib/mapLevelBalance.test.js` (create)

**Interfaces:**
- Consumes: `getRegionConfig` (`src/game/regionRegistry.js`), `mapLevelRange` (`src/game/battleTeams.js`), `supabase` (`src/lib/supabase.js`).
- Produces:
  - `getMapLevelBand(regionName: string, mapIndex: number): [number, number]`
  - `getRowOffset(mapIndex: number, rowIndex: number): number`
  - `loadMapLevelBalance(): Promise<void>`
  - `saveMapLevelBand(regionName, mapIndex, { min, max }): Promise<{error}>`
  - `saveRowOffset(mapIndex, rowIndex, offset): Promise<{error}>`
  - `OFFSET_MIN = 0`, `OFFSET_MAX = 20`, `LEVEL_MIN = 1`, `LEVEL_MAX = 100`
  - `isCommittableLevel(draft: string): boolean`
  - `__resetMapLevelBalanceForTests(): void`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mapLevelBalance.test.js`:

```js
import { test, expect, beforeEach, vi } from 'vitest'

// The module reads Supabase at load(); these tests only cover the cache and
// fallback logic, so stub the client out entirely.
vi.mock('./supabase.js', () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: [], error: null }) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}))

const {
  getMapLevelBand, getRowOffset, isCommittableLevel,
  OFFSET_MIN, OFFSET_MAX, __setCacheForTests, __resetMapLevelBalanceForTests,
} = await import('./mapLevelBalance.js')

beforeEach(() => { __resetMapLevelBalanceForTests() })

test('getMapLevelBand falls back to the region config when the cache is empty', () => {
  // Kanto map 1 ships as [1, 8] (kanto.teams.js MAP_LEVEL_RANGES).
  expect(getMapLevelBand('Kanto', 0)).toEqual([1, 8])
  // Unova map 1 ships as [3, 10] (unova.teams.js).
  expect(getMapLevelBand('Unova', 0)).toEqual([3, 10])
})

test('getMapLevelBand clamps an out-of-range map index to the last band', () => {
  expect(getMapLevelBand('Kanto', 99)).toEqual([58, 73])
})

test('getMapLevelBand returns a safe default for an unknown region', () => {
  expect(getMapLevelBand('Atlantis', 0)).toEqual([1, 100])
})

test('a cached band wins over the config', () => {
  __setCacheForTests({ bands: { 'Kanto:0': [20, 30] }, offsets: {} })
  expect(getMapLevelBand('Kanto', 0)).toEqual([20, 30])
  // Untouched maps still read from config.
  expect(getMapLevelBand('Kanto', 1)).toEqual([8, 17])
})

test('getRowOffset defaults to 0 and reads the cache when present', () => {
  expect(getRowOffset(0, 3)).toBe(0)
  __setCacheForTests({ bands: {}, offsets: { '0:3': 4 } })
  expect(getRowOffset(0, 3)).toBe(4)
  expect(getRowOffset(0, 4)).toBe(0)
})

test('isCommittableLevel rejects an empty box but accepts 0', () => {
  // An empty input is mid-edit, not "set this to zero" — the Number('') === 0
  // trap isCommittablePrice exists for in metaShopBalance.js.
  expect(isCommittableLevel('')).toBe(false)
  expect(isCommittableLevel('   ')).toBe(false)
  expect(isCommittableLevel('0')).toBe(true)
  expect(isCommittableLevel('12')).toBe(true)
})

test('offset bounds are the documented 0..20', () => {
  expect(OFFSET_MIN).toBe(0)
  expect(OFFSET_MAX).toBe(20)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mapLevelBalance.test.js`
Expected: FAIL — "Cannot find module './mapLevelBalance.js'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/mapLevelBalance.js`:

```js
import { supabase } from './supabase'
import { getRegionConfig } from '../game/regionRegistry'
import { mapLevelRange } from '../game/battleTeams'

// Per-map / per-row enemy level tuning, stored in the `map_level_balance`
// table (see supabase/map_level_balance.sql). Everyone reads it; only admins
// can write.
//
// Two knobs:
//   band   — per region, per map: the [min, max] level range pickLevel
//            interpolates inside. Overrides the region config's mapLevelRanges.
//   offset — per node ROW, universal across regions: a jitter magnitude, so a
//            level rolled on that row gets a uniform delta from [-N, +N].
//
// The region config is the fallback for bands, so a missing row, an offline
// client, or a failed fetch always degrades to shipped behaviour. Offsets
// default to 0, which pickLevel treats as "no jitter" and which consumes no
// rng draw — an empty table reproduces pre-feature generation exactly.

export const LEVEL_MIN = 1
export const LEVEL_MAX = 100
export const OFFSET_MIN = 0
export const OFFSET_MAX = 20

// The sentinel `region` for offset rows — offsets are universal across
// regions, so they cannot key on a real region name. Matches the SQL comment.
const OFFSET_REGION = '*'
// The sentinel `row_index` for band rows. NULL cannot sit in a composite
// primary key, so band rows use -1 (see map_level_balance.sql).
const BAND_ROW = -1

// 'Region:mapIndex' -> [min, max]
let bandCache = new Map()
// 'mapIndex:rowIndex' -> offset
let offsetCache = new Map()

const bandKey = (region, mapIndex) => `${region}:${mapIndex}`
const offsetKey = (mapIndex, rowIndex) => `${mapIndex}:${rowIndex}`

const clampLevel = n => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(Number(n))))
const clampOffset = n => Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, Math.round(Number(n))))

// The shipped band for a region/map, straight from its config. Unknown regions
// yield the full range rather than undefined — a caller mid-render with a bad
// region name must still get a usable [min, max] to destructure.
export function defaultBandFor(regionName, mapIndex) {
  const ranges = getRegionConfig(regionName)?.mapLevelRanges
  return ranges?.length ? mapLevelRange(ranges, mapIndex) : [LEVEL_MIN, LEVEL_MAX]
}

// Cached band for a region/map, falling back to the config. Synchronous so map
// generation call sites can read it without awaiting.
export function getMapLevelBand(regionName, mapIndex) {
  return bandCache.get(bandKey(regionName, mapIndex)) ?? defaultBandFor(regionName, mapIndex)
}

// Cached jitter magnitude for a node row. 0 means no jitter.
export function getRowOffset(mapIndex, rowIndex) {
  return offsetCache.get(offsetKey(mapIndex, rowIndex)) ?? 0
}

// An empty box is mid-edit, not "set this to 0" — the same Number('') === 0
// trap isCommittablePrice guards against in metaShopBalance.js.
export function isCommittableLevel(draft) {
  return String(draft ?? '').trim() !== ''
}

// Fetch every band and offset into the caches. Call once on app start;
// failures are non-fatal (the caches stay empty and config defaults apply).
export async function loadMapLevelBalance() {
  try {
    const { data, error } = await supabase
      .from('map_level_balance')
      .select('region, map_index, row_index, min_level, max_level, offset')
    if (error || !data) return
    for (const row of data) {
      if (row.region === OFFSET_REGION) {
        if (row.offset == null) continue
        offsetCache.set(offsetKey(row.map_index, row.row_index), clampOffset(row.offset))
      } else {
        if (row.min_level == null || row.max_level == null) continue
        bandCache.set(bandKey(row.region, row.map_index), [
          clampLevel(row.min_level),
          clampLevel(row.max_level),
        ])
      }
    }
  } catch {
    // Offline or misconfigured Supabase — config defaults apply.
  }
}

// Admin write. Upserts the row and updates the local cache so the change is
// live immediately for this session. Returns { error } on failure (the RLS
// policy rejects non-admins server-side).
export async function saveMapLevelBand(regionName, mapIndex, { min, max }) {
  // Clamp BEFORE the inversion fix so a swapped pair is still in range.
  const lo = clampLevel(min)
  const hi = clampLevel(max)
  const values = lo <= hi ? [lo, hi] : [hi, lo]
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('map_level_balance')
    .upsert({
      region: regionName,
      map_index: mapIndex,
      row_index: BAND_ROW,
      min_level: values[0],
      max_level: values[1],
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'region,map_index,row_index' })
  if (!error) bandCache.set(bandKey(regionName, mapIndex), values)
  return { error }
}

export async function saveRowOffset(mapIndex, rowIndex, offset) {
  const value = clampOffset(offset)
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('map_level_balance')
    .upsert({
      region: OFFSET_REGION,
      map_index: mapIndex,
      row_index: rowIndex,
      offset: value,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'region,map_index,row_index' })
  if (!error) offsetCache.set(offsetKey(mapIndex, rowIndex), value)
  return { error }
}

// ── Test seams ────────────────────────────────────────────────────────────
// The caches are module-level (deliberately — generation reads them
// synchronously), so tests need a way to seed and clear them.
export function __setCacheForTests({ bands = {}, offsets = {} }) {
  bandCache = new Map(Object.entries(bands))
  offsetCache = new Map(Object.entries(offsets))
}

export function __resetMapLevelBalanceForTests() {
  bandCache = new Map()
  offsetCache = new Map()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mapLevelBalance.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mapLevelBalance.js src/lib/mapLevelBalance.test.js
git commit -m "feat(balance): add mapLevelBalance client module"
```

---

### Task 5: Wire generation to the band and offset

**Files:**
- Modify: `src/components/NodeMap.jsx` — trainer path (~line 884), grass path (~line 917), catch path (~line 966)
- Modify: `src/game/safariBake.js:40-71, 84-116`
- Modify: `src/App.jsx:28-30` (import), `:213` (effect)

**Interfaces:**
- Consumes: `pickLevel(band, positionWeight, offset)` and `buildTrainerTeamSpec(pool, band, count, positionWeight, offset)` from Task 1; `rowIndexForNodeId` from Task 2; `getMapLevelBand`, `getRowOffset`, `loadMapLevelBalance` from Task 4.
- Produces: nothing consumed by later tasks (Task 6 reads the same Task 4 API directly).

- [ ] **Step 1: Add the load call in App.jsx**

Add to the import block (beside line 28's `loadRegionBalance`):

```js
import { loadMapLevelBalance } from './lib/mapLevelBalance.js'
```

Add the effect immediately after the existing `loadRegionBalance` effect on line 213:

```js
  // Per-map level bands + per-row jitter offsets, same non-fatal-failure
  // posture as loadRegionBalance above — an empty cache falls back to each
  // region's shipped mapLevelRanges.
  useEffect(() => { loadMapLevelBalance() }, [])
```

- [ ] **Step 2: Wire the three NodeMap call sites**

Add to `NodeMap.jsx`'s imports:

```js
import { rowIndexForNodeId } from '../game/nodeMap.js'
import { getMapLevelBand, getRowOffset } from '../lib/mapLevelBalance.js'
```

(`nodeMap.js` is already imported in this file for `NODE_TYPES` / `pick` — extend that existing import rather than adding a second one.)

In `fetchEnemyTeam`, immediately after the existing `const positionWeight = node.id / totalNodes`:

```js
    // The row's admin-tuned jitter magnitude (0 = shipped behaviour, and no
    // rng draw). Rows are recoverable from the node id because buildRows
    // assigns ids in row order — see rowIndexForNodeId.
    const rowOffset = getRowOffset(mapIndex, rowIndexForNodeId(node.id))
```

Trainer branch — replace the band lookup and the spec call:

```js
      const band = getMapLevelBand(config.name, mapIndex)
```
```js
      specs = buildTrainerTeamSpec(pool, band, count, positionWeight, rowOffset)
```

Grass branch — replace the band lookup and the `pickLevel` call:

```js
      const [min, max] = getMapLevelBand(config.name, mapIndex)
      const grassRange = [Math.max(1, min - 3), Math.max(1, max - 3)]
      specs = [{ id, level: pickLevel(grassRange, positionWeight, rowOffset) }]
```

In `fetchOfferedPokemon`, after its own `const positionWeight = node.id / totalNodes`, add the same offset lookup and pass it through. The catch BAND stays on `config.catchLevelRanges` — only the offset is new:

```js
    const rowOffset = getRowOffset(mapIndex, rowIndexForNodeId(node.id))
    const catchBands = config.catchLevelRanges ?? config.mapLevelRanges
    const level = pickLevel(mapLevelRange(catchBands, mapIndex), positionWeight, rowOffset)
```

- [ ] **Step 3: Wire safariBake.js**

Change both bake helpers to accept and forward an offset, and have the pass compute it per node.

`bakeGrass` — signature and band lookup:

```js
function bakeGrass(config, mapIndex, positionWeight, usedInRow, rowOffset = 0) {
  const pool = config.catchPools?.[mapIndex] ?? []
  const drawable = availableIn(pool, usedInRow)
  const id = drawable.length > 0 ? pick(drawable).id : (config.fallbackSpeciesId ?? 504)
  const [min, max] = getMapLevelBand(config.name, mapIndex)
  const band = [
    Math.max(1, min - GRASS_LEVEL_OFFSET),
    Math.max(1, max - GRASS_LEVEL_OFFSET),
  ]
  return { id, level: pickLevel(band, positionWeight, rowOffset) }
}
```

`bakePokeball` — signature and level draw (catch band stays config-only):

```js
function bakePokeball(config, mapIndex, positionWeight, maxSpeciesId, usedInRow, rowOffset = 0) {
  const pool = config.catchPools?.[mapIndex] ?? []
  if (pool.length === 0) return null

  const bands = config.catchLevelRanges ?? config.mapLevelRanges
  const level = pickLevel(mapLevelRange(bands, mapIndex), positionWeight, rowOffset)
```

Add the imports at the top of `safariBake.js`:

```js
import { NODE_TYPES, pick, rowIndexForNodeId } from './nodeMap.js'
import { getMapLevelBand, getRowOffset } from '../lib/mapLevelBalance.js'
```

In `bakeSafariSpecies`, compute the offset alongside `positionWeight` and pass it to both helpers:

```js
      const positionWeight = totalNodes > 0 ? node.id / totalNodes : 0.5
      const rowOffset = getRowOffset(mapIndex, rowIndexForNodeId(node.id))

      // One draw per node — availableIn has already removed this row's used
      // species from the pool, so there is nothing to retry.
      let species
      if (node.type === NODE_TYPES.GRASS) {
        species = bakeGrass(config, mapIndex, positionWeight, usedInRow, rowOffset)
      } else if (node.type === NODE_TYPES.POKEBALL) {
        species = bakePokeball(config, mapIndex, positionWeight, maxSpeciesId, usedInRow, rowOffset)
      } else if (node.type === NODE_TYPES.MASTER_BALL) {
```

- [ ] **Step 4: Run the full suite to verify nothing regressed**

Run: `npm test`
Expected: PASS. `safariBake.test.js` is the one to watch — it asserts seeded species/level output, and an empty offset cache must reproduce it exactly (offset 0 draws no rng).

If `safariBake.test.js` fails on levels, the cause is almost certainly an unguarded `rng()` in the jitter branch — re-check Task 1 Step 3's `offset > 0` guard before touching the test.

- [ ] **Step 5: Verify the app builds**

Run: `npm run build`
Expected: build succeeds. This catches a circular-import problem: `safariBake.js` (a `game/` module) now imports from `lib/`, which imports `battleTeams.js` back out of `game/`. If Vite reports a cycle, note it and stop — do not paper over it; the fix is a design decision (likely moving `defaultBandFor`'s `mapLevelRange` call inline).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/NodeMap.jsx src/game/safariBake.js
git commit -m "feat(balance): apply admin level bands and row offsets at generation"
```

---

### Task 6: Trainer Levels dashboard panel

**Files:**
- Modify: `src/lib/mapLevelBalance.js` — add `derivedRowRange` + `rowPositionWeights`
- Modify: `src/components/BalanceDashboard.jsx` — add `TrainerLevelsPanel` at module scope (after `GlobalStarterBoostPanel`, ~line 263), render it in the `difficulty` tab body (~line 499)
- Test: `src/lib/mapLevelBalance.test.js` (extend)

**Interfaces:**
- Consumes: `getMapLevelBand`, `defaultBandFor`, `getRowOffset`, `saveMapLevelBand`, `saveRowOffset`, `isCommittableLevel`, `OFFSET_MIN`, `OFFSET_MAX`, `LEVEL_MIN`, `LEVEL_MAX` (Task 4); `regionNames` (already imported in the dashboard); `BALANCE` (`src/game/balance.js`, imported by the lib module).
- Produces:
  - `derivedRowRange(band: [number, number], positionWeight: number, offset?: number): [number, number]`
  - `rowPositionWeights(): number[]` — one weight per node row, 9 today.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

The two helpers live in `src/lib/mapLevelBalance.js`, NOT in the `.jsx` file. Importing them from `BalanceDashboard.jsx` would pull the entire component tree — and every sprite/asset import it transitively reaches — into a plain arithmetic unit test. They are pure functions over `BALANCE`, so the lib module is their natural home.

Append to the existing `src/lib/mapLevelBalance.test.js` (extend the existing destructured import to include `derivedRowRange` and `rowPositionWeights`):

```js

// The cell shows the TRUE reachable range including clamps, not a naive
// interpolation between band endpoints — see the spec's "Derived cell math".
test('derivedRowRange clamps the low end for early rows', () => {
  // randOffset is 0.05, so at positionWeight 0 the low end's t clamps to 0
  // and the cell floors at the band minimum.
  const [low, high] = derivedRowRange([10, 50], 0, 0)
  expect(low).toBe(10)
  expect(high).toBeGreaterThan(10)
})

test('derivedRowRange widens by the offset on both ends', () => {
  const [lowA, highA] = derivedRowRange([10, 50], 0.5, 0)
  const [lowB, highB] = derivedRowRange([10, 50], 0.5, 3)
  expect(lowB).toBe(Math.max(1, lowA - 3))
  expect(highB).toBe(highA + 3)
})

test('derivedRowRange never leaves [1, 100]', () => {
  const [low] = derivedRowRange([1, 5], 0, 20)
  const [, high] = derivedRowRange([95, 100], 1, 20)
  expect(low).toBeGreaterThanOrEqual(1)
  expect(high).toBeLessThanOrEqual(100)
})

test('derivedRowRange rises down the map', () => {
  const early = derivedRowRange([10, 50], 0, 0)
  const late = derivedRowRange([10, 50], 1, 0)
  expect(late[1]).toBeGreaterThan(early[1])
})

test('rowPositionWeights returns one weight per row, ascending', () => {
  const weights = rowPositionWeights()
  // rowWidths [1,2,3,4,3,4,3] + pokecenter + boss = 9 rows.
  expect(weights).toHaveLength(9)
  for (let i = 1; i < weights.length; i++) {
    expect(weights[i]).toBeGreaterThan(weights[i - 1])
  }
  expect(weights[0]).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mapLevelBalance.test.js`
Expected: FAIL — "derivedRowRange is not a function" / no such export.

- [ ] **Step 3: Add the exported helpers**

Add to `src/lib/mapLevelBalance.js`, and add `import { BALANCE } from '../game/balance'` to its imports:

```js
// Position weight of each node ROW, matching what generation computes per NODE
// (node.id / totalNodes). A row spans a small range of weights since its nodes
// have consecutive ids; the row's FIRST node id is used, so later nodes in a
// wide row skew fractionally higher than the cell displays. Accepted — the
// cell is a balancing reference, not a per-node oracle.
export function rowPositionWeights() {
  const widths = [...BALANCE.map.rowWidths, 2, 1] // + pokecenter row + boss row
  const total = widths.reduce((n, w) => n + w, 0)
  const weights = []
  let firstId = 0
  for (const width of widths) {
    weights.push(firstId / total)
    firstId += width
  }
  return weights
}

// The level range a row can actually produce: pickLevel's formula evaluated at
// both extremes of its random term, then widened by the row's jitter offset
// and clamped to [1, 100].
//
// This deliberately reports the TRUE reachable range INCLUDING clamps rather
// than a naive interpolation. Because randOffset is 0.05, tLow clamps to 0 for
// early rows, so several early rows on a map legitimately show the same floor
// (the band minimum). That is what generation does — not a display bug, and
// not to be "corrected" later.
export function derivedRowRange([min, max], positionWeight, offset = 0) {
  const { posFactor, randSpan, randOffset } = BALANCE.trainers.level
  const clamp01 = t => Math.max(0, Math.min(1, t))
  const tLow = clamp01(positionWeight * posFactor - randOffset)
  const tHigh = clamp01(positionWeight * posFactor + randSpan - randOffset)
  const span = max - min
  const low = Math.round(min + span * tLow) - offset
  const high = Math.round(min + span * tHigh) + offset
  return [Math.max(1, low), Math.min(100, high)]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mapLevelBalance.test.js`
Expected: PASS — 12 tests (7 from Task 4, 5 new).

- [ ] **Step 5: Build the panel component**

Add at module scope, after `GlobalStarterBoostPanel`:

```js
// Enemy level pacing per map. Two knobs, deliberately separated:
//   HEADER  — each region's [min, max] band for the selected map. These are
//             the numbers being tuned.
//   OFFSET  — a per-ROW jitter magnitude, universal across regions (hence one
//             column, not one per region).
// The table BODY is read-only: a row's level range is derived from the band
// and the row's position down the map, not authored. Mixing inputs and
// derived cells in one grid made it unclear which numbers were live, so the
// editable band sits above the table.
function TrainerLevelsPanel({ theme, regions }) {
  const { textColor, mutedColor, panelBorder, innerBg } = theme
  const [mapIndex, setMapIndex] = useState(0)
  const weights = useMemo(() => rowPositionWeights(), [])

  // Band drafts keyed by region so switching maps re-reads rather than
  // syncing through an effect — same approach as the damage sliders above.
  const [bandDrafts, setBandDrafts] = useState({})   // 'Region:map' -> {min, max}
  const [offsetDrafts, setOffsetDrafts] = useState({}) // 'map:row' -> string
  const [status, setStatus] = useState({})           // key -> idle|saving|saved|error

  const bandFor = region =>
    bandDrafts[`${region}:${mapIndex}`] ?? {
      min: String(getMapLevelBand(region, mapIndex)[0]),
      max: String(getMapLevelBand(region, mapIndex)[1]),
    }

  const offsetFor = row =>
    offsetDrafts[`${mapIndex}:${row}`] ?? String(getRowOffset(mapIndex, row))

  async function commitBand(region, next) {
    const key = `${region}:${mapIndex}`
    if (!isCommittableLevel(next.min) || !isCommittableLevel(next.max)) {
      setBandDrafts(prev => ({ ...prev, [key]: undefined }))
      setStatus(prev => ({ ...prev, [key]: 'idle' }))
      return
    }
    setStatus(prev => ({ ...prev, [key]: 'saving' }))
    const { error } = await saveMapLevelBand(region, mapIndex, {
      min: Number(next.min), max: Number(next.max),
    })
    // Drop the draft so the row re-reads the clamped value the cache now holds.
    setBandDrafts(prev => ({ ...prev, [key]: undefined }))
    setStatus(prev => ({ ...prev, [key]: error ? 'error' : 'saved' }))
  }

  async function commitOffset(row, draft) {
    const key = `${mapIndex}:${row}`
    if (!isCommittableLevel(draft)) {
      setOffsetDrafts(prev => ({ ...prev, [key]: undefined }))
      setStatus(prev => ({ ...prev, [key]: 'idle' }))
      return
    }
    setStatus(prev => ({ ...prev, [key]: 'saving' }))
    const { error } = await saveRowOffset(mapIndex, row, Number(draft))
    setOffsetDrafts(prev => ({ ...prev, [key]: undefined }))
    setStatus(prev => ({ ...prev, [key]: error ? 'error' : 'saved' }))
  }

  const cellStyle = {
    fontFamily: 'Upheaval', fontSize: '11px', color: textColor,
    padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap',
  }
  const headStyle = { ...cellStyle, color: mutedColor, fontSize: '10px' }
  const numberInput = {
    fontFamily: 'Upheaval', fontSize: '11px', color: textColor,
    backgroundColor: innerBg, border: panelBorder,
    padding: '3px 4px', width: '52px',
  }
  const statusColor = s =>
    s === 'error' ? '#ef4444' : s === 'saved' ? '#22c55e' : 'transparent'

  // Row labels mirror buildRows' layout: rowWidths, then the Pokécenter fork,
  // then the boss.
  const rowCount = weights.length
  const rowLabel = row => {
    if (row === 0) return 'Row 1 (start)'
    if (row === rowCount - 1) return `Row ${row + 1} (boss)`
    if (row === rowCount - 2) return `Row ${row + 1} (PC/mart)`
    return `Row ${row + 1}`
  }

  return (
    <Panel
      theme={theme}
      title="Trainer Levels"
      subtitle="Per-map level bands, one column per playable region. The band is what you edit; each row's range below is DERIVED from it and the row's position down the map, so early rows sit near the floor and the boss row near the ceiling. The offset is a ± jitter applied to every level rolled on that row (0 = off), shared by all regions. Applies to trainers, grass, and catch offers — note a downward jitter on a catch node can offer an earlier evolution stage. Saved to Supabase and applied for everyone."
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: mutedColor }}>Map</span>
        <select
          value={mapIndex}
          onChange={e => setMapIndex(Number(e.target.value))}
          style={{
            fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
            backgroundColor: innerBg, border: panelBorder, padding: '4px 6px', cursor: 'pointer',
          }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <option key={i} value={i}>Map {i + 1}</option>
          ))}
        </select>
      </div>

      {/* Header strip — the editable bands, one pair per region. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {regions.map(region => {
          const draft = bandFor(region)
          const key = `${region}:${mapIndex}`
          const shipped = defaultBandFor(region, mapIndex)
          return (
            <div key={region} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'Orange Kid', fontSize: '14px', color: textColor,
                width: theme.labelWidth, flexShrink: 0,
              }}>
                {region} band
              </span>
              <input
                type="number" min={LEVEL_MIN} max={LEVEL_MAX} step={1}
                value={draft.min}
                onChange={e => setBandDrafts(prev => ({ ...prev, [key]: { ...draft, min: e.target.value } }))}
                onBlur={() => commitBand(region, draft)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                style={numberInput}
              />
              <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor }}>–</span>
              <input
                type="number" min={LEVEL_MIN} max={LEVEL_MAX} step={1}
                value={draft.max}
                onChange={e => setBandDrafts(prev => ({ ...prev, [key]: { ...draft, max: e.target.value } }))}
                onBlur={() => commitBand(region, draft)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                style={numberInput}
              />
              <span style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: mutedColor }}>
                default {shipped[0]}–{shipped[1]}
              </span>
              <span style={{
                fontFamily: 'Orange Kid', fontSize: '11px', minWidth: '52px',
                color: statusColor(status[key]),
              }}>
                {status[key] === 'saving' ? 'Saving…' : status[key] === 'saved' ? 'Saved' : status[key] === 'error' ? 'Failed' : '·'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Derived table — read-only cells, one editable offset per row. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, textAlign: 'left' }}>Node row</th>
              {regions.map(r => <th key={r} style={headStyle}>{r}</th>)}
              <th style={headStyle}>± offset</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((weight, row) => {
              const offsetKey = `${mapIndex}:${row}`
              const offset = Number(offsetFor(row)) || 0
              return (
                <tr key={row} style={{ borderTop: panelBorder }}>
                  <td style={{ ...cellStyle, textAlign: 'left', color: mutedColor }}>
                    {rowLabel(row)}
                  </td>
                  {regions.map(region => {
                    const [low, high] = derivedRowRange(getMapLevelBand(region, mapIndex), weight, offset)
                    return <td key={region} style={cellStyle}>Lv{low}–{high}</td>
                  })}
                  <td style={cellStyle}>
                    <input
                      type="number" min={OFFSET_MIN} max={OFFSET_MAX} step={1}
                      // Row 0 is the pre-cleared START node (NodeMap seeds
                      // clearedNodes with Set([0])) — nothing ever rolls a
                      // level there, so an offset would be a lie.
                      disabled={row === 0}
                      value={offsetFor(row)}
                      onChange={e => setOffsetDrafts(prev => ({ ...prev, [offsetKey]: e.target.value }))}
                      onBlur={() => commitOffset(row, offsetFor(row))}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      style={{ ...numberInput, width: '46px', opacity: row === 0 ? 0.4 : 1 }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
```

Add the imports at the top of `BalanceDashboard.jsx`:

```js
import {
  getMapLevelBand, defaultBandFor, getRowOffset,
  saveMapLevelBand, saveRowOffset, isCommittableLevel,
  derivedRowRange, rowPositionWeights,
  LEVEL_MIN, LEVEL_MAX, OFFSET_MIN, OFFSET_MAX,
} from '../lib/mapLevelBalance.js'
```

`BalanceDashboard.jsx` no longer needs its own `BALANCE` import for this feature — both helpers read it inside the lib module.

- [ ] **Step 6: Render the panel in the difficulty tab**

In the `dashTab === 'difficulty'` branch, after the existing Difficulty `Panel` closes:

```jsx
        {/* Level pacing — per-map bands + per-row jitter, all playable regions
            side by side so a map can be balanced against its neighbours. */}
        <TrainerLevelsPanel theme={theme} regions={regions} />
```

- [ ] **Step 7: Verify the suite and the build**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 8: Verify in the running app**

Run: `npm run dev`, open the admin balance dashboard, Difficulty tab.

Confirm by eye:
1. The Trainer Levels panel renders with a Map dropdown and 2 region columns (Kanto, Unova).
2. Band inputs show Kanto `1–8` / Unova `3–10` on Map 1, matching the shipped defaults.
3. Row 1's offset input is disabled; rows 2–9 are editable.
4. Derived cells rise down the table — row 9 (boss) shows a higher range than row 2.
5. Editing a band and blurring updates every derived cell in that column.
6. Typing an offset and blurring widens that row's cells in both region columns.

Saving requires an admin account and the Task 3 migration applied. Without either, the panel still renders and reads shipped defaults; a write shows `Failed`. That is the intended degradation, not a bug — but note which of the two you verified.

- [ ] **Step 9: Commit**

```bash
git add src/components/BalanceDashboard.jsx src/lib/mapLevelBalance.js src/lib/mapLevelBalance.test.js
git commit -m "feat(balance): add Trainer Levels panel to the difficulty tab"
```

---

## Deployment note

The panel reads and writes `map_level_balance`, which does not exist until `supabase/map_level_balance.sql` is run in the Supabase SQL editor. Until then every read falls back to the region configs and every write fails with a visible `Failed` status — the game is unaffected either way. Run the migration before expecting saves to stick.
