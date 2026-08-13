# Mega Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rare Mega Stone map node that lets the player mega-evolve an
eligible roster Pokémon — new sprite, real PokéAPI stats, and (for 9
species) a new typing — for as long as the stone stays equipped, plus a new
animated "flashing sprite" evolution popup that replaces the old static one
everywhere a Pokémon's form changes.

**Architecture:** A build-time script fetches all ~44 official mega forms
from PokéAPI into a new local `public/data/megas.json`, mirroring the
existing `pokedex.json` pattern. Mega state is baked directly onto the
roster instance (not derived live from `heldItem` each render), the same
convention `buildEvolvedInstance` already uses for real evolutions —
equipping/unequipping the Mega Stone rewrites `types`/`stats`/`sprite`/
`move` on the instance and stashes a `_megaBase` snapshot to restore on
unequip. The node itself follows the existing `PowerUpgradeNode.jsx`
roster-list template, and spawns via a map-ramped override in `randomNode`
mirroring how Master Ball overrides a Pokéball roll.

**Tech Stack:** React (Vite), Vitest, plain JS (no TypeScript), PokéAPI as
the data source, existing region/balance config system.

## Global Constraints

- Mega eligibility is independent of catchability — species data is baked
  in for all ~44 official mega-eligible species regardless of whether
  they're in any region's catch pool.
- No changes to region catch pools, `maps: []`, or any region file.
- Mega persists for the whole run once equipped (not battle-only), reverts
  instantly when the stone is unequipped.
- Mega Stone shares the existing single held-item slot — it is a normal
  held item, NOT a second slot, and NOT part of the general item-drop pool
  (`ITEMS`/`pickThreeItems`) — obtainable only from the `MEGA_STONE` node.
- Real PokéAPI mega base stats and types are used as-is, no scaling.
- Mega Stone node: 0% before map index 2 (map 3), flat 3% from map 3 on,
  capped at one spawn per run.
- The new animated evolution popup replaces `EvolutionNotice.jsx` entirely,
  used for both real species evolutions and Mega Stone equip.
- Multiple simultaneous evolutions now play as sequential animated popups,
  one after another, not stacked in one static card.

---

## File Structure

**New files:**
- `scripts/buildMegaData.mjs` — build-time PokéAPI fetch, writes `public/data/megas.json`.
- `src/game/megas.js` — runtime mega-data loading, eligibility checks, equip/revert transforms.
- `src/components/MegaStoneNode.jsx` — the "Mega Evolve" roster popup.
- `src/components/MegaFormChoice.jsx` — X/Y branch picker sub-screen (Charizard, Mewtwo).
- `src/components/EvolutionAnimation.jsx` — new flashing-sprite popup, replaces `EvolutionNotice.jsx`.
- `src/game/megas.test.js` — unit tests for eligibility, equip/revert, spawn chance.

**Modified files:**
- `src/game/attackTypes.js` — 9 new `ATTACK_TYPE` rows keyed by mega form id.
- `src/game/pokemon.js` — `currentMoveType`/`retypeMove` become mega-form-aware.
- `src/game/items.js` — new standalone `MEGA_STONE_ITEM` export (not in `ITEMS`).
- `src/game/nodeMap.js` — new `NODE_TYPES.MEGA_STONE`, `megaStoneChance()`, `randomNode` override.
- `src/game/balance.js` — new `BALANCE.map.megaStone` config.
- `src/lib/useEvolutionFlow.jsx` — sequential queue, append instead of replace.
- `src/components/NodeMap.jsx` — icon, click handler, pending-modal wiring, run-level spawn flag.
- `src/App.jsx` — `megaStoneSpawnedThisRun` state, mega hook in `handleItemAssign`/`moveItem`.
- `package.json` — `build:dex` also runs the new mega-data script.
- `src/components/EvolutionNotice.jsx` — deleted.

**Deletion happens in Task 11**, after `EvolutionAnimation.jsx` (built in Task 10) is wired into `useEvolutionFlow` and verified — not before, so there's no window where evolutions have no popup at all.

---

### Task 1: Mega species data — build script

**Files:**
- Create: `scripts/buildMegaData.mjs`
- Modify: `package.json:9` (the `build:dex` script line)

**Interfaces:**
- Produces: `public/data/megas.json`, shape:
  ```json
  {
    "generatedAt": "ISO string", "source": "pokeapi.co",
    "megas": {
      "<basePokeId>": [
        { "formId": 10033, "formName": "venusaur-mega", "label": "Mega Venusaur",
          "types": ["grass","poison"],
          "baseStats": {"hp":80,"attack":100,"defense":123,"spAtk":122,"spDef":120,"speed":80},
          "sprite": "https://...", "spriteBack": "https://...",
          "shinySprite": "https://...", "shinySpriteBack": "https://..." }
      ]
    }
  }
  ```
  Charizard (`6`) and Mewtwo (`150`) have two entries each (X and Y); every
  other key has exactly one.

- [ ] **Step 1: Write the build script**

```js
#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// buildMegaData.mjs — generate the local Mega Evolution data bundle.
//
// Fetches every official Mega Evolution form from PokéAPI and writes
// public/data/megas.json, keyed by base national-dex id. Independent of
// which species are catchable in any region — a species just needs to be
// in the player's roster (however it got there) to be mega-eligible.
//
// Re-run only if the curated MEGA_FORMS list below changes:
//
//   npm run build:dex
// ─────────────────────────────────────────────────────────────────────────
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const API = 'https://pokeapi.co/api/v2'
const OUT_DIR = path.join(ROOT, 'public', 'data')

// Curated: every species with an official Mega Evolution, across every
// generation that introduced one (X/Y and Alpha Sapphire/Omega Ruby).
// Charizard and Mewtwo carry two mega forms (X and Y); every other entry
// is a single form name. Not filtered by this game's current catch pools —
// see the design spec, §"Scope": eligibility is independent of catchability.
const MEGA_FORMS = {
  1:   ['venusaur-mega'],
  6:   ['charizard-mega-x', 'charizard-mega-y'],
  9:   ['blastoise-mega'],
  15:  ['beedrill-mega'],
  18:  ['pidgeot-mega'],
  65:  ['alakazam-mega'],
  80:  ['slowbro-mega'],
  94:  ['gengar-mega'],
  115: ['kangaskhan-mega'],
  127: ['pinsir-mega'],
  130: ['gyarados-mega'],
  142: ['aerodactyl-mega'],
  150: ['mewtwo-mega-x', 'mewtwo-mega-y'],
  181: ['ampharos-mega'],
  212: ['scizor-mega'],
  214: ['heracross-mega'],
  229: ['houndoom-mega'],
  248: ['tyranitar-mega'],
  254: ['sceptile-mega'],
  257: ['blaziken-mega'],
  260: ['swampert-mega'],
  282: ['gardevoir-mega'],
  302: ['sableye-mega'],
  303: ['mawile-mega'],
  306: ['aggron-mega'],
  308: ['medicham-mega'],
  310: ['manectric-mega'],
  319: ['sharpedo-mega'],
  323: ['camerupt-mega'],
  334: ['altaria-mega'],
  354: ['banette-mega'],
  359: ['absol-mega'],
  362: ['glalie-mega'],
  373: ['salamence-mega'],
  376: ['metagross-mega'],
  380: ['latias-mega'],
  381: ['latios-mega'],
  384: ['rayquaza-mega'],
  428: ['lopunny-mega'],
  475: ['gallade-mega'],
  531: ['audino-mega'],
  719: ['diancie-mega'],
}

const LABEL_OVERRIDES = {
  'charizard-mega-x': 'Mega Charizard X',
  'charizard-mega-y': 'Mega Charizard Y',
  'mewtwo-mega-x':    'Mega Mewtwo X',
  'mewtwo-mega-y':    'Mega Mewtwo Y',
}

function labelFor(formName, baseDisplayName) {
  return LABEL_OVERRIDES[formName] ?? `Mega ${baseDisplayName}`
}

function displayName(apiName) {
  return apiName.split('-')[0].replace(/^\w/, c => c.toUpperCase())
}

async function fetchJson(url, retries = 3) {
  let lastErr
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      lastErr = new Error(`HTTP ${res.status} for ${url}`)
    } catch (err) {
      lastErr = err
    }
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
  }
  throw lastErr
}

async function mapPool(items, workers, fn) {
  const queue = [...items]
  await Promise.all(Array.from({ length: workers }, async () => {
    while (queue.length > 0) await fn(queue.shift())
  }))
}

const megas = {}
let failures = 0
const entries = Object.entries(MEGA_FORMS).flatMap(([baseId, formNames]) =>
  formNames.map(formName => ({ baseId, formName }))
)

console.log(`Fetching ${entries.length} mega forms...`)
await mapPool(entries, 8, async ({ baseId, formName }) => {
  try {
    const data = await fetchJson(`${API}/pokemon/${formName}`)
    const baseDisplayName = displayName(formName)
    const entry = {
      formId: data.id,
      formName: data.name,
      label: labelFor(formName, baseDisplayName),
      types: data.types.map(t => t.type.name),
      baseStats: {
        hp:      data.stats.find(s => s.stat.name === 'hp').base_stat,
        attack:  data.stats.find(s => s.stat.name === 'attack').base_stat,
        defense: data.stats.find(s => s.stat.name === 'defense').base_stat,
        spAtk:   data.stats.find(s => s.stat.name === 'special-attack').base_stat,
        spDef:   data.stats.find(s => s.stat.name === 'special-defense').base_stat,
        speed:   data.stats.find(s => s.stat.name === 'speed').base_stat,
      },
      sprite: data.sprites.front_default,
      spriteBack: data.sprites.back_default ?? data.sprites.front_default,
      shinySprite: data.sprites.front_shiny ?? data.sprites.front_default,
      shinySpriteBack: data.sprites.back_shiny ?? data.sprites.back_default ?? data.sprites.front_shiny ?? data.sprites.front_default,
    }
    if (!megas[baseId]) megas[baseId] = []
    megas[baseId].push(entry)
  } catch (err) {
    failures++
    console.warn(`  ! mega form failed for ${formName}: ${err.message}`)
  }
})

// Stable order: X before Y for the two dual-form species.
for (const baseId of Object.keys(megas)) {
  megas[baseId].sort((a, b) => a.formId - b.formId)
}

await mkdir(OUT_DIR, { recursive: true })
const out = { generatedAt: new Date().toISOString(), source: 'pokeapi.co', megas }
const json = JSON.stringify(out)
await writeFile(path.join(OUT_DIR, 'megas.json'), json)

console.log(`\nWrote public/data/megas.json (${Object.keys(megas).length} species, ${(json.length / 1024).toFixed(0)} kB)`)
if (failures > 0) {
  console.warn(`\n${failures} fetch(es) failed. Re-run to retry.`)
  process.exitCode = 1
}
```

- [ ] **Step 2: Wire it into the existing build:dex script**

Edit `package.json:9`:

```json
    "build:dex": "node scripts/buildPokedex.mjs && node scripts/buildMegaData.mjs",
```

- [ ] **Step 3: Run it and verify output**

Run: `npm run build:dex`

Expected: console output ending in `Wrote public/data/megas.json (44 species, NN kB)` with `0 fetch(es) failed`. Confirm the file exists and Charizard/Mewtwo each have 2 entries:

```bash
node -e "const d = require('./public/data/megas.json'); console.log(Object.keys(d.megas).length, d.megas['6'].length, d.megas['150'].length)"
```

Expected: `44 2 2`

- [ ] **Step 4: Commit**

```bash
git add scripts/buildMegaData.mjs package.json public/data/megas.json
git commit -m "feat: add mega evolution data build script"
```

---

### Task 2: Mega-form-aware attack types

The existing `ATTACK_TYPE` table (`src/game/attackTypes.js`) is keyed by
species id and hand-picks which of a dual-type Pokémon's two types it
attacks with. 9 mega forms gain a genuinely different type combination
(confirmed against live PokéAPI data) and need their own rows, keyed by the
mega form's own PokéAPI id — NOT the base species id, since the base id's
existing row (if any) doesn't apply to the mega's different type list.

**Files:**
- Modify: `src/game/attackTypes.js`
- Test: `src/game/attackTypes.test.js` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `attackTypeFor(pokeIdOrFormId, types)` continues to work
  unchanged for existing callers; 9 new keys added to `ATTACK_TYPE` so a
  mega'd instance's move rebuild (Task 5) can call
  `attackTypeFor(instance._megaFormId, instance.types)` and get a
  deliberate pick instead of the `types[0]` fallback.

- [ ] **Step 1: Write the failing test**

```js
// src/game/attackTypes.test.js
import { test, expect } from 'vitest'
import { attackTypeFor } from './attackTypes.js'

test('mega Charizard X (fire/dragon) attacks as fire, not the table fallback', () => {
  expect(attackTypeFor(10034, ['fire', 'dragon'])).toBe('fire')
})

test('mega Gyarados (water/dark) attacks as water', () => {
  expect(attackTypeFor(10130, ['water', 'dark'])).toBe('water')
})

test('mega Mewtwo X (psychic/fighting) attacks as psychic', () => {
  expect(attackTypeFor(10052, ['psychic', 'fighting'])).toBe('psychic')
})

test('mega Ampharos (electric/dragon) attacks as electric', () => {
  expect(attackTypeFor(10176, ['electric', 'dragon'])).toBe('electric')
})

test('mega Sceptile (grass/dragon) attacks as grass', () => {
  expect(attackTypeFor(10063, ['grass', 'dragon'])).toBe('grass')
})

test('mega Altaria (dragon/fairy) attacks as dragon', () => {
  expect(attackTypeFor(10178, ['dragon', 'fairy'])).toBe('dragon')
})

test('mega Pinsir (bug/flying) attacks as bug', () => {
  expect(attackTypeFor(10093, ['bug', 'flying'])).toBe('bug')
})

test('mega Lopunny (normal/fighting) attacks as fighting (normal is offensively dead weight)', () => {
  expect(attackTypeFor(10104, ['normal', 'fighting'])).toBe('fighting')
})

test('mega Audino (normal/fairy) attacks as fairy', () => {
  expect(attackTypeFor(10188, ['normal', 'fairy'])).toBe('fairy')
})

test('mega Aggron (steel only, single-typed) falls back to types[0] with no table row needed', () => {
  expect(attackTypeFor(10071, ['steel'])).toBe('steel')
})
```

Run `node -e "fetch('https://pokeapi.co/api/v2/pokemon/charizard-mega-x').then(r=>r.json()).then(d=>console.log(d.id))"` (and similarly for the other 9 form names from Task 1's `MEGA_FORMS` list) to get the exact `formId` values before writing the test — the ids above are illustrative; confirm each against Task 1's already-generated `public/data/megas.json` (`jq '.megas["6"]' public/data/megas.json` etc.) rather than re-fetching.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/attackTypes.test.js`
Expected: FAIL — every mega-form-id case falls back to `types[0]` instead of the hand-picked type (fails wherever `types[0]` differs from the expected pick, e.g. Gyarados `types[0]` is `'water'` too so that one may coincidentally pass — Mewtwo X `types[0]` is `'psychic'` too — the real failures are Lopunny (`types[0]` is `'normal'`, wrong) and any others where the fallback disagrees).

- [ ] **Step 3: Add the 9 new table rows**

In `src/game/attackTypes.js`, add a new section after the existing table
(before its closing `}`), using the exact `formId` values read from
`public/data/megas.json` in Step 1:

```js
  // ── Mega Evolution forms ──────────────────────────────────────────────
  // Keyed by the MEGA FORM's own PokéAPI id (10033+), not the base species
  // id — a mega'd instance keeps its base pokeId for lookups (vitamins,
  // Pokédex ownership) but its move-type pick must consult the form it's
  // actually wearing right now, since 9 forms change typing on mega. See
  // docs/superpowers/specs/2026-08-13-mega-evolution-design.md §2.
  10034: 'fire',       // charizard-mega-x — fire/dragon (was fire/flying)
  10130: 'water',      // gyarados-mega — water/dark (was water/flying)
  10052: 'psychic',    // mewtwo-mega-x — psychic/fighting
  10176: 'electric',   // ampharos-mega — electric/dragon
  10063: 'grass',      // sceptile-mega — grass/dragon
  10178: 'dragon',     // altaria-mega — dragon/fairy
  10093: 'bug',        // pinsir-mega — bug/flying (newly dual-type)
  10104: 'fighting',   // lopunny-mega — normal/fighting — fighting scores higher, normal is dead weight
  10188: 'fairy',      // audino-mega — normal/fairy — fairy scores higher, normal is dead weight
```

(Mega Aggron needs no row — steel/rock → steel is single-typed, and
`attackTypeFor`'s existing `types?.length === 1` early return at line 198
already handles it correctly with no table lookup.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/attackTypes.test.js`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/attackTypes.js src/game/attackTypes.test.js
git commit -m "feat: hand-pick attack types for the 9 retyped mega evolution forms"
```

---

### Task 3: Mega Stone item definition

**Files:**
- Modify: `src/game/items.js`

**Interfaces:**
- Produces: `MEGA_STONE_ITEM`, a standalone exported object (same shape as
  entries in `ITEMS`, but NOT a member of `ITEMS` — it must never appear in
  `pickThreeItems`/`itemOdds`/tier-budget draws, since it's obtainable only
  from the dedicated `MEGA_STONE` node).

- [ ] **Step 1: Add the item export**

In `src/game/items.js`, after the `ITEMS` array closes (after line 151,
before the `ROSTER_CONSUMABLES` export), add:

```js
// Mega Stone — NOT part of ITEMS/pickThreeItems/itemOdds. It never drops
// from a general item node; it is granted exclusively by the MEGA_STONE map
// node (see game/nodeMap.js). A normal held item otherwise — shares the
// single held-item slot, moves through the same bag/moveItem paths as
// Leftovers or Choice Band — but equipping/unequipping it also transforms
// the holder's form (see game/megas.js applyMega/revertMega).
export const MEGA_STONE_ITEM = {
  id: 'mega_stone', name: 'Mega Stone',
  description: "Mega Evolves the Pokémon it's given to, for as long as it's held",
  tier: 'legendary', icon: 'mega-stone',
}
```

- [ ] **Step 2: Verify it's excluded from the draw pool**

Run: `npx vitest run src/game/shop.test.js` (or wherever `itemOdds`/`pickThreeItems` already have coverage) to confirm nothing broke, then manually check:

```bash
node -e "
import('./src/game/items.js').then(({ ITEMS, MEGA_STONE_ITEM }) => {
  console.log('in ITEMS:', ITEMS.some(i => i.id === 'mega_stone'))
  console.log('exported separately:', MEGA_STONE_ITEM.id === 'mega_stone')
})
"
```

Expected: `in ITEMS: false`, `exported separately: true`

- [ ] **Step 3: Commit**

```bash
git add src/game/items.js
git commit -m "feat: add standalone Mega Stone item, excluded from the general drop pool"
```

---

### Task 4: Runtime mega data loading + eligibility

**Files:**
- Create: `src/game/megas.js`
- Test: `src/game/megas.test.js`

**Interfaces:**
- Consumes: `public/data/megas.json` (Task 1), `checkEvolution` from
  `src/game/pokemon.js` (existing, exported at `pokemon.js:619`).
- Produces:
  - `async function ensureMegaData()` — lazy-loads `megas.json` once, caches in memory.
  - `async function megaFormsFor(pokeId)` — returns `[]` or the array of mega form entries for that species (1 or 2 entries).
  - `async function isFullyEvolved(instance)` — `true` if the species has no further evolution branch, regardless of level.
  - `async function isMegaEligible(instance)` — `megaFormsFor(instance.pokeId).length > 0 && isFullyEvolved(instance)`.

- [ ] **Step 1: Write the failing tests**

```js
// src/game/megas.test.js
import { test, expect, vi, beforeEach } from 'vitest'

// Fake megas.json fetch — same pattern pokemon.test.js uses for local data.
const FAKE_MEGAS = {
  generatedAt: '2026-01-01', source: 'pokeapi.co',
  megas: {
    '6': [
      { formId: 10034, formName: 'charizard-mega-x', label: 'Mega Charizard X',
        types: ['fire', 'dragon'],
        baseStats: { hp: 78, attack: 130, defense: 111, spAtk: 130, spDef: 85, speed: 100 },
        sprite: 'x-sprite', spriteBack: 'x-back', shinySprite: 'x-shiny', shinySpriteBack: 'x-shiny-back' },
      { formId: 10035, formName: 'charizard-mega-y', label: 'Mega Charizard Y',
        types: ['fire', 'flying'],
        baseStats: { hp: 78, attack: 145, defense: 100, spAtk: 130, spDef: 90, speed: 100 },
        sprite: 'y-sprite', spriteBack: 'y-back', shinySprite: 'y-shiny', shinySpriteBack: 'y-shiny-back' },
    ],
  },
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url) => {
    if (url === '/data/megas.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FAKE_MEGAS) })
    }
    return Promise.resolve({ ok: false })
  }))
})

test('megaFormsFor returns both forms for a dual-mega species (Charizard)', async () => {
  const { megaFormsFor } = await import('./megas.js')
  const forms = await megaFormsFor(6)
  expect(forms).toHaveLength(2)
  expect(forms[0].formName).toBe('charizard-mega-x')
  expect(forms[1].formName).toBe('charizard-mega-y')
})

test('megaFormsFor returns empty array for a species with no mega form', async () => {
  const { megaFormsFor } = await import('./megas.js')
  const forms = await megaFormsFor(999999)
  expect(forms).toEqual([])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/megas.test.js`
Expected: FAIL with "Failed to resolve import './megas.js'" or similar (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```js
// src/game/megas.js
//
// Mega Evolution: species eligibility and local data loading.
//
// public/data/megas.json (built by scripts/buildMegaData.mjs) covers all
// ~44 official mega-eligible species regardless of whether they're in any
// region's catch pool — mega eligibility only depends on the player already
// having the species in their roster. See
// docs/superpowers/specs/2026-08-13-mega-evolution-design.md.
import { checkEvolution } from './pokemon.js'

let megaCache = null       // pokeId -> [{ formId, formName, label, types, baseStats, sprite, ... }]
let loadPromise = null

function ensureMegaData() {
  if (!loadPromise) {
    loadPromise = (async () => {
      megaCache = new Map()
      try {
        const res = await fetch('/data/megas.json')
        if (res.ok) {
          const { megas } = await res.json()
          for (const [pokeId, forms] of Object.entries(megas)) {
            megaCache.set(Number(pokeId), forms)
          }
        }
      } catch {
        // No local data (e.g. build:dex never ran) — every species reports
        // zero mega forms rather than throwing.
      }
    })()
  }
  return loadPromise
}

// Mega form entries for a species (1 for most, 2 for Charizard/Mewtwo — X
// before Y). Empty array if the species has no official Mega Evolution.
export async function megaFormsFor(pokeId) {
  await ensureMegaData()
  return megaCache.get(pokeId) ?? []
}

// True if a roster instance has no further evolution at all, independent of
// its current level — a level-5 Charmander is NOT fully evolved (it just
// hasn't leveled yet); a level-100 Charizard is. Reuses checkEvolution with
// ignoreLevel so the level requirement drops out of the check entirely: a
// non-null result means SOME branch exists, regardless of what triggers it.
export async function isFullyEvolved(instance) {
  const result = await checkEvolution(instance, instance.level, { ignoreLevel: true })
  return result === null
}

// A roster Pokémon can be mega-evolved if its species has an official mega
// form AND it's fully evolved (matches the real games: no mega-evolving a
// Charmander, only a Charizard).
export async function isMegaEligible(instance) {
  const forms = await megaFormsFor(instance.pokeId)
  if (forms.length === 0) return false
  return isFullyEvolved(instance)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/megas.test.js`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/megas.js src/game/megas.test.js
git commit -m "feat: load mega evolution data and check species eligibility"
```

---

### Task 5: Equip/revert transform

The core mechanic: rewriting a roster instance's `types`/`stats`/`sprite`/
`move` when a Mega Stone is equipped, and restoring them when it's removed.
Follows the exact pattern `buildEvolvedInstance` (`src/game/pokemon.js:548`)
and `retypeMove` (`src/game/pokemon.js:786`) already use — pure functions,
HP ratio preserved, move rebuilt via the mega-form-aware `attackTypeFor`
from Task 2.

**Files:**
- Modify: `src/game/megas.js`
- Modify: `src/game/pokemon.js:834` (`currentMoveType`) — needs to prefer `_megaFormId` over `pokeId` for the attack-type lookup when mega'd.
- Test: `src/game/megas.test.js`

**Interfaces:**
- Consumes: `calcStat`, `calcHP` (`pokemon.js:191-197`), `getTypeMove`/`tierForLevel` (`typeMoves.js`), `attackTypeFor` (`attackTypes.js`, Task 2).
- Produces:
  - `function applyMega(instance, megaForm)` — pure, returns a new instance object with `_megaBase`, `_megaFormId`, `types`, `stats`, `sprite`, `spriteBack`, `move`, `heldItem: MEGA_STONE_ITEM` set.
  - `function revertMega(instance)` — pure, returns a new instance with `_megaBase`/`_megaFormId` fields restored and cleared; no-op (returns `instance` unchanged) if `instance._megaBase` is absent.
  - Later tasks (`App.jsx`) call these instead of directly mutating `heldItem`.

- [ ] **Step 1: Write the failing tests**

```js
// append to src/game/megas.test.js
import { applyMega, revertMega } from './megas.js'

const CHARIZARD_INSTANCE = {
  pokeId: 6, name: 'Charizard', types: ['fire', 'flying'], level: 50, shiny: false,
  sprite: 'base-sprite', spriteBack: 'base-back',
  stats: { maxHp: 160, hp: 100, attack: 120, defense: 100, spAtk: 130, spDef: 105, speed: 120 },
  move: { type: 'fire', tier: 3, name: 'flamethrower', power: 90 },
  fainted: false, heldItem: null,
}

const MEGA_X_FORM = {
  formId: 10034, formName: 'charizard-mega-x', label: 'Mega Charizard X',
  types: ['fire', 'dragon'],
  baseStats: { hp: 78, attack: 130, defense: 111, spAtk: 130, spDef: 85, speed: 100 },
  sprite: 'mega-x-sprite', spriteBack: 'mega-x-back',
  shinySprite: 'mega-x-shiny', shinySpriteBack: 'mega-x-shiny-back',
}

test('applyMega swaps types, sprite, and recomputes stats from the mega base stats', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(mega.types).toEqual(['fire', 'dragon'])
  expect(mega.sprite).toBe('mega-x-sprite')
  expect(mega.spriteBack).toBe('mega-x-back')
  expect(mega._megaFormId).toBe(10034)
  // stats recomputed via calcStat/calcHP against MEGA_X_FORM.baseStats at level 50 — not copied from base
  expect(mega.stats.attack).not.toBe(CHARIZARD_INSTANCE.stats.attack)
  expect(mega.stats.attack).toBeGreaterThan(0)
})

test('applyMega preserves HP ratio, not raw HP', () => {
  // CHARIZARD_INSTANCE is at 100/160 = 62.5% HP
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  const ratio = mega.stats.hp / mega.stats.maxHp
  expect(ratio).toBeCloseTo(100 / 160, 2)
})

test('applyMega sets heldItem to the Mega Stone', async () => {
  const { MEGA_STONE_ITEM } = await import('./items.js')
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(mega.heldItem).toBe(MEGA_STONE_ITEM)
})

test('applyMega snapshots the pre-mega form into _megaBase', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(mega._megaBase.types).toEqual(['fire', 'flying'])
  expect(mega._megaBase.sprite).toBe('base-sprite')
  expect(mega._megaBase.stats).toEqual(CHARIZARD_INSTANCE.stats)
})

test('revertMega restores the exact pre-mega form, preserving HP ratio', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  // Simulate damage taken while mega'd.
  const damaged = { ...mega, stats: { ...mega.stats, hp: Math.floor(mega.stats.maxHp * 0.4) } }
  const reverted = revertMega(damaged)
  expect(reverted.types).toEqual(['fire', 'flying'])
  expect(reverted.sprite).toBe('base-sprite')
  expect(reverted.stats.maxHp).toBe(CHARIZARD_INSTANCE.stats.maxHp)
  expect(reverted.stats.hp / reverted.stats.maxHp).toBeCloseTo(0.4, 2)
  expect(reverted._megaBase).toBeUndefined()
  expect(reverted._megaFormId).toBeUndefined()
})

test('revertMega on an instance that was never mega\'d is a no-op', () => {
  const reverted = revertMega(CHARIZARD_INSTANCE)
  expect(reverted).toBe(CHARIZARD_INSTANCE)
})

test('applyMega on a retyped form (e.g. mega Gyarados, water/dark) rebuilds the move on the mega-form-aware attack type', () => {
  const gyaradosBase = {
    pokeId: 130, name: 'Gyarados', types: ['water', 'flying'], level: 40, shiny: false,
    sprite: 'g-sprite', spriteBack: 'g-back',
    stats: { maxHp: 150, hp: 150, attack: 110, defense: 90, spAtk: 80, spDef: 90, speed: 95 },
    move: { type: 'water', tier: 2, name: 'surf', power: 70 },
    fainted: false, heldItem: null,
  }
  const gyaradosMega = {
    formId: 10130, formName: 'gyarados-mega', label: 'Mega Gyarados',
    types: ['water', 'dark'],
    baseStats: { hp: 95, attack: 155, defense: 109, spAtk: 70, spDef: 130, speed: 81 },
    sprite: 'gm-sprite', spriteBack: 'gm-back', shinySprite: 'gm-shiny', shinySpriteBack: 'gm-shiny-back',
  }
  const mega = applyMega(gyaradosBase, gyaradosMega)
  expect(mega.move.type).toBe('water') // Task 2's table: mega Gyarados (10130) attacks as water
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/megas.test.js`
Expected: FAIL with "applyMega is not exported" / "revertMega is not exported".

- [ ] **Step 3: Implement `applyMega`/`revertMega`**

Append to `src/game/megas.js`:

```js
import { calcHP, calcStat } from './pokemon.js'
import { attackTypeFor } from './attackTypes.js'
import { getTypeMove, tierForLevel } from './typeMoves.js'
import { MEGA_STONE_ITEM } from './items.js'

// Equip a Mega Stone: rewrite types/stats/sprite/move onto the instance and
// snapshot the pre-mega form into _megaBase so revertMega can restore it
// exactly. Follows buildEvolvedInstance's pattern (pokemon.js) — the same
// "bake it into the instance" convention every other stat/sprite/type
// change in this game already uses, rather than deriving mega display live
// from heldItem at render time.
export function applyMega(instance, megaForm) {
  const hpRatio = instance.stats.hp / instance.stats.maxHp
  const level = instance.level
  const stats = {
    maxHp:   Math.floor(calcHP(megaForm.baseStats.hp, level)),
    attack:  Math.floor(calcStat(megaForm.baseStats.attack,  level)),
    defense: Math.floor(calcStat(megaForm.baseStats.defense, level)),
    spAtk:   Math.floor(calcStat(megaForm.baseStats.spAtk,   level)),
    spDef:   Math.floor(calcStat(megaForm.baseStats.spDef,   level)),
    speed:   Math.floor(calcStat(megaForm.baseStats.speed,   level)),
  }
  const hp = Math.max(1, Math.floor(stats.maxHp * hpRatio))
  const tier = instance.move?.tier ?? tierForLevel(level)
  // Attack type is looked up under the MEGA FORM's own id (10033+), not the
  // base species id — see attackTypes.js's "Mega Evolution forms" section
  // (Task 2). A species with no dedicated row (typing unchanged, or the
  // base row already applies) falls back to types[0] exactly as normal.
  const moveType = attackTypeFor(megaForm.formId, megaForm.types)
  return {
    ...instance,
    _megaBase: {
      types: instance.types, stats: instance.stats,
      sprite: instance.sprite, spriteBack: instance.spriteBack, move: instance.move,
    },
    _megaFormId: megaForm.formId,
    types: megaForm.types,
    sprite:     instance.shiny ? megaForm.shinySprite : megaForm.sprite,
    spriteBack: instance.shiny ? megaForm.shinySpriteBack : megaForm.spriteBack,
    stats: { ...stats, hp },
    move: getTypeMove(moveType, tier),
    heldItem: MEGA_STONE_ITEM,
  }
}

// Unequip: restore the pre-mega snapshot, preserving current HP ratio
// against the restored maxHp (matches applyMega's own HP-ratio rule, and
// buildEvolvedInstance's). No-op if the instance was never mega'd.
export function revertMega(instance) {
  if (!instance._megaBase) return instance
  const hpRatio = instance.stats.hp / instance.stats.maxHp
  const restoredHp = Math.max(1, Math.floor(instance._megaBase.stats.maxHp * hpRatio))
  const next = {
    ...instance,
    types: instance._megaBase.types,
    sprite: instance._megaBase.sprite,
    spriteBack: instance._megaBase.spriteBack,
    stats: { ...instance._megaBase.stats, hp: restoredHp },
    move: instance._megaBase.move,
  }
  delete next._megaBase
  delete next._megaFormId
  return next
}
```

- [ ] **Step 4: Update `currentMoveType` to be mega-aware**

`src/game/pokemon.js:834` — `currentMoveType` currently checks
`pokemon.heldItem?.retype === 'move'` for the Polarity Band. It must also
prefer `_megaFormId` over `pokeId` as the `attackTypeFor` lookup key when
present, so any future move rebuild on a mega'd Pokémon (TM node upgrades,
via `PowerUpgradeNode`'s `onUpgrade` at `NodeMap.jsx:1879`) stays
consistent with the type it was equipped under:

```js
export function currentMoveType(pokemon) {
  if (!pokemon) return 'normal'
  if (pokemon.heldItem?.retype === 'move') {
    const alt = alternateTypeFor(pokemon.pokeId, pokemon.types)
    if (alt) return alt
  }
  // A mega'd Pokémon's attack-type row (if any) is keyed by the mega FORM's
  // own id, not the base species id — see attackTypes.js's "Mega Evolution
  // forms" section. Falls back to the base pokeId lookup once unequipped.
  const lookupId = pokemon._megaFormId ?? pokemon.pokeId
  return attackTypeFor(lookupId, pokemon.types)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/game/megas.test.js src/game/pokemon.test.js`
Expected: PASS, all tests (existing `pokemon.test.js` tests must still
pass — `currentMoveType`'s change is additive, non-mega'd instances have no
`_megaFormId` so `lookupId` falls back to `pokemon.pokeId` exactly as
before).

- [ ] **Step 6: Commit**

```bash
git add src/game/megas.js src/game/megas.test.js src/game/pokemon.js
git commit -m "feat: mega evolution equip/revert transform"
```

---

### Task 6: Node type, spawn mechanics, balance config

**Files:**
- Modify: `src/game/nodeMap.js`
- Modify: `src/game/balance.js`
- Test: `src/game/nodeMap.test.js` (new — no existing test file for this module, following `safariBake.test.js`'s conventions for `buildRows`/`NODE_TYPES` usage)

**Interfaces:**
- Consumes: `BALANCE.map.megaStone` (new config).
- Produces: `NODE_TYPES.MEGA_STONE`, `megaStoneChance(mapIndex)`,
  `randomNode(id, trainerPool, mapIndex, megaStoneAvailable)` (signature
  extended with a 4th param, default `true`), `buildRows(trainerPool,
  bossTrainer, mapIndex, options)` — `options.megaStoneAvailable` (default
  `true`) threaded through to every `randomNode` call in that map.

- [ ] **Step 1: Write the failing tests**

```js
// src/game/nodeMap.test.js
import { test, expect } from 'vitest'
import { megaStoneChance, buildRows, NODE_TYPES } from './nodeMap.js'

test('megaStoneChance is 0 before map index 2 (map 3)', () => {
  expect(megaStoneChance(0)).toBe(0)
  expect(megaStoneChance(1)).toBe(0)
})

test('megaStoneChance is flat 3% from map index 2 on', () => {
  expect(megaStoneChance(2)).toBeCloseTo(0.03)
  expect(megaStoneChance(5)).toBeCloseTo(0.03)
  expect(megaStoneChance(7)).toBeCloseTo(0.03)
})

test('buildRows never produces a MEGA_STONE node when megaStoneAvailable is false, regardless of map index', () => {
  for (let mapIndex = 2; mapIndex <= 7; mapIndex++) {
    const rows = buildRows([1, 4, 7], 'Brock', mapIndex, { megaStoneAvailable: false })
    const hasMega = rows.some(row => row.some(n => n.type === NODE_TYPES.MEGA_STONE))
    expect(hasMega).toBe(false)
  }
})

test('buildRows never produces a MEGA_STONE node before map index 2 even when available', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0, { megaStoneAvailable: true })
  const hasMega = rows.some(row => row.some(n => n.type === NODE_TYPES.MEGA_STONE))
  expect(hasMega).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/nodeMap.test.js`
Expected: FAIL — `megaStoneChance is not exported`, `NODE_TYPES.MEGA_STONE is undefined`.

- [ ] **Step 3: Add the balance config**

In `src/game/balance.js`, inside the `map` block, right after the existing
`masterBall` entry (around line 43):

```js
    // Mega Stone (rare) node chance: 0% before map index 2 (map 3), flat
    // 3% on every map from there on. Independent of the weighted
    // nodeTypeChances table (which sums to 100 and is always active) — this
    // follows the SAME override pattern as masterBall above: randomNode
    // rolls a normal type first, then may steal that slot for MEGA_STONE.
    megaStone: { startIndex: 2, chance: 0.03 },
```

- [ ] **Step 4: Add `NODE_TYPES.MEGA_STONE` and `megaStoneChance`**

In `src/game/nodeMap.js`:

1. Add `MEGA_STONE: 'mega_stone'` to the `NODE_TYPES` object (`nodeMap.js:5-23`).
2. Add, right after `masterBallChance` (`nodeMap.js:66-72`):

```js
// Chance (0..1) that a normal node roll is stolen for a Mega Stone node
// instead — same override mechanic as masterBallChance above, not a slice
// of NODE_TYPE_CHANCES (which sums to 100 and has no map-index gating). 0%
// before map index 2 (map 3), flat BALANCE.map.megaStone.chance from there.
export function megaStoneChance(mapIndex) {
  const { startIndex, chance } = BALANCE.map.megaStone
  return mapIndex >= startIndex ? chance : 0
}
```

3. Update `randomNode` (`nodeMap.js:101-110`) to accept and apply a 4th
   parameter, checked AFTER the existing Master Ball override so a node
   already promoted to Master Ball can't also be stolen for Mega Stone:

```js
function randomNode(id, trainerPool, mapIndex = 0, megaStoneAvailable = true) {
  let type = pickType()
  // A Pokéball node has a rare, map-ramped chance to become a Master Ball
  // (legendary) node instead — a variant of the Pokéball, so the overall
  // node distribution is barely affected.
  if (type === NODE_TYPES.POKEBALL && rng() < masterBallChance(mapIndex)) {
    type = NODE_TYPES.MASTER_BALL
  }
  // Mega Stone: a separate, rarer override on top of whatever type was just
  // picked (any type, not just Pokéball) — capped to one spawn per run by
  // the caller via megaStoneAvailable (App.jsx tracks this at the run
  // level, not per-map).
  if (megaStoneAvailable && rng() < megaStoneChance(mapIndex)) {
    type = NODE_TYPES.MEGA_STONE
  }
  return { id, type, ...(type === NODE_TYPES.TRAINER ? { trainer: pick(trainerPool) } : {}) }
}
```

4. Update `buildRows` (`nodeMap.js:116-160`) to read `megaStoneAvailable`
   from `options` (default `true`) and pass it through every `randomNode`
   call:

```js
export function buildRows(trainerPool, bossTrainer, mapIndex = 0, options = {}) {
  const ROW_WIDTHS = BALANCE.map.rowWidths
  const { megaStoneAvailable = true } = options
  let id = 0
  const rows = ROW_WIDTHS.map(width =>
    Array.from({ length: width }, () => randomNode(id++, trainerPool, mapIndex, megaStoneAvailable))
  )

  rows[1][0] = { id: rows[1][0].id, type: NODE_TYPES.POKEBALL }

  const rightId = rows[1][1].id
  let right = rows[1][1]
  while (right.type === NODE_TYPES.POKEBALL || right.type === NODE_TYPES.MASTER_BALL) {
    right = randomNode(rightId, trainerPool, mapIndex, megaStoneAvailable)
  }
  rows[1][1] = right

  // ...rest of the function is unchanged (row 7 pokecenter/pokemart fork,
  // boss node, Safari bake) — options is still destructured further down
  // for mode/config/maxSpeciesId exactly as before.
```

(The rest of `buildRows` — row 7's guaranteed heal/shop fork, the boss
node, and the Safari-mode bake — is untouched; only the two `randomNode`
call sites above gain the new argument.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/game/nodeMap.test.js`
Expected: PASS, all 4 tests. Also run the existing Safari suite to confirm
no regression: `npx vitest run src/game/safariBake.test.js`

- [ ] **Step 6: Commit**

```bash
git add src/game/nodeMap.js src/game/balance.js src/game/nodeMap.test.js
git commit -m "feat: add Mega Stone node type with map-ramped, once-per-run spawn"
```

---

### Task 7: MegaStoneNode popup + MegaFormChoice sub-screen

**Files:**
- Create: `src/components/MegaStoneNode.jsx`
- Create: `src/components/MegaFormChoice.jsx`

**Interfaces:**
- Consumes: `isFullyEvolved`, `megaFormsFor` (Task 4 — the component checks
  these two separately rather than the combined `isMegaEligible`, since the
  UI needs to distinguish WHY a mon is ineligible: no mega form at all vs.
  not fully evolved yet); `TYPE_COLORS`/`typeTextColor` (`src/game/types.js`, existing).
- Produces:
  - `<MegaStoneNode roster={[...]} onEquip={(pokeIndex, megaForm) => {}} onUnequip={(pokeIndex) => {}} onKeepInBag={() => {}} onClose={() => {}} />`
  - `<MegaFormChoice pokemonName={string} forms={[formA, formB]} onChoose={(form) => {}} onCancel={() => {}} />`

- [ ] **Step 1: Write `MegaFormChoice.jsx`** (the X/Y sub-screen, modeled directly on `EvolutionChoice.jsx`)

```jsx
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { TYPE_COLORS, typeTextColor } from '../game/types.js'

// X/Y branch picker for the two mega-eligible species with dual forms
// (Charizard, Mewtwo). Shown from MegaStoneNode when a roster Pokémon has
// more than one entry in megas.json. Modeled on EvolutionChoice.jsx's
// layout — same "pick one of N options shown side by side" shape.
export default function MegaFormChoice({ pokemonName, forms, onChoose, onCancel }) {
  const { dark } = useTheme()
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const border = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const textColor = dark ? '#DBDBDB' : '#333'
  const mutedColor = muted(dark)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 130,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.75)',
    }}>
      <div style={{
        backgroundColor: cardBg, border, boxShadow: shadow,
        padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
          Choose {pokemonName}'s Mega Form
        </span>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {forms.map(form => (
            <button
              key={form.formId}
              onClick={() => onChoose(form)}
              className="hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: innerBg, border,
                padding: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                cursor: 'pointer', width: '140px',
              }}
            >
              <img src={form.sprite} alt={form.label} style={{ width: '72px', height: '72px', imageRendering: 'pixelated' }} />
              <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: textColor, textAlign: 'center' }}>
                {form.label}
              </span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {form.types.map(type => (
                  <span key={type} style={{
                    fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '8px',
                    color: typeTextColor(TYPE_COLORS[type]), backgroundColor: TYPE_COLORS[type] || '#888',
                    border: '1px solid #000', borderRadius: '0', padding: '2px 5px', textTransform: 'uppercase',
                  }}>
                    {type}
                  </span>
                ))}
              </div>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: mutedColor }}>
                ATK {form.baseStats.attack} · SPA {form.baseStats.spAtk} · SPE {form.baseStats.speed}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
            border, backgroundColor: innerBg, padding: '8px 20px', cursor: 'pointer', width: '100%',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `MegaStoneNode.jsx`** (roster list, modeled on `PowerUpgradeNode.jsx`)

```jsx
import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { megaFormsFor, isFullyEvolved } from '../game/megas.js'
import MegaFormChoice from './MegaFormChoice'

// "Mega Evolve" node popup. One row per roster Pokémon: ineligible species
// grey out with a reason, eligible-single-form gets a direct Equip button,
// eligible-dual-form (Charizard, Mewtwo) opens MegaFormChoice, and an
// already-mega'd Pokémon shows Unequip instead. Modeled on
// PowerUpgradeNode.jsx's roster-list structure.
export default function MegaStoneNode({ roster, onEquip, onUnequip, onKeepInBag, onClose }) {
  const { dark } = useTheme()
  const [rows, setRows] = useState(null) // [{ forms: [...], fullyEvolved: bool }] | null while loading
  const [choosingIndex, setChoosingIndex] = useState(null) // roster index currently in the X/Y picker

  useEffect(() => {
    let cancelled = false
    Promise.all(roster.map(async p => ({
      forms: await megaFormsFor(p.pokeId),
      fullyEvolved: await isFullyEvolved(p),
    }))).then(results => { if (!cancelled) setRows(results) })
    return () => { cancelled = true }
  }, [roster])

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  if (choosingIndex !== null && rows) {
    const pokemon = roster[choosingIndex]
    return (
      <MegaFormChoice
        pokemonName={pokemon.name}
        forms={rows[choosingIndex].forms}
        onChoose={form => { onEquip(choosingIndex, form); setChoosingIndex(null) }}
        onCancel={() => setChoosingIndex(null)}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)',
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mega-title"
        style={{
          backgroundColor: bg, border: borderStyle, boxShadow: shadowStyle,
          padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
          maxWidth: '440px', width: '94vw', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h2 id="mega-title" style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor, margin: 0 }}>Mega Evolve</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="hover:opacity-70 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
              style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              X
            </button>
          </div>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: textColor }}>
            Equip the Mega Stone to a fully-evolved Pokémon.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {roster.map((pokemon, i) => {
            const row = rows?.[i]
            const eligible = row && row.forms.length > 0 && row.fullyEvolved
            const isMega = !!pokemon._megaBase
            const reason = !row ? '' : row.forms.length === 0 ? 'No Mega Evolution' : !row.fullyEvolved ? 'Must be fully evolved' : ''

            return (
              <div key={i} style={{
                backgroundColor: innerBg, border: borderStyle, padding: '10px',
                display: 'flex', alignItems: 'center', gap: '10px',
                opacity: eligible || isMega ? 1 : 0.5,
              }}>
                <img
                  src={pokemon.sprite} alt=""
                  style={{ width: '44px', height: '44px', imageRendering: 'pixelated', flexShrink: 0, opacity: pokemon.fainted ? 0.55 : 1 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: textColor, textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {pokemon.name}
                  </span>
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor }}>
                    {isMega ? 'Mega Evolved' : reason}
                  </span>
                </div>
                {isMega ? (
                  <button
                    onClick={() => onUnequip(i)}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
                    style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor, border: borderStyle, backgroundColor: innerBg, padding: '8px 14px', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Unequip
                  </button>
                ) : (
                  <button
                    disabled={!eligible}
                    onClick={() => {
                      if (!eligible) return
                      if (row.forms.length > 1) setChoosingIndex(i)
                      else onEquip(i, row.forms[0])
                    }}
                    aria-label={eligible ? `Mega Evolve ${pokemon.name}` : `${pokemon.name} cannot Mega Evolve: ${reason}`}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
                    style={{
                      fontFamily: 'Upheaval', fontSize: '14px',
                      color: eligible ? '#1a1a1a' : mutedColor,
                      border: borderStyle, backgroundColor: eligible ? '#facc15' : innerBg,
                      padding: '8px 14px', cursor: eligible ? 'pointer' : 'not-allowed', flexShrink: 0,
                    }}
                  >
                    {row?.forms.length > 1 ? 'Choose Form' : 'Equip'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={onKeepInBag}
          className="hover:opacity-70 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
          style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor, border: borderStyle, backgroundColor: innerBg, padding: '12px', cursor: 'pointer', width: '100%' }}
        >
          Keep in Bag
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Manual verification (no automated test — this is a presentational component; its underlying logic (`isFullyEvolved`/`megaFormsFor`) is already covered by Task 4's tests)**

Run `npm run dev`, temporarily render `<MegaStoneNode roster={SOME_TEST_ROSTER} onEquip={console.log} onUnequip={console.log} onKeepInBag={() => console.log('bagged')} onClose={() => console.log('closed')} />` from a scratch route or by calling it directly in `NodeMap.jsx` behind a temporary `true &&` (reverted before commit) to confirm: ineligible mons grey out with the right reason text, Charizard/Mewtwo open the X/Y picker, single-form mons equip directly.

- [ ] **Step 4: Commit**

```bash
git add src/components/MegaStoneNode.jsx src/components/MegaFormChoice.jsx
git commit -m "feat: add Mega Evolve popup and X/Y form picker"
```

---

### Task 8: Wire the node into NodeMap.jsx and App.jsx

**Files:**
- Modify: `src/components/NodeMap.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `MegaStoneNode` (Task 7), `applyMega`/`revertMega` (Task 5), `MEGA_STONE_ITEM` (Task 3), `NODE_TYPES.MEGA_STONE`/`megaStoneChance` (Task 6).
- Produces: `App.jsx` exposes `onMegaEquip(pokeIndex, megaForm)` / `onMegaUnequip(pokeIndex)` props into `NodeMap`, alongside the existing `onItemAssign`/`onItemKeepInBag`/`onMoveItem`.

- [ ] **Step 1: Add the icon**

In `src/components/NodeMap.jsx`, add to `ITEM_ICONS` (around line 40-49):

```js
  [NODE_TYPES.MEGA_STONE]:    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/mega-stone.png',
```

- [ ] **Step 2: Add `pendingMega` state and the click handler**

Add alongside the existing `pendingItem`/`pendingPower` state (`NodeMap.jsx:597-598`):

```js
  const [pendingMega, setPendingMega] = useState(null)
```

In `handleNodeClick` (`NodeMap.jsx:912` onward), add a new branch right
after the existing `POWER_UPGRADE` case (`NodeMap.jsx:1001-1003`):

```js
    } else if (node.type === NODE_TYPES.MEGA_STONE) {
      onEarnCash?.(getEffectiveBalance().economy.payouts.node)
      setPendingMega({ node })
    } else {
```

(This slots in before the existing `else { setClearedNodes... }` fallback,
matching the exact shape of every other special-cased node type.)

- [ ] **Step 3: Render the modal**

Add near the other `pending*` modals (after the `pendingPower` block,
`NodeMap.jsx:1868-1891`):

```jsx
      {pendingMega && (
        <MegaStoneNode
          roster={roster}
          onEquip={(pokeIndex, megaForm) => {
            onMegaEquip(pokeIndex, megaForm)
            setClearedNodes(prev => new Set([...prev, pendingMega.node.id]))
            setCurrentNode(pendingMega.node.id)
            setPendingMega(null)
          }}
          onUnequip={(pokeIndex) => {
            onMegaUnequip(pokeIndex)
            // Unequip doesn't close the node — the player may still want to
            // equip a different roster member before leaving.
          }}
          onKeepInBag={() => {
            onItemKeepInBag(MEGA_STONE_ITEM)
            setClearedNodes(prev => new Set([...prev, pendingMega.node.id]))
            setCurrentNode(pendingMega.node.id)
            setPendingMega(null)
          }}
          onClose={() => {
            setClearedNodes(prev => new Set([...prev, pendingMega.node.id]))
            setCurrentNode(pendingMega.node.id)
            setPendingMega(null)
          }}
        />
      )}
```

Add the imports at the top of `NodeMap.jsx`:

```js
import MegaStoneNode from './MegaStoneNode'
import { MEGA_STONE_ITEM } from '../game/items.js'
```

- [ ] **Step 4: Add `onMegaEquip`/`onMegaUnequip` props to `NodeMap`'s signature**

`NodeMap.jsx:536` — add `onMegaEquip, onMegaUnequip` to the destructured
props list, alongside `onItemAssign, onItemKeepInBag`.

- [ ] **Step 5: Add label/title case**

Find the node-label switch (`NodeMap.jsx:1224-1225`, same block as `ITEM`/`POWER_UPGRADE`) and add:

```js
      case NODE_TYPES.MEGA_STONE:    return { title: 'Mega Stone', sub: `Mega Evolve a Pokémon · $${nodePay}` }
```

- [ ] **Step 6: Implement `onMegaEquip`/`onMegaUnequip` in `App.jsx`**

Add near `handleItemAssign`/`handleItemKeepInBag` (`App.jsx:924-938`):

```js
  // Mega Evolve: rewrite the roster slot's types/stats/sprite/move via
  // applyMega, same "bake it into the instance" convention evolution
  // already uses. Unlike handleItemAssign, there's no swapBackItem to
  // restore — a Mega Stone always displaces whatever was held before it
  // (that item returns to the bag), since a mega'd Pokémon's held-item
  // slot is now occupied by the stone itself.
  function handleMegaEquip(pokemonIndex, megaForm) {
    setRoster(prev => prev.map((p, i) => {
      if (i !== pokemonIndex) return p
      const displaced = p.heldItem
      const mega = applyMega(p, megaForm)
      if (displaced) setBag(bagPrev => [...bagPrev, displaced])
      return mega
    }))
  }

  // Unequip: revert to the pre-mega snapshot and return the Mega Stone
  // itself to the bag (mirrors how moveItem returns a displaced held item).
  function handleMegaUnequip(pokemonIndex) {
    setRoster(prev => prev.map((p, i) => {
      if (i !== pokemonIndex || !p._megaBase) return p
      const reverted = revertMega(p)
      setBag(bagPrev => [...bagPrev, MEGA_STONE_ITEM])
      return { ...reverted, heldItem: null }
    }))
  }
```

Note: `displaced`/`setBag` calls happen inside the `setRoster` updater
function bodies above, which React may invoke more than once under
StrictMode — this mirrors a known sharp edge already called out in
`moveItem`'s comment (`App.jsx:953-956`, "nesting setBag inside setRoster
caused... duplication bug"). To avoid reintroducing that exact bug,
restructure both functions to compute the displaced/bag change OUTSIDE the
`setRoster` updater, the same way `moveItem` does:

```js
  function handleMegaEquip(pokemonIndex, megaForm) {
    const displaced = roster[pokemonIndex]?.heldItem ?? null
    setRoster(prev => prev.map((p, i) => i === pokemonIndex ? applyMega(p, megaForm) : p))
    if (displaced) setBag(prev => [...prev, displaced])
  }

  function handleMegaUnequip(pokemonIndex) {
    const target = roster[pokemonIndex]
    if (!target?._megaBase) return
    setRoster(prev => prev.map((p, i) => i === pokemonIndex ? { ...revertMega(p), heldItem: null } : p))
    setBag(prev => [...prev, MEGA_STONE_ITEM])
  }
```

Use this second version — it matches `moveItem`'s already-established
pure-read-then-two-separate-updates shape exactly.

Add the imports at the top of `App.jsx`:

```js
import { applyMega, revertMega } from './game/megas.js'
import { MEGA_STONE_ITEM } from './game/items.js'
```

- [ ] **Step 7: Wire the props into `<NodeMap>`'s JSX**

Find where `NodeMap` is rendered (`App.jsx:1380-1381`, alongside
`onItemAssign={handleItemAssign}` `onItemKeepInBag={handleItemKeepInBag}`)
and add:

```jsx
          onMegaEquip={handleMegaEquip}
          onMegaUnequip={handleMegaUnequip}
```

- [ ] **Step 8: Manual verification**

Run `npm run dev`. Since the node needs map index ≥ 2 and a run-level flag
to spawn naturally (Task 9 wires the run-level cap), temporarily force
`megaStoneChance` to return `1` in `nodeMap.js` (revert after testing) to
guarantee a Mega Stone node appears on the next map. Click it, confirm the
popup opens, equip a fully-evolved roster mon, confirm its sprite/types
change immediately in the roster panel, then unequip and confirm it
reverts.

- [ ] **Step 9: Commit**

```bash
git add src/components/NodeMap.jsx src/App.jsx
git commit -m "feat: wire Mega Stone node into NodeMap and App"
```

---

### Task 9: Run-level once-per-run spawn cap

Verified call chain: `App.jsx` never calls `buildRows` directly. Only
Kanto and Unova are actually playable right now — Hoenn and Sinnoh's
region configs both have `maps: []` (confirmed empty, unrelated
pre-existing state, not something this task touches). Kanto and Unova each
define a `maps[i].generate(starter, { mode }) => { region, mapIndex, rows }`
closure (`kanto.js:558-575`, `unova.js:710+`), and the ONLY call site for
`generate()` outside those two region files is
`src/components/NodeMap.jsx:579-580`, inside a `useMemo`:

```js
const mapData = useMemo(
  () => {
    if (initialMapData && initialMapData.mapIndex === mapIndex) return initialMapData
    if (mode === 'safari' && !prewarmReady) return null
    if (seed != null) return withRng(deriveSeed(seed, mapIndex), () => mapConfig.generate(starter, { mode }))
    return mapConfig.generate(starter, { mode })
  },
  [mapConfig, prewarmReady] // eslint-disable-line react-hooks/exhaustive-deps
)
```

So the flag has to flow: `App.jsx` (owns the run-level ref) → passed down
as a new `NodeMap` prop → forwarded into `generate(starter, { mode,
megaStoneAvailable })` → each region's `generate` closure forwards it into
its own `buildRows` call. And the reverse direction — "a Mega Stone node
was just generated, flip the ref" — has to travel back UP via a new
callback prop, fired from a `useEffect` watching `mapData` (not inside the
`useMemo` itself, which must stay a pure computation with no side effects).

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/NodeMap.jsx`
- Modify: `src/game/regions/kanto.js`
- Modify: `src/game/regions/unova.js`

**Interfaces:**
- Consumes: `NODE_TYPES.MEGA_STONE` (Task 6), `buildRows`'s
  `options.megaStoneAvailable` (Task 6).
- Produces: `NodeMap` gains two new props: `megaStoneAvailable` (boolean,
  passed in) and `onMapGenerated` (callback, `(rows) => void`, fired once
  per new `mapData`). `App.jsx` owns `megaStoneSpawnedThisRun` (a ref,
  reset per run) and passes/receives both.

- [ ] **Step 1: Add the run-level flag in `App.jsx`**

Near `bag`'s declaration (`App.jsx:73`), add:

```js
  // True once a MEGA_STONE node has been generated anywhere in the current
  // run — passed down to NodeMap so at most one spawns per run (see
  // nodeMap.js's megaStoneChance / randomNode override). A ref, not state:
  // it drives no render of its own, only gates a value read at map-
  // generation time, same category as mapsCleared.current elsewhere in this
  // file.
  const megaStoneSpawnedThisRun = useRef(false)
```

- [ ] **Step 2: Reset it in `resetRunStats`**

`App.jsx:906-918` — add one line:

```js
  function resetRunStats() {
    mapsCleared.current = 0
    eliteFourDefeated.current = 0
    pokemonCaught.current = 0
    pokemonCaughtIds.current = []
    pokemonSeenIds.current = []
    pokemonSeenShinyIds.current = []
    megaStoneSpawnedThisRun.current = false
    setSpeedCash(0)
    setCashEarned(0)
    setMetacashEarned(0)
    setKeysEarned(0)
    setPayoutSaved(true)
  }
```

- [ ] **Step 3: Pass the flag and a report-back callback into `<NodeMap>`**

Alongside the `onMegaEquip`/`onMegaUnequip` props added in Task 8 Step 7:

```jsx
          megaStoneAvailable={!megaStoneSpawnedThisRun.current}
          onMapGenerated={rows => {
            if (rows.some(row => row.some(n => n.type === NODE_TYPES.MEGA_STONE))) {
              megaStoneSpawnedThisRun.current = true
            }
          }}
```

Import `NODE_TYPES` from `./game/nodeMap.js` in `App.jsx` if not already imported.

- [ ] **Step 4: Accept the new props in `NodeMap` and thread them through**

`NodeMap.jsx:536` — add `megaStoneAvailable = true, onMapGenerated` to the
destructured props list.

Update the `generate()` calls (`NodeMap.jsx:579-580`) to pass it through:

```js
      if (seed != null) return withRng(deriveSeed(seed, mapIndex), () => mapConfig.generate(starter, { mode, megaStoneAvailable }))
      return mapConfig.generate(starter, { mode, megaStoneAvailable })
```

Add a `useEffect` right after the `mapData` `useMemo` block
(`NodeMap.jsx:583`, before `const edges = mapConfig.edges`) to report the
generated rows back up:

```js
  useEffect(() => {
    if (mapData?.rows) onMapGenerated?.(mapData.rows)
  }, [mapData]) // eslint-disable-line react-hooks/exhaustive-deps
```

(`onMapGenerated` is deliberately left out of the dependency array — same
justification as the existing `mapConfig`/`prewarmReady`-only deps on the
`useMemo` above: this must fire exactly once per NEW `mapData`, not
whenever the caller happens to pass a new function reference for the
callback.)

- [ ] **Step 5: Forward the flag through Kanto's `generate` closure**

`src/game/regions/kanto.js:558` — change:

```js
    generate: (starter, { mode = 'classic' } = {}) => {
```

to:

```js
    generate: (starter, { mode = 'classic', megaStoneAvailable = true } = {}) => {
```

and its `buildRows` call (`kanto.js:563`):

```js
      const rows = buildRows(TRAINER_POOLS[i], boss, i, { megaStoneAvailable })
```

(The comment at `kanto.js:560-562` about safari options being deliberately
withheld until after the rival-node overwrite still applies — this only
adds `megaStoneAvailable` to that same options object, nothing else
changes about the safari-bake timing.)

- [ ] **Step 6: Forward the flag through Unova's `generate` closure**

`src/game/regions/unova.js:710-722` — change:

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

to:

```js
    generate: (starter, { mode = 'classic', megaStoneAvailable = true } = {}) => {
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
          megaStoneAvailable,
        }),
      }
    },
```

- [ ] **Step 7: Manual verification**

Force `megaStoneChance` to `1` temporarily (as in Task 8 Step 8), start a
Kanto run, advance through 3+ maps past map index 2, confirm a
`MEGA_STONE` node appears on exactly one map and never again for the rest
of that run. Repeat for a Unova run. Revert the temporary
`megaStoneChance` override.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/components/NodeMap.jsx src/game/regions/kanto.js src/game/regions/unova.js
git commit -m "feat: cap Mega Stone node spawns at one per run"
```

---

### Task 10: New animated evolution popup

**Files:**
- Create: `src/components/EvolutionAnimation.jsx`
- Modify: `src/lib/useEvolutionFlow.jsx`
- Delete: `src/components/EvolutionNotice.jsx`

**Interfaces:**
- Consumes: nothing new (pure presentational + `setTimeout`/`requestAnimationFrame`).
- Produces: `<EvolutionAnimation fromSprite={url} toSprite={url} fromName={string} toName={string} mode={'evolve'|'mega'} onDismiss={() => {}} />`

- [ ] **Step 1: Write `EvolutionAnimation.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

// Flash-transition popup: alternates the old/new sprite with an
// accelerating interval and an inverting black/white background, settles
// on the new sprite, then reveals the outcome text. Replaces the old static
// EvolutionNotice — used for both real species evolutions and Mega Stone
// equip (mode selects the reveal-text template). See
// docs/superpowers/specs/2026-08-13-mega-evolution-design.md §5-6.
//
// Timing: starts at 400ms/frame, eases down to 80ms/frame over ~2.5s total
// (quadratic ease so it reads as a buildup, not a metronome), then settles.
// A click/tap anywhere during the flash jumps straight to the settled state.
const FLASH_TOTAL_MS = 2500
const FRAME_START_MS = 400
const FRAME_END_MS = 80

export default function EvolutionAnimation({ fromSprite, toSprite, fromName, toName, mode = 'evolve', onDismiss }) {
  const { dark } = useTheme()
  const [phase, setPhase] = useState('flash') // 'flash' | 'settled'
  const [showFrom, setShowFrom] = useState(true)
  const [flashBg, setFlashBg] = useState('black') // 'black' | 'white' — only used during 'flash'
  const startRef = useRef(null)
  const frameRef = useRef(null)
  const okRef = useRef(null)

  useEffect(() => {
    startRef.current = performance.now()

    function tick() {
      const elapsed = performance.now() - startRef.current
      if (elapsed >= FLASH_TOTAL_MS) {
        setPhase('settled')
        setShowFrom(false)
        return
      }
      const t = elapsed / FLASH_TOTAL_MS
      const eased = t * t // quadratic ease-in — starts slow, accelerates
      const frameMs = FRAME_START_MS - eased * (FRAME_START_MS - FRAME_END_MS)
      setShowFrom(prev => !prev)
      setFlashBg(prev => (prev === 'black' ? 'white' : 'black'))
      frameRef.current = setTimeout(tick, frameMs)
    }
    frameRef.current = setTimeout(tick, FRAME_START_MS)
    return () => clearTimeout(frameRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'settled') return
    okRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onDismiss])

  function skip() {
    clearTimeout(frameRef.current)
    setPhase('settled')
    setShowFrom(false)
  }

  const settledBg = 'rgba(0,0,0,0.7)'
  const bg = phase === 'flash' ? flashBg : settledBg
  const currentSprite = phase === 'flash' ? (showFrom ? fromSprite : toSprite) : toSprite
  // During the flash, the sprite is color-inverted relative to whatever the
  // CURRENT background is — inverted on white, normal on black — so it
  // reads as a photo-negative flicker rather than a plain image swap.
  const spriteFilter = phase === 'flash' && flashBg === 'white' ? 'invert(1)' : 'none'

  const revealText = mode === 'mega'
    ? `${fromName} Mega Evolved!`
    : `${fromName} is evolving into ${toName}!`

  return (
    <div
      onClick={phase === 'flash' ? skip : onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '20px', backgroundColor: bg, transition: phase === 'settled' ? 'background-color 0.2s' : 'none',
        cursor: phase === 'flash' ? 'pointer' : 'default',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={revealText}
    >
      <img
        src={currentSprite} alt="" aria-hidden="true"
        style={{ width: '140px', height: '140px', imageRendering: 'pixelated', filter: spriteFilter }}
      />
      {phase === 'settled' && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
        >
          <span style={{
            fontFamily: 'Upheaval', fontSize: '18px', color: dark ? '#DBDBDB' : '#fff',
            textAlign: 'center', textTransform: 'capitalize', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
          }}>
            {revealText}
          </span>
          <button
            ref={okRef}
            onClick={onDismiss}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '11px', color: '#333',
              border: '2px solid #2e2e2e', backgroundColor: '#DBDBDB',
              padding: '8px 24px', cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manual verification of the animation**

Render it from a temporary scratch call (e.g. behind a dev-only button in
`NodeMap.jsx`, reverted before commit) with real sprite URLs, confirm: the
flash visibly accelerates, background alternates, clicking during the
flash jumps straight to the settled reveal text and OK button, Escape
dismisses once settled.

- [ ] **Step 3: Commit the new component (not yet wired in)**

```bash
git add src/components/EvolutionAnimation.jsx
git commit -m "feat: add flashing-sprite evolution animation component"
```

---

### Task 11: Sequential evolution queue + swap in the new animation

**Files:**
- Modify: `src/lib/useEvolutionFlow.jsx`
- Delete: `src/components/EvolutionNotice.jsx`

**Interfaces:**
- Consumes: `EvolutionAnimation` (Task 10).
- Produces: `useEvolutionFlow`'s public surface (`applyVictory`,
  `evolveWithStone`, `useRareCandy`, `render`, `evolutionNotices`,
  `evolutionChoices`) is unchanged in shape — only `render()`'s internals
  and the queue-clearing behavior change.

- [ ] **Step 1: Update `applyVictory` to append instead of replace**

`src/lib/useEvolutionFlow.jsx:40` — change:

```js
    if (notices.length > 0) setEvolutionNotices(notices)
```

to:

```js
    if (notices.length > 0) setEvolutionNotices(prev => [...prev, ...notices])
```

(This fixes a latent bug: two battles won back-to-back, each producing an
evolution, previously had the second `applyVictory` call silently replace
the first's still-unshown notice. `useRareCandy`/`evolveWithStone`, a few
lines below, already append — this just makes `applyVictory` consistent
with them.)

- [ ] **Step 2: Update `render()` to show one notice at a time**

`src/lib/useEvolutionFlow.jsx:118-131` — replace:

```js
  function render() {
    if (evolutionChoices.length > 0) {
      const choice = evolutionChoices[0]
      return (
        <EvolutionChoice
          fromName={choice.fromName}
          fromSprite={choice.sprite}
          options={choice.options}
          onChoose={handleEvolutionChoose}
        />
      )
    }
    return <EvolutionNotice notices={evolutionNotices} onDismiss={() => setEvolutionNotices([])} />
  }
```

with:

```js
  function render() {
    if (evolutionChoices.length > 0) {
      const choice = evolutionChoices[0]
      return (
        <EvolutionChoice
          fromName={choice.fromName}
          fromSprite={choice.sprite}
          options={choice.options}
          onChoose={handleEvolutionChoose}
        />
      )
    }
    if (evolutionNotices.length === 0) return null
    const notice = evolutionNotices[0]
    return (
      <EvolutionAnimation
        key={`${notice.pokeId}-${notice.from}-${notice.to}`}
        fromSprite={notice.fromSprite}
        toSprite={notice.toSprite}
        fromName={notice.from}
        toName={notice.to}
        mode="evolve"
        onDismiss={() => setEvolutionNotices(prev => prev.slice(1))}
      />
    )
  }
```

(The `key` prop forces React to remount `EvolutionAnimation` for each
queued notice, so its internal flash-phase state resets — without it, a
second evolution advancing into the same component instance would start
already in the `'settled'` phase from the first one.)

- [ ] **Step 3: Update the import**

`src/lib/useEvolutionFlow.jsx:4` — replace:

```js
import EvolutionNotice from '../components/EvolutionNotice'
```

with:

```js
import EvolutionAnimation from '../components/EvolutionAnimation'
```

- [ ] **Step 4: Delete the old component**

```bash
git rm src/components/EvolutionNotice.jsx
```

Run `grep -rn "EvolutionNotice" src/` to confirm no remaining references
(the only consumer was `useEvolutionFlow.jsx`, just updated).

- [ ] **Step 5: Manual verification**

Run `npm run dev`, play until a battle win triggers an evolution — confirm
the new flash animation plays, settles on "X is evolving into Y!", OK
dismisses. Engineer a scenario with 2+ simultaneous evolutions (e.g. a
roster of two low-level Pokémon both crossing their evolution level on the
same win) and confirm they play as two sequential animated popups, not
stacked.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useEvolutionFlow.jsx
git commit -m "feat: replace static evolution notice with sequential flash animations"
```

---

### Task 12: Mega equip plays the animation

Wires Task 10's component into the Mega Evolve flow (Task 8's
`handleMegaEquip`), which currently equips silently with no ceremony.

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `EvolutionAnimation` (Task 10).
- Produces: `App.jsx` renders `EvolutionAnimation` with `mode="mega"` after
  a successful `handleMegaEquip`, tracked via a new `pendingMegaAnimation`
  state (separate from `useEvolutionFlow`'s queue — mega equip is a
  one-off, not part of the post-battle notice queue).

- [ ] **Step 1: Add state and update `handleMegaEquip`**

Near `bag`'s declaration:

```js
  const [pendingMegaAnimation, setPendingMegaAnimation] = useState(null)
```

Update `handleMegaEquip` (Task 8, Step 6's final version) to capture the
before/after sprites for the animation:

```js
  function handleMegaEquip(pokemonIndex, megaForm) {
    const before = roster[pokemonIndex]
    if (!before) return
    const displaced = before.heldItem
    const mega = applyMega(before, megaForm)
    setRoster(prev => prev.map((p, i) => i === pokemonIndex ? mega : p))
    if (displaced) setBag(prev => [...prev, displaced])
    setPendingMegaAnimation({
      fromSprite: before.sprite, toSprite: mega.sprite, name: before.name,
    })
  }
```

- [ ] **Step 2: Render the animation**

Add near wherever `NodeMap` and its sibling modals are rendered in
`App.jsx`'s JSX (top-level, so it overlays regardless of which screen is
active underneath):

```jsx
      {pendingMegaAnimation && (
        <EvolutionAnimation
          fromSprite={pendingMegaAnimation.fromSprite}
          toSprite={pendingMegaAnimation.toSprite}
          fromName={pendingMegaAnimation.name}
          toName={pendingMegaAnimation.name}
          mode="mega"
          onDismiss={() => setPendingMegaAnimation(null)}
        />
      )}
```

Add the import: `import EvolutionAnimation from './components/EvolutionAnimation'`

- [ ] **Step 3: Manual verification**

Force a Mega Stone node to spawn (temporary `megaStoneChance` override, as
in Task 8), equip it on an eligible Pokémon, confirm the flash animation
plays with the reveal text "{Name} Mega Evolved!" (no "is evolving into"),
confirm unequipping later (Task 8's `handleMegaUnequip`) does NOT trigger
any animation — instant, silent revert.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: play the flash animation on Mega Stone equip"
```

---

### Task 13: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, zero failures, including every pre-existing suite
(`pokemon.test.js`, `safariBake.test.js`, `shop.test.js`, etc.) alongside
the new `attackTypes.test.js`, `megas.test.js`, `nodeMap.test.js`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 3: Manual end-to-end run**

Play a full run from `npm run dev`: start a Kanto or Hoenn run (species
with real mega forms), reach map 3+, find a Mega Stone node (force the
chance temporarily if RNG doesn't cooperate — remove the override before
the final commit), equip a mega, fight a battle with it active (confirm
damage numbers reflect the new stats/type), unequip mid-run, trigger a
real evolution (rare candy or level-up) and confirm the new animation
plays for that too.

- [ ] **Step 4: Remove any temporary debug overrides**

`grep -rn "megaStoneChance" src/game/nodeMap.js` — confirm no hardcoded
`return 1` or similar test scaffolding was left in from manual
verification steps in earlier tasks.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: mega evolution regression pass"
```

(Only if Step 4 found something to remove — otherwise no commit needed
here.)
