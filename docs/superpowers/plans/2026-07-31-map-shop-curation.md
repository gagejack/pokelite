# Map Shop Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn eight identical Pokémart shelves into eight town-specific shops, driven entirely by region config data plus one small change to stock resolution.

**Architecture:** `getShopInventory(config, mapIndex)` already composes `shopGeneric` + `shopPools[mapIndex]`. This plan (1) teaches `toEntry` to accept `{ id, stock }` objects alongside bare string ids, (2) adds twelve price entries so currently-unpriced items become sellable, and (3) rewrites the `shopGeneric` / `shopPools` tables in `kanto.js` and `unova.js`. Everything except step 1 is data.

**Tech Stack:** Plain ES modules, no framework. React only at the consumer (`PokemartNode`), which this plan does not touch. Tests use Node's built-in `node --test` runner — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-31-map-shop-curation-design.md`

## Global Constraints

- **No new items.** Every id used here already exists in `src/game/items.js`. Do not add to `ITEMS`.
- **No new mechanics.** Purchases already route through the existing bag/consumable paths. Do not touch `PokemartNode.jsx`.
- **No income changes.** `BALANCE.economy.payouts` is not modified by any task.
- **No plate changes.** The gym-type mapping and the uniform $300 plate price stand exactly as in `2026-07-29-pokemart-shelf-design.md` §2.
- **`shop.js` stays pure.** No React, no `rng`, no side effects. Same inputs → same output.
- **Stock precedence, exactly:** explicit per-map `stock` > `BALANCE.economy.shopStock[id]` > `1`.
- **Prices are authoritative from the spec's pricing table.** Do not invent or round values.
- **Hoenn and Sinnoh are untouched.** They are stubs (`maps: []`).
- **Lint and build must stay clean:** `npm run lint` and `npm run build`.

---

### Task 1: Per-map stock overrides in `shop.js`

Teaches the shelf resolver to accept `{ id, stock }` pool entries. This is the only logic change in the plan; every later task is data that depends on it.

**Files:**
- Modify: `src/game/shop.js:16-34`
- Create: `src/game/shop.test.js`
- Modify: `package.json:6-12` (add a `test` script)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `getShopInventory(config, mapIndex)` — unchanged signature, returns `Array<{ item, price, stock }>`. Pool entries may now be either a `string` id or an object `{ id: string, stock?: number }`. Tasks 3 and 4 author pools in both forms.

- [ ] **Step 1: Add the test script to `package.json`**

In the `"scripts"` block, add a `test` entry beside the existing ones. Bare
`node --test` uses Node's own recursive discovery — a `src/**/*.test.js` glob
was verified to silently MISS test files more than one directory deep, because
the shell expands it before Node sees it.

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dex": "node scripts/buildPokedex.mjs",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing test**

Create `src/game/shop.test.js`. These four cases cover the whole contract: the two entry forms, the precedence rule, and the two ways an entry gets dropped.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { getShopInventory } from './shop.js'

// max_heal is priced ($150) and has a global stock entry (2) in
// BALANCE.economy.shopStock. plate_rock is priced ($300) with no global stock,
// so it falls through to the default of 1.

test('string entry uses the global stock table', () => {
  const shelf = getShopInventory({ shopGeneric: ['max_heal'], shopPools: [[]] }, 0)
  assert.equal(shelf.length, 1)
  assert.equal(shelf[0].item.id, 'max_heal')
  assert.equal(shelf[0].stock, 2)
})

test('string entry with no global stock defaults to 1', () => {
  const shelf = getShopInventory({ shopGeneric: [], shopPools: [['plate_rock']] }, 0)
  assert.equal(shelf[0].stock, 1)
})

test('object entry overrides the global stock table', () => {
  const shelf = getShopInventory(
    { shopGeneric: [], shopPools: [[{ id: 'max_heal', stock: 3 }]] }, 0)
  assert.equal(shelf[0].item.id, 'max_heal')
  assert.equal(shelf[0].stock, 3)
})

test('an unpriced id is skipped in either form', () => {
  // leftovers exists in ITEMS but has no BALANCE.economy.prices entry.
  const shelf = getShopInventory(
    { shopGeneric: ['leftovers'], shopPools: [[{ id: 'leftovers', stock: 5 }]] }, 0)
  assert.deepEqual(shelf, [])
})

test('an unknown id is skipped in either form', () => {
  const shelf = getShopInventory(
    { shopGeneric: ['not_a_real_item'], shopPools: [[{ id: 'also_fake' }]] }, 0)
  assert.deepEqual(shelf, [])
})

test('a curated object entry dedupes against the same generic string id', () => {
  // Celadon's shape: max_heal is generic AND restocked by the pool. The pool
  // entry must win, because that is the whole point of the override.
  const shelf = getShopInventory(
    { shopGeneric: ['max_heal'], shopPools: [[{ id: 'max_heal', stock: 3 }]] }, 0)
  assert.equal(shelf.length, 1)
  assert.equal(shelf[0].stock, 3)
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`

Expected: the last four fail. `object entry overrides...` fails because `toEntry` receives an object and `ITEMS.find(i => i.id === id)` compares an id against an object, yielding `undefined` → entry dropped. The dedupe test fails because the generic string wins and stock is 2, not 3.

- [ ] **Step 4: Implement the minimal change**

Replace `toEntry` and `getShopInventory` in `src/game/shop.js` (lines 16-34) with:

```js
// Normalise a pool entry to { id, stock }. An entry is either a bare item id
// (use the global stock table) or an object carrying an explicit per-map stock.
function toRef(entry) {
  return typeof entry === 'string' ? { id: entry, stock: undefined } : { id: entry?.id, stock: entry?.stock }
}

// Resolve one entry into a shop entry, or null if the id is unknown or the
// item has no price (an unpriced item is simply not for sale).
//
// Stock precedence: an explicit per-map `stock` beats BALANCE.economy.shopStock,
// which beats the default of 1. The per-map override is what lets one town
// stock three Max Heals while every other town stocks two.
function toEntry(entry) {
  const { id, stock } = toRef(entry)
  const item = ITEMS.find(i => i.id === id)
  if (!item) return null
  const price = BALANCE.economy.prices[id]
  if (price == null) return null
  return { item, price, stock: stock ?? BALANCE.economy.shopStock[id] ?? 1 }
}

// The shop shelf for `mapIndex` in `config`. Generic entries first, then the
// map's curated entries. Duplicate ids collapse to ONE entry — and the curated
// one wins, so a pool can restock or re-stock an item the generic list already
// offers (Celadon selling three Max Heals) rather than being silently ignored.
export function getShopInventory(config, mapIndex) {
  const generic = config?.shopGeneric ?? []
  const curated = config?.shopPools?.[mapIndex] ?? []
  // Curated first so it claims the id, then generic fills the rest; the final
  // sort restores generic-before-curated display order.
  const seen = new Set()
  const picked = []
  for (const entry of [...curated, ...generic]) {
    const { id } = toRef(entry)
    if (id == null || seen.has(id)) continue
    seen.add(id)
    picked.push({ entry, fromGeneric: !curated.includes(entry) })
  }
  return picked
    .sort((a, b) => (a.fromGeneric === b.fromGeneric ? 0 : a.fromGeneric ? -1 : 1))
    .map(p => toEntry(p.entry))
    .filter(Boolean)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: 6 pass, 0 fail.

- [ ] **Step 6: Verify lint and build are clean**

Run: `npm run lint && npm run build`
Expected: no errors. Pre-existing `react-refresh/only-export-components` errors in `src/lib/theme.jsx` and `src/lib/settings.jsx` are unrelated and expected — confirm the count has not grown.

- [ ] **Step 7: Commit**

```bash
git add src/game/shop.js src/game/shop.test.js package.json
git commit -m "feat(shop): per-map stock overrides"
```

---

### Task 2: Price the twelve new shop items

Nine items in the spec's fiction are currently unpriced, so `toEntry` silently drops them. Without this task Tasks 3 and 4 would author pools that render as empty shelves.

**Files:**
- Modify: `src/game/balance.js:164-177` (the `prices` block)
- Modify: `src/game/shop.test.js` (append one test)

**Interfaces:**
- Consumes: `getShopInventory` from Task 1.
- Produces: `BALANCE.economy.prices` gains twelve keys — `sitrus_berry`, `big_root`, `wise_glasses`, `iron_ball`, `black_sludge`, `assault_vest`, `bright_powder`, `eviolite`, `life_orb`, `kings_rock`, `type_prism`, `focus_sash`. Tasks 3 and 4 reference all of them.

- [ ] **Step 1: Write the failing test**

Append to `src/game/shop.test.js`:

```js
import { BALANCE } from './balance.js'

test('every newly curated item is priced', () => {
  const needed = [
    'sitrus_berry', 'big_root', 'wise_glasses', 'iron_ball', 'black_sludge',
    'assault_vest', 'bright_powder', 'eviolite', 'life_orb', 'kings_rock',
    'type_prism', 'focus_sash',
  ]
  const missing = needed.filter(id => BALANCE.economy.prices[id] == null)
  assert.deepEqual(missing, [], `unpriced: ${missing.join(', ')}`)
})

test('the price ladder keeps its rungs', () => {
  const p = BALANCE.economy.prices
  assert.equal(p.max_heal, 150)
  assert.equal(p.muscle_band, 200)
  assert.equal(p.wise_glasses, 200)   // Muscle Band's special-attack mirror
  assert.equal(p.plate_rock, 300)
  assert.equal(p.mega_revive, 900)    // the ceiling, unchanged
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: `every newly curated item is priced` fails listing all twelve ids.

- [ ] **Step 3: Add the prices**

In `src/game/balance.js`, replace the `prices` object with the following. Existing values are unchanged; the new block is appended inside the same object.

```js
    prices: {
      max_heal: 150,
      muscle_band: 200,
      light_clay: 200,
      mega_revive: 900,
      plate_rock: 300,
      plate_water: 300,
      plate_electric: 300,
      plate_grass: 300,
      plate_poison: 300,
      plate_psychic: 300,
      plate_fire: 300,
      plate_ground: 300,

      // ── Curated-shelf items (2026-07-31-map-shop-curation-design.md) ─────
      // Priced onto the EXISTING rungs rather than inventing new ones:
      // $150 heal / $200 mid / $250 mid+ / $300 plate-class / $400-450 epic /
      // $600 legendary / $900 ceiling.
      //
      // Sitrus Berry matches the Max Heal's price because it IS a heal — one
      // you cannot aim. Wise Glasses matches Muscle Band because it is that
      // item mirrored onto special attack; pricing them apart would make the
      // choice about value rather than about the team you are running.
      sitrus_berry: 150,
      big_root: 200,
      wise_glasses: 200,
      iron_ball: 250,
      black_sludge: 250,
      assault_vest: 300,
      // Epic tier sits above every plate: unconditional where a plate is
      // type-locked.
      bright_powder: 400,
      eviolite: 400,
      life_orb: 450,
      kings_rock: 450,
      // Legendary, but below Mega Revive: each changes ONE Pokémon, where the
      // $900 ceiling recovers the whole team.
      type_prism: 600,
      focus_sash: 600,
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/game/balance.js src/game/shop.test.js
git commit -m "balance: price the curated shelf items"
```

---

### Task 3: Kanto's eight towns

The content payload. Replaces Kanto's four-item generic shelf with one item, and fills all eight curated pools.

**Files:**
- Modify: `src/game/regions/kanto.js:478-501`
- Modify: `src/game/shop.test.js` (append)

**Interfaces:**
- Consumes: `getShopInventory` (Task 1), the twelve prices (Task 2).
- Produces: `kantoConfig.shopGeneric = ['max_heal']` and `kantoConfig.shopPools` as an 8-element array. Task 4 mirrors this shape for Unova.

- [ ] **Step 1: Write the failing test**

Append to `src/game/shop.test.js`:

```js
import { kantoConfig } from './regions/kanto.js'

test('every Kanto map sells a heal', () => {
  for (let i = 0; i < 8; i++) {
    const ids = getShopInventory(kantoConfig, i).map(e => e.item.id)
    assert.ok(ids.includes('max_heal'), `map ${i} has no Max Heal`)
  }
})

test('every Kanto map shows exactly four entries', () => {
  for (let i = 0; i < 8; i++) {
    assert.equal(getShopInventory(kantoConfig, i).length, 4, `map ${i} shelf size`)
  }
})

test('each Kanto map sells its gym-typed plate', () => {
  const expected = [
    'plate_rock', 'plate_water', 'plate_electric', 'plate_grass',
    'plate_poison', 'plate_psychic', 'plate_fire', 'plate_ground',
  ]
  expected.forEach((plate, i) => {
    const ids = getShopInventory(kantoConfig, i).map(e => e.item.id)
    assert.ok(ids.includes(plate), `map ${i} missing ${plate}`)
  })
})

test('Celadon is the only Mega Revive vendor, and restocks the heal', () => {
  const celadon = getShopInventory(kantoConfig, 3)   // map 4, zero-indexed
  const heal = celadon.find(e => e.item.id === 'max_heal')
  assert.equal(heal.stock, 3)
  assert.ok(celadon.some(e => e.item.id === 'mega_revive'))

  for (let i = 0; i < 8; i++) {
    if (i === 3) continue
    const ids = getShopInventory(kantoConfig, i).map(e => e.item.id)
    assert.ok(!ids.includes('mega_revive'), `map ${i} should not sell Mega Revive`)
    assert.equal(getShopInventory(kantoConfig, i).find(e => e.item.id === 'max_heal').stock, 2)
  }
})

test('the re-homed mid-tier items appear exactly once each', () => {
  const count = id => {
    let n = 0
    for (let i = 0; i < 8; i++) {
      if (getShopInventory(kantoConfig, i).some(e => e.item.id === id)) n++
    }
    return n
  }
  assert.equal(count('light_clay'), 1)    // Pewter
  assert.equal(count('muscle_band'), 1)   // Vermilion
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: `exactly four entries` fails (currently 5), `Celadon...` fails (stock 2, and Mega Revive is on every map), `re-homed...` fails (each appears 8 times).

- [ ] **Step 3: Replace Kanto's shop tables**

In `src/game/regions/kanto.js`, replace lines 478-501 (the `shopGeneric` comment block through the closing `],` of `shopPools`) with:

```js
  // Pokémart shelves — see game/shop.js and
  // docs/superpowers/specs/2026-07-31-map-shop-curation-design.md.
  //
  // `shopGeneric` is offered at EVERY map's shop; `shopPools[i]` is map i's
  // curated list. Only the heal is universal: a run that cannot buy a heal is
  // decided by map layout rather than by play. Everything else is curated, so
  // each shop reads as THAT TOWN's shop.
  shopGeneric: ['max_heal'],

  // One type-boost plate per map, matched to that map's GYM TYPE (verified
  // against each leader's lead Pokémon in kanto.teams.js). Thematic, NOT
  // counter-typed: the plate sold on a map is the one that helps least against
  // that map's gym, which makes the shop where you invest in the NEXT map.
  //
  // The other two items per shelf come from what the TOWN is. Each shelf keeps
  // the price ladder — roughly $150 heal / $200-300 mid / $400+ ceiling — so a
  // player who does not know Kanto still has a legible spread.
  shopPools: [
    // Map 1 — Pewter: museum town, stone and fossils, defensive
    ['plate_rock', 'light_clay', 'eviolite'],
    // Map 2 — Cerulean: seaside and cape. Sitrus + Big Root is a recovery
    // build bought in one stop (Big Root multiplies the berry's heal).
    ['plate_water', 'sitrus_berry', 'big_root'],
    // Map 3 — Vermilion: working port. Freight is heavy and slow — Iron Ball
    // trades Speed for power, Muscle Band is the dock-labour stat stick.
    ['plate_electric', 'muscle_band', 'iron_ball'],
    // Map 4 — Celadon: THE DEPARTMENT STORE. The only Mega Revive vendor in
    // the run, and the only shop that restocks the heal to three. At the
    // midpoint this makes "save for Celadon" a strategy rather than a habit,
    // and gives the $900 ceiling purchase a location instead of being
    // perpetually available and perpetually declined.
    ['plate_grass', 'mega_revive', { id: 'max_heal', stock: 3 }],
    // Map 5 — Fuchsia: Safari Zone, poison and wardens. Bright Powder is the
    // Zone's evasion; Black Sludge is Koga's own passive.
    ['plate_poison', 'black_sludge', 'bright_powder'],
    // Map 6 — Saffron: Silph Co. Wise Glasses is corporate special attack;
    // Assault Vest is the defensive answer to Saffron's own specialty, sold
    // in the same building.
    ['plate_psychic', 'wise_glasses', 'assault_vest'],
    // Map 7 — Cinnabar: the volcanic research lab. Type Prism is the only item
    // that permanently rewrites what a Pokémon is, sold by the lab that does
    // exactly that. Fiction and mechanic are the same sentence.
    ['plate_fire', 'life_orb', 'type_prism'],
    // Map 8 — Viridian: Giovanni's turf, the last shop before the League. You
    // buy your second life here or you do not get one.
    ['plate_ground', 'kings_rock', 'focus_sash'],
  ],
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 13 pass, 0 fail.

- [ ] **Step 5: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: clean, error count unchanged from Task 1 Step 6.

- [ ] **Step 6: Commit**

```bash
git add src/game/regions/kanto.js src/game/shop.test.js
git commit -m "feat(shop): Kanto's eight towns get their own shelves"
```

---

### Task 4: Unova's re-homed generics

Unova's towns are not themed in this codebase, and inventing a fiction blind would produce exactly the generic shelves this work removes. So Unova gets the same shrunk generic list and the mid-tier rungs re-homed onto three maps — no worse than today, with a template for the next pass.

**Files:**
- Modify: `src/game/regions/unova.js:656-661`
- Modify: `src/game/shop.test.js` (append)

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: `unovaConfig.shopGeneric = ['max_heal']`, `unovaConfig.shopPools` as an 8-element array.

- [ ] **Step 1: Write the failing test**

Append to `src/game/shop.test.js`:

```js
import { unovaConfig } from './regions/unova.js'

test('every Unova map sells a heal', () => {
  for (let i = 0; i < 8; i++) {
    const ids = getShopInventory(unovaConfig, i).map(e => e.item.id)
    assert.ok(ids.includes('max_heal'), `map ${i} has no Max Heal`)
  }
})

test('Unova re-homes the mid-tier onto maps 1, 3 and 4', () => {
  const idsAt = i => getShopInventory(unovaConfig, i).map(e => e.item.id)
  assert.ok(idsAt(0).includes('light_clay'))
  assert.ok(idsAt(2).includes('muscle_band'))
  assert.ok(idsAt(3).includes('mega_revive'))
  // and nowhere else
  for (let i = 0; i < 8; i++) {
    if (i !== 3) assert.ok(!idsAt(i).includes('mega_revive'), `map ${i}`)
  }
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: `Unova re-homes...` fails — Mega Revive is currently generic, so it appears on all eight maps.

- [ ] **Step 3: Replace Unova's shop tables**

In `src/game/regions/unova.js`, replace lines 656-661 with:

```js
  // Pokémart shelves — see game/shop.js and
  // docs/superpowers/specs/2026-07-31-map-shop-curation-design.md.
  //
  // Only the heal is universal, matching Kanto. Unova's per-map plates and
  // town fiction are NOT yet authored: the plate mapping is written against a
  // region's gym-type order, and the town-by-town pass Kanto received has not
  // been done here. Rather than invent one blind, Unova re-homes the three
  // former generics onto the same rungs Kanto uses and leaves the remaining
  // pools empty — an empty pool resolves to no curated items, not an error.
  //
  // To finish Unova: give each map a `plate_<gymtype>` plus two items drawn
  // from what that city is, keeping roughly one mid-tier and one ceiling item
  // per shelf. See kanto.js shopPools for the worked example.
  shopGeneric: ['max_heal'],
  shopPools: [
    ['light_clay'],                                     // map 1 — mid-tier defensive
    [],
    ['muscle_band'],                                    // map 3 — mid-tier offensive
    ['mega_revive', { id: 'max_heal', stock: 3 }],      // map 4 — the logistics stop
    [],
    [],
    [],
    [],
  ],
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 15 pass, 0 fail.

- [ ] **Step 5: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/regions/unova.js src/game/shop.test.js
git commit -m "feat(shop): re-home Unova's generics onto curated maps"
```

---

### Task 5: Verify the shelf in the running app

The tests prove the data resolves. They cannot prove four stacked cards are usable on a phone, which is Risk 4 in the spec (carried over from the shelf spec, where five entries were flagged as a crowding risk).

**Files:**
- Modify: none expected. If the shelf overflows, fix in `src/components/PokemartNode.jsx` and note it in the commit.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: nothing consumed by later tasks; this is the final gate.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Note the port from the output — Vite increments when 5173 is taken.

- [ ] **Step 2: Reach a Pokémart on map 1**

Start a Kanto run and travel to a Pokémart node. Confirm the shelf shows exactly four entries: Max Heal $150, Light Clay $200, Stone Plate $300, Eviolite $400.

- [ ] **Step 3: Check Celadon**

Reach map 4's Pokémart. Confirm Max Heal shows stock 3 (not 2), and Mega Revive is present at $900.

Verify the display order: generics first, then curated. Max Heal should still lead the shelf despite being restocked by the pool.

- [ ] **Step 4: Check the mobile width**

With the shop open, set the browser to 375px wide (devtools device toolbar, iPhone SE). Confirm:
- all four entries reachable by scrolling, none clipped
- Buy targets still at least 44px tall
- a sold-out entry greys rather than disappearing (buy the Max Heal three times at Celadon)

- [ ] **Step 5: Buy one of each new kind**

- Buy **Eviolite** (map 1) — a newly-purchasable HELD item. Confirm it lands in the bag and can be equipped onto a Pokémon.
- Buy **Type Prism** (map 7) — a newly-purchasable CONSUMABLE. Confirm it applies through the existing consumable path and retypes the target.

- [ ] **Step 6: Commit any fixes**

If Steps 1-5 required no changes, skip. Otherwise:

```bash
git add src/components/PokemartNode.jsx
git commit -m "fix(shop): <what the play-test surfaced>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Curation principle (location fiction) | 3 (encoded in the pool comments) |
| §2 Generic shelf shrinks to `max_heal` | 3 (Kanto), 4 (Unova) |
| §3 Kanto's eight towns table | 3 |
| §4 The three carrying placements | 3 (Celadon/Cinnabar/Viridian pools) |
| §5 Per-map stock overrides | 1 |
| §6 Unova scoped to re-homing | 4 |
| Pricing table (12 items) | 2 |
| Risk 4 (mobile crowding) | 5 Step 4 |
| Verification items 1-10 | 1 Step 6, 2, 3, 4, 5 |

**Known gap:** spec verification item 9 ("sold-out entries grey rather than disappear") is covered only by play-testing in Task 5 Step 4, not by an automated test — it is a render behaviour in `PokemartNode`, outside the pure module these tests cover.

**Type consistency:** `getShopInventory(config, mapIndex)` keeps its signature across all tasks. Pool entries are `string | { id: string, stock?: number }` in Tasks 1, 3 and 4 alike. `toRef` and `toEntry` are internal to `shop.js` and referenced by no other task.
