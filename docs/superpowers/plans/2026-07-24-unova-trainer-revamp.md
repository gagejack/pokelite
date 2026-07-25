# Unova Trainer Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Unova's 22 generic route-trainer classes with 15 type
specialists whose species pools unlock progressively by map.

**Architecture:** Pools stay authored as flat base-form arrays in
`unova.js`. A new `SPECIES_MIN_MAP` table gates which species are eligible on
each map; `NodeMap.jsx` filters the themed pool through it before building the
team. The existing `rollStageForLevel` call already rolls evolution stage by
level, so no stage data is authored. One engine change (a pool filter), the
rest is region data.

**Tech Stack:** Plain ESM JavaScript, React 18, Vite. No test framework — the
project verifies logic with standalone `scripts/verify-*.mjs` harnesses run
under plain `node`. Follow that pattern; do NOT add Vitest or Jest.

## Global Constraints

- **Node scripts cannot import `unova.js` directly** — region configs import
  `.webp` assets, which plain `node` cannot parse (`ERR_UNKNOWN_FILE_EXTENSION`).
  Verification scripts must read pool data by parsing the source with a regex,
  or import only leaf modules that have no asset imports.
- **Species id range:** Unova dex is 494–649 inclusive. Starters (495–503) and
  legendaries/mythicals (638–649) are excluded from every trainer pool.
- **Pools list base forms only.** Never author an evolved form; the engine
  rolls stages. Authoring `537` (Seismitoad) instead of `535` (Tympole) is a
  bug.
- **`SPECIES_MIN_MAP` values are 1-based map numbers** (1–8), while
  `mapIndex` in code is 0-based. The filter compares
  `SPECIES_MIN_MAP[id] <= mapIndex + 1`.
- **Sprite keys must match exactly** between `TRAINER_SPRITES`,
  `TRAINER_FULL_SPRITES`, `TRAINER_TYPE_POOLS`, and `TRAINER_POOLS`. A
  mismatch silently produces a trainer with no sprite.
- **Do not modify Kanto.** It shares `NodeMap.jsx`; the pool filter must be a
  no-op for any region without `speciesMinMap`.
- Commit after every task.

---

### Task 1: Add the `speciesMinMap` pool filter to NodeMap

Engine change first, so later data tasks have something to feed. The filter is
a no-op when a region omits `speciesMinMap`, keeping Kanto byte-identical.

**Files:**
- Create: `src/game/trainerPools.js`
- Modify: `src/components/NodeMap.jsx:551-568` (the `isTrainer` branch)
- Test: `scripts/verify-trainer-pools.mjs`

**Interfaces:**
- Produces: `filterPoolByMap(pool, speciesMinMap, mapIndex)` →
  `number[]`. `pool` is an array of species ids, `speciesMinMap` is
  `{ [speciesId: number]: number }` (1-based map) or `undefined`, `mapIndex`
  is 0-based. Returns every id whose unlock map is `<= mapIndex + 1`. When
  `speciesMinMap` is falsy, returns `pool` unchanged. When the filter would
  return empty but `pool` is non-empty, returns `pool` unchanged (fail-open,
  so a mis-authored table can never produce a trainer with no Pokémon).

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-trainer-pools.mjs`:

```javascript
// Node harness for src/game/trainerPools.js — map-gated pool filtering.
import { filterPoolByMap } from '../src/game/trainerPools.js'

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

const POOL = [515, 535, 550, 592]
const MIN = { 515: 1, 535: 1, 550: 3, 592: 6 }

// mapIndex 0 == map 1: only the two unlocked at map 1.
check('map 1 gates to unlocked only', eq(filterPoolByMap(POOL, MIN, 0), [515, 535]))
// mapIndex 2 == map 3: Basculin joins.
check('map 3 admits basculin', eq(filterPoolByMap(POOL, MIN, 2), [515, 535, 550]))
// mapIndex 5 == map 6: everything.
check('map 6 admits all', eq(filterPoolByMap(POOL, MIN, 5), [515, 535, 550, 592]))
// No table (Kanto) → unchanged.
check('no minMap returns pool as-is', eq(filterPoolByMap(POOL, undefined, 0), POOL))
check('null minMap returns pool as-is', eq(filterPoolByMap(POOL, null, 0), POOL))
// Species absent from the table are treated as always available.
check('unlisted species always allowed', eq(filterPoolByMap([999], MIN, 0), [999]))
// Fail-open: everything gated out returns the full pool rather than nothing.
check('fail-open when all gated', eq(filterPoolByMap([592], { 592: 8 }, 0), [592]))
// Empty pool stays empty.
check('empty pool stays empty', eq(filterPoolByMap([], MIN, 0), []))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-trainer-pools.mjs`
Expected: FAIL — `Cannot find module '.../src/game/trainerPools.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/game/trainerPools.js`:

```javascript
// Map-gated trainer pool filtering.
//
// A region may declare `speciesMinMap` ({ speciesId: 1-based map }) alongside
// its `trainerTypePools`. A themed pool then only offers the species the run
// has progressed far enough to see, so a Water specialist on map 1 sends out
// Panpour rather than Alomomola.
//
// Regions without the table (Kanto) are unaffected — the pool passes through.

// Filter `pool` (species ids) to those unlocked by `mapIndex` (0-based).
// Species missing from the table are always allowed. If the filter would
// empty a non-empty pool, the pool passes through unchanged: a mis-authored
// table must never produce a trainer with no Pokémon.
export function filterPoolByMap(pool, speciesMinMap, mapIndex) {
  if (!speciesMinMap || pool.length === 0) return pool
  const mapNumber = mapIndex + 1
  const allowed = pool.filter(id => (speciesMinMap[id] ?? 1) <= mapNumber)
  return allowed.length > 0 ? allowed : pool
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/verify-trainer-pools.mjs`
Expected: PASS — all 8 checks ok, `ALL PASS`

- [ ] **Step 5: Wire the filter into NodeMap**

In `src/components/NodeMap.jsx`, add to the import block near line 13:

```javascript
import { filterPoolByMap } from '../game/trainerPools.js'
```

Then in the `isTrainer` branch, replace these exact lines:

```javascript
      const themed = config.trainerTypePools?.[node.trainer]
      const pool = themed?.length
        ? themed
        : config.trainerSpeciesPools?.[Math.min(mapIndex, (config.trainerSpeciesPools?.length ?? 1) - 1)] ?? []
```

with:

```javascript
      // Themed pools are gated by the region's speciesMinMap so a specialist
      // only sends out species the run has reached (no Alomomola on map 1).
      // Regions without the table pass through unchanged.
      const themedAll = config.trainerTypePools?.[node.trainer]
      const themed = themedAll?.length
        ? filterPoolByMap(themedAll, config.speciesMinMap, mapIndex)
        : themedAll
      const pool = themed?.length
        ? themed
        : config.trainerSpeciesPools?.[Math.min(mapIndex, (config.trainerSpeciesPools?.length ?? 1) - 1)] ?? []
```

- [ ] **Step 6: Verify the build passes and Kanto is unaffected**

Run: `npx vite build`
Expected: `✓ built in ...` with no errors. (A pre-existing chunk-size warning
is expected and unrelated.)

Kanto has no `speciesMinMap`, so `filterPoolByMap` returns its pools
unchanged — no behavior change.

- [ ] **Step 7: Commit**

```bash
git add src/game/trainerPools.js scripts/verify-trainer-pools.mjs src/components/NodeMap.jsx
git commit -m "feat(trainers): map-gated themed pool filtering

Regions may declare speciesMinMap to gate themed trainer pools by
progression. Fail-open so a mis-authored table can't empty a pool.
Kanto has no table and is unaffected."
```

---

### Task 2: Copy the borrowed Bug Catcher sprites into Unova

Gen 5 has no Bug Catcher class. Sprites are physically duplicated into Unova's
asset folders so the region config resolves them like any native sprite — no
cross-region lookup code.

**Files:**
- Create: `src/assets/regions/Unova/Trainer Full Sprites/Bug Catcher.webp`
- Create: `src/assets/regions/Unova/Trainers Overworlds/Bug Catcher.webp`

**Interfaces:**
- Produces: two asset files importable from `unova.js` by the same relative
  path style as every other Unova sprite.

- [ ] **Step 1: Copy both files**

```bash
cd /Users/gagejack/Desktop/Speedmon
cp "src/assets/regions/Kanto/Kanto Trainer Sprites/Bug Catcher.webp" \
   "src/assets/regions/Unova/Trainer Full Sprites/Bug Catcher.webp"
cp "src/assets/regions/Kanto/Kanto Trainer Overworlds/Bug Catcher.webp" \
   "src/assets/regions/Unova/Trainers Overworlds/Bug Catcher.webp"
```

- [ ] **Step 2: Verify both files exist and are non-empty**

```bash
ls -l "src/assets/regions/Unova/Trainer Full Sprites/Bug Catcher.webp" \
      "src/assets/regions/Unova/Trainers Overworlds/Bug Catcher.webp"
```

Expected: both listed with a non-zero byte size. The overworld sheet is
96×128 (a 12-frame walk cycle), matching every other Unova overworld sprite,
so the existing renderer crops it without special handling.

Fisher and Baker are already native Unova assets — do NOT copy anything for
them.

- [ ] **Step 3: Commit**

```bash
git add "src/assets/regions/Unova/Trainer Full Sprites/Bug Catcher.webp" \
        "src/assets/regions/Unova/Trainers Overworlds/Bug Catcher.webp"
git commit -m "assets(unova): add borrowed Bug Catcher sprites

Gen 5 has no Bug Catcher class. Copied from Kanto (same 96x128 overworld
sheet format) so unova.js resolves them natively."
```

---

### Task 3: Rewrite the Unova trainer data

The bulk of the change: new sprite imports, new pools, new `SPECIES_MIN_MAP`,
new per-map class placement.

**Files:**
- Modify: `src/game/regions/unova.js` (imports, `TRAINER_SPRITES`,
  `TRAINER_FULL_SPRITES`, `TRAINER_TYPE_POOLS`, `TRAINER_POOLS`, config export)
- Test: `scripts/verify-unova-trainers.mjs`

**Interfaces:**
- Consumes: `filterPoolByMap` from Task 1 (via NodeMap, not imported here);
  the two sprite files from Task 2.
- Produces: `config.speciesMinMap` — `{ [speciesId]: number }` read by
  `NodeMap.jsx`. `config.trainerTypePools` keyed by the 15 class names below.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-unova-trainers.mjs`. It parses `unova.js` as text
because region configs import `.webp` files that plain node cannot load.

```javascript
// Node harness for Unova's trainer data. Parses unova.js as source text —
// the module imports .webp assets, which plain node cannot resolve.
import { readFileSync } from 'fs'
import { filterPoolByMap } from '../src/game/trainerPools.js'

const src = readFileSync(new URL('../src/game/regions/unova.js', import.meta.url), 'utf8')
let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

const block = (name) => {
  const m = new RegExp(`const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src)
  if (!m) throw new Error(`${name} not found`)
  return m[1]
}

// --- Parse TRAINER_TYPE_POOLS ---
const poolsBlock = block('TRAINER_TYPE_POOLS')
const pools = {}
for (const m of poolsBlock.matchAll(/'([^']+)':\s*\[([0-9,\s]*)\]/g)) {
  pools[m[1]] = m[2].split(',').map(s => s.trim()).filter(Boolean).map(Number)
}

// --- Parse SPECIES_MIN_MAP ---
const minBlock = block('SPECIES_MIN_MAP')
const minMap = {}
for (const m of minBlock.matchAll(/(\d+):\s*(\d+)/g)) minMap[Number(m[1])] = Number(m[2])

// --- Parse TRAINER_POOLS (per-map class placement) ---
const tpMatch = /const TRAINER_POOLS = \[([\s\S]*?)\n\]/.exec(src)
const mapRows = tpMatch[1].trim().split('\n')
  .map(r => [...r.matchAll(/'([^']+)'/g)].map(m => m[1]))
  .filter(r => r.length > 0)

const EXPECTED_CLASSES = [
  'Fisher', 'Bug Catcher', 'Baker', 'Youngster', 'Nursery Aide', 'Hiker',
  'Black Belt', 'Cyclist M', 'Cyclist F', 'Depot Agent', 'Pilot',
  'Pokemon Ranger M', 'Pokemon Ranger F', 'Janitor', 'Roughneck',
]
const REMOVED = [
  'Backpacker M', 'Backpacker F', 'Lass', 'Twins', 'Preschooler M',
  'Preschooler F', 'Schoolkid M', 'Schoolkid F', 'Ace Trainer M',
  'Ace Trainer F', 'Veteran M', 'Veteran F', 'Battle Girl', 'Biker',
  'Worker M', 'Worker F',
]

check('all 15 classes have a themed pool',
  EXPECTED_CLASSES.every(c => Array.isArray(pools[c]) && pools[c].length > 0))
check('no extra classes in TRAINER_TYPE_POOLS',
  Object.keys(pools).every(c => EXPECTED_CLASSES.includes(c)))
check('removed classes absent from pools',
  REMOVED.every(c => !(c in pools)))
check('removed classes absent from every map row',
  REMOVED.every(c => !mapRows.some(r => r.includes(c))))
check('8 map rows', mapRows.length === 8)
check('every placed class has a themed pool',
  mapRows.every(r => r.every(c => c in pools)))

// Species id sanity: Unova dex only, no starters, no legendaries.
const allIds = [...new Set(Object.values(pools).flat())]
check('all species in Unova dex range 494-649',
  allIds.every(id => id >= 494 && id <= 649))
check('no starters (495-503)', allIds.every(id => id < 495 || id > 503))
check('no legendaries (638-649)', allIds.every(id => id < 638 || id > 649))

// Every pooled species has an unlock entry.
check('every species has a SPECIES_MIN_MAP entry',
  allIds.every(id => typeof minMap[id] === 'number'))
check('unlock maps are 1..8',
  Object.values(minMap).every(v => v >= 1 && v <= 8))

// Roaming classes appear on every map; fixed classes do not.
const ROAMING = ['Fisher', 'Bug Catcher', 'Baker']
check('roaming classes on all 8 maps',
  ROAMING.every(c => mapRows.every(r => r.includes(c))))

// The real payoff: every class, on every map it is placed, must have at
// least one species available after gating.
let starved = []
mapRows.forEach((row, mapIndex) => {
  row.forEach(cls => {
    const got = filterPoolByMap(pools[cls], minMap, mapIndex)
    if (got.length === 0) starved.push(`${cls}@map${mapIndex + 1}`)
  })
})
check(`no class starved on a map it appears on ${starved.join(', ')}`, starved.length === 0)

// Variety: no map row should be a single class repeated.
check('every map has >= 4 distinct classes',
  mapRows.every(r => new Set(r).size >= 4))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-unova-trainers.mjs`
Expected: FAIL — `SPECIES_MIN_MAP not found` (the block does not exist yet).

- [ ] **Step 3: Replace the sprite imports**

In `src/game/regions/unova.js`, the overworld imports sit near line 44 and the
full-sprite imports near line 100. Add these three imports alongside the
existing ones (keep the established `trainerX` / `fullX` naming):

```javascript
import trainerFisher from '../../assets/regions/Unova/Trainers Overworlds/Fisher.webp'
import trainerBugCatcher from '../../assets/regions/Unova/Trainers Overworlds/Bug Catcher.webp'
import trainerBaker from '../../assets/regions/Unova/Trainers Overworlds/Baker.webp'
```

```javascript
import fullFisher from '../../assets/regions/Unova/Trainer Full Sprites/Fisher.webp'
import fullBugCatcher from '../../assets/regions/Unova/Trainer Full Sprites/Bug Catcher.webp'
import fullBaker from '../../assets/regions/Unova/Trainer Full Sprites/Baker.webp'
```

Delete the now-unused imports for the 16 removed classes (Backpacker M/F,
Lass, Twins, Preschooler M/F, Schoolkid M/F, Ace Trainer M/F, Veteran M/F,
Battle Girl, Biker, Worker M/F) from BOTH import groups. `npx vite build`
fails on an import of a deleted binding, so removing the entries below without
removing these imports is safe but leaves dead code — remove both.

- [ ] **Step 4: Replace TRAINER_SPRITES and TRAINER_FULL_SPRITES**

Replace the whole `const TRAINER_SPRITES = { ... }` object with exactly the 15
kept classes plus the existing boss/gym entries (do NOT touch gym leader or
Elite Four keys — only route-trainer keys change):

```javascript
// --- Trainer overworld sprites ---
const TRAINER_SPRITES = {
  // Roaming type specialists — appear on every map
  'Fisher':           trainerFisher,
  'Bug Catcher':      trainerBugCatcher,
  'Baker':            trainerBaker,
  // Fixed-route specialists
  'Youngster':        trainerYoungster,
  'Nursery Aide':     trainerNurseryAide,
  'Hiker':            trainerHiker,
  'Black Belt':       trainerBlackBelt,
  'Cyclist M':        trainerCyclistM,
  'Cyclist F':        trainerCyclistF,
  'Depot Agent':      trainerDepotAgent,
  'Pilot':            trainerPilot,
  'Pokemon Ranger M': trainerRangerM,
  'Pokemon Ranger F': trainerRangerF,
  'Janitor':          trainerJanitor,
  'Roughneck':        trainerRoughneck,
}
```

If the existing local import identifiers differ (e.g. `trainerRangerM` is
actually named `trainerPokemonRangerM`), keep the existing identifier — only
the object keys and the set of entries are specified here.

Apply the identical key set to `TRAINER_FULL_SPRITES`, using the `full*`
identifiers.

- [ ] **Step 5: Replace TRAINER_TYPE_POOLS**

Replace the whole object with:

```javascript
// --- Themed species pools per trainer class ---
// Every route trainer is a type specialist: the pool is every Unova line
// carrying that type (dual-types included), minus starters and legendaries.
// Base forms only — rollStageForLevel picks the evolution stage by level, so
// one entry covers the whole line (Tympole on map 2, Seismitoad on map 6).
// Availability per map is gated by SPECIES_MIN_MAP below.
const TRAINER_TYPE_POOLS = {
  // Water
  'Fisher':           [515, 535, 550, 564, 580, 592, 594],
  // Bug
  'Bug Catcher':      [540, 543, 557, 588, 595, 616, 632, 636],
  // Fire
  'Baker':            [513, 554, 607, 631, 636],
  // Normal — early-route half (Nursery Aide takes the caretaker half)
  'Youngster':        [504, 506, 519, 627],
  // Normal — caretaker half
  'Nursery Aide':     [531, 572, 585, 626],
  // Ground / Rock
  'Hiker':            [524, 529, 536, 551, 557, 564, 566, 618, 622],
  // Fighting
  'Black Belt':       [532, 538, 539, 559, 619],
  // Electric
  'Cyclist M':        [522, 587, 595, 602, 618],
  'Cyclist F':        [522, 587, 595, 602, 618],
  // Steel
  'Depot Agent':      [530, 589, 597, 599, 624, 632],
  // Flying
  'Pilot':            [519, 527, 561, 566, 580, 587, 627, 629],
  // Grass
  'Pokemon Ranger M': [511, 540, 546, 548, 556, 585, 590, 597],
  'Pokemon Ranger F': [511, 540, 546, 548, 556, 585, 590, 597],
  // Poison
  'Janitor':          [543, 568, 590],
  // Dark
  'Roughneck':        [509, 551, 559, 570, 624, 629, 633],
}
```

- [ ] **Step 6: Add SPECIES_MIN_MAP**

Insert immediately after `TRAINER_TYPE_POOLS`:

```javascript
// First map (1-based) each species may appear on a trainer's team. Seeded from
// CATCH_POOLS (when the line first becomes catchable), then hand-corrected
// earlier where a specialist would otherwise have fewer than two lines on
// early maps — when a trainer should own a species is a different question
// from when the player can catch one.
const SPECIES_MIN_MAP = {
  504: 1, 506: 1, 509: 1, 513: 1, 515: 1, 519: 1, 522: 1, 535: 1,
  540: 1, 543: 1, 551: 1, 559: 1, 570: 1,
  511: 2, 524: 2, 527: 2, 529: 2, 530: 2, 531: 2, 532: 2, 536: 2,
  546: 2, 548: 2, 554: 2, 568: 2, 587: 2, 595: 2, 599: 2,
  539: 3, 550: 3, 556: 3, 557: 3, 561: 3, 590: 3, 597: 3, 602: 3,
  624: 4,
  538: 5, 564: 5, 566: 5, 585: 5, 626: 5,
  572: 6, 580: 6, 592: 6, 594: 6,
  607: 7, 619: 7, 622: 7, 631: 7,
  588: 8, 589: 8, 616: 8, 618: 8, 627: 8, 629: 8, 632: 8, 633: 8, 636: 8,
}
```

- [ ] **Step 7: Replace TRAINER_POOLS (per-map class placement)**

Roaming classes (Fisher, Bug Catcher, Baker) appear on all 8 maps. Fixed
classes are placed to match their Black/White route and city locations.
Depot Agent and Nursery Aide are absent from map 1 by design — their earliest
species unlock at map 2.

```javascript
// Which trainer classes can appear on each map. The three roaming specialists
// (Fisher, Bug Catcher, Baker) are on every map — their species pool changes
// with progression, not their presence. The rest are placed to match their
// Black/White route and city locations.
const TRAINER_POOLS = [
  ['Fisher', 'Bug Catcher', 'Baker', 'Youngster', 'Roughneck', 'Hiker'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Youngster', 'Nursery Aide', 'Pokemon Ranger M', 'Pokemon Ranger F'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Hiker', 'Janitor', 'Black Belt', 'Roughneck'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Cyclist M', 'Cyclist F', 'Depot Agent', 'Roughneck'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Hiker', 'Pokemon Ranger M', 'Pokemon Ranger F', 'Nursery Aide'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Pilot', 'Pokemon Ranger M', 'Pokemon Ranger F', 'Depot Agent'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Black Belt', 'Roughneck', 'Hiker', 'Janitor'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Depot Agent', 'Pilot', 'Roughneck', 'Hiker'],
]
```

- [ ] **Step 8: Export speciesMinMap from the region config**

In the config object (near `trainerTypePools: TRAINER_TYPE_POOLS,` around line
688), add the new line directly beneath it:

```javascript
  trainerTypePools: TRAINER_TYPE_POOLS,
  // Gates themed pools by progression (game/trainerPools.js).
  speciesMinMap: SPECIES_MIN_MAP,
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `node scripts/verify-unova-trainers.mjs`
Expected: PASS — every check ok, `ALL PASS`. In particular
`no class starved on a map it appears on` must pass with an empty list.

- [ ] **Step 10: Verify the build**

Run: `npx vite build`
Expected: `✓ built in ...`. A failure here almost always means a sprite
import identifier was deleted but still referenced, or a `TRAINER_SPRITES` key
has no matching import.

- [ ] **Step 11: Commit**

```bash
git add src/game/regions/unova.js scripts/verify-unova-trainers.mjs
git commit -m "feat(unova): type-specialist route trainers

Replaces 22 generic classes with 15 type specialists. Adds SPECIES_MIN_MAP
so pools unlock by progression; Fisher/Bug Catcher/Baker roam every map
while the rest sit on their BW routes. Removes Backpacker (was on 6/8 maps
with a pool identical to Hiker's) and the untyped Ace Trainer/Veteran."
```

---

### Task 4: Verify no orphaned sprite references remain

Removing 16 classes risks a stale reference elsewhere in the codebase (saved
runs, the balance dashboard, prewarm). This task is verification only — it
produces no new feature code.

**Files:**
- Modify: only if a broken reference is found.
- Test: `scripts/verify-unova-trainers.mjs` (extended)

**Interfaces:**
- Consumes: the finished `unova.js` from Task 3.

- [ ] **Step 1: Grep for references to removed classes**

```bash
cd /Users/gagejack/Desktop/Speedmon
grep -rn "Backpacker\|Ace Trainer\|Veteran\|Battle Girl\|Preschooler\|Schoolkid\|'Twins'\|Worker M\|Worker F" src/ --include=*.js --include=*.jsx
```

Expected: **no results outside `src/game/regions/kanto.js`.** Kanto has its
own unrelated classes and must not be edited. If a hit appears in
`unova.js`, a sprite import or object entry was missed in Task 3 — remove it.

- [ ] **Step 2: Confirm every Unova sprite key resolves to a real asset**

Add this check to the end of `scripts/verify-unova-trainers.mjs`, immediately
before the final `console.log`:

```javascript
// Every TRAINER_SPRITES / TRAINER_FULL_SPRITES key must be a class we kept,
// and every kept class must have both sprites.
const spriteKeys = (name) => {
  const m = new RegExp(`const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src)
  return m ? [...m[1].matchAll(/'([^']+)':/g)].map(x => x[1]) : []
}
const ow = spriteKeys('TRAINER_SPRITES')
const full = spriteKeys('TRAINER_FULL_SPRITES')
check('every class has an overworld sprite',
  EXPECTED_CLASSES.every(c => ow.includes(c)))
check('every class has a full sprite',
  EXPECTED_CLASSES.every(c => full.includes(c)))
check('no removed class kept a sprite entry',
  REMOVED.every(c => !ow.includes(c) && !full.includes(c)))
```

- [ ] **Step 3: Run the extended test**

Run: `node scripts/verify-unova-trainers.mjs`
Expected: PASS including the three new sprite checks.

- [ ] **Step 4: Run every existing verify script for regressions**

```bash
for f in scripts/verify-*.mjs; do echo "--- $f"; node "$f" || echo "FAILED: $f"; done
```

Expected: every script prints `ALL PASS`. These cover seeded-run determinism —
a failure means map generation changed shape, which this work should not do.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-unova-trainers.mjs
git commit -m "test(unova): assert sprite/class parity after trainer revamp"
```

---

### Task 5: Manual play verification

Automated checks cover data shape but not how the region feels. This is the
acceptance gate.

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Play a Unova run and check each item**

Start a Unova run and clear at least maps 1–3, hovering trainer nodes to read
their team previews.

- [ ] Map 1 trainers are Fisher / Bug Catcher / Baker / Youngster / Roughneck /
      Hiker only — no Backpacker, no Ace Trainer.
- [ ] Every trainer node shows a sprite (a missing sprite means a key mismatch).
- [ ] A Fisher on map 1 sends out Panpour or Tympole — never Alomomola or
      Jellicent.
- [ ] A Bug Catcher on map 1 sends out Sewaddle or Venipede — never Durant or
      Larvesta.
- [ ] Teams read as their type: Black Belt is Fighting, Janitor is Poison.

- [ ] **Step 3: Confirm late-map progression**

Use the admin "Skip map" button to reach maps 6–8, then check:

- [ ] Fisher now offers the late lines (Frillish/Jellicent, Alomomola, Swanna).
- [ ] Evolved stages appear — Seismitoad rather than Tympole, Klinklang rather
      than Klink.
- [ ] Map 8 trainers are typed, not generic (the old Ace Trainer/Veteran fell
      through to the shared pool).

- [ ] **Step 4: Confirm Kanto is unchanged**

Start a Kanto run and clear map 1.

- [ ] Kanto trainers are unchanged (Bug Catcher, Lass, Camper, Picnicker…).
- [ ] Kanto trainer teams still match their classes.

Kanto has no `speciesMinMap`, so `filterPoolByMap` returns its pools
untouched. A visible Kanto change means the filter is not failing open.

- [ ] **Step 5: Commit any fixes**

If steps 2–4 surface a problem, fix it, re-run
`node scripts/verify-unova-trainers.mjs`, and commit with a message describing
the specific fix.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Type ownership (15 classes, one per type) | 3 (Step 5) |
| Roster changes: 10 removed, 3 added | 3 (Steps 3–4), 4 (Step 1) |
| Sprite handling (physical duplication) | 2 |
| Placement: roaming vs fixed | 3 (Step 7) |
| Progression: flat pools + global unlock map | 1, 3 (Step 6) |
| Dual-type overlap (intentional) | 3 (Step 5) — shared ids appear in both pools |
| SPECIES_MIN_MAP derivation + 13 hand-corrections | 3 (Step 6) |
| Youngster / Nursery Aide Normal split | 3 (Step 5) |
| Verification criteria 1–3 | 3 (Step 9), 4 (Steps 2–3) |
| Verification criterion 4 (build) | 1 (Step 6), 3 (Step 10) |
| Verification criterion 5 (Kanto regression) | 4 (Step 4), 5 (Step 4) |

**Placeholder scan:** No TBD/TODO. Every code step contains literal code.
Species ids are enumerated, not described.

**Type consistency:** `filterPoolByMap(pool, speciesMinMap, mapIndex)` is
defined in Task 1 and called with that exact signature in Task 1 Step 5,
Task 3's test, and nowhere else. Config key is `speciesMinMap` (camelCase) in
both `unova.js` and `NodeMap.jsx`; the module-level constant is
`SPECIES_MIN_MAP`. Class-name strings match across `TRAINER_TYPE_POOLS`,
`TRAINER_POOLS`, `TRAINER_SPRITES`, and the test's `EXPECTED_CLASSES`.

**Known deviation from the spec:** the spec's class table lists
`Cyclist M/F` and `Pokémon Ranger M/F` as single rows; the implementation
authors them as four separate keys (`Cyclist M`, `Cyclist F`,
`Pokemon Ranger M`, `Pokemon Ranger F`) because sprites are per-key. Pools are
identical within each pair, matching the spec's line counts. Note the config
uses ASCII `Pokemon`, not `Pokémon`, matching the existing sprite keys.
