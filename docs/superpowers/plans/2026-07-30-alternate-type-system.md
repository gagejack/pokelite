# Alternate-Type System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An authored table that names the correct attacking type for every dual-type Pokémon, plus two items built on the same primitive — a held item that swaps the move (reversible) and a consumed item that fully retypes the Pokémon (permanent).

**Architecture:** A 162-row table (`src/game/attackTypes.js`) keys each dual-type species to its attacking type. `attackTypeFor(id, types)` is the single entry point — it short-circuits on single-type input so a Type-Prism'd mon stays retyped. `alternateTypeFor(id, types)` returns the other type. Both items are inert on the 209 single-type species and kept rather than spent in that case. The Polarity Band rebuilds the move at equip time rather than during battle, so the displayed move name always matches the damage it deals. The Type Prism changes both offense and defense — removing a 4× weakness in exchange for resistances is the trade that makes it legendary.

**Tech Stack:** React 19, Vite, Supabase JS v2, inline `style={{}}` for layout (Tailwind classes only for `hover:`/`transition:` — this codebase's convention), no test framework.

## Global Constraints

Copy these verbatim; every task inherits them.

- **The table is hand-tuned, not scored.** Pure scoring flips 79 of 162 entries and gets several badly wrong (Charizard→Flying, Blaziken→Fighting, Swampert→Ground). Each row starts from the canonical primary type, except where that primary is Normal — Normal has zero super-effective matchups, so a normal/X species always attacks as X.
- **Rows where the other type scores higher carry a tradeoff comment** — `// ground scores higher (5 vs 2)` — so re-picking one is a one-word edit with the reasoning already sitting next to it.
- **Missing row = `types[0]`.** No error, no fallback scoring. A new region's dual-type species work on day one without an authoring step, just incorrectly.
- **`attackTypeFor` short-circuits on single-type input.** A prismed Swampert (types: `['ground']`) returns `'ground'` despite the table saying `'water'`. This is what makes the Type Prism permanent — no later TM or evolution can drag it back.
- **The Polarity Band rebuilds the move at EQUIP TIME** in `moveItem` and `handleItemAssign`. Not during battle. The UI must show Bulldoze, not "Bubble Beam dealing Ground damage." Move tier survives the swap.
- **Battle owes the Band only ×1.25** (`BALANCE.battle.heldItems.polarityBand`). The retype already happened before the fight.
- **The Type Prism is a consumable**, not a held item. It is consumed on use, irreversible, and its `consumable: 'retype'` routes through `applyConsumable`.
- **Both items are inert on single-types** — `alternateTypeFor` returns null, both paths refuse with `used: false`, and the item is kept.
- **Item whitelists use `isRosterConsumable(item)`** from `src/game/items.js`, not inline arrays. The old `['heal', 'revive', 'revive_all']` triples had already started to drift.
- **Numbers live in `src/game/balance.js`** under `battle.heldItems.polarityBand`. No gameplay number hardcoded in a component.
- **Never render Upheaval or Orange Kid below 12px** — they are pixel display faces that stop resolving (see `docs/UI_TOUCHUPS.md`).
- **Pre-existing lint baselines — count ERRORS, not eslint's bundled "N problems" total** (which includes warnings). Whole repo: **42 errors, 5 warnings**. Per file: `Stats.jsx` 8, `Roster.jsx` 3, `App.jsx` 1, `NodeMap.jsx` 3, `BattleCard.jsx` 18, `DailyChallenge.jsx` 2. Do not let these grow and do not "fix" them.
- **Verification is `npm run lint`, `npm run build`, and a Node check of the pure module.** No test framework exists; never add one.
- **Commit after every task** with the message given in that task's final step.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/game/attackTypes.js` | The 162-row table + `attackTypeFor` / `alternateTypeFor`. Leaf. |
| `docs/superpowers/specs/2026-07-30-alternate-type-system-design.md` | Design spec (already written). |

**Modified:**

| File | Change |
|---|---|
| `src/game/pokemon.js` | `attackTypeFor` replaces `types[0]` at 3 move-assignment sites; new `retypeMove` and `applyTypePrism` helpers. |
| `src/game/items.js` | Both item definitions + `isRosterConsumable` + `ROSTER_CONSUMABLES`. |
| `src/game/balance.js` | `polarityBand: 1.25` under `battle.heldItems`. |
| `src/game/battle.js` | Band ×1.25 branch in `calcDamage`. |
| `src/App.jsx` | Band equip/unequip retype in `moveItem` and `handleItemAssign`; Prism in `applyConsumable`. |
| `src/components/NodeMap.jsx` | Band retype branch in bag-drop and item-offer; import `isRosterConsumable`. |
| `src/components/EliteFour.jsx` | Band retype branch in bag-drop; import `isRosterConsumable`. |
| `src/components/ItemNode.jsx` | "No alternate type" guard for the Prism. |
| `docs/ITEMS.md` | Both items documented; alternate-types section added; consumable count bumped. |

---

## Task 1: The attacking-type table

Every downstream task depends on this. The table replaces `types[0]` at all three move-assignment sites, and both items read `alternateTypeFor` from it.

**Files:**
- Create: `src/game/attackTypes.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```js
  export const ATTACK_TYPE          // { [pokeId]: type }, 162 rows
  export function attackTypeFor(pokeId, types)  // chosen attacking type
  export function alternateTypeFor(pokeId, types)  // the other type, or null
  ```
  `attackTypeFor` short-circuits on single-type input: `types.length === 1` → return `types[0]`. This is what makes the Type Prism permanent.

- [ ] **Step 1: Generate the table**

For every dual-type species in `public/data/pokedex.json`, pick an attacking type:

- Default: `types[0]` — the canonical primary type.
- **Exception:** if `types[0] === 'normal'`, pick `types[1]`. Normal has zero super-effective matchups; the other type always has more.
- Mark every row where the other type scores higher with a comment: `// ground scores higher (5 vs 2)`.

Result: 162 rows keyed by dex id, with the species name and its two types in the comment so a reader never has to cross-reference the dex.

```js
export const ATTACK_TYPE = {
  1:   'grass',     // bulbasaur — grass/poison
  16:  'flying',    // pidgey — normal/flying
  31:  'poison',    // nidoqueen — poison/ground  // ground scores higher (5 vs 2)
  ...
}
```

- [ ] **Step 2: Write `attackTypeFor` and `alternateTypeFor`**

```js
export function attackTypeFor(pokeId, types) {
  if (!types || types.length === 1) return types?.[0] ?? 'normal'
  return ATTACK_TYPE[pokeId] ?? types[0]
}

export function alternateTypeFor(pokeId, types) {
  if (!types || types.length < 2) return null
  const chosen = attackTypeFor(pokeId, types)
  return types.find(t => t !== chosen) ?? null
}
```

The short-circuit on `types.length === 1` is load-bearing: a prismed Swampert has `['ground']` and must never resolve to `'water'` from the table.

- [ ] **Step 3: Verify the table**

Write this to a scratch file and run with `node`:

```js
import { readFileSync } from 'fs'
import { ATTACK_TYPE, attackTypeFor, alternateTypeFor } from './src/game/attackTypes.js'
import { TYPE_CHART } from './src/game/typeChart.js'
const dex = JSON.parse(readFileSync('./public/data/pokedex.json','utf8')).pokemon
const types = Object.keys(TYPE_CHART)
const se = t => types.filter(d => (TYPE_CHART[t]?.[d] ?? 1) > 1).length

let fails = 0
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}

// Every entry names a type the species actually has.
for (const [id, t] of Object.entries(ATTACK_TYPE)) {
  const p = dex[id]
  if (!p) { console.log('FAIL  id', id, 'not in dex'); fails++; continue }
  if (!p.types.includes(t)) { console.log('FAIL ', p.apiName, t, p.types.join('/')); fails++ }
}
chk('all entries belong to their species', true, fails === 0)

// Every dual-type species is covered.
const dual = Object.values(dex).filter(p => p.types?.length === 2)
const missing = dual.filter(p => !ATTACK_TYPE[p.pokeId])
chk('dual-type species uncovered', missing.length, 0)

// No dual-type attacks as Normal.
const stuck = dual.filter(p => attackTypeFor(p.pokeId, p.types) === 'normal')
chk('dual-types still attacking as normal', stuck.length, 0)

// Fallbacks.
chk('single-type charmander 4', attackTypeFor(4, ['fire']), 'fire')
chk('unknown id 9999', attackTypeFor(9999, ['water','ice']), 'water')
chk('no types at all', attackTypeFor(9999, undefined), 'normal')
chk('alternate of single', alternateTypeFor(5, ['fire']), null)
chk('alternate of pidgey', alternateTypeFor(16, ['normal','flying']), 'normal')

// The originally reported bug.
chk('pidgey attacks flying', attackTypeFor(16, ['normal','flying']), 'flying')
chk('spearow attacks flying', attackTypeFor(21, ['normal','flying']), 'flying')

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`)
```

All 10 checks pass (the first aggregates the 162-row loop — any bad entry prints its own FAIL line above it). Delete the scratch file.

- [ ] **Step 4: Lint and build**

Zero errors on the new file. Build clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/attackTypes.js
git commit -m "feat(types): add the dual-type attacking-type table"
```

---

## Task 2: Wire the table into move assignment

Three sites currently read `types[0]` to pick a move. Replace all three with `attackTypeFor(id, types)`.

**Files:**
- Modify: `src/game/pokemon.js`
- Modify: `src/components/NodeMap.jsx`

**Interfaces:**
- Consumes: `attackTypeFor` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Import and wire in `pokemon.js`**

Add the import:
```js
import { attackTypeFor } from './attackTypes.js'
```

Site 1 — `buildPokemonInstance` (the main spawn path), change:
```js
// before
const move = getTypeMove(base.types[0], tierForLevel(level))
// after
const move = getTypeMove(attackTypeFor(base.pokeId, base.types), tierForLevel(level))
```

Site 2 — evolution (re-picks the move, since evolving can change typing), change:
```js
// before
move: getTypeMove(evolvedBase.types[0], preservedTier),
// after
move: getTypeMove(attackTypeFor(evolvedBase.pokeId, evolvedBase.types), preservedTier),
```

Site 3 — the TM node reroll is in `NodeMap.jsx`, not `pokemon.js` — see Step 2.

- [ ] **Step 2: Wire the TM node in `NodeMap.jsx`**

The TM node reroll (around `NodeMap.jsx:1500`) raises a move's tier by rebuilding it. It MUST use `attackTypeFor` here too — a rebuild with `types[0]` would silently revert a Pidgey's move to Normal, undoing this whole feature the first time anyone uses a TM:

```js
// before
return { ...p, move: getTypeMove(p.types[0], nextTier) }
// after
return { ...p, move: getTypeMove(attackTypeFor(p.pokeId, p.types), nextTier) }
```

A tier boost is not a type change, but it IS a rebuild — and every rebuild must ask the table. Add the import:

```js
import { attackTypeFor } from '../game/attackTypes.js'
```

- [ ] **Step 3: Verify real spawns**

```js
// scratch: verify-spawns.mjs
import { fetchPokemonBase, buildPokemonInstance } from './src/game/pokemon.js'

for (const id of [16, 21, 6, 1, 25, 130]) {
  const b = await fetchPokemonBase(id)
  const i = buildPokemonInstance(b, 30)
  console.log(`${i.name.padEnd(12)} ${i.types.join('/').padEnd(16)} move: ${i.move.name.padEnd(16)} (${i.move.type})`)
}
```

Expected:
```
pidgey       normal/flying   move: wing-attack     (flying)
spearow      normal/flying   move: wing-attack     (flying)
charizard    fire/flying     move: flamethrower    (fire)
bulbasaur    grass/poison    move: razor-leaf      (grass)
pikachu      electric        move: spark           (electric)
gyarados     water/flying    move: bubble-beam     (water)
```

Pidgey and Spearow now use Wing Attack instead of a Normal move, while Charizard keeps Flamethrower.

Existing saves keep their baked-in moves — this applies to newly spawned Pokémon, including enemy teams.

- [ ] **Step 4: Lint and build**

`pokemon.js` zero errors. `NodeMap.jsx` at its 3-error baseline. Build clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/pokemon.js src/components/NodeMap.jsx
git commit -m "fix(types): dual-type Pokemon attack with the right type"
```

---

## Task 3: Polarity Band (held item, move retype)

A rare held item that swaps the move to the alternate type, with +25% damage. Reversible on unequip/swap.

**Files:**
- Modify: `src/game/balance.js`
- Modify: `src/game/items.js`
- Modify: `src/game/pokemon.js`
- Modify: `src/game/battle.js`
- Modify: `src/App.jsx`
- Modify: `src/components/NodeMap.jsx`
- Modify: `src/components/EliteFour.jsx`

**Interfaces:**
- Consumes: `alternateTypeFor` (Task 1), `getTypeMove` + `tierForLevel` from `typeMoves.js`.
- Produces: `retypeMove(instance, active)` — rebuilds the move for the alternate type when active, restores it when `active: false`.

- [ ] **Step 1: Add the balance knob**

In `src/game/balance.js`, under `battle.heldItems`:
```js
polarityBand: 1.25,
```

- [ ] **Step 2: Define the item**

In `src/game/items.js`:
```js
{ id: 'polarity_band', name: 'Polarity Band', description: "Move uses the Pokémon's alternate type, +25% damage", tier: 'rare', icon: 'ability-urge', retype: 'move' },
```

Sprite: `ability-urge` from PokéAPI. Verify it resolves (HTTP 200).

- [ ] **Step 3: Write `retypeMove` in `pokemon.js`**

```js
import { getTypeMove, tierForLevel } from './typeMoves.js'
import { attackTypeFor, alternateTypeFor } from './attackTypes.js'

// Rebuild the move for the alternate type (band on) or restore the authored
// attacking type (band off). The move's TIER is preserved: TM upgrades are
// progress the player paid for and must survive an item swap. A single-type
// Pokémon has no alternate, so equipping returns it untouched — the band is
// inert rather than broken.
export function retypeMove(pokemon, on) {
  if (!pokemon) return pokemon
  const tier = pokemon.move?.tier ?? tierForLevel(pokemon.level)
  const alt = alternateTypeFor(pokemon.pokeId, pokemon.types)
  if (on && !alt) return pokemon
  const type = on ? alt : attackTypeFor(pokemon.pokeId, pokemon.types)
  return { ...pokemon, move: getTypeMove(type, tier) }
}
```

The restore branch asks `attackTypeFor`, not `types[0]` — a normal/flying bird's "original" attacking type was already Flying from the table, so restoring must consult the table too or the band coming off would break what the band never touched.

- [ ] **Step 4: The ×1.25 in battle**

In `src/game/battle.js`, in `calcDamage`, add after the existing attacker-side items:
```js
if (aItem === 'polarity_band') itemDmg *= HI.polarityBand
```

- [ ] **Step 5: Retype at equip time in `App.jsx`**

In `moveItem`, the single funnel for every equip/unequip/swap — rebuild the move **inside the `setRoster` updater** (pure transform, StrictMode-safe). FOUR cases must fire, not two: the band arriving, the band departing from a source Pokémon, **and both displaced-item paths** — a band swapped off for another item must release its retype, or the move stays stuck at the alternate type on a Pokémon no longer holding the band:

```js
setRoster(prev => prev.map((p, i) => {
  let next = p
  if (from.kind === 'pokemon' && i === from.pokeIndex) {
    next = { ...next, heldItem: null }
    if (item.retype === 'move') next = retypeMove(next, false)          // band leaves source
  }
  if (to.kind === 'pokemon' && i === to.pokeIndex) {
    if (displaced?.retype === 'move') next = retypeMove(next, false)    // displaced band releases
    next = { ...next, heldItem: item }
    if (item.retype === 'move') next = retypeMove(next, true)           // band arrives
  }
  return next
}))
```

In `handleItemAssign`, the equip-from-offer path that bypasses `moveItem` — same logic, including releasing the swapped-out band:

```js
setRoster(prev => prev.map((p, i) => {
  if (i !== pokemonIndex) return p
  let next = p
  if (swapBackItem?.retype === 'move') next = retypeMove(next, false)
  next = { ...next, heldItem: item }
  if (item?.retype === 'move') next = retypeMove(next, true)
  return next
}))
```

- [ ] **Step 6: Retype at the two drop sites**

In `NodeMap.jsx` and `EliteFour.jsx`, after the existing consumable/evolve branches, add a Band-retention branch:

```js
// Polarity Band — rebuilding the move is on equip, so dropping it from the bag
// just needs the equip path to fire. The item is kept on a single-type target
// since retypeMove is a no-op there (no alternate).
if (item?.retype === 'move' && to.kind === 'pokemon') {
  onMoveItem?.({ item, from, to: { kind: 'pokemon', pokeIndex: to.pokeIndex } })
  return
}
```

- [ ] **Step 7: Extract `isRosterConsumable`**

Three files have drifted copies of `['heal', 'revive', 'revive_all'].includes(item?.consumable)`. Extract into `items.js`:

```js
export const ROSTER_CONSUMABLES = ['heal', 'revive', 'revive_all', 'retype']
export const isRosterConsumable = item => ROSTER_CONSUMABLES.includes(item?.consumable)
```

Replace all three inline checks in `NodeMap.jsx` and `EliteFour.jsx` with `isRosterConsumable(item)`. The `'retype'` kind is included now — Task 4's Type Prism rides on it without another edit here.

- [ ] **Step 8: Node-verify the band**

```js
// scratch: verify-band.mjs
import { fetchPokemonBase, buildPokemonInstance, retypeMove } from './src/game/pokemon.js'

const show = p => `${p.name} [${p.types.join('/')}] move=${p.move.name}(${p.move.type}) t${p.move.tier}`

// Swampert — band on → Bulldoze, band off → Bubble Beam.
const sw = buildPokemonInstance(await fetchPokemonBase(260), 40)
console.log('before :', show(sw))
const on = retypeMove(sw, true)
console.log('band on:', show(on))
const off = retypeMove(on, false)
console.log('band off:', show(off))
console.log('reverted:', off.move.type === sw.move.type)

// Pidgey — band on → Headbutt, band off → Wing Attack.
const py = buildPokemonInstance(await fetchPokemonBase(16), 40)
console.log('\npidgey :', show(py))
console.log('band on:', show(retypeMove(py, true)))

// Pikachu — single-type, inert.
const pi = buildPokemonInstance(await fetchPokemonBase(25), 40)
const piOn = retypeMove(pi, true)
console.log('\npikachu:', show(pi))
console.log('band on:', show(piOn))
console.log('inert:', piOn.move.type === pi.move.type)

// TM tier preserved.
const sw4 = buildPokemonInstance(await fetchPokemonBase(260), 40)
sw4.move = { ...sw4.move, tier: 4 }
console.log('\ntier-4 band on:', retypeMove(sw4, true).move.tier, '(expect 4)')
```

Expected: Swampert swaps and reverts cleanly. Pidgey gets Headbutt. Pikachu unchanged. Tier 4 survives.

Delete scratch file.

- [ ] **Step 9: Lint and build**

`pokemon.js` zero errors. `items.js` zero errors. `battle.js` zero errors. `App.jsx` at its 1-error baseline. `NodeMap.jsx` at its 3-error baseline. `EliteFour.jsx` zero errors. Build clean.

- [ ] **Step 10: Commit**

```bash
git add src/game/balance.js src/game/items.js src/game/pokemon.js src/game/battle.js src/App.jsx src/components/NodeMap.jsx src/components/EliteFour.jsx
git commit -m "feat(items): add Polarity Band"
```

---

## Task 4: Type Prism (consumed, full retype)

A legendary consumable that collapses a dual-type Pokémon onto its alternate type. Permanent and irreversible.

**Files:**
- Modify: `src/game/items.js`
- Modify: `src/game/pokemon.js`
- Modify: `src/App.jsx`
- Modify: `src/components/ItemNode.jsx`

**Interfaces:**
- Consumes: `alternateTypeFor` (Task 1), `attackTypeFor` (Task 1), `getTypeMove` (typeMoves.js).
- Produces: `applyTypePrism(roster, index)` — same `{ roster, used }` contract as the healing helpers.

- [ ] **Step 1: Define the item**

In `src/game/items.js`:
```js
{ id: 'type_prism', name: 'Type Prism', description: "Permanently changes a Pokémon to its alternate type", tier: 'legendary', icon: 'griseous-orb', consumable: 'retype' },
```

Sprite: `griseous-orb`. Verify it resolves (HTTP 200).

- [ ] **Step 2: Write `applyTypePrism` in `pokemon.js`**

```js
export function applyTypePrism(roster, index) {
  const target = roster[index]
  if (!target) return { roster, used: false }
  const alt = alternateTypeFor(target.pokeId, target.types)
  if (!alt) return { roster, used: false }

  return {
    roster: roster.map((p, i) => i === index ? {
      ...p,
      types: [alt],
      // Preserve the move's TIER (set by TM nodes, not by level) while retyping
      // it — the same rule evolution follows.
      move: getTypeMove(alt, p.move?.tier ?? tierForLevel(p.level)),
    } : p),
    used: true,
  }
}
```

`types` collapses to `[alt]` — a single-element array. The move is rebuilt from `alt` directly: on a single-type array `attackTypeFor` short-circuits to `types[0]`, which IS `alt`, so consulting the table here would be an indirection that returns its own input. The short-circuit is what keeps the mon retyped through later TMs and evolutions: the table says Swampert attacks as Water, but `attackTypeFor` sees `types.length === 1` and returns `'ground'` instead.

- [ ] **Step 3: Wire into `applyConsumable`**

In `src/App.jsx`, add `'retype'` to the dispatch map in `applyConsumable`:

```js
function applyConsumable(item, pokeIndex) {
  const apply = {
    heal:       r => healOne(r, pokeIndex),
    revive:     r => reviveOne(r, pokeIndex),
    revive_all: r => reviveAll(r),
    retype:     r => applyTypePrism(r, pokeIndex),
  }[item?.consumable]
  if (!apply) return false
  const { used } = apply(roster)
  if (used) setRoster(prev => apply(prev).roster)
  return used
}
```

- [ ] **Step 4: Add the ItemNode guard**

In `src/components/ItemNode.jsx`, in the `blocked` closure, add one check covering BOTH the prism and the band — a band offered to a single-type is just as dead a tap:

```js
if ((c === 'retype' || selectedItem.retype === 'move')
    && !alternateTypeFor(pokemon.pokeId, pokemon.types)) {
  return 'Only one type — nothing to swap'
}
```

Import `alternateTypeFor` from `../game/attackTypes.js` (NOT `pokemon.js` — it lives in the table module).

- [ ] **Step 5: Node-verify the prism**

```js
// scratch: verify-prism.mjs
import { fetchPokemonBase, buildPokemonInstance, applyTypePrism } from './src/game/pokemon.js'
import { attackTypeFor } from './src/game/attackTypes.js'

const show = p => `${p.name} [${p.types.join('/')}] move=${p.move.name}(${p.move.type})`

// Swampert → pure Ground.
const sw = buildPokemonInstance(await fetchPokemonBase(260), 40)
const { roster: [swGround], used } = applyTypePrism([sw], 0)
console.log('swampert:', show(sw))
console.log('  prismd:', show(swGround), '| used:', used)

// Gyarados → pure Flying.
const gy = buildPokemonInstance(await fetchPokemonBase(130), 40)
const { roster: [gyFly] } = applyTypePrism([gy], 0)
console.log('gyarados:', show(gy))
console.log('  prismd:', show(gyFly))

// Pikachu — single-type, refused.
const pi = buildPokemonInstance(await fetchPokemonBase(25), 40)
const out = applyTypePrism([pi], 0)
console.log('pikachu used:', out.used, '(expect false)')

// Prismed mon stays retyped through attackTypeFor.
console.log('\nattackTypeFor on prismed swampert:', attackTypeFor(swGround.pokeId, swGround.types), '(expect ground)')
console.log('attackTypeFor on table for swampert:', 'water', '(table says water — short-circuit must override)')
```

Expected: Swampert → `[ground]` with Bulldoze, Gyarados → `[flying]` with Wing Attack, Pikachu refused, `attackTypeFor` returns `'ground'` not `'water'`.

Delete scratch file.

- [ ] **Step 6: Lint and build**

`pokemon.js` zero errors. `items.js` zero errors. `App.jsx` at its 1-error baseline. `ItemNode.jsx` zero errors. Build clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/items.js src/game/pokemon.js src/App.jsx src/components/ItemNode.jsx
git commit -m "feat(items): add Type Prism"
```

---

## Task 5: Document everything

ITEMS.md carries the reference table; both items plus the alternate-type mechanics get documented. **Note:** this was already committed alongside the code in this session — if ITEMS.md already shows rare 14 @ 1.79%, legendary 5 @ 1.00%, both item rows, and the "Alternate types" section, this task is verify-only: run Step 5's check and skip the rest.

**Files:**
- Modify: `docs/ITEMS.md`

- [ ] **Step 1: Update tier counts**

Rare goes 13→14 (Polarity Band). Legendary goes 4→5 (Type Prism) — the tier was at 4 because Evolve Stone moved down to rare in an earlier change, not because anything was deleted; Weakness Policy was reworked but remains in the tier.

Update the summary table and section headers with correct counts and per-slot percentages, verified against `itemOdds()`.

- [ ] **Step 2: Add the item rows**

Polarity Band in the Rare table, Type Prism in the Legendary table. Follow existing row format.

- [ ] **Step 3: Add the "Alternate types" section**

Document the primitive (`attackTypeFor` / `alternateTypeFor`), the scope table (Band: move only, reversable; Prism: full mon, permanent), the defensive trade example (Swampert's 4×→resist swap), and the contract (both inert on single-types, kept rather than spent).

- [ ] **Step 4: Bump consumable count**

The "There are five" line → six (`evolve_stone`, `rare_candy`, `type_prism`, `max_heal`, `max_revive`, `mega_revive`).

- [ ] **Step 5: Verify docs against code**

Every tier count and percentage checked against `itemOdds()`, not recomputed by hand. All agree.

- [ ] **Step 6: Commit**

```bash
git add docs/ITEMS.md
git commit -m "docs: document Polarity Band, Type Prism, and alternate-type system"
```

---

## Known gaps (deliberate, not defects)

State these plainly if asked; do not "fix" them without a new decision.

1. **8 authoring decisions unresolved.** 61 table rows carry a tradeoff comment; 8 of those are genuinely debatable (e.g. Nidoqueen → Ground, Lapras → Ice). They are left at the canonical type with the comment as a prompt.
2. **No validation step on `build:dex`.** A new region's dual-type species have no table entries and attack as `types[0]` until authored. The build script does not check this.
3. **Prism'd Pokémon have no visible history.** Nothing marks a Swampert as "was once Water." The type change is silent — stats, sprite, and name are unchanged.
4. **Band equip paths are a closed set.** `moveItem` and `handleItemAssign` both retype. A third equip path added later would miss this.
5. **Single-type short-circuit masks table bugs.** If a row names a type the species doesn't have, nobody notices until someone equips a Band and the move doesn't change.
6. **Existing saves keep their baked-in moves.** The table only applies to newly spawned Pokémon. A saved run's Pidgeot still attacks as Normal.
