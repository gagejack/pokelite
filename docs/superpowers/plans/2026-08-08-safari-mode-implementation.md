# Safari Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Safari Mode — a second game mode where grass, Pokéball, and Master Ball nodes display the actual Pokémon they contain, because the species is drawn at map-generation time instead of at click time.

**Architecture:** A `species` field baked onto nodes during map generation is the entire mode. The render layer reacts to that field's presence rather than taking a mode flag, and the click handlers read the baked value instead of drawing fresh. Everything already keyed off node data — reachability, clearing, payouts, rival placement — keeps working untouched.

**Tech Stack:** React 18 + Vite, Vitest (jsdom), Tailwind, Supabase. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-safari-mode-design.md`

## Global Constraints

- **Classic must not change.** Any behavior difference in a non-Safari run is a bug, not a tradeoff. Several tasks assert this explicitly.
- **Never reorder `rng()` calls** on the Classic path. All randomness flows through `src/game/rng.js`. Adding draws to the Safari path is fine; changing the order of existing Classic draws is not.
- **Game rules and data stay out of React components.** Pure logic goes in `src/game/`, per `Agents.md`.
- **Balance knobs live in `src/game/balance.js`** (the `BALANCE` object), never inline.
- **Mode identifiers are the exact strings** `'classic'` and `'safari'`. Player-facing labels are `Classic` and `Safari`.
- **Only Kanto and Unova are playable.** Hoenn and Sinnoh ship `maps: []`. Use `regionNames({ playableOnly: true })` anywhere regions are listed.
- **Tailwind for layout**, but note `NodeMap.jsx` and the menu components use inline `style=` objects throughout — follow the local file's existing convention over the global one.
- Test command: `npm test` (Vitest, `src/**/*.test.{js,jsx}`). Lint: `npm run lint`.

## File Structure

**Created:**
- `src/game/safariBake.js` — the bake pass. Pure: takes rows + config + mapIndex, returns rows with `species` attached. The mode's core logic, isolated so it is testable without React.
- `src/game/safariBake.test.js` — unit tests for the bake.
- `src/components/SafariRegionSelect.jsx` — Safari's region picker. A copy of `RegionSelect.jsx` reading Safari's unlock list.

**Modified:**
- `src/game/pokemon.js` — add `rollStageForLevelSync()` and `cachedSprite()`.
- `src/game/nodeMap.js` — `buildRows()` gains the options bag.
- `src/game/regions/kanto.js`, `src/game/regions/unova.js` — thread `mode`/`config` through `generate()`, run the bake after fixups.
- `src/game/metaProfile.js` — Safari profile fields, `unlockSafariRegion()`, `claimFirstSafariRegion()`.
- `src/game/metaProfile.test.js` — tests for the above.
- `src/lib/metaSave.js` — merge rules for the two new fields.
- `src/components/NodeMap.jsx` — render baked sprites, consume baked species on click, single-Pokémon Pokéball flow.
- `src/components/PokeballNode.jsx` — single-Pokémon variant.
- `src/components/MainMenu.jsx` — Classic / Safari entry.
- `src/App.jsx` — run mode state, persistence, routing.

## Task Ordering

Tasks 1–4 are pure logic with no UI, each independently testable. Task 5 wires generation. Tasks 6–8 are UI. Task 9 is profile/persistence. Task 10 is the end-to-end pass. A reviewer can reject any one without unwinding its neighbors.

---

### Task 1: Synchronous evolution-stage roll

`rollStageForLevel()` is async because it may fetch an evolution chain. Map generation is synchronous and runs inside the synchronous `withRng()`, so the bake needs a sync variant. This is safe because `prewarmCache()` already warms every catch-pool species' full line into `chainCache` before a map renders.

**Files:**
- Modify: `src/game/pokemon.js` (add `rollStageForLevelSync` near `rollStageForLevel`, around line 442)
- Test: `src/game/pokemon.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `rollStageForLevelSync(id: number, level: number, maxSpeciesId?: number) => number` — returns an evolution-stage species id, or `id` unchanged if the line is not in cache. Also exports `_seedChainCacheForTest(id, root)` for tests.

- [ ] **Step 1: Read the existing async implementation**

Read `src/game/pokemon.js` around lines 395–460. Note two things: `resolveEvolutionLine(id, maxSpeciesId, level)` is the async part, and the weighting after it (`weight = stage index + 1`, favoring more-evolved forms) is pure. The sync version reuses that weighting exactly.

Also read `loadEvolutionChain()` (line ~309) to see that `chainCache` is keyed by every species id in the line, so any member resolves without a fetch.

- [ ] **Step 2: Write the failing test**

Add to `src/game/pokemon.test.js`:

```js
import { rollStageForLevelSync, _seedChainCacheForTest } from './pokemon.js'

// A minimal two-stage line: 10 → 11 at level 7. Shape matches slimChain()'s
// output — { id, minLevel, levelUp, evolvesTo }.
const TWO_STAGE_LINE = {
  id: 10,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [{ id: 11, minLevel: 7, levelUp: true, evolvesTo: [] }],
}

test('rollStageForLevelSync returns the id unchanged when the line is not cached', () => {
  // 9999 was never warmed, so there is nothing to roll against.
  expect(rollStageForLevelSync(9999, 50)).toBe(9999)
})

test('rollStageForLevelSync returns the base form when the level is below the evolution', () => {
  _seedChainCacheForTest(10, TWO_STAGE_LINE)
  // Level 5 is under the stage-2 minLevel of 7, so only stage 1 is eligible.
  expect(rollStageForLevelSync(10, 5)).toBe(10)
})

test('rollStageForLevelSync can return the evolved form once the level allows it', () => {
  _seedChainCacheForTest(10, TWO_STAGE_LINE)
  // Both stages are eligible at level 50 and the roll is weighted, so sample
  // repeatedly and assert both forms appear rather than asserting one result.
  const seen = new Set()
  for (let i = 0; i < 200; i++) seen.add(rollStageForLevelSync(10, 50))
  expect(seen.has(10)).toBe(true)
  expect(seen.has(11)).toBe(true)
})

test('rollStageForLevelSync respects the generation ceiling', () => {
  _seedChainCacheForTest(10, TWO_STAGE_LINE)
  // maxSpeciesId 10 drops the stage-2 branch entirely, so only 10 can come back.
  const seen = new Set()
  for (let i = 0; i < 50; i++) seen.add(rollStageForLevelSync(10, 50, 10))
  expect(seen).toEqual(new Set([10]))
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/game/pokemon.test.js`
Expected: FAIL — `rollStageForLevelSync is not a function`.

- [ ] **Step 4: Implement the sync variant**

In `src/game/pokemon.js`, immediately after `rollStageForLevel`, add:

```js
// Synchronous twin of rollStageForLevel, for callers that cannot await —
// specifically Safari's map-generation bake, which runs inside the synchronous
// withRng(). Reads ONLY the already-warmed chainCache: prewarmCache() warms the
// full evolution line of every catch-pool species (via allSpeciesInLine) before
// a map renders, so the data is in memory by the time a bake runs.
//
// On a cache miss this returns `id` unchanged rather than fetching — the same
// fallback the async version uses when resolution fails. A miss means the
// previewed sprite is a base form; the map is still valid, just less varied.
export function rollStageForLevelSync(id, level, maxSpeciesId = Infinity) {
  const root = chainCache.get(id)
  if (!root) return id

  const stages = stagesFromRoot(root, id, level, maxSpeciesId)
  if (!stages || stages.length === 0) return id
  const eligible = stages.filter(s => s.minLevel <= level)
  if (eligible.length === 0) return stages[0].id

  // Same weighting as rollStageForLevel: weight = index + 1, biasing toward
  // the most-evolved eligible stage.
  const total = eligible.reduce((s, _, i) => s + (i + 1), 0)
  let roll = rng() * total
  for (let i = 0; i < eligible.length; i++) {
    roll -= i + 1
    if (roll <= 0) return eligible[i].id
  }
  return eligible[eligible.length - 1].id
}

// Test seam: lets a test populate chainCache without a network round-trip.
// Not used by application code.
export function _seedChainCacheForTest(id, root) {
  chainCache.set(id, root)
}
```

- [ ] **Step 5: Extract the shared stage walk**

`resolveEvolutionLine` currently contains the walk inline. Pull the pure part into a helper both callers use, so the sync and async paths can never diverge.

In `src/game/pokemon.js`, add above `resolveEvolutionLine`:

```js
// The pure stage walk shared by resolveEvolutionLine (async) and
// rollStageForLevelSync. Given a resolved chain root, produce the reachable
// stages for `id` at `level` as [{ id, minLevel }]. Extracted so the two
// callers cannot drift — the only difference between them is how they obtain
// `root` (await a fetch vs. read the warm cache).
function stagesFromRoot(root, id, level, maxSpeciesId) {
  let effectiveId = id
  if (root) {
    const path = levelUpPathTo(root, id)
    if (path) effectiveId = downgradeTarget(path, level)
  }

  const findNode = node => {
    if (node.id === effectiveId) return node
    for (const child of node.evolvesTo ?? []) {
      const hit = findNode(child)
      if (hit) return hit
    }
    return null
  }
  const start = findNode(root) ?? root

  const stages = []
  let node = start
  let cumulativeLevel = 1
  while (node) {
    if (!node.id) break
    stages.push({ id: node.id, minLevel: cumulativeLevel })
    const branches = node.evolvesTo.filter(b => b.levelUp && b.id <= maxSpeciesId)
    if (branches.length === 0) break
    const nextNode = branches[Math.floor(rng() * branches.length)]
    cumulativeLevel = Math.max(cumulativeLevel, nextNode.minLevel)
    node = nextNode
  }
  return stages
}
```

Then replace that same walk inside `resolveEvolutionLine` with a call to `stagesFromRoot(root, pokeId, level, maxSpeciesId)`, keeping its existing `await`-and-error handling around it. Do not change what `resolveEvolutionLine` returns.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS, including every pre-existing `pokemon.test.js` test. The extraction in Step 5 is a refactor — if an existing test now fails, `stagesFromRoot` does not match the original walk. Fix it rather than editing the test.

- [ ] **Step 7: Commit**

```bash
git add src/game/pokemon.js src/game/pokemon.test.js
git commit -m "feat(safari): synchronous evolution-stage roll off the warm cache"
```

---

### Task 2: `cachedSprite` reader

The map renders synchronously, so it needs a sprite URL without awaiting. `baseCache` entries already carry `sprite`; this is the reader beside `cachedType` / `cachedName`.

**Files:**
- Modify: `src/game/pokemon.js` (beside `cachedType`, ~line 170)
- Test: `src/game/pokemon.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `cachedSprite(id: number) => string | null`.

- [ ] **Step 1: Write the failing test**

Add to `src/game/pokemon.test.js`:

```js
import { cachedSprite } from './pokemon.js'

test('cachedSprite returns null for a species that was never warmed', () => {
  expect(cachedSprite(9999)).toBe(null)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/game/pokemon.test.js`
Expected: FAIL — `cachedSprite is not a function`.

- [ ] **Step 3: Implement**

In `src/game/pokemon.js`, directly after `cachedName`:

```js
// Front sprite URL for a prewarmed species, or null if it hasn't been fetched.
// Used by Safari node rendering, which draws a Pokémon on the map itself and
// must stay synchronous — a null here falls back to the Classic node icon.
export function cachedSprite(id) {
  return baseCache.get(id)?.sprite ?? null
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/game/pokemon.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/pokemon.js src/game/pokemon.test.js
git commit -m "feat(safari): cachedSprite reader for synchronous map rendering"
```

---

### Task 3: The bake pass

The heart of the mode. A pure function that walks finished rows and attaches `species` to grass, Pokéball, and Master Ball nodes. It runs **after** region post-processing so a region fixup (Kanto's rival overwrite) cannot discard a baked species or shift `rng()` ordering.

**Files:**
- Create: `src/game/safariBake.js`
- Test: `src/game/safariBake.test.js`

**Interfaces:**
- Consumes: `rollStageForLevelSync(id, level, maxSpeciesId)` from Task 1.
- Produces: `bakeSafariSpecies(rows, { config, mapIndex, maxSpeciesId }) => rows` — mutates and returns the same `rows` array. Node shapes: grass `{ id, level }`, Pokéball `{ id, rarity, level }`, Master Ball `{ id, level }`.

- [ ] **Step 1: Read how the click path draws today**

Read `src/components/NodeMap.jsx`:
- Grass draw, lines 650–658 — uniform `pick()` over `config.catchPools[mapIndex]`, level band is the trainer band **minus 3**, floored at 1.
- Catch offer, `fetchOfferedPokemon` (~line 676) — `config.pickCatchOffer`, level from `config.catchLevelRanges ?? config.mapLevelRanges`, then the stage roll.

The bake must mirror these exactly. Any divergence makes the preview a lie, which is the one thing the mode cannot do.

- [ ] **Step 2: Write the failing tests**

Create `src/game/safariBake.test.js`:

```js
import { test, expect } from 'vitest'
import { bakeSafariSpecies } from './safariBake.js'
import { NODE_TYPES } from './nodeMap.js'
import { pickCatchOffer } from './catch.js'

// Minimal region config — only the fields the bake reads.
const CONFIG = {
  catchPools: [[
    { id: 1, rarity: 'common' },
    { id: 4, rarity: 'common' },
    { id: 7, rarity: 'rare' },
  ]],
  legendaryPools: [[{ id: 144, level: 50 }]],
  mapLevelRanges: [[10, 20]],
  catchLevelRanges: [[12, 18]],
  catchTierBudget: { common: 70, rare: 25, epic: 5, legendary: 0 },
  pickCatchOffer,
  fallbackSpeciesId: 504,
}

const rowsWith = (...types) => [types.map((type, i) => ({ id: i, type }))]

test('bakes species onto grass nodes', () => {
  const rows = rowsWith(NODE_TYPES.GRASS)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  const { species } = rows[0][0]
  expect(species).toBeTruthy()
  expect([1, 4, 7]).toContain(species.id)
  expect(species.level).toBeGreaterThan(0)
})

test('bakes id, rarity and level onto pokeball nodes', () => {
  const rows = rowsWith(NODE_TYPES.POKEBALL)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  const { species } = rows[0][0]
  expect(species).toBeTruthy()
  expect(species.rarity).toBeTruthy()
  expect(species.level).toBeGreaterThan(0)
})

test('bakes the legendary onto a master ball node', () => {
  const rows = rowsWith(NODE_TYPES.MASTER_BALL)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species).toEqual({ id: 144, level: 50 })
})

test('leaves every other node type untouched', () => {
  const rows = rowsWith(
    NODE_TYPES.TRAINER, NODE_TYPES.ITEM, NODE_TYPES.POWER_UPGRADE,
    NODE_TYPES.POKECENTER, NODE_TYPES.POKEMART, NODE_TYPES.BOSS,
    NODE_TYPES.MYSTERY, NODE_TYPES.RIVAL,
  )
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  rows[0].forEach(node => expect(node.species).toBeUndefined())
})

test('de-duplicates species within a row when the pool allows it', () => {
  // Three bakeable nodes against a three-species pool — all distinct.
  const rows = rowsWith(NODE_TYPES.GRASS, NODE_TYPES.GRASS, NODE_TYPES.GRASS)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  const ids = rows[0].map(n => n.species.id)
  expect(new Set(ids).size).toBe(3)
})

test('allows duplicates when a row has more nodes than the pool has species', () => {
  // Five nodes, three species — repeats are unavoidable and must not throw.
  const rows = rowsWith(...Array(5).fill(NODE_TYPES.GRASS))
  expect(() =>
    bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  ).not.toThrow()
  expect(rows[0].every(n => n.species?.id)).toBe(true)
})

test('de-dup is scoped per row, so a species may repeat across rows', () => {
  // A single-species pool: two rows must both bake it, proving the used-set
  // resets per row rather than persisting across the map.
  const onePool = { ...CONFIG, catchPools: [[{ id: 25, rarity: 'common' }]] }
  const rows = [
    [{ id: 0, type: NODE_TYPES.GRASS }],
    [{ id: 1, type: NODE_TYPES.GRASS }],
  ]
  bakeSafariSpecies(rows, { config: onePool, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species.id).toBe(25)
  expect(rows[1][0].species.id).toBe(25)
})

test('falls back to fallbackSpeciesId when the catch pool is empty', () => {
  const emptyPool = { ...CONFIG, catchPools: [[]] }
  const rows = rowsWith(NODE_TYPES.GRASS)
  bakeSafariSpecies(rows, { config: emptyPool, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species.id).toBe(504)
})

test('bakes nothing on a master ball node when the legendary pool is empty', () => {
  const noLegendaries = { ...CONFIG, legendaryPools: [[]] }
  const rows = rowsWith(NODE_TYPES.MASTER_BALL)
  bakeSafariSpecies(rows, { config: noLegendaries, mapIndex: 0, maxSpeciesId: 151 })
  // No species to bake — the node keeps the Classic icon and the existing
  // empty-team guard clears it on click.
  expect(rows[0][0].species).toBeUndefined()
})

test('bakes nothing on a pokeball node when the catch pool is empty', () => {
  const emptyPool = { ...CONFIG, catchPools: [[]] }
  const rows = rowsWith(NODE_TYPES.POKEBALL)
  bakeSafariSpecies(rows, { config: emptyPool, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species).toBeUndefined()
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/game/safariBake.test.js`
Expected: FAIL — cannot resolve `./safariBake.js`.

- [ ] **Step 4: Implement the bake**

Create `src/game/safariBake.js`:

```js
// Safari Mode's map-generation bake (spec: docs/superpowers/specs/
// 2026-08-08-safari-mode-design.md).
//
// In Safari, the map shows the player exactly what each node holds. That is
// possible only because the species is drawn HERE, at generation, rather than
// at click time. NodeMap then renders `node.species` and its click handlers
// consume it instead of drawing again — one draw, one truth.
//
// This runs as a pass over FINISHED rows, after each region's generate() has
// applied its own fixups (Kanto overwrites a node with its rival). Baking
// inside buildRows would draw species for nodes that are then discarded,
// wasting rng() draws and making call order depend on per-region
// post-processing.

import { NODE_TYPES, pick } from './nodeMap.js'
import { mapLevelRange, pickLevel } from './battleTeams.js'
import { rollStageForLevelSync } from './pokemon.js'
import { rng } from './rng.js'

// How many times to redraw when a row already used a species. Best-effort: a
// row with more bakeable nodes than the pool has species MUST still generate,
// so after this many attempts the duplicate is accepted.
const DEDUP_ATTEMPTS = 8

// Grass levels sit this far below the map's trainer band — mirrors the Classic
// grass draw in NodeMap.fetchEnemyTeam.
const GRASS_LEVEL_OFFSET = 3

// Draw one grass species. Mirrors the Classic grass path exactly: uniform pick
// over the catch pool (grass ignores rarity — it is a forced fight, not a
// reward) at the trainer band minus GRASS_LEVEL_OFFSET.
function bakeGrass(config, mapIndex, positionWeight) {
  const pool = config.catchPools?.[mapIndex] ?? []
  const id = pool.length > 0 ? pick(pool).id : (config.fallbackSpeciesId ?? 504)
  const [min, max] = mapLevelRange(config.mapLevelRanges, mapIndex)
  const band = [
    Math.max(1, min - GRASS_LEVEL_OFFSET),
    Math.max(1, max - GRASS_LEVEL_OFFSET),
  ]
  return { id, level: pickLevel(band, positionWeight) }
}

// Draw one catchable species. Mirrors Classic's fetchOfferedPokemon, except it
// draws ONE instead of getActiveExtras().catchOfferCount — Safari has no
// multi-Pokémon offer on any path, which is why Collector's Eye is inert here.
// Levels come from the region's own catch bands so difficulty tuning cannot
// move what the player catches.
function bakePokeball(config, mapIndex, positionWeight, maxSpeciesId) {
  const pool = config.catchPools?.[mapIndex] ?? []
  if (pool.length === 0) return null

  const bands = config.catchLevelRanges ?? config.mapLevelRanges
  const level = pickLevel(mapLevelRange(bands, mapIndex), positionWeight)
  const [chosen] = config.pickCatchOffer(pool, 1, config.catchTierBudget)
  if (!chosen) return null

  // Same stage roll Classic applies to catch offers, in its sync form.
  const id = rollStageForLevelSync(chosen.id, level, maxSpeciesId)
  return { id, rarity: chosen.rarity, level }
}

// Draw one legendary. Returns null on an empty pool: the node then keeps the
// Classic Master Ball icon and NodeMap's existing empty-team guard clears it.
function bakeMasterBall(config, mapIndex) {
  const pool = config.legendaryPools?.[mapIndex] ?? []
  if (pool.length === 0) return null
  const { id, level } = pick(pool)
  return { id, level }
}

// Attach `species` to every bakeable node in `rows`. Mutates and returns rows,
// matching how region generate() functions already treat them.
export function bakeSafariSpecies(rows, { config, mapIndex, maxSpeciesId = Infinity }) {
  // Position weight scales levels down the map, same denominator the Classic
  // click path uses (total node count).
  const totalNodes = rows.reduce((n, row) => n + row.length, 0)

  rows.forEach(row => {
    // De-dup is scoped to the row: rows are what the player compares side by
    // side, and a map-wide set would starve late rows on small pools.
    const usedInRow = new Set()

    row.forEach(node => {
      const positionWeight = totalNodes > 0 ? node.id / totalNodes : 0.5

      let species = null
      for (let attempt = 0; attempt < DEDUP_ATTEMPTS; attempt++) {
        if (node.type === NODE_TYPES.GRASS) {
          species = bakeGrass(config, mapIndex, positionWeight)
        } else if (node.type === NODE_TYPES.POKEBALL) {
          species = bakePokeball(config, mapIndex, positionWeight, maxSpeciesId)
        } else if (node.type === NODE_TYPES.MASTER_BALL) {
          species = bakeMasterBall(config, mapIndex)
        } else {
          return // not a bakeable node type
        }

        // An empty pool yields null — nothing to bake, nothing to retry.
        if (!species) return
        if (!usedInRow.has(species.id)) break
      }

      usedInRow.add(species.id)
      node.species = species
    })
  })

  return rows
}
```

Note: `rng` is imported because `pick()` and `pickLevel()` consume the shared stream; the import documents that this module draws randomness. If ESLint flags it as unused, remove the import — the draws still flow through `rng.js` via those helpers.

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/game/safariBake.test.js`
Expected: PASS, all ten tests.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: clean. Remove the `rng` import if it is reported unused.

- [ ] **Step 7: Commit**

```bash
git add src/game/safariBake.js src/game/safariBake.test.js
git commit -m "feat(safari): map-generation species bake"
```

---

### Task 4: Thread mode through `buildRows`

`buildRows` needs to know the mode and reach the region config. Classic behavior must be byte-identical afterward.

**Files:**
- Modify: `src/game/nodeMap.js:103` (the `buildRows` signature and its tail)
- Test: `src/game/safariBake.test.js` (add a `buildRows` block)

**Interfaces:**
- Consumes: `bakeSafariSpecies(rows, { config, mapIndex, maxSpeciesId })` from Task 3.
- Produces: `buildRows(trainerPool, bossTrainer, mapIndex, options?)` where `options` is `{ mode = 'classic', config = null, maxSpeciesId = Infinity }`. Returns rows, baked when `mode === 'safari'` and `config` is present.

- [ ] **Step 1: Write the failing test**

Append to `src/game/safariBake.test.js`:

```js
import { buildRows, NODE_TYPES as NT } from './nodeMap.js'

const anyNode = rows => rows.flat()

test('buildRows in classic mode bakes nothing', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0)
  expect(anyNode(rows).every(n => n.species === undefined)).toBe(true)
})

test('buildRows in safari mode bakes every bakeable node', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0, {
    mode: 'safari', config: CONFIG, maxSpeciesId: 151,
  })
  const bakeable = anyNode(rows).filter(n =>
    n.type === NT.GRASS || n.type === NT.POKEBALL || n.type === NT.MASTER_BALL
  )
  // The pools in CONFIG are non-empty, so every bakeable node gets a species.
  expect(bakeable.length).toBeGreaterThan(0)
  expect(bakeable.every(n => n.species?.id)).toBe(true)
})

test('buildRows in safari mode leaves non-bakeable nodes clean', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0, {
    mode: 'safari', config: CONFIG, maxSpeciesId: 151,
  })
  const others = anyNode(rows).filter(n =>
    n.type !== NT.GRASS && n.type !== NT.POKEBALL && n.type !== NT.MASTER_BALL
  )
  expect(others.every(n => n.species === undefined)).toBe(true)
})

test('buildRows in safari mode bakes nothing without a config', () => {
  // Defensive: a caller that forgets to pass config must produce a playable
  // Classic-looking map rather than crashing on config.catchPools.
  const rows = buildRows([1, 4, 7], 'Brock', 0, { mode: 'safari' })
  expect(anyNode(rows).every(n => n.species === undefined)).toBe(true)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/game/safariBake.test.js`
Expected: FAIL — the safari cases find no `species` because `buildRows` ignores the fourth argument.

- [ ] **Step 3: Update `buildRows`**

In `src/game/nodeMap.js`, add the import at the top:

```js
import { bakeSafariSpecies } from './safariBake.js'
```

Change the signature at line 103 from:

```js
export function buildRows(trainerPool, bossTrainer, mapIndex = 0) {
```

to:

```js
// `options` carries Safari Mode's needs: the mode itself, the region config
// (the bake reads catch/legendary pools and level bands from it), and the
// generation ceiling. Classic callers omit it entirely and are unaffected.
export function buildRows(trainerPool, bossTrainer, mapIndex = 0, options = {}) {
```

Then replace the final `return rows` (line ~146, after the boss row is pushed) with:

```js
  // Safari: attach each bakeable node's species now that the rows are final.
  // This must stay AFTER every structural fixup above — see safariBake.js.
  // Region post-processing (e.g. Kanto's rival) happens in the region's
  // generate(), which calls bakeSafariSpecies itself after its own fixups.
  const { mode = 'classic', config = null, maxSpeciesId = Infinity } = options
  if (mode === 'safari' && config) {
    bakeSafariSpecies(rows, { config, mapIndex, maxSpeciesId })
  }
  return rows
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/game/safariBake.test.js`
Expected: PASS.

- [ ] **Step 5: Verify Classic did not move**

Run: `npm test`
Expected: PASS. Every existing test must still pass — `buildRows`'s new parameter is optional and its Classic path is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/game/nodeMap.js src/game/safariBake.test.js
git commit -m "feat(safari): thread mode and config through buildRows"
```

---

### Task 5: Region generate() wiring

Kanto applies a rival fixup after `buildRows`, which would clobber a baked node. Kanto therefore bakes itself, after its fixup. Unova has no fixup and can bake inside `buildRows`.

**Files:**
- Modify: `src/game/regions/kanto.js:556-563`
- Modify: `src/game/regions/unova.js:709-712`
- Test: `src/game/safariBake.test.js`

**Interfaces:**
- Consumes: `buildRows(..., options)` from Task 4, `bakeSafariSpecies` from Task 3.
- Produces: `generate(starter, options?) => { region, mapIndex, rows }`, where `options` is `{ mode = 'classic' }`.

- [ ] **Step 1: Write the failing test**

Append to `src/game/safariBake.test.js`:

```js
import { getRegionConfig } from './regionRegistry.js'

test('kanto generate bakes in safari mode and skips the rival node', () => {
  const kanto = getRegionConfig('Kanto')
  // Map index 2 is the map where Kanto overwrites a node with its rival.
  const { rows } = kanto.maps[2].generate({ id: 1 }, { mode: 'safari' })
  const rival = rows.flat().find(n => n.type === 'rival')
  expect(rival).toBeTruthy()
  // The rival replaced whatever was there, so it must carry no baked species.
  expect(rival.species).toBeUndefined()
  // ...and the surviving bakeable nodes still got baked.
  const grass = rows.flat().filter(n => n.type === 'grass')
  expect(grass.every(n => n.species?.id)).toBe(true)
})

test('kanto generate bakes nothing in classic mode', () => {
  const kanto = getRegionConfig('Kanto')
  const { rows } = kanto.maps[0].generate({ id: 1 })
  expect(rows.flat().every(n => n.species === undefined)).toBe(true)
})

test('unova generate bakes in safari mode', () => {
  const unova = getRegionConfig('Unova')
  const { rows } = unova.maps[0].generate({ id: 495 }, { mode: 'safari' })
  const grass = rows.flat().filter(n => n.type === 'grass')
  expect(grass.every(n => n.species?.id)).toBe(true)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/game/safariBake.test.js`
Expected: FAIL — `generate()` ignores its second argument, so nothing is baked.

- [ ] **Step 3: Update Kanto**

In `src/game/regions/kanto.js`, add to the imports:

```js
import { bakeSafariSpecies } from '../safariBake.js'
import { GEN_MAX_ID } from '../pokemon.js'
```

Replace the `generate` at line 556 with:

```js
    generate: (starter, { mode = 'classic' } = {}) => {
      const boss = i === 0 ? (STARTER_BOSS[starter?.id] ?? 'Brock') : MAP_BOSSES[i]
      // NOTE: buildRows is deliberately NOT given the safari options here.
      // Kanto overwrites a node below, and baking before that fixup would
      // waste rng() draws on a node that is discarded. The bake runs after.
      const rows = buildRows(TRAINER_POOLS[i], boss, i)
      if (i === 2) {
        rows[4][1] = { id: rows[4][1].id, type: NODE_TYPES.RIVAL, trainer: 'Blue', rivalTeam: 'blueEarlyGame' }
      }
      if (mode === 'safari') {
        bakeSafariSpecies(rows, {
          config: kantoConfig,
          mapIndex: i,
          maxSpeciesId: GEN_MAX_ID[1],
        })
      }
      return { region: 'Kanto', mapIndex: i, rows }
    },
```

`kantoConfig` is referenced inside its own definition. That is safe because `generate` runs long after the object is constructed, but confirm the config is declared as `export const kantoConfig = {...}` and referenced by that exact name.

- [ ] **Step 4: Update Unova**

In `src/game/regions/unova.js`, add to the imports:

```js
import { GEN_MAX_ID } from '../pokemon.js'
```

Replace the `generate` at line 709 with:

```js
    generate: (starter, { mode = 'classic' } = {}) => {
      const boss = i === 0 ? (STARTER_BOSS[starter?.id] ?? 'Chili') : MAP_BOSSES[i]
      // Unova applies no post-buildRows fixups, so the bake can run inside
      // buildRows via its options bag.
      return {
        region: 'Unova',
        mapIndex: i,
        rows: buildRows(TRAINER_POOLS[i], boss, i, {
          mode,
          config: unovaConfig,
          maxSpeciesId: GEN_MAX_ID[5],
        }),
      }
    },
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, all tests including the three new ones.

- [ ] **Step 6: Commit**

```bash
git add src/game/regions/kanto.js src/game/regions/unova.js src/game/safariBake.test.js
git commit -m "feat(safari): bake species in kanto and unova generate()"
```

---

### Task 6: Profile fields and Safari unlocks

Safari tracks its own unlock list against the shared key wallet, and grants a free first region of the player's choice.

**Files:**
- Modify: `src/game/metaProfile.js` (`createProfile` ~line 44, and new functions after `unlockRegion` ~line 311)
- Modify: `src/lib/metaSave.js:192-211` (`migrateGuestProfile`)
- Test: `src/game/metaProfile.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `createProfile()` now returns `safariUnlockedRegions: []` and `safariFirstRegionClaimed: false`.
  - `claimFirstSafariRegion(profile, regionName) => { ok, profile, reason? }` — free, once.
  - `unlockSafariRegion(profile, regionName) => { ok, profile, reason? }` — costs 1 key from `profile.keys`.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/metaProfile.test.js`:

```js
import { claimFirstSafariRegion, unlockSafariRegion } from './metaProfile.js'

test('a fresh profile has no safari regions and has not claimed its free one', () => {
  const p = createProfile()
  expect(p.safariUnlockedRegions).toEqual([])
  expect(p.safariFirstRegionClaimed).toBe(false)
})

test('claiming the first safari region is free and costs no keys', () => {
  const p = { ...createProfile(), keys: 3 }
  const { ok, profile } = claimFirstSafariRegion(p, 'Unova')
  expect(ok).toBe(true)
  expect(profile.safariUnlockedRegions).toEqual(['Unova'])
  expect(profile.safariFirstRegionClaimed).toBe(true)
  expect(profile.keys).toBe(3)
})

test('the free claim can only be used once', () => {
  const p = claimFirstSafariRegion(createProfile(), 'Kanto').profile
  const { ok, reason } = claimFirstSafariRegion(p, 'Unova')
  expect(ok).toBe(false)
  expect(reason).toBe('Free region already claimed')
})

test('a second safari region costs one key from the shared wallet', () => {
  const first = claimFirstSafariRegion({ ...createProfile(), keys: 2 }, 'Kanto').profile
  const { ok, profile } = unlockSafariRegion(first, 'Unova')
  expect(ok).toBe(true)
  expect(profile.keys).toBe(1)
  expect(profile.safariUnlockedRegions).toEqual(['Kanto', 'Unova'])
})

test('unlocking a safari region with no keys is rejected', () => {
  const p = { ...createProfile(), keys: 0, safariUnlockedRegions: ['Kanto'], safariFirstRegionClaimed: true }
  const { ok, reason } = unlockSafariRegion(p, 'Unova')
  expect(ok).toBe(false)
  expect(reason).toBe('Not enough keys')
})

test('unlocking an already-unlocked safari region is rejected, never double-charged', () => {
  const p = { ...createProfile(), keys: 5, safariUnlockedRegions: ['Kanto'], safariFirstRegionClaimed: true }
  const { ok, profile, reason } = unlockSafariRegion(p, 'Kanto')
  expect(ok).toBe(false)
  expect(reason).toBe('Region already unlocked')
  expect(profile.keys).toBe(5)
})

test('safari unlocks do not leak into classic', () => {
  const p = claimFirstSafariRegion(createProfile(), 'Unova').profile
  // Classic still only has its starting region.
  expect(p.unlockedRegions).toEqual(['Kanto'])
  expect(p.unlockedRegions).not.toContain('Unova')
})

test('classic unlocks do not leak into safari', () => {
  const p = unlockRegion({ ...createProfile(), keys: 1 }, 'Unova').profile
  expect(p.safariUnlockedRegions).toEqual([])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/game/metaProfile.test.js`
Expected: FAIL — `claimFirstSafariRegion is not a function`.

- [ ] **Step 3: Add the profile fields**

In `src/game/metaProfile.js`, inside `createProfile()`'s returned object, after `unlockedRegions`:

```js
    // Safari Mode's unlock list, tracked separately from Classic's: unlocking
    // a region in one mode does not unlock it in the other. Empty on a fresh
    // profile because Safari's FIRST region is free and player-chosen (see
    // claimFirstSafariRegion) rather than forced to Kanto the way Classic is.
    safariUnlockedRegions: [],
    safariFirstRegionClaimed: false,
```

Update the JSDoc block above `createProfile` so the "one exception is `unlockedRegions`" sentence also notes that Safari starts empty by design.

- [ ] **Step 4: Add the unlock functions**

In `src/game/metaProfile.js`, after `unlockRegion`:

```js
/**
 * Claim Safari Mode's one free region. Unlike Classic — which forces a new
 * profile into Kanto because keys come only from wins — Safari lets the player
 * choose which region they start in, at no cost. Once.
 *
 * Same `{ ok, profile, reason? }` contract as unlockRegion: reject rather than
 * silently no-op, and never mutate the input.
 *
 * @param {MetaProfile} profile
 * @param {string} regionName
 * @returns {{ ok: boolean, profile: MetaProfile, reason?: string }}
 */
export function claimFirstSafariRegion(profile, regionName) {
  if (profile.safariFirstRegionClaimed) {
    return { ok: false, profile, reason: 'Free region already claimed' }
  }
  return {
    ok: true,
    profile: {
      ...profile,
      safariUnlockedRegions: [...(profile.safariUnlockedRegions ?? []), regionName],
      safariFirstRegionClaimed: true,
    },
  }
}

/**
 * Spend a key to unlock `regionName` in Safari Mode. The key comes from the
 * SHARED wallet (profile.keys) — Safari and Classic have separate unlock lists
 * but one currency, and Safari wins pay keys on the same terms as Classic wins,
 * so neither mode is a dead end.
 *
 * @param {MetaProfile} profile
 * @param {string} regionName
 * @returns {{ ok: boolean, profile: MetaProfile, reason?: string }}
 */
export function unlockSafariRegion(profile, regionName) {
  const unlocked = profile.safariUnlockedRegions ?? []
  if (unlocked.includes(regionName)) {
    return { ok: false, profile, reason: 'Region already unlocked' }
  }
  if (profile.keys < REGION_UNLOCK_COST) {
    return { ok: false, profile, reason: 'Not enough keys' }
  }
  return {
    ok: true,
    profile: {
      ...profile,
      keys: profile.keys - REGION_UNLOCK_COST,
      safariUnlockedRegions: [...unlocked, regionName],
    },
  }
}
```

- [ ] **Step 5: Write the failing merge test**

`migrateGuestProfile` builds its result from an explicit field list, so unlisted fields are silently dropped on guest→account merge. Add to `src/game/metaProfile.test.js` (or `src/lib/metaSave.test.js` if one exists — check first with `ls src/lib/*.test.js`):

```js
import { migrateGuestProfile } from '../lib/metaSave.js'

test('merging profiles unions safari unlocks from both sides', () => {
  const account = { ...createProfile(), safariUnlockedRegions: ['Kanto'], safariFirstRegionClaimed: true }
  const local = { ...createProfile(), safariUnlockedRegions: ['Unova'], safariFirstRegionClaimed: true }
  const merged = migrateGuestProfile(local, account)
  expect(new Set(merged.safariUnlockedRegions)).toEqual(new Set(['Kanto', 'Unova']))
})

test('merging keeps the free region claimed if EITHER side claimed it', () => {
  const account = { ...createProfile(), safariFirstRegionClaimed: false }
  const local = { ...createProfile(), safariUnlockedRegions: ['Unova'], safariFirstRegionClaimed: true }
  // Without the OR, the merged profile would be handed a second free region.
  expect(migrateGuestProfile(local, account).safariFirstRegionClaimed).toBe(true)
})

test('merging leaves safari fields intact when neither side has any', () => {
  const merged = migrateGuestProfile(createProfile(), createProfile())
  expect(merged.safariUnlockedRegions).toEqual([])
  expect(merged.safariFirstRegionClaimed).toBe(false)
})
```

- [ ] **Step 6: Run to verify the merge tests fail**

Run: `npm test -- src/game/metaProfile.test.js`
Expected: FAIL — merged profile has `undefined` for both Safari fields, because `migrateGuestProfile` never names them.

- [ ] **Step 7: Add the merge rules**

In `src/lib/metaSave.js`, inside `migrateGuestProfile`, add beside the other unions:

```js
  const safariUnlockedRegions = union(accountProfile.safariUnlockedRegions, localProfile.safariUnlockedRegions)
```

and add to the returned object, after `unlockedRegions`:

```js
    safariUnlockedRegions,
    // OR, not "prefer account": if EITHER side already claimed the free
    // region, the merged profile must stay claimed, or the merge silently
    // hands out a second free region.
    safariFirstRegionClaimed: Boolean(
      accountProfile.safariFirstRegionClaimed || localProfile.safariFirstRegionClaimed
    ),
```

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/game/metaProfile.js src/game/metaProfile.test.js src/lib/metaSave.js
git commit -m "feat(safari): separate region unlocks on the shared key wallet"
```

---

### Task 7: Render baked species on the map

Grass gets a red silhouette outline, Master Ball a black silhouette, Pokéball renders plain. Tooltips name the species.

**Files:**
- Modify: `src/components/NodeMap.jsx` — `getIcon` (~line 949), `getNodeLabel` (~line 958), `ICON_SCALE` (~line 301)

**Interfaces:**
- Consumes: `cachedSprite(id)` from Task 2, `cachedType`/`cachedName` (existing), `node.species` from Task 3.
- Produces: no new exports. Visual only.

- [ ] **Step 1: Read the render path**

Read `src/components/NodeMap.jsx` lines 290–320 (`ICON_SCALE` and how icons are sized) and 945–1020 (`getIcon`, `getNodeLabel`). Note that this file styles with inline `style=` objects, not Tailwind — follow that.

- [ ] **Step 2: Add the sprite import**

In the imports at the top of `src/components/NodeMap.jsx`, add `cachedSprite` to the existing `pokemon.js` import (which already brings in `cachedType` and `cachedName`).

- [ ] **Step 3: Render the baked sprite**

In `getIcon`, insert a branch **before** the existing type checks, so a baked node wins over its Classic icon:

```js
  function getIcon(node, isCurrentNode) {
    if (isCurrentNode && character) return character.sprite
    // Safari: a baked node draws its actual Pokémon. A cache miss (species not
    // prewarmed) falls through to the Classic icon — the node stays playable,
    // only the preview is lost.
    if (node.species?.id) {
      const sprite = cachedSprite(node.species.id)
      if (sprite) return sprite
    }
    if (node.type === NODE_TYPES.TRAINER || node.type === NODE_TYPES.BOSS || node.type === NODE_TYPES.RIVAL) {
      return config.trainerSprites[node.trainer] || ITEM_ICONS[NODE_TYPES.POKEBALL]
    }
    if (node.type === NODE_TYPES.GRASS) return mapConfig.grassIcon
    return ITEM_ICONS[node.type]
  }
```

- [ ] **Step 4: Add the visual treatments**

Add near `ICON_SCALE` (~line 301):

```js
  // Safari node treatments. Grass is a WILD Pokémon — you fight it and do not
  // keep it — so it gets a red outline; a Pokéball's Pokémon joins your team
  // and renders plain. Four stacked drop-shadows trace the sprite's actual
  // silhouette, which survives small sizes and busy map backgrounds far better
  // than a blur would.
  const SAFARI_WILD_OUTLINE = [
    'drop-shadow(1.5px 0 0 #e23b3b)',
    'drop-shadow(-1.5px 0 0 #e23b3b)',
    'drop-shadow(0 1.5px 0 #e23b3b)',
    'drop-shadow(0 -1.5px 0 #e23b3b)',
  ].join(' ')

  // Master Ball keeps its legendary hidden until clicked: brightness(0)
  // collapses the sprite to solid black while preserving shape and alpha.
  const SAFARI_SILHOUETTE = 'brightness(0)'

  function safariFilter(node) {
    if (!node.species?.id) return undefined
    if (node.type === NODE_TYPES.GRASS) return SAFARI_WILD_OUTLINE
    if (node.type === NODE_TYPES.MASTER_BALL) return SAFARI_SILHOUETTE
    return undefined
  }
```

Find where the node icon `<img>` is rendered (search for `ICON_SCALE` usage) and add `filter: safariFilter(node)` to its inline `style` object. Also give baked nodes their own scale entry, since Pokémon sprites carry different padding than the grass icon:

```js
  const SAFARI_ICON_SCALE = 0.85
```

Use it in place of the `ICON_SCALE` lookup when `node.species?.id` is set.

- [ ] **Step 5: Name the species in tooltips**

In `getNodeLabel`, add before the existing `switch`:

```js
    // Safari: a baked node names what it holds. Master Ball is the deliberate
    // exception — naming it would defeat the silhouette.
    if (node.species?.id && node.type !== NODE_TYPES.MASTER_BALL) {
      const nodePayout = getEffectiveBalance().economy.payouts.node
      const name = cachedName(node.species.id) ?? '???'
      const row = { type: cachedType(node.species.id), name, level: node.species.level }
      if (node.type === NODE_TYPES.GRASS) {
        return { title: 'Tall Grass', sub: [row, `+1 LVL · $${BALANCE.economy.payouts.grass}`] }
      }
      if (node.type === NODE_TYPES.POKEBALL) {
        return { title: 'Wild Pokémon', sub: [row, `Catch it · $${nodePayout}`] }
      }
    }
```

The `{ type, name, level }` row shape matches the boss and rival tooltips, so it renders a colored type chip with no new tooltip code.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`

There is no Safari entry point yet (Task 8), so force one temporarily: in `NodeMap.jsx`'s `useMemo` that calls `mapConfig.generate(starter)`, pass `{ mode: 'safari' }`. Start a Kanto run and confirm: grass nodes show Pokémon with a red outline, Pokéball nodes show Pokémon with no outline, any Master Ball shows a black silhouette, tooltips name the species with a type chip, and the Master Ball tooltip still reads `???`.

**Revert the temporary change before committing.**

- [ ] **Step 7: Run tests and lint**

Run: `npm test && npm run lint`
Expected: PASS and clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/NodeMap.jsx
git commit -m "feat(safari): render baked species with wild outline and legendary silhouette"
```

---

### Task 8: Single-Pokémon Pokéball flow

In Safari a Pokéball holds one Pokémon, taken on click. The modal only appears when the roster is full and a swap decision is needed.

**Files:**
- Modify: `src/components/NodeMap.jsx` — `fetchOfferedPokemon` (~line 676), the click dispatch (~line 777), `resolveMysteryNode` (~line 719)
- Modify: `src/components/PokeballNode.jsx` — single-Pokémon variant

**Interfaces:**
- Consumes: `node.species` from Task 3, `getActiveExtras().partySize` (existing).
- Produces: `PokeballNode` accepts `single: boolean`. When true it renders one Pokémon and skips the choose-one-of-three grid.

- [ ] **Step 1: Read the current flow**

Read `src/components/NodeMap.jsx` lines 676–740 (`fetchOfferedPokemon`, `resolveMysteryNode`) and 777–800 (the Pokéball dispatch). Read `src/components/PokeballNode.jsx` in full — it is 207 lines and handles the offer grid, the roster-full swap panel, and the Mystery reroll.

- [ ] **Step 2: Build the offer from the baked species**

In `fetchOfferedPokemon`, add at the top:

```js
  async function fetchOfferedPokemon(node) {
    // Safari: the species was drawn at map generation and is already on screen.
    // Rebuild that exact Pokémon rather than drawing again — one draw, one
    // truth. Returns a single-element array so every downstream consumer
    // (the modal, the swap panel, onPick) keeps its existing shape.
    if (node.species?.id) {
      const base = await fetchPokemonBase(node.species.id)
      const instance = buildPokemonInstance(base, node.species.level)
      return [{ ...instance, rarity: node.species.rarity }]
    }
    const pool = config.catchPools?.[mapIndex] ?? []
    // ...existing body unchanged...
```

- [ ] **Step 3: Take the Pokémon directly when the roster has room**

In the click dispatch, replace the `else if (node.type === NODE_TYPES.POKEBALL)` branch:

```js
    } else if (node.type === NODE_TYPES.POKEBALL) {
      setLoadingNode(node.id)
      const offered = await fetchOfferedPokemon(node)
      setLoadingNode(null)
      onEarnCash?.(getEffectiveBalance().economy.payouts.node)
      if (offered.length === 0) {
        setClearedNodes(prev => new Set([...prev, node.id]))
        setCurrentNode(node.id)
        return
      }
      // Safari with room to spare: there is no choice to present — the player
      // already made it by walking here — so take the Pokémon and move on. A
      // full roster still needs the swap panel, and a Mystery-resolved node
      // still needs its reroll button, so both keep the modal.
      const isSafariSingle = !!node.species?.id
      const hasRoom = roster.length < getActiveExtras().partySize
      if (isSafariSingle && hasRoom && !node.fromMystery) {
        handlePokeballPick({ pokemon: offered[0], swapIndex: null }, node)
        return
      }
      setPendingPokeball({ node, offered })
    }
```

`handlePokeballPick` at line 913 currently reads its node from `pendingPokeball` state, which is null on the direct-take path. Refactor it to take the node explicitly, so both callers share one code path rather than duplicating the catch/clear/record logic:

```js
  // Takes `node` explicitly rather than reading pendingPokeball, because
  // Safari's direct-take path never opens the modal — there is no pending
  // state to read. The modal caller passes pendingPokeball.node.
  function handlePokeballPick({ pokemon, swapIndex }, node) {
    if (!node) return
    if (swapIndex !== null) {
      // swapIntoRoster, not a bare replace: the outgoing Pokémon's held item
      // transfers to the newcomer (and its move is rebuilt if that item is a
      // Polarity Band, whose retype depends on the holder's species).
      setRoster(prev => swapIntoRoster(prev, swapIndex, pokemon))
    } else {
      setRoster(prev => prev.length < getActiveExtras().partySize ? [...prev, pokemon] : prev)
    }
    onPokemonCaught?.(pokemon.pokeId, !!pokemon.shiny)
    onCatchRecorded?.(pokemon)
    setClearedNodes(prev => new Set([...prev, node.id]))
    setCurrentNode(node.id)
    setPendingPokeball(null)
  }
```

Then update the modal's call site at line 1561 to pass the node:

```js
          onPick={pick => handlePokeballPick(pick, pendingPokeball.node)}
```

- [ ] **Step 4: Keep the reroll on Mystery-resolved Pokéballs**

A Mystery node bakes nothing, so a Mystery that resolves into a Pokéball has no `node.species`. In Safari it must still draw **one** species, not three, and must keep its reroll — the reroll is the Mystery node's entire bonus.

In `resolveMysteryNode`, thread the mode through so the resolved node knows to draw singly. Add a `safariSingle: true` flag to the resolved node when the run is in Safari and the resolved type is `POKEBALL`, then in `fetchOfferedPokemon` treat `node.safariSingle` as "draw one":

```js
    // Safari draws ONE species on every path, including a Mystery that
    // resolved into a Pokéball — the mode has no multi-Pokémon offer anywhere,
    // which is why Collector's Eye is inert here.
    const offerCount = (node.safariSingle || mode === 'safari')
      ? 1
      : getActiveExtras().catchOfferCount
    const chosen = config.pickCatchOffer(pool, offerCount, config.catchTierBudget)
```

`mode` reaches `NodeMap` as a prop in Task 9. Until then, add the prop with a `'classic'` default so this task is testable on its own.

- [ ] **Step 5: Add the single-Pokémon variant to `PokeballNode`**

In `src/components/PokeballNode.jsx`, add `single = false` to the props, and use it for the header and the grid:

```js
export default function PokeballNode({ offered, roster, onPick, onClose, caughtSet, isLegendary = false, onReroll = null, rerolling = false, single = false }) {
```

Change the header copy so the single case does not tell the player to choose:

```js
          <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>
            Wild Pokémon Found!
          </span>
          <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor }}>
            {single
              ? (isFull ? 'Your team is full — swap someone out?' : 'Add it to your team')
              : 'Choose one to add to your team'}
          </span>
```

The existing offer grid already renders whatever `offered` contains, so a one-element array renders one card with no further change. Leave `handleSelectPokemon` alone: with a full roster it opens the swap panel, which is exactly what the single case needs.

- [ ] **Step 6: Pass `single` at the call site**

In `NodeMap.jsx`, where `PokeballNode` is rendered (~line 1559), add:

```js
          single={!!pendingPokeball.node.species?.id || !!pendingPokeball.node.safariSingle}
```

Leave the existing `onReroll={pendingPokeball.node.fromMystery ? rerollPokeballOffer : null}` untouched — that is what keeps the Mystery bonus alive.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`

Temporarily force Safari again as in Task 7. Confirm: clicking a Pokéball node with roster space adds that exact Pokémon with no modal and pays the node cash; clicking one with a full roster opens the swap panel showing a single Pokémon; a Mystery node that resolves into a Pokéball shows one Pokémon with a working reroll button.

**Revert the temporary change before committing.**

- [ ] **Step 8: Run tests and lint**

Run: `npm test && npm run lint`
Expected: PASS and clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/NodeMap.jsx src/components/PokeballNode.jsx
git commit -m "feat(safari): single-Pokemon pokeball flow"
```

---

### Task 9: Mode entry, routing, and run persistence

Two Main Menu buttons, a Safari region picker, and `mode` carried on the run so a resumed Safari run stays Safari.

**Files:**
- Create: `src/components/SafariRegionSelect.jsx`
- Modify: `src/components/MainMenu.jsx` (`buttonDefs`, ~line 105)
- Modify: `src/App.jsx` (run state, `buildRunSnapshot` ~line 351, resume ~line 453)
- Modify: `src/components/NodeMap.jsx` (accept and use the `mode` prop)

**Interfaces:**
- Consumes: `claimFirstSafariRegion`, `unlockSafariRegion` from Task 6; `generate(starter, { mode })` from Task 5.
- Produces: `SafariRegionSelect` with the same props as `RegionSelect` plus Safari's unlock semantics. `runMode: 'classic' | 'safari'` on run snapshots.

- [ ] **Step 1: Create the Safari region picker**

Copy `src/components/RegionSelect.jsx` to `src/components/SafariRegionSelect.jsx`, then change three things:

1. Rename the default export to `SafariRegionSelect`.
2. Read Safari's list — replace `const unlockedRegions = profile?.unlockedRegions ?? []` with:

```js
  // Safari tracks its own unlocks: a region unlocked in Classic is still
  // locked here, and vice versa.
  const unlockedRegions = profile?.safariUnlockedRegions ?? []
  const firstRegionClaimed = profile?.safariFirstRegionClaimed ?? false
```

3. Make the first region free. Find where a locked card decides whether it is clickable (the `unlocked` / `clickable` logic in `RegionCard`, ~line 25) and pass `firstRegionClaimed` down, treating any region as clickable when it is false:

```js
    // Safari's first region is free and player-chosen — unlike Classic, which
    // forces a fresh profile into Kanto. Every region after costs a key.
    const unlocked = unlockedRegions.includes(region.name)
    const isFreeChoice = !firstRegionClaimed
    const clickable = unlocked || isFreeChoice || keys >= 1
```

Also update the cost label so a free-choice card shows "Free" rather than a key price. Use `regionNames({ playableOnly: true })` for the region list — Hoenn and Sinnoh have `maps: []` and must not be selectable.

- [ ] **Step 2: Add the Main Menu buttons**

In `src/components/MainMenu.jsx`, find `buttonDefs` (~line 105). Replace the single Play entry with two, keeping the existing def shape (read the neighbours to match it exactly):

```js
    { id: 'play',   label: 'Classic', onClick: () => startRun('classic') },
    { id: 'safari', label: 'Safari',  onClick: () => startRun('safari') },
```

Update `startRun` (~line 101) to take the mode:

```js
  const startRun = (mode = 'classic') =>
    (isDesktop ? changeMode(mode === 'safari' ? 'safariRegion' : 'region') : onPlay(mode))
```

Desktop swaps the button column in place for region selection; add a `safariRegion` case beside the existing `region` case that renders Safari's region bars from `safariUnlockedRegions`.

- [ ] **Step 3: Track the mode in App**

In `src/App.jsx`, add state beside the other run state:

```js
  // Which mode the active run is in. Persisted on the snapshot so a resumed
  // Safari run rebuilds as Safari — a run that came back as Classic would
  // regenerate its maps without baked species.
  const [gameMode, setGameMode] = useState('classic')
```

Set it when a run starts, and route region selection to `SafariRegionSelect` when it is `'safari'`.

In `buildRunSnapshot` (~line 351), add `gameMode` to the returned object. In the resume path (~line 453) and the Run It Back restore (~line 524), read it back:

```js
      setGameMode(snapshot.gameMode ?? 'classic')
```

The `?? 'classic'` is what makes legacy saved runs — which have no `gameMode` — resume as Classic.

Note there is an existing `runMode` field (`snapshot.runMode ?? 'normal'`, line ~540) for seeded/daily runs. That is a **different** axis. Do not merge them; name this one `gameMode` throughout.

- [ ] **Step 4: Pass the mode to NodeMap and gate on prewarm**

Pass `mode={gameMode}` to `<NodeMap>`. In `NodeMap.jsx`, accept it (`mode = 'classic'`) and pass it into generation:

```js
      if (initialMapData && initialMapData.mapIndex === mapIndex) return initialMapData
      if (seed != null) return withRng(deriveSeed(seed, mapIndex), () => mapConfig.generate(starter, { mode }))
      return mapConfig.generate(starter, { mode })
```

**Critical ordering requirement — this gate does not exist yet and must be built.**

The bake's stage roll reads `chainCache`, which `prewarmCache()` fills asynchronously. If generation runs first, every stage roll misses and the map silently bakes base forms — no crash, no error, just a quietly wrong map. That makes it the most dangerous failure in the feature: it looks like it works.

`prewarmCache` is currently called **fire-and-forget** from `App.jsx` at four sites (lines 269, 506, 1089, 1120) — `if (config) prewarmCache(config)`, never awaited, no completion signal. `NodeMap` does not call it at all. So there is nothing to await today.

Add a readiness flag in `App.jsx` beside the other run state:

```js
  // Safari's map generation reads the prewarmed evolution cache synchronously,
  // so it must not run until prewarmCache resolves — otherwise every stage
  // roll misses and the map bakes base forms with no visible error. Classic
  // never reads that cache at generation time and does not wait.
  const [prewarmReady, setPrewarmReady] = useState(false)
```

At each of the four `prewarmCache(...)` call sites, replace the fire-and-forget call with:

```js
    setPrewarmReady(false)
    if (config) prewarmCache(config).then(() => setPrewarmReady(true))
    else setPrewarmReady(true)
```

(At lines 269 and 1120 the argument is `getRegionConfig(daily.region)` / `getRegionConfig(region)` rather than a `config` local — adapt the expression, keep the structure.)

Pass it down: `prewarmReady={prewarmReady}` on `<NodeMap>`, accepted as `prewarmReady = false`.

Then gate generation in `NodeMap`'s `useMemo`. Return `null` while Safari is waiting, and add `prewarmReady` to the dependency array so the map builds the moment the cache is warm:

```js
  const mapData = useMemo(
    () => {
      if (initialMapData && initialMapData.mapIndex === mapIndex) return initialMapData
      // Safari waits for the warm cache; Classic never needs it.
      if (mode === 'safari' && !prewarmReady) return null
      if (seed != null) return withRng(deriveSeed(seed, mapIndex), () => mapConfig.generate(starter, { mode }))
      return mapConfig.generate(starter, { mode })
    },
    [mapConfig, prewarmReady] // eslint-disable-line react-hooks/exhaustive-deps
  )
```

Add an early return above the component's JSX so a null map renders the loading state rather than crashing on `mapData.rows`:

```js
  if (!mapData) return <div style={{ padding: '24px', fontFamily: 'Upheaval' }}>Loading map…</div>
```

Match the surrounding file's loading-state styling if one already exists — search for `loadingNode` to see how it renders.

Do not remove the comment explaining the gate. Without it the next reader sees a redundant-looking dependency and simplifies it away, reintroducing a bug with no symptom.

- [ ] **Step 5: Wire the unlock actions**

Where `RegionSelect`'s `onSelectRegion` currently calls `unlockRegion`, route Safari's picker to the Safari equivalents: `claimFirstSafariRegion(profile, name)` when `safariFirstRegionClaimed` is false, `unlockSafariRegion(profile, name)` otherwise. Both return `{ ok, profile, reason }` — handle rejection the same way the Classic path already does (show `reason`, do not enter the region).

- [ ] **Step 6: Verify the full loop in the browser**

Run: `npm run dev`

Walk it end to end:
1. Main Menu shows **Classic** and **Safari**.
2. Safari → region select shows every playable region selectable, first one free.
3. Pick a region, pick a starter, and the map shows Pokémon sprites with red outlines on grass.
4. Home mid-run, then Resume — the run comes back as Safari with the same baked species.
5. Back to Main Menu → Classic → confirm the map looks exactly as it always has.

- [ ] **Step 7: Run tests and lint**

Run: `npm test && npm run lint`
Expected: PASS and clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/SafariRegionSelect.jsx src/components/MainMenu.jsx src/App.jsx src/components/NodeMap.jsx
git commit -m "feat(safari): mode entry, region select, and run persistence"
```

---

### Task 10: End-to-end verification

The mode is built. This task proves it works and that Classic did not move.

**Files:**
- Modify: whatever the checks turn up.

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: a verified feature.

- [ ] **Step 1: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: PASS and clean. Paste the real output into the task notes — do not claim a pass you have not seen.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds.

Note the deliberate import cycle: `nodeMap.js` imports `bakeSafariSpecies` from `safariBake.js`, which imports `NODE_TYPES` and `pick` back from `nodeMap.js`. This is fine — both bindings are read at call time, not during module evaluation, and `battleTeams.js` already imports `pick` from `nodeMap.js` the same way. If the build does warn, break it by moving `NODE_TYPES` and `pick` into a small `nodeTypes.js` and importing from there in all three files.

- [ ] **Step 3: Classic regression pass**

Play a Classic Kanto run through at least two maps. Confirm: generic node icons, the three-Pokémon offer on Pokéball nodes, Collector's Eye still widening that offer to four if owned, Mystery rerolls working, tooltips reading as they always did. Any difference here is a bug.

- [ ] **Step 4: Safari verification pass**

Play a Safari run through at least two maps. Confirm each spec claim:
- Grass nodes show a Pokémon with a red outline; the battle is against **that exact species**.
- Pokéball nodes show a Pokémon with no outline; clicking with room adds that exact Pokémon.
- A full roster opens the swap panel with one Pokémon shown.
- Master Ball nodes show a black silhouette and reveal on click.
- Mystery nodes still show `?`, and one resolving into a Pokéball offers a single Pokémon with a working reroll.
- No row shows the same species twice.
- Item, TM, Pokécenter, Pokémart, trainer, rival, and boss nodes are unchanged.

- [ ] **Step 5: Unlock and merge verification**

- A fresh profile entering Safari gets a free region of its choice.
- A second Safari region costs a key from the shared wallet.
- A Safari win pays a key (check the run-end screen).
- Regions unlocked in Safari are still locked in Classic.
- Sign in as a guest with Safari progress and confirm the merge keeps both unlock lists and does not re-grant the free region.

- [ ] **Step 6: Run It Back verification**

With Run It Back owned, lose a Safari map and replay it. The replayed map must be identical, baked species included — `buildRunSnapshot` stores `mapData` and `NodeMap` reuses `initialMapData`, so a redraw here means the snapshot path broke.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix(safari): end-to-end verification fixes"
```

---

## Deferred (explicitly out of scope)

Per the spec: Safari-specific balance tuning, per-mode leaderboards, a Safari daily challenge, and any new region. Also deferred: Hoenn and Sinnoh remain `maps: []` in both modes.

Two known-and-accepted behaviors, recorded so a future reader does not read them as bugs:

- **Collector's Eye is inert in Safari.** It stays purchasable with no shop label. Deliberate — the spec rejected greying it out.
- **Run It Back gives full map knowledge in Safari.** The replayed map is identical, so the player knows every species. Shipping as-is; tune later if degenerate.
