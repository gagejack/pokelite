# Pokémart & Speed Cash Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-run currency (Speed Cash) earned from battles and a Pokémart node that spends it on a stocked Max Heal.

**Architecture:** Two counters live as `useState` in `App.jsx` beside the existing run stats — `speedCash` (spendable) and `cashEarned` (lifetime total) — passed down with an `onEarnCash` / `onSpendCash` callback pair. Battles credit cash in the two existing victory handlers (`NodeMap.handleBattleEnd`, `EliteFour.handleBattleEnd`); non-fight nodes credit a $10 floor where they clear in `handleNodeClick`. Node tooltips gain their payout so the tradeoff is visible. Map generation swaps row 7's random sibling for a new `NODE_TYPES.POKEMART`, which opens a new `PokemartNode.jsx` overlay modelled directly on `ItemNode.jsx`'s pick stage. Shop inventory is authored per region config (`shopGeneric` + `shopPools`, ids only) and read through a new pure module `src/game/shop.js`; price and stock come from `BALANCE.economy`.

**Tech Stack:** React 19 (function components, hooks), Vite, inline styles (this codebase uses inline `style={{}}` for layout; Tailwind utility classes only for `hover:`/`transition` — follow that convention exactly), no test framework.

## Global Constraints

Copy these verbatim; every task inherits them.

- **Currency name:** Speed Cash. **Symbol:** `$`, always **leading** the amount (`$150`, never `150$`).
- **Payouts (Speed Cash):** grass `50`, trainer `30`, rival `60`, boss (gym leader) `120`, legendary (Master Ball) `250`, Elite Four member `200`, non-fight node (Pokéball/Item/TM) `10`.
- **Prices:** Max Heal `150`, stock `2` per shop.
- **Legendary money is paid for WINNING, never for catching.** The payout fires in `handleBattleEnd`'s `if (won)` branch — never in `handleLegendaryCatch`. Declining the catch must not cost the player $250.
- **Mystery nodes pay their RESOLVED type's rate.** No special case: resolution happens before dispatch, so the normal payout logic already sees the resolved type.
- **Two counters:** `speedCash` (spendable balance, goes down on purchase) and `cashEarned` (total ever earned this run, only goes up, never touched by purchases). Both in the run-save `stats`.
- **Persistence:** per-run, carried across maps, resets on new run / restart. Lives in the run-save `stats` object. **No Supabase schema change, no migration.**
- **Row 7 is always `[pokecenter, pokemart]` in random order.** The coin-flip that places the Pokécenter is kept; only the sibling changes.
- **No test framework exists in this repo.** Verification per task = `npm run lint` + `npm run build` + the stated manual check. Never add a test runner.
- **Pre-existing lint baselines** (do not "fix", do not let them grow): `App.jsx` 1 error, `NodeMap.jsx` 3, `Pokedex.jsx` 1, `BattleCard.jsx` 18. Whole-repo baseline: **43 errors, 5 warnings (48 problems)**. Count **errors only** — eslint's "N problems" total bundles warnings, so `NodeMap.jsx` reports "4 problems" for its 3 errors + 1 warning. That is the baseline, not a regression.
- **Balance numbers live in `src/game/balance.js`.** No gameplay number may be hardcoded in a component. `balance.js` is a leaf module: it imports nothing, and node-type strings inside it are plain string literals asserted against `NODE_TYPES` by `nodeMap.js`.
- **Fonts:** `Upheaval` for headings/buttons, `Orange Kid` for body. **Never render either below 12px** — they are pixel display faces that stop resolving. (See `docs/UI_TOUCHUPS.md`.)
- **Muted text color** comes from `muted(dark)` in `src/lib/colors.js`. Never re-declare `dark ? '#888' : '#777'`.
- **Commit after every task** using the message given in that task's final step.
- **AGENTS.md:49 says "Never reorder rng() calls." Task 2 breaks this on purpose, with sign-off.** Removing `randomNode` from row 7 shifts the seeded stream. Do NOT add throwaway `rng()` calls to compensate — the old call count was variable (1–2), so no fixed burn restores alignment. Accepted cost; deploy at UTC midnight so the daily challenge rolls over cleanly.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/game/shop.js` | Pure: resolve a map's shop inventory from region config; nothing else. |
| `src/components/PokemartNode.jsx` | The shop overlay. Presentational + local stock state. |

**Modified:**

| File | Change |
|---|---|
| `src/game/balance.js` | New `economy` block (payouts, prices, stock). |
| `src/game/nodeMap.js` | `NODE_TYPES.POKEMART`; row 7 sibling becomes the mart. |
| `src/game/regions/kanto.js` | `shopGeneric` + `shopPools` on the config. |
| `src/game/regions/hoenn.js`, `sinnoh.js`, `unova.js` | Same two fields (empty pools). |
| `src/App.jsx` | `speedCash` + `cashEarned` state, earn/spend handlers, save/restore/reset, props. |
| `src/components/NodeMap.jsx` | Cash props, earn on victory + non-fight nodes, payout tooltips, mart node icon/label/click/overlay, HUD. |
| `src/components/EliteFour.jsx` | Earn on victory + HUD. |
| `src/components/BattleCard.jsx` | Show total earned on the run-end screen. |
| `docs/ITEMS.md` | Document payouts and shop prices. |

---

## Task 1: Economy constants in balance.js

The single source of truth for every number in this feature. Nothing else in this task.

**Files:**
- Modify: `src/game/balance.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `BALANCE.economy` with this exact shape —
  ```js
  BALANCE.economy = {
    payouts: { grass: 50, trainer: 30, rival: 60, boss: 120, legendary: 250, eliteFour: 200, node: 10 },
    prices:  { max_heal: 150 },
    shopStock: { max_heal: 2 },
  }
  ```
  Keys in `prices` / `shopStock` are **item ids from `src/game/items.js`** (snake_case), not display names.

- [ ] **Step 1: Add the economy block**

In `src/game/balance.js`, insert this block immediately **after** the closing `},` of the `progression:` block (currently around line 84) and before the `// ── Trainer team generation` comment. Match the surrounding comment style — a section rule comment, then the object.

```js
  // ── Speed Cash economy (NodeMap / EliteFour victory handlers, shop.js) ────
  // Money compensates for FORGONE LEVELS: the weaker a fight's XP reward, the
  // stronger its cash. Grass pays more than a trainer precisely because a
  // trainer already pays 2 levels to grass's 1 (see progression.levelsGained)
  // and levels compound. Flipping this ordering collapses the grass/trainer
  // fork back into "trainer always wins".
  //
  // Legendary sits ABOVE a gym leader on purpose: a Master Ball fight awards
  // only levelsGained.default (2) — the same as a route trainer — for a Lv70
  // Mewtwo. It cannot be farmed, so it doesn't move the average.
  //
  // `node` is the FLOOR: a token payout for non-fight nodes (pokéball / item /
  // TM). Without it a map whose six random rows all roll non-fight pays only
  // the boss's 120 — less than one Max Heal, so the guaranteed shop is
  // guaranteed useless. At a fifth of a grass node it can't rival fighting.
  //
  // Expected income per map: rowWidths gives 7 rows, but row 0 is the
  // pre-cleared START node (NodeMap seeds clearedNodes with Set([0])), so
  // there are 6 random rows plus the boss:
  //   grass    6 × 0.28 × 50  =  84
  //   trainer  6 × 0.28 × 30  =  50
  //   floor    6 × 0.38 × 10  =  23
  //   mystery  6 × 0.06 × ~45 =  16
  //   boss                    = 120   →  ≈ $293/map (floor $180, ceiling ~$420)
  economy: {
    payouts: {
      grass: 50,
      trainer: 30,
      rival: 60,
      boss: 120,        // gym leader
      legendary: 250,   // Master Ball node — paid on WIN, never on catch
      eliteFour: 200,
      node: 10,         // pokéball / item / TM — the income floor
    },
    // Keyed by item id (see game/items.js). An item with no entry is not sold.
    prices: { max_heal: 150 },
    // Units a single shop stocks. Uncapped stock would turn a legendary
    // windfall into five heals and undo the attrition pressure.
    shopStock: { max_heal: 2 },
  },
```

- [ ] **Step 2: Verify the object is reachable and frozen**

Run:
```bash
node --input-type=module -e "import('./src/game/balance.js').then(m => { const e = m.BALANCE.economy; console.log(JSON.stringify(e)); console.log('frozen:', Object.isFrozen(e), Object.isFrozen(e.payouts)) })"
```
Expected output: the full economy JSON — confirm `"node":10` is present — then `frozen: true true`. (`deepFreeze` at the top of the file recurses, so the nested objects must both report frozen — if `payouts` is not frozen, the block was inserted outside the `deepFreeze(...)` call.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no NEW errors. `balance.js` must have zero.

- [ ] **Step 4: Commit**

```bash
git add src/game/balance.js
git commit -m "feat(economy): add Speed Cash payout/price constants to balance"
```

---

## Task 2: The POKEMART node type and row-7 placement

Map generation only. No UI, no cash. After this task the node exists in generated maps and renders as a placeholder-less unknown type — that is expected and fixed in Task 4.

**Files:**
- Modify: `src/game/nodeMap.js:4-19` (the `NODE_TYPES` object), `src/game/nodeMap.js:128-134` (row 7)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `NODE_TYPES.POKEMART === 'pokemart'`. `buildRows()` keeps its existing signature `buildRows(trainerPool, bossTrainer, mapIndex = 0)` and its existing return shape `rows: Node[][]`.

- [ ] **Step 1: Add the node type**

In `src/game/nodeMap.js`, add to the `NODE_TYPES` object immediately after the `POKECENTER: 'pokecenter',` line:

```js
  // Shop node. Always row 7's sibling to the Pokécenter, so the row is a fork:
  // heal OR shop, never both. See buildRows below.
  POKEMART: 'pokemart',
```

Do **not** add it to `MYSTERY_OUTCOMES` — a "?" node must never resolve into a shop.

- [ ] **Step 2: Replace row 7's random sibling with the mart**

Replace the row 7 block (currently `src/game/nodeMap.js:128-134`) — the whole comment plus the `rows.push(...)` call:

```js
  // Row 7 (2 nodes) — a guaranteed Pokécenter at a random index, with the
  // Pokémart as its sibling. Because the player walks exactly one node per
  // row, this row is a fork: arrive at the boss HEALED, or arrive STOCKED.
  // The coin flip only decides which side each lands on. Note this row can no
  // longer roll grass/trainer/item — an accepted loss of ~1 random node per
  // map in exchange for a guaranteed shop.
  const pcIndex = rng() < 0.5 ? 0 : 1
  rows.push(Array.from({ length: 2 }, (_, i) =>
    i === pcIndex
      ? { id: id++, type: NODE_TYPES.POKECENTER }
      : { id: id++, type: NODE_TYPES.POKEMART }
  ))
```

The `randomNode(...)` call is gone; `trainerPool` and `mapIndex` are still used by the rows above, so **do not** remove those parameters.

**Critical — do not change the `rng()` call count.** The single `rng() < 0.5` flip stays, and `randomNode` (which consumed 1–2 `rng()` calls) is gone. This shifts the seeded stream for row 7 onward, which is expected and acceptable: seeded runs generated before this change will produce different maps. Do not try to preserve the old stream with a dummy call.

- [ ] **Step 3: Verify row 7 across many generated maps**

Run:
```bash
node --input-type=module -e "
import('./src/game/nodeMap.js').then(({ buildRows, NODE_TYPES }) => {
  let ok = 0
  for (let i = 0; i < 500; i++) {
    const { } = {}
    const rows = buildRows(['Youngster'], 'Brock', 0)
    const row7 = rows[7].map(n => n.type).sort().join(',')
    if (row7 === 'pokecenter,pokemart') ok++
  }
  console.log('rows[7] correct in', ok, 'of 500')
})"
```
Expected: `rows[7] correct in 500 of 500`.

If the script errors on an asset import, run the check in the browser console instead after `npm run dev`, or skip to Step 4 and verify visually in Step 5 — but do not skip both.

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: `nodeMap.js` clean; build succeeds.

- [ ] **Step 5: Visual check**

Run `npm run dev`, start a run, and look at the second-to-last row. One node is the Pokécenter; the other renders with **no icon** (the icon map has no `pokemart` entry yet). That blank node is the correct intermediate state — Task 4 gives it an icon.

- [ ] **Step 6: Commit**

```bash
git add src/game/nodeMap.js
git commit -m "feat(map): add POKEMART node as row 7's Pokecenter sibling"
```

---

## Task 3: Shop inventory resolution (shop.js + region configs)

A pure module plus the authored data it reads. No UI.

**Files:**
- Create: `src/game/shop.js`
- Modify: `src/game/regions/kanto.js:466+` (config object), `src/game/regions/hoenn.js:167+`, `src/game/regions/sinnoh.js:131+`, `src/game/regions/unova.js:645+`

**Deliberate divergence from the spec.** The design doc (§5) sketched region
config entries as `[{ id: 'max_heal', price: 150, stock: 2 }]`. This plan puts
price and stock in `BALANCE.economy` and leaves the config holding **ids only**.
Reason: the Global Constraints forbid gameplay numbers outside `balance.js`, and
the sketched shape would duplicate a price across every region that sells the
item. The player-visible behavior is identical. Do not "restore" the spec shape.

**Interfaces:**
- Consumes: `BALANCE.economy.prices` and `BALANCE.economy.shopStock` from Task 1; `ITEMS` from `src/game/items.js`.
- Produces:
  ```js
  // ShopEntry = { item: Item, price: number, stock: number }
  export function getShopInventory(config, mapIndex): ShopEntry[]
  ```
  `item` is the **full object from `ITEMS`** (so it carries `name`, `description`, `icon`, `tier`, `consumable`), not just an id. Entries whose id matches no item are dropped. Task 5's `PokemartNode` consumes exactly this array.

- [ ] **Step 1: Write `src/game/shop.js`**

```js
// Pokémart inventory resolution.
//
// A map's shop shows the region's GENERIC list (offered at every map) followed
// by that map's CURATED list. Both are authored in the region config beside
// legendaryPools; both are arrays of item ids from game/items.js. Price and
// stock come from BALANCE.economy — the shop adds no item data of its own, so
// an item's name/description/icon can never drift between the shop and the bag.
//
// This module is PURE: no React, no rng, no side effects. Same inputs → same
// output, so a shop re-render can't reshuffle the shelf.
import { ITEMS } from './items.js'
import { BALANCE } from './balance.js'

// Resolve one item id into a shop entry, or null if the id is unknown or the
// item has no price (an unpriced item is simply not for sale).
function toEntry(id) {
  const item = ITEMS.find(i => i.id === id)
  if (!item) return null
  const price = BALANCE.economy.prices[id]
  if (price == null) return null
  return { item, price, stock: BALANCE.economy.shopStock[id] ?? 1 }
}

// The shop shelf for `mapIndex` in `config`. Generic entries first, then the
// map's curated entries. Duplicate ids collapse to the first occurrence, so a
// curated list can name a generic item without doubling the shelf.
export function getShopInventory(config, mapIndex) {
  const generic = config?.shopGeneric ?? []
  const curated = config?.shopPools?.[mapIndex] ?? []
  const seen = new Set()
  return [...generic, ...curated]
    .filter(id => (seen.has(id) ? false : (seen.add(id), true)))
    .map(toEntry)
    .filter(Boolean)
}
```

- [ ] **Step 2: Add shop data to the Kanto config**

In `src/game/regions/kanto.js`, inside the `kantoConfig` object, insert immediately **after** the `legendaryIds:` line:

```js
  // Pokémart shelves (see game/shop.js). Both are arrays of item ids from
  // game/items.js; price and stock come from BALANCE.economy, not from here.
  // `shopGeneric` is offered at EVERY map's shop; `shopPools[i]` is map i's
  // curated extra. The curated lists are authored by hand and are intentionally
  // empty for now — a separate design decision.
  shopGeneric: ['max_heal'],
  shopPools: [
    [], [], [], [], [], [], [], [],   // maps 1–8
  ],
```

- [ ] **Step 3: Add the same fields to the other three regions**

Add to `hoennConfig` (`src/game/regions/hoenn.js:167+`), `sinnohConfig` (`src/game/regions/sinnoh.js:131+`), and `unovaConfig` (`src/game/regions/unova.js:645+`). Place each after that config's `legendaryIds` line if it has one, otherwise after `catchPools`. Use the short form — the full comment lives in kanto.js:

```js
  // Pokémart shelves — see game/shop.js and the note in kanto.js.
  shopGeneric: ['max_heal'],
  shopPools: [],
```

`shopPools: []` is correct here: `getShopInventory` reads `shopPools?.[mapIndex] ?? []`, so a short or empty array yields no curated items rather than throwing.

- [ ] **Step 4: Verify resolution**

Run:
```bash
node --input-type=module -e "
Promise.all([import('./src/game/shop.js'), import('./src/game/items.js'), import('./src/game/balance.js')])
  .then(([{ getShopInventory }]) => {
    const cfg = { shopGeneric: ['max_heal'], shopPools: [[], []] }
    const inv = getShopInventory(cfg, 0)
    console.log(inv.map(e => e.item.name + ' \$' + e.price + ' x' + e.stock))
    console.log('unknown id dropped:', getShopInventory({ shopGeneric: ['nope'] }, 0).length === 0)
    console.log('missing config safe:', getShopInventory(undefined, 3).length === 0)
    console.log('dupe collapsed:', getShopInventory({ shopGeneric: ['max_heal'], shopPools: [['max_heal']] }, 0).length === 1)
  })"
```
Expected:
```
[ 'Max Heal $150 x2' ]
unknown id dropped: true
missing config safe: true
dupe collapsed: true
```

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: clean for the new and touched files; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/game/shop.js src/game/regions/kanto.js src/game/regions/hoenn.js src/game/regions/sinnoh.js src/game/regions/unova.js
git commit -m "feat(shop): add pure shop inventory resolution + region shelves"
```

---

## Task 4: Speed Cash state and earning

Wire the currency end to end — App state, save/restore, both victory handlers, and a HUD readout. The shop does not exist yet; after this task you can watch money accrue with nothing to spend it on. That is a deliberately testable slice.

**Files:**
- Modify: `src/App.jsx` (state, snapshot, resume, reset, props for both run screens)
- Modify: `src/components/NodeMap.jsx` (props, victory payout, HUD)
- Modify: `src/components/EliteFour.jsx` (props, victory payout, HUD)

**Interfaces:**
- Consumes: `BALANCE.economy.payouts` from Task 1.
- Produces, for Task 5:
  - `NodeMap` and `EliteFour` both receive `speedCash: number` and `onEarnCash: (amount: number) => void`.
  - `NodeMap` additionally receives `onSpendCash: (amount: number) => boolean` — returns `true` if the player could afford it and the balance was debited, `false` if not (in which case nothing changed).
  - App's snapshot `stats` object gains `speedCash: number`.

- [ ] **Step 1: Add the App state and handlers**

In `src/App.jsx`, add the ref beside the other run-stat refs (after `const pokemonSeenShinyIds = useRef([])`, currently line 56). It needs to be **both** a ref and reactive state: the refs above it are read only at save time, but Speed Cash has to re-render the HUD and the shop's affordability as it changes.

```js
  // Speed Cash — the run's currency. Per-run: earned in battle, spent at the
  // Pokémart, carried across maps, reset on a new run. Lives in the run-save
  // `stats` object below, so there is no schema change.
  // State (not a ref) because the HUD and the shop's affordability re-render
  // on every change; the other stats above are only read at save time.
  const [speedCash, setSpeedCash] = useState(0)
  // Total ever earned this run — only goes up; purchases never touch it. Shown
  // on the run-end screen. Without it the Elite Four's payouts would be pure
  // waste: there is no mart there, so $200 × 4 + the last gym's $120 would
  // accrue into a void. This makes the whole economy visible at the end even
  // for a player who never shopped. Local only — no `runs` column.
  const [cashEarned, setCashEarned] = useState(0)
```

Add the two handlers next to `applyConsumable` (after line 467):

```js
  // Credit a payout. Amounts come from BALANCE.economy.payouts — the callers
  // pick which one; this just adds. Both counters move together here, and ONLY
  // here: spendCash below touches the balance alone, which is what makes
  // cashEarned a true lifetime total.
  function earnCash(amount) {
    if (!amount) return
    setSpeedCash(prev => prev + amount)
    setCashEarned(prev => prev + amount)
  }

  // Debit a purchase. Returns true if it went through, false if the player
  // couldn't afford it (and nothing changed) — the caller uses the boolean to
  // decide whether to hand over the item, so the two can never disagree.
  //
  // The decision is made INSIDE the updater against `prev`, not against the
  // `speedCash` closure value: two Buy taps in the same tick both close over
  // the same stale balance, and checking outside would let a player at $150
  // buy twice and go negative. `paid` is assigned during the updater and read
  // after — safe because React runs the updater synchronously here.
  //
  // StrictMode double-invokes updaters, so the updater must be idempotent for
  // a given `prev`: it is, since it only ever returns `prev - amount` or
  // `prev`, and `paid` is overwritten with the same value both times.
  function spendCash(amount) {
    let paid = false
    setSpeedCash(prev => {
      if (prev < amount) { paid = false; return prev }
      paid = true
      return prev - amount
    })
    return paid
  }
```

- [ ] **Step 2: Persist and restore it**

Three edits in `src/App.jsx`:

In `buildRunSnapshot()`'s `stats` object (line ~171), add two entries after `pokemonSeenShinyIds`:
```js
        speedCash,
        cashEarned,
```

In `resumeRun()` (line ~243), after the `pokemonSeenShinyIds.current = ...` line:
```js
    setSpeedCash(run.stats?.speedCash ?? 0)
    setCashEarned(run.stats?.cashEarned ?? 0)
```
The `?? 0` matters — runs saved before this feature have neither key.

In `resetRunStats()` (line ~396), add as the last lines of the function:
```js
    setSpeedCash(0)
    setCashEarned(0)
```
`resetRunStats` is called by both `startRun` and `restartRun`, so this covers "new run" and "Play Again" in one place — do not add separate resets in either.

- [ ] **Step 3: Pass it to both run screens**

On the `<NodeMap ...>` element (line ~573), add after the `onApplyConsumable={applyConsumable}` line:
```js
          speedCash={speedCash}
          onEarnCash={earnCash}
          onSpendCash={spendCash}
```

On the `<EliteFour ...>` element (line ~619), add after its `onApplyConsumable={applyConsumable}` line:
```js
          speedCash={speedCash}
          onEarnCash={earnCash}
```
EliteFour gets no `onSpendCash`: there is no mart in the Elite Four (spec §6).

- [ ] **Step 4: Credit NodeMap victories**

In `src/components/NodeMap.jsx`, add the three props to the component signature (line 382). Insert them right after `onApplyConsumable`:
```js
speedCash = 0, onEarnCash, onSpendCash,
```

In `handleBattleEnd` (line ~709), inside the `if (won) {` branch, immediately **after** the `const updatedRoster = await evo.applyVictory(...)` line and before `setPendingBattle(null)`:

```js
      // Speed Cash payout. Mirrors the levelsGained ladder above but inverted:
      // the fights that pay the fewest levels pay the most cash. See
      // BALANCE.economy.payouts for why.
      //
      // CRITICAL — the legendary payout lives HERE, in the `won` branch, and
      // never in handleLegendaryCatch: a Master Ball win leads to a catch offer
      // the player may DECLINE, and declining must not torch $250. The money is
      // for beating it, not for keeping it.
      const pay = BALANCE.economy.payouts
      onEarnCash?.(
        isRival ? pay.rival
        : isMasterBall ? pay.legendary
        : isBoss ? pay.boss
        : node.type === NODE_TYPES.GRASS ? pay.grass
        : pay.trainer
      )
```

Order matters in that chain: a rival node is checked first (it is a trainer variant), then Master Ball, then boss, then grass, with plain trainers as the fallback. `BALANCE` is already imported at line 24 — do not add a second import.

- [ ] **Step 4b: Credit the non-fight nodes ($10 floor)**

Still in `src/components/NodeMap.jsx`, in `handleNodeClick` (line ~658). Three node types pay the floor: Pokéball, Item, and TM. Each is credited **when the node is taken**, not when the player keeps something — declining a catch or closing an item offer still pays.

In the `POKEBALL` branch (line ~685), add immediately after `setLoadingNode(null)`:
```js
      // The floor payout — paid for taking the node, whether or not the player
      // keeps anything. See BALANCE.economy.payouts.node.
      onEarnCash?.(BALANCE.economy.payouts.node)
```

In the `ITEM` branch (line ~695), change the single line to:
```js
    } else if (node.type === NODE_TYPES.ITEM) {
      onEarnCash?.(BALANCE.economy.payouts.node)
      setPendingItem({ node, offered: pickThreeItems() })
```

In the `POWER_UPGRADE` branch (line ~701), change to:
```js
    } else if (node.type === NODE_TYPES.POWER_UPGRADE) {
      onEarnCash?.(BALANCE.economy.payouts.node)
      setPendingPower({ node })
```

A mystery node needs no case: `resolveMysteryNode` rewrites `node.type` to the resolved type **before** this dispatch runs, so a "?" that becomes an item hits the ITEM branch and pays $10, and one that becomes grass hits the battle path and pays $50. Do not add a mystery-specific payout.

The Pokécenter and Pokémart branches pay nothing.

- [ ] **Step 4c: Show payouts in the node tooltips**

Without this the entire mechanism is invisible — the player can't weigh grass against trainer if only one side of the trade is on screen. In `getNodeLabel`:

Trainer (line ~829) — replace the `sub` construction:
```js
      const sub = [...(typeLine ? [typeLine] : []), '+2 levels to all mon', `$${BALANCE.economy.payouts.trainer}`]
```

Rival (line ~852) — replace the return:
```js
      return { title: node.trainer ?? 'Rival', sub: [...sub, `+4 levels + full heal · $${BALANCE.economy.payouts.rival}`] }
```

Master Ball (line ~863) — replace the return:
```js
      return { title: 'Master Ball', sub: [{ type: null, name: '???', level: lvl }, `$${BALANCE.economy.payouts.legendary}`] }
```

Boss (line ~841) — replace the return:
```js
      return { title: node.trainer ?? 'Gym Leader', sub: [...sub, `$${BALANCE.economy.payouts.boss}`] }
```

The plain `switch` cases (line ~865) become:
```js
    const nodePay = BALANCE.economy.payouts.node
    switch (node.type) {
      case NODE_TYPES.GRASS:         return { title: 'Tall Grass', sub: `+1 LVL · $${BALANCE.economy.payouts.grass}` }
      case NODE_TYPES.POKEBALL:      return { title: 'Poké Ball', sub: `Catch a Pokémon · $${nodePay}` }
      case NODE_TYPES.ITEM:          return { title: 'Item', sub: `Select an item · $${nodePay}` }
      case NODE_TYPES.POWER_UPGRADE: return { title: 'TM', sub: `Upgrade a move · $${nodePay}` }
      case NODE_TYPES.POKECENTER:    return { title: 'Pokémon Center', sub: 'Full heal' }
      case NODE_TYPES.MYSTERY:       return { title: 'Mystery', sub: '???' }
      default:                       return { title: node.type, sub: '' }
    }
```

Mystery deliberately shows no payout — revealing it would leak the outcome. The Pokémart case is added in Task 6.

The tooltip renderer (line ~350) already handles both a string `sub` and an array of strings/objects, so no rendering change is needed.

- [ ] **Step 5: Credit EliteFour victories**

In `src/components/EliteFour.jsx`, add to the component signature (line 22), after `onApplyConsumable`:
```js
speedCash = 0, onEarnCash,
```

In `handleBattleEnd` (line ~79), inside `if (battleWon) {`, immediately after the `const updatedRoster = await evo.applyVictory(...)` line:
```js
      onEarnCash?.(BALANCE.economy.payouts.eliteFour)
```
`BALANCE` is already imported at line 11.

- [ ] **Step 6: Add the HUD readout to NodeMap**

The player must be able to see the balance without opening the shop, or the payouts are invisible. Put it in the desktop-and-mobile-shared area: the **BAG panel header** on desktop is the natural home, but the mobile layout has its own bag row. Use a small standalone badge instead so one element serves both.

In `src/components/NodeMap.jsx`, inside the returned `<Layout ...>` (starting line 1039), add as the **first child**, before the `{isDesktop ? (` expression:

```jsx
      {/* Speed Cash balance. Fixed top-left so it clears the FloatingNav pill
          (top-right, zIndex 150) on mobile and the nav bar on desktop. zIndex
          sits below the battle overlay (100) so a battle covers it. */}
      <div style={{
        position: 'fixed', top: '8px', left: '8px', zIndex: 50,
        display: 'flex', alignItems: 'center', gap: '4px',
        backgroundColor: 'rgba(0,0,0,0.55)', padding: '4px 8px',
        pointerEvents: 'none',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#facc15' }}>
          ${speedCash}
        </span>
      </div>
```

Add the identical block as the first child of EliteFour's returned `<Layout>` too, so the balance doesn't vanish in the endgame. (It is read-only there — no mart — but a disappearing counter reads as a bug.)

- [ ] **Step 7: Lint and build**

Run: `npm run lint && npm run build`
Expected: no new errors beyond the recorded baselines (`App.jsx` 1, `NodeMap.jsx` 3). If `speedCash` is reported unused in `EliteFour.jsx`, you skipped the HUD block there — add it rather than removing the prop.

- [ ] **Step 8: Manual verification**

Run `npm run dev` and check all of these:

1. A fresh run starts at `$0`.
2. Clearing a **grass** node adds exactly `50`.
3. Clearing a **trainer** node adds exactly `30`.
4. Clearing a **Pokéball**, **Item**, or **TM** node adds exactly `10` each — including when the player **declines** the catch or closes the item offer without taking anything.
5. Clearing the **gym leader** adds `120` and the balance survives into the next map (it must NOT reset at the map boundary).
6. **Beat a Master Ball node and DECLINE the catch — the $250 is still credited.** This is the regression this plan most wants to prevent.
7. A **mystery** node pays its resolved type: "?" → grass pays `50`, "?" → item pays `10`.
8. Every node tooltip shows its payout — grass reads `+1 LVL · $50`, trainer shows `$30`. Mystery shows none.
9. Hitting **Home** mid-run, then **Resume Run** from the menu, restores the same balance.
10. Starting a **new** run resets it to `$0`.
11. **Play Again** after a loss resets it to `$0`.
12. Losing a battle adds nothing.
13. **Play a full map taking only Pokéball/Item/TM nodes.** Total must be at least `$180` — the floor exists so this map isn't dead.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/components/NodeMap.jsx src/components/EliteFour.jsx
git commit -m "feat(economy): earn, persist, and display Speed Cash"
```

---

## Task 5: The Pokémart shop overlay

The component itself. Modelled on `ItemNode.jsx`'s pick stage — same backdrop, panel, close button, and card language — with price/stock/affordability added.

**Files:**
- Create: `src/components/PokemartNode.jsx`

**Interfaces:**
- Consumes: `getShopInventory` from Task 3; `speedCash` from Task 4.
- Produces the component:
  ```js
  export default function PokemartNode({ inventory, speedCash, onBuy, onClose })
  ```
  - `inventory: ShopEntry[]` — from `getShopInventory`.
  - `speedCash: number` — current balance, for affordability.
  - `onBuy: (entry: ShopEntry) => boolean` — the parent debits and adds to the bag; returns `true` if the purchase went through. The component decrements its own stock **only** when this returns `true`.
  - `onClose: () => void` — dismiss; the parent clears the node.

  Stock is **local component state**, seeded from `inventory`. It exists only while the shop is open: a shop is visited once per run (its node is cleared on close), so there is nothing to persist. Do not lift it to App.

- [ ] **Step 1: Write the component**

Create `src/components/PokemartNode.jsx`:

```jsx
import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { itemIconUrl, tierColor } from '../game/items'

// The Pokémart shop overlay. Deliberately built on ItemNode's pick-stage
// language (same backdrop, panel, close button, stacked-on-mobile cards) so the
// two "choose a thing" screens read as one family — the difference is that this
// one costs money and can run out.
//
// Stock is LOCAL state: a mart node is cleared when the shop closes, so a shop
// is visited exactly once and there is nothing to carry. The parent owns money
// and the bag; this component owns only what's left on the shelf.
export default function PokemartNode({ inventory, speedCash, onBuy, onClose }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  // Remaining units per shelf index, seeded once from the inventory.
  const [stock, setStock] = useState(() => inventory.map(e => e.stock))
  const [hovered, setHovered] = useState(null)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  function buy(entry, i) {
    if (stock[i] <= 0) return
    // The parent is the authority on affordability — it owns the balance. Only
    // decrement the shelf if it actually took the money, so a rejected purchase
    // can never eat stock.
    if (onBuy(entry)) setStock(prev => prev.map((n, j) => (j === i ? n - 1 : n)))
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
      }}
    >
      <div style={{
        backgroundColor: bg,
        border: borderStyle,
        boxShadow: shadowStyle,
        padding: isDesktop ? '29px' : '24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: isDesktop ? '24px' : '20px',
        maxWidth: isDesktop ? '740px' : '560px', width: '94vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header — title, balance, close */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', position: 'relative' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>Pokémart</span>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: '#facc15' }}>
            ${speedCash}
          </span>
          <button
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
            aria-label="Close"
            // 44px touch target with the glyph offset so it doesn't visually
            // shift — the shared close-button pattern (see ItemNode).
            style={{
              fontFamily: 'Upheaval', fontSize: '18px', color: mutedColor,
              background: 'none', border: 'none', cursor: 'pointer',
              minWidth: '44px', minHeight: '44px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'absolute', top: '-10px', right: '-10px',
            }}
          >
            X
          </button>
        </div>

        {inventory.length === 0 ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
            Nothing in stock.
          </span>
        ) : (
          // Row on desktop, stack on mobile — three columns on a 375px screen
          // squeezes the type below its legibility floor (see UI_TOUCHUPS #1).
          <div style={{
            display: 'flex',
            flexDirection: isDesktop ? 'row' : 'column',
            gap: '10px',
            width: '100%',
          }}>
            {inventory.map((entry, i) => {
              const left = stock[i]
              const soldOut = left <= 0
              const tooPoor = speedCash < entry.price
              // Sold out is checked first: a sold-out entry stays visible and
              // greyed so the player can see what they missed, and "Sold Out"
              // is the more useful of the two reasons.
              const blocked = soldOut ? 'Sold Out' : tooPoor ? 'Not enough Speed Cash' : null
              const rarity = tierColor(entry.item)
              const isHovered = hovered === i
              return (
                <div
                  key={entry.item.id}
                  style={{
                    backgroundColor: innerBg,
                    border: `2px solid ${rarity}`,
                    opacity: soldOut ? 0.45 : 1,
                    padding: isDesktop ? '17px 12px' : '12px 14px',
                    display: 'flex',
                    flexDirection: isDesktop ? 'column' : 'row',
                    alignItems: 'center',
                    gap: isDesktop ? '8px' : '14px',
                    textAlign: isDesktop ? 'center' : 'left',
                    flex: isDesktop ? '1 1 0' : '0 0 auto',
                    minWidth: 0, width: '100%',
                  }}
                >
                  <img
                    src={itemIconUrl(entry.item)}
                    alt={entry.item.name}
                    style={{
                      width: isDesktop ? '68px' : '56px',
                      height: isDesktop ? '68px' : '56px',
                      imageRendering: 'pixelated',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? '8px' : '3px',
                    minWidth: 0, flex: 1,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: '8px',
                      width: '100%', justifyContent: isDesktop ? 'center' : 'space-between',
                    }}>
                      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '22px' : '17px', color: textColor }}>
                        {entry.item.name}
                      </span>
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: '#facc15', flexShrink: 0 }}>
                        ${entry.price}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'Orange Kid',
                      fontSize: isDesktop ? '21px' : '15px',
                      color: mutedColor,
                      textAlign: isDesktop ? 'center' : 'left',
                      lineHeight: 1.35,
                    }}>
                      {entry.item.description}
                    </span>
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor }}>
                      {left} in stock
                    </span>
                    {/* The reason has to be ON SCREEN, not in a title tooltip:
                        `title` never appears on touch. */}
                    {blocked && (
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444' }}>
                        {blocked}
                      </span>
                    )}
                    <button
                      onClick={() => buy(entry, i)}
                      disabled={!!blocked}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        fontFamily: 'Upheaval', fontSize: '13px',
                        color: textColor, border: borderStyle,
                        backgroundColor: bg, padding: '8px 20px',
                        minHeight: '44px',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                        opacity: blocked ? 0.4 : 1,
                        transform: !blocked && isHovered ? 'translateY(-2px)' : 'none',
                        transition: 'transform 0.1s',
                        marginTop: '4px',
                      }}
                    >
                      Buy
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: '13px',
            color: mutedColor, border: borderStyle,
            backgroundColor: innerBg, padding: '8px', cursor: 'pointer',
            width: '100%', minHeight: '44px',
          }}
        >
          Leave
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: `PokemartNode.jsx` reports zero errors. The component is not rendered anywhere yet — that is Task 6 — so there is no visual check in this task.

- [ ] **Step 3: Commit**

```bash
git add src/components/PokemartNode.jsx
git commit -m "feat(shop): add PokemartNode shop overlay"
```

---

## Task 6: Wire the mart into NodeMap

The last connection: icon, tooltip, click handler, overlay, purchase.

**Files:**
- Modify: `src/components/NodeMap.jsx` — imports (~line 8–29), `ITEM_ICONS` (~34), `pendingMart` state (~428), `handleNodeClick` (~697), `getNodeLabel` (~870), overlay render (~1366)

**Interfaces:**
- Consumes: `PokemartNode` (Task 5), `getShopInventory` (Task 3), `speedCash` / `onSpendCash` (Task 4), `onItemKeepInBag` (already an existing NodeMap prop — `App.handleItemKeepInBag`, which appends to the bag).
- Produces: nothing downstream.

- [ ] **Step 1: Imports and icon**

In `src/components/NodeMap.jsx`:

Add after the `import ItemNode from './ItemNode'` line (line 8):
```js
import PokemartNode from './PokemartNode'
```

Add after the `import { pickThreeItems, itemIconUrl } from '../game/items.js'` line (line 16):
```js
import { getShopInventory } from '../game/shop.js'
```

Add to the `ITEM_ICONS` map (line 34), after the `POKECENTER` entry:
```js
  [NODE_TYPES.POKEMART]:      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/max-potion.png',
```
The remote sprite URL matches how every other non-local node icon in this map is sourced. `getIcon` already falls through to `ITEM_ICONS[node.type]` for unknown types, so no change is needed there.

- [ ] **Step 2: Add the pending state**

After `const [pendingPower, setPendingPower] = useState(null)` (line 428):
```js
  const [pendingMart, setPendingMart] = useState(null)
```

- [ ] **Step 3: Handle the click**

In `handleNodeClick`, add a branch immediately **after** the `POKECENTER` branch (which ends at line 700 with `setCurrentNode(node.id)`) and before the `POWER_UPGRADE` branch:

```js
    } else if (node.type === NODE_TYPES.POKEMART) {
      setPendingMart({ node, inventory: getShopInventory(config, mapIndex) })
```

The node is **not** cleared here — the shop's `onClose` clears it, matching how `pendingItem` / `pendingPower` work. Clearing on open would let the player walk on while the shop is still up.

- [ ] **Step 4: Add the tooltip label**

In `getNodeLabel`'s `switch` (line ~865), add after the `POKECENTER` case:
```js
      case NODE_TYPES.POKEMART:      return { title: 'Pokémart', sub: 'Spend Speed Cash' }
```

- [ ] **Step 5: Render the overlay**

At the end of the returned JSX, after the closing `)}` of the `{pendingPower && (...)}` block (line ~1387) and before `</Layout>`:

```jsx
      {pendingMart && (
        <PokemartNode
          inventory={pendingMart.inventory}
          speedCash={speedCash}
          onBuy={entry => {
            // The App owns the balance, so IT decides whether the purchase is
            // affordable; the shop only reflects the answer. Bought items go
            // straight to the bag, exactly like an item node's "Keep in Bag".
            const paid = onSpendCash?.(entry.price)
            if (paid) onItemKeepInBag?.(entry.item)
            return !!paid
          }}
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingMart.node.id]))
            setCurrentNode(pendingMart.node.id)
            setPendingMart(null)
          }}
        />
      )}
```

- [ ] **Step 6: Lint and build**

Run: `npm run lint && npm run build`
Expected: `NodeMap.jsx` still at its 3-error baseline, no more. Build succeeds.

- [ ] **Step 7: Manual verification — the full spec checklist**

Run `npm run dev` and confirm every item:

1. Row 7 has a Pokécenter and a Pokémart, in random order, on **every** map of a full run.
2. Clicking the mart opens the shop; the balance in the header matches the map HUD.
3. With **≥ $150**: Buy debits exactly `150`, the Max Heal appears in the bag, and stock drops `2 → 1`.
4. Buying twice sells out: the card greys, reads `Sold Out`, and Buy is disabled.
5. With **< $150**: Buy is disabled and reads `Not enough Speed Cash`. Nothing is debited, stock does not move.
6. `Leave` and `X` both close the shop and clear the node; the player can then advance.
7. A Max Heal bought at the mart works from the bag exactly like a dropped one (drag onto a damaged Pokémon → heals and is consumed; onto a fainted one → kept, with the "has fainted — use a revive" notice).
8. Taking the mart means the Pokécenter is **not** reachable, and vice versa.
9. Check the shop at **375px** width: cards stack, no text below 12px, Buy is a 44px-tall target.
10. **Refresh the page mid-shop** (shop open, one Max Heal already bought). On reload the shop is closed and its node is un-cleared, so re-entering shows **full stock** — the bought Max Heal is gone from the bag too, because `persistProgress` only fires on map-progress change. Money, bag, and stock all roll back together, so this is consistent, not a duplicate. **Confirm the player did not keep the item while the money returned** — that would be the exploit.

- [ ] **Step 8: Commit**

```bash
git add src/components/NodeMap.jsx
git commit -m "feat(shop): wire Pokemart node into the map"
```

---

## Task 7: Show total earned on the run-end screen

Without this, `cashEarned` is tracked and never displayed, and the Elite Four's ~$920 of payouts stays invisible. This is the payoff for Task 4's second counter.

**Files:**
- Modify: `src/components/BattleCard.jsx` (component signature ~line 34, `DefeatScreen` call ~325, `DefeatScreen` signature ~744, its body)
- Modify: `src/components/NodeMap.jsx` (`<BattleCard>` ~1281)
- Modify: `src/components/EliteFour.jsx` (`<BattleCard>` ~238)

**Interfaces:**
- Consumes: `cashEarned` from Task 4.
- Produces: nothing downstream.

- [ ] **Step 1: Thread the prop through BattleCard**

In `src/components/BattleCard.jsx`, add `cashEarned = 0` to the component's props (line ~34), after `seedCode`.

Pass it on at the `DefeatScreen` render (line ~325):
```jsx
    <DefeatScreen roster={battleRoster} dark={dark} onRestart={onRestart} onMainMenu={onMainMenu} seedCode={seedCode} cashEarned={cashEarned} />
```

Add it to `DefeatScreen`'s signature (line ~744):
```js
function DefeatScreen({ roster, dark, onRestart, onMainMenu, seedCode, cashEarned = 0 }) {
```

- [ ] **Step 2: Render the total**

In `DefeatScreen`'s JSX, immediately after the `<SeedCodeChip .../>` line (~771):

```jsx
        {/* Total Speed Cash earned this run — the lifetime counter, so it is
            unaffected by anything spent at the Pokémart. This is the only
            place the Elite Four's payouts ever become visible: there is no
            mart in the gauntlet, so that money is otherwise unspendable. */}
        <span style={{ fontFamily: 'Orange Kid', fontSize: '17px', color: '#facc15' }}>
          Speed Cash earned: ${cashEarned}
        </span>
```

- [ ] **Step 3: Pass it from both run screens**

In `src/components/NodeMap.jsx`, add `cashEarned` to the component signature next to `speedCash` (from Task 4), and add to the `<BattleCard ...>` element (~1281):
```jsx
            cashEarned={cashEarned}
```

Do the same in `src/components/EliteFour.jsx` (signature + `<BattleCard>` at ~238).

In `src/App.jsx`, pass `cashEarned={cashEarned}` to both `<NodeMap>` and `<EliteFour>`, beside the existing `speedCash={speedCash}`.

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: `BattleCard.jsx` still at its 18-error baseline, no growth. Build succeeds.

- [ ] **Step 5: Manual verification**

Run `npm run dev`:

1. Earn some cash, then lose a battle. The defeat screen shows `Speed Cash earned: $X` matching the total earned.
2. Buy a Max Heal, then lose. The displayed total is **unchanged by the purchase** — it is lifetime earned, not the balance.
3. The number is legible in both light and dark themes.

- [ ] **Step 6: Commit**

```bash
git add src/components/BattleCard.jsx src/components/NodeMap.jsx src/components/EliteFour.jsx src/App.jsx
git commit -m "feat(economy): show total Speed Cash earned on the run-end screen"
```

---

## Task 8: Document the economy

**Files:**
- Modify: `docs/ITEMS.md`

**Interfaces:**
- Consumes: the final numbers from Task 1.
- Produces: nothing in code.

- [ ] **Step 1: Read the existing doc**

Read `docs/ITEMS.md` in full and match its heading depth, table style, and tone. Do not restructure it.

- [ ] **Step 2: Add a Pokémart section**

Append a new top-level section at the end of `docs/ITEMS.md`:

```markdown
## Pokémart & Speed Cash

Speed Cash (`$`) is a per-run currency. It is earned in battle, spent at the
Pokémart node (row 7, always paired with the Pokécenter), carried across maps,
and reset when a run starts or restarts. It is stored in the run-save `stats`
object — there is no Supabase column for it.

### Payouts

| Source | Speed Cash | Levels |
|---|---|---|
| Grass | $50 | 1 |
| Trainer | $30 | 2 |
| Rival | $60 | 4 |
| Gym leader | $120 | 2 + full heal |
| Legendary (Master Ball) | $250 | 2 |
| Elite Four member | $200 | 2 |
| Pokéball / Item / TM | $10 | — |

Money compensates for forgone levels: weaker XP pays better cash. Grass out-earns
trainers because trainers already pay double the levels, and levels compound.
Expected income is roughly **$293 per map** (floor $180, ceiling ~$420).

The $10 on non-fight nodes is the income floor — without it a map of all
Pokéball/Item/TM rows would pay only the boss's $120, less than one Max Heal.

**Legendary money is paid for winning, not catching** — declining the catch
still pays $250. A mystery node pays whatever type it resolves into.

Node tooltips show the payout beside the level reward, so the grass-versus-
trainer tradeoff is visible rather than learned by accident.

Two counters are tracked: the spendable balance, and total ever earned this run
(shown on the run-end screen, unaffected by purchases).

### Shop

| Item | Price | Stock per shop |
|---|---|---|
| Max Heal | $150 | 2 |

Purchases go straight to the bag. A sold-out entry stays visible and greyed.

Inventory is authored per region: `shopGeneric` (offered at every map) plus
`shopPools[mapIndex]` (curated per map, currently empty). Both are arrays of
item ids; price and stock come from `BALANCE.economy`. See `src/game/shop.js`.

All numbers live in `src/game/balance.js` under `economy`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ITEMS.md
git commit -m "docs: document the Pokemart and Speed Cash economy"
```

---

## Task 9: Persist total earned to Supabase

The `runs.speed_cash_earned` column **already exists in the live project** — it was applied and verified on 2026-07-28 (integer, not null, default 0). This task only writes to it.

**Files:**
- Modify: `supabase/runs_tracking.sql` (record the column so the file stays the schema's source of truth)
- Modify: `src/App.jsx` (`recordRunEnd`, ~line 275-301)
- Modify: `src/components/Stats.jsx` (display)

**Interfaces:**
- Consumes: `cashEarned` from Task 4.
- Produces: nothing downstream.

- [ ] **Step 1: Record the column in the SQL file**

The column is already live; this keeps `supabase/runs_tracking.sql` accurate for anyone rebuilding the schema. In the `alter table public.runs` block (line ~13-22), add before the `winning_roster` line:

```sql
  add column if not exists speed_cash_earned   integer not null default 0,
```

Do **not** re-run the file expecting a change — `add column if not exists` is a no-op for both this and `pokemon_seen_shiny_ids`.

- [ ] **Step 2: Write the field on run end**

In `src/App.jsx`, in `recordRunEnd`'s `payload` object (line ~280-288), add after `pokemon_seen_shiny_ids`:

```js
      speed_cash_earned: cashEarned,
```

Store the **lifetime earned** total, not the ending balance: the balance is an artifact of when the player last shopped and says nothing about how the run went.

- [ ] **Step 3: Surface insert failures**

This is the bug-prevention half of the task. `recordRunEnd` currently ignores its insert error (line ~301), while `recordCatch` (line ~345) and `recordBadgeEarned` (line ~393) both `console.warn`. That silence hid a real outage: `pokemon_seen_shiny_ids` was added to this payload before the column existed in the live project, so **every run-end insert failed silently** until the column was applied on 2026-07-28.

Replace line ~301:
```js
    await supabase.from('runs').insert(payload)
```
with:
```js
    // A missing column rejects the WHOLE insert, so a schema drift silently
    // stops all run tracking. This warn is what makes that visible — it was
    // absent when `pokemon_seen_shiny_ids` shipped ahead of its column, and
    // every run-end write failed unnoticed until the column was added.
    const { error: runErr } = await supabase.from('runs').insert(payload)
    if (runErr) console.warn('recordRunEnd insert failed:', runErr.message)
```

Matches the existing pattern in `recordCatch` / `recordBadgeEarned`. Never blocks the run.

- [ ] **Step 4: Show lifetime earnings on the Stats page**

Read `src/components/Stats.jsx` first and match its existing stat-row markup and aggregation style exactly — it already sums columns across the user's `runs` rows (see the query at line ~73). Add `speed_cash_earned` to that select, sum it, and render one row labelled `Speed Cash earned` with the value formatted as `$1,240` (leading symbol, thousands separators via `toLocaleString()`).

If the existing query selects specific columns, add this one to the list. **Do not** add a retry-without-column fallback here — the column is verified present, and the fallback in `Pokedex.jsx` exists only because that bug predates the fix.

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: `App.jsx` at its 1-error baseline, no growth. Build succeeds.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, logged in:

1. Play a run, earn cash, lose. Open Stats — `Speed Cash earned` reflects the run.
2. Check the browser console during run-end: **no** `recordRunEnd insert failed` warning.
3. Play a second run. The Stats total is the sum of both, not just the latest.
4. Buying at the mart does not reduce the recorded total.

- [ ] **Step 7: Commit**

```bash
git add supabase/runs_tracking.sql src/App.jsx src/components/Stats.jsx
git commit -m "feat(economy): persist Speed Cash earned to runs, surface insert errors"
```

---

## Known gaps (deliberate, not defects)

State these plainly if asked; do not "fix" them without a new decision.

1. **Seeded runs change, breaking AGENTS.md:49.** Task 2 removes a `randomNode` call from row 7, shifting the rng stream. The same seed yields a different run before and after deploy. The daily challenge is the real cost: a mid-day deploy puts morning and afternoon players on different maps for one date and one leaderboard. **Signed off by the user.** Do not attempt to preserve the stream with throwaway `rng()` calls — the old call count was variable (1–2), so no fixed burn realigns it. **Mitigation: deploy at UTC midnight**, when the daily seed rolls over.
2. **Curated shop pools are empty.** `shopPools` arrays exist and resolve correctly but contain nothing. Filling them is a separate authoring pass.
3. **No selling.** Items cannot be sold back for cash.
4. **No mart in the Elite Four.** The stage is a linear gauntlet. The HUD shows the balance and members still pay $200, but nothing there spends it — the payout surfaces only through `cashEarned` on the run-end screen.
5. **Stock does not persist across a page refresh.** A shop's remaining stock is local component state, and the node is only cleared on close. A mid-shop refresh restores the shop unentered at full stock — but the purchase's money and item roll back with it, so nothing is duplicated. Verified in Task 6 Step 7.10.
6. **Map 8's fork is degenerate.** A gym win already full-heals, so on the final map the Pokécenter is nearly worthless while the mart's two Max Heals carry into the Elite Four. The mart strictly dominates row 7 there. Knowingly shipped; revisit after play-testing.
7. **No money on the win screen.** `cashEarned` is shown on the defeat screen (`DefeatScreen`). `VictoryScreen` is a lean "Victory! / Continue" popup and was left alone. A winning player sees the total only if they lose a later run.
