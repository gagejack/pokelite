# PokeLike — Codebase Audit & Modularity Plan

**Audience:** an AI implementer. Every item below is self-contained with file
paths, line references, the exact change, and how to verify. Items are grouped
and ordered so earlier ones don't conflict with later ones. Do them in order.

**Guiding constraint (from CLAUDE.md):** game data (pools, teams, type charts)
must live in `src/game/`, never in components. The game loop must be modular so
Hoenn (and other regions) can reuse it with only new *assets + data*, no logic
changes. This plan's north star is: **make a region a pure data object, and make
every component/loop read from the region config — never from a Unova-specific
module.**

---

## PART A — BUGS (fix first; independent of modularity work)

### A1. Type chart: steel is wrong vs ice and fairy (duplicate object keys)
**File:** [src/game/typeChart.js](src/game/typeChart.js) line 14 (the `steel:` row).

The `steel` row lists `ice` and `fairy` **twice** each:
```
steel: { rock: SE, ice: SE, fairy: SE, ... , ice: NV, dragon: NV, fairy: NV, normal: NV, poison: IM },
```
In a JS object literal the **last** key wins, so steel is currently computed as
`ice: 0.5` and `fairy: 0.5` — steel deals *half* damage to ice/fairy. Correct
Gen-5 chart: **steel is super-effective (2×) vs ice, rock, and fairy.**

**Fix:** Remove the second `ice: NV` and second `fairy: NV` from the steel row.
The row should read:
```js
steel: { rock: SE, ice: SE, fairy: SE, fighting: NV, ground: NV, fire: NV, water: NV, electric: NV, steel: NV, dragon: NV, poison: IM },
```
(Note the earlier duplicated defensive entries `flying: NV, psychic: NV, bug: NV,
grass: NV, normal: NV` in that row are **not** part of steel's *offensive* chart —
`TYPE_CHART[attackType][defType]` is attack steel vs defender. Steel attacking
flying/psychic/bug/grass/normal is neutral (1×), so those `NV` entries are ALSO
wrong. Reduce the steel row to exactly steel's offensive matchups: `rock: SE,
ice: SE, fairy: SE, steel: NV, fire: NV, water: NV, electric: NV, poison: IM`.)

**Verify:** In a node with a `console` or via the running app, a Steel move vs an
Ice-type enemy must now show "super effective" and ~2× damage. Before the fix it
shows "not very effective". Drive a Steel-type attacker (e.g. Klinklang line,
id 601) into an Ice enemy on map 7 and confirm the damage/effectiveness label.

### A2. `applyBattleVictory` heals fainted Pokémon 0 but grass losses can still level
**File:** [src/game/pokemon.js](src/game/pokemon.js) lines 184–205; called from
[src/components/NodeMap.jsx](src/components/NodeMap.jsx) line 434 (`if (won)`).

This is fine as-is (victory only). **No change** — listed to confirm it was
reviewed. The 5% survivor heal and fainted-guard in `levelUp` (line 220) are
correct.

### A3. Master Ball can spawn but grass/pokéball fallback level defaults to Patrat (504)
**File:** [src/components/NodeMap.jsx](src/components/NodeMap.jsx) line 338.

`const id = pool.length > 0 ? pick(pool).id : 504` hardcodes Unova's Patrat as the
fallback species when a region has no catch pool for a map. This is a Unova leak
into the generic component. Low severity today (Unova always has pools), but it
will silently spawn a Patrat in Hoenn if a pool is missing. **Fix as part of B4**
(region config should provide a `fallbackSpeciesId`). Track here; implement in B4.

### A4. `STARTER_BOSS` fallback to 'Chili' is Unova-specific but lives in region file
**File:** [src/game/regions/unova.js](src/game/regions/unova.js) line 646.

`const boss = i === 0 ? (STARTER_BOSS[starter?.id] ?? 'Chili') : MAP_BOSSES[i]`.
This is correctly inside the Unova config, so it's not a leak — but the pattern
(map-1 boss depends on starter) must be generalized so Hoenn can express its own
starter→boss mapping. **Handled in B2** (move `starterBoss` into region config
shape). No standalone fix.

---

## PART B — MODULARITY (the core ask: make the loop region-agnostic)

**The central problem:** [src/game/enemyTeams.js](src/game/enemyTeams.js) is 100%
Unova data (dex 504–649) but lives in the *generic* `game/` layer, and three
non-Unova files import from it directly:
- [src/App.jsx](src/App.jsx) line 11 — `TRAINER_SPECIES_POOLS, BOSS_TEAMS, ELITE_FOUR_TEAMS`
- [src/components/NodeMap.jsx](src/components/NodeMap.jsx) line 17 — 8 named imports
- [src/components/EliteFour.jsx](src/components/EliteFour.jsx) line 10 — `ELITE_FOUR_TEAMS, POKEMON_NAMES`
- [src/components/NodeMap.jsx](src/components/NodeMap.jsx) line 14 — `pickCatchOffer` imported from `regions/unova.js` (a specific region!)

Until these all read from the **region config object**, dropping in Hoenn means
editing the shared modules — which is exactly what modularity must prevent.

The end state: **`getRegionConfig(name)` returns everything the loop needs.**
Components import only pure *functions* from `game/` (the algorithms) and all
*data* from the config.

### B1. Move Unova battle data into the Unova region module
**Create the region-owned data; keep the algorithms generic.**

1. In [src/game/regions/unova.js](src/game/regions/unova.js), add (or import from a
   new `src/game/regions/unova.teams.js` to keep the file manageable — the region
   file is already 650+ lines) the following, moved verbatim from
   [src/game/enemyTeams.js](src/game/enemyTeams.js):
   - `POKEMON_TYPES`, `POKEMON_NAMES` (lines 4–51)
   - `TRAINER_SPECIES_POOLS` (lines 62–79)
   - `BOSS_TEAMS` (lines 82–108)
   - `ELITE_FOUR_TEAMS` (lines 112–118)
   - `MAP_LEVEL_RANGES` (lines 121–123)

2. Attach them to `unovaConfig` (line 627):
   ```js
   export const unovaConfig = {
     name: 'Unova',
     damageMultiplier: 2.5,
     // ...existing...
     trainerSpeciesPools: TRAINER_SPECIES_POOLS,
     bossTeams: BOSS_TEAMS,
     eliteFourTeams: ELITE_FOUR_TEAMS,
     mapLevelRanges: MAP_LEVEL_RANGES,
     pokemonTypes: POKEMON_TYPES,   // id → type, for tooltips
     pokemonNames: POKEMON_NAMES,   // id → name, for tooltips
     fallbackSpeciesId: 504,        // used when a map pool is empty (see A3/B4)
     pickCatchOffer,                // move the fn reference here too (see B3)
     catchTierBudget: CATCH_TIER_BUDGET,
   }
   ```

3. In [src/game/enemyTeams.js](src/game/enemyTeams.js), **keep only the pure,
   region-agnostic functions** and re-home them:
   - `pickLevel([min,max], positionWeight)` (lines 134–138) — pure, keep.
   - `mapLevelRange(mapIndex)` (lines 126–128) — **change signature** to take the
     ranges array: `mapLevelRange(ranges, mapIndex)`. It must not reference a
     module-level constant anymore.
   - `buildTrainerTeamSpec(...)` (lines 144–156) — **change signature** to accept
     the pool + ranges: `buildTrainerTeamSpec(pool, band, count, positionWeight)`.
     Remove its internal reads of `TRAINER_SPECIES_POOLS` and `mapLevelRange`.
   - `pickTrainerCount(mapIndex)` (lines 159–163) — pure (depends only on index),
     keep. (If you want per-region team sizes later, move to config; not required
     now.)

   Rename this file to **`src/game/battleTeams.js`** (it's now generic team-spec
   helpers, no region data). Update the two importers (NodeMap, and delete the
   App import per B2).

**Verify:** `npm run build` clean. Grep confirms `enemyTeams.js` no longer exists
and no file imports Unova dex numbers from a generic module.

### B2. App.jsx should not import battle data at all
**File:** [src/App.jsx](src/App.jsx) lines 11, 216.

Line 11 imports `TRAINER_SPECIES_POOLS, BOSS_TEAMS, ELITE_FOUR_TEAMS` **only** to
pass to `prewarmCache` (line 216). Replace with config-driven prewarm:

- Change `prewarmCache` signature in [src/game/pokemon.js](src/game/pokemon.js)
  line 29 from `prewarmCache(regionConfig, trainerPokemonPools, bossTeams)` to
  `prewarmCache(regionConfig)` and read everything off the config:
  ```js
  export async function prewarmCache(regionConfig) {
    const ids = new Set()
    regionConfig.catchPools?.forEach(pool => pool.forEach(m => ids.add(m.id)))
    regionConfig.trainerSpeciesPools?.forEach(pool => pool.forEach(id => ids.add(id)))
    Object.values(regionConfig.bossTeams ?? {}).forEach(t => t.forEach(({id}) => ids.add(id)))
    Object.values(regionConfig.eliteFourTeams ?? {}).forEach(t => t.forEach(({id}) => ids.add(id)))
    regionConfig.legendaryPools?.forEach(pool => pool.forEach(({id}) => ids.add(id)))
    // ...rest unchanged...
  }
  ```
  (Also prewarms Elite Four + legendaries, which the current code misses.)
- In App.jsx line 216: `if (config) prewarmCache(config)`. Delete the line-11
  import entirely.
- Also fold the map-1 starter→boss mapping into the config: add
  `starterBoss: { 495:'Chili', 498:'Cress', 501:'Cilan' }` to `unovaConfig` and
  have `generate` read `config.starterBoss` (it already does via the local
  `STARTER_BOSS`; just expose it so other regions define their own).

**Verify:** App.jsx has zero imports from `game/enemyTeams` / `battleTeams`.
Prewarm still runs (network tab shows PokéAPI fetches on region select).

### B3. NodeMap must read all battle data from config, not from unova.js / enemyTeams.js
**File:** [src/components/NodeMap.jsx](src/components/NodeMap.jsx) lines 14, 17.

Replace:
```js
import { pickCatchOffer } from '../game/regions/unova.js'
import { buildTrainerTeamSpec, pickTrainerCount, BOSS_TEAMS, TRAINER_SPECIES_POOLS, POKEMON_TYPES, POKEMON_NAMES, mapLevelRange, pickLevel } from '../game/enemyTeams.js'
```
with **only generic functions**:
```js
import { buildTrainerTeamSpec, pickTrainerCount, mapLevelRange, pickLevel } from '../game/battleTeams.js'
```
Then thread data from `config`:
- Line 325 `specs = BOSS_TEAMS[node.trainer]` → `config.bossTeams[node.trainer]`.
- Line 332 `buildTrainerTeamSpec(node.trainer, count, positionWeight, mapIndex)`
  → compute `band = mapLevelRange(config.mapLevelRanges, mapIndex)` and
  `pool = config.trainerSpeciesPools[Math.min(mapIndex, len-1)]`, then
  `buildTrainerTeamSpec(pool, band, count, positionWeight)`.
- Lines 339, 366 `mapLevelRange(mapIndex)` → `mapLevelRange(config.mapLevelRanges, mapIndex)`.
- Line 338 fallback `504` → `config.fallbackSpeciesId ?? 504` (fixes A3).
- Line 369 `pickCatchOffer(pool, 3)` → `config.pickCatchOffer(pool, 3)`
  (or keep `pickCatchOffer` generic in `game/` since the algorithm is region-
  agnostic — see note below).
- Lines 518–531 (getNodeLabel tooltips): `TRAINER_SPECIES_POOLS` →
  `config.trainerSpeciesPools`; `POKEMON_TYPES` → `config.pokemonTypes`;
  `POKEMON_NAMES` → `config.pokemonNames`; `BOSS_TEAMS` → `config.bossTeams`.

**Note on `pickCatchOffer` and `CATCH_TIER_BUDGET`:** the *algorithm*
(lines 545–563 of unova.js) is fully generic — it only needs a pool and a budget
table. **Move `pickCatchOffer` and the default `CATCH_TIER_BUDGET` to a new
generic module `src/game/catch.js`**, and let a region override the budget via
`config.catchTierBudget`. Then NodeMap imports `pickCatchOffer` from `game/catch.js`
and passes `config.catchTierBudget`. This removes the "component imports a specific
region file" smell entirely.

**Verify:** NodeMap imports nothing from `regions/*`. Play a full map: trainers,
grass, pokéball catches, and a boss all still spawn correct-level teams; tooltips
still show types/names.

### B4. EliteFour must read teams + names from config
**File:** [src/components/EliteFour.jsx](src/components/EliteFour.jsx) line 10.

Replace `import { ELITE_FOUR_TEAMS, POKEMON_NAMES } from '../game/enemyTeams.js'`
with config reads:
- Line 42, 92 `ELITE_FOUR_TEAMS[member.name]` → `config.eliteFourTeams[member.name]`.
- Line 143 `POKEMON_NAMES[s.id]` → `config.pokemonNames[s.id]`.
Remove the import.

**Verify:** Beat the 8th gym, enter Elite Four, confirm each member's team preview
names + levels render and battles start.

### B5. Result of B1–B4: the region config is now the single source of truth
After B1–B4, `getRegionConfig(name)` returns an object with this **complete shape**
(document this as a comment block at the top of
[src/game/regionRegistry.js](src/game/regionRegistry.js) so future regions have a
checklist):
```
{
  name, damageMultiplier,
  characters[], trainerSprites{}, trainerFullSprites{},
  catchPools[8][], legendaryPools[8][], catchTierBudget{},
  trainerSpeciesPools[8][], mapLevelRanges[8][2],
  bossTeams{name:[{id,level}]}, eliteFourTeams{name:[{id,level}]},
  pokemonTypes{id:type}, pokemonNames{id:name},
  starterBoss{starterId:bossName}, fallbackSpeciesId,
  eliteFour[{name,type,sprite,fullSprite,champion?}],
  maps[8]{ generate(starter), edges, background, grassIcon },
}
```
**No component should import from `src/game/regions/*` after this part.** Grep to
prove it: `grep -rn "regions/" src/components` returns nothing.

### B6. Author Hoenn as pure data (the payoff / proof the loop is modular)
**Files:** [src/game/regions/hoenn.js](src/game/regions/hoenn.js) (currently
`maps: []`), and register nothing new — it's already in the registry.

With B1–B5 done, making Hoenn playable requires **only** filling the same fields
Unova fills — no logic edits anywhere else. Provide:
- `catchPools` (8 arrays of `{id,rarity}`, dex 252–386, evolution-gated by band).
- `trainerSpeciesPools`, `bossTeams` (Roxanne…Wallace), `eliteFourTeams`
  (Sidney, Phoebe, Glacia, Drake, + Champion Steven/Wallace).
- `mapLevelRanges`, `legendaryPools` (Regis, Latios/Latias, Kyogre/Groudon/Rayquaza).
- `pokemonTypes` / `pokemonNames` for every id used (or better — see C1 —
  derive these at runtime and delete the hand-maintained tables entirely).
- `starterBoss` (252/255/258 → first gym), `fallbackSpeciesId`.
- `maps[8]` reusing the shared `buildRows` + `MAP_EDGES` (both already generic).
- Trainer/character/gym sprite maps (assets already staged under
  `src/assets/regions/Hoenn/`).

This item is the acceptance test for the whole refactor: **if Hoenn needs any
change outside `hoenn.js`, the modularization in B1–B5 is incomplete.**

---

## PART C — REDUNDANCIES & EFFICIENCIES

### C1. Delete the hand-maintained POKEMON_TYPES / POKEMON_NAMES tables (biggest win)
**Files:** [src/game/enemyTeams.js](src/game/enemyTeams.js) lines 4–51 (→ moving in
B1); consumers in NodeMap + EliteFour tooltips.

These two ~90-entry tables duplicate data the app **already fetches** from PokéAPI
in `fetchPokemonBase` (name + types are on the cached base object, see
[src/game/pokemon.js](src/game/pokemon.js) lines 68–70). Maintaining them by hand
for every region is error-prone and defeats "don't bundle what PokéAPI gives you".

**Two options — recommend option (a):**
- **(a) Runtime, from cache.** Since `prewarmCache` (B2) already fetches every id a
  region uses *before* the map renders, the `baseCache` holds name+types for all of
  them. Add tiny accessors to `pokemon.js`:
  ```js
  export function cachedType(id) { return baseCache.get(id)?.types?.[0] ?? null }
  export function cachedName(id) { return baseCache.get(id)?.name ?? null }
  ```
  Replace all `POKEMON_TYPES[id]` / `POKEMON_NAMES[id]` tooltip lookups with these.
  Delete both tables from every region. (Guard for `null` while prewarm is in
  flight — tooltips already tolerate `'???'`/`'?'` fallbacks.)
- **(b)** Keep per-region tables but auto-generate them with a one-off script.
  More maintenance than (a). Skip unless offline tooltips before prewarm matter.

**Verify:** Tooltips on trainer/boss/elite nodes still show correct type chips and
names after removing the tables. Removes ~180 lines of hand-keyed data per region.

### C2. Consolidate the three identical `onSwap` roster reorder closures
**Files:** [src/components/NodeMap.jsx](src/components/NodeMap.jsx) lines 587, 651;
[src/components/EliteFour.jsx](src/components/EliteFour.jsx) line 169.

The swap closure `(a,b) => setRoster(prev => { const r=[...prev]; [r[a],r[b]]=[r[b],r[a]]; return r })`
is written **three times**. Extract one helper `swapInRoster(setRoster)` in a
small shared util (e.g. `src/game/roster.js`, pure) or accept an `onSwap` from App
and pass it down. Low risk, removes duplication.

### C3. Duplicate evolution-notice modal markup in NodeMap and EliteFour
**Files:** [src/components/NodeMap.jsx](src/components/NodeMap.jsx) lines 733–759;
[src/components/EliteFour.jsx](src/components/EliteFour.jsx) lines 203–226.

The "X evolved into Y!" modal is copy-pasted. Extract a
`<EvolutionNotice notices={...} onDismiss={...} />` component in
`src/components/`. Both screens render it. Removes ~25 duplicated lines each.

### C4. Duplicate `applyBattleVictory → notices → setRoster` block
**Files:** [src/components/NodeMap.jsx](src/components/NodeMap.jsx) lines 434–441;
[src/components/EliteFour.jsx](src/components/EliteFour.jsx) lines 65–73.

Same sequence (apply victory, record owned species, set roster, set notices).
Optional: extract `useBattleVictory(setRoster, onSpeciesOwned)` hook returning a
function that runs the block. Lower priority than C1–C3.

### C5. `moveItem`/`handleItemAssign`/`handleItemKeepInBag` overlap
**File:** [src/App.jsx](src/App.jsx) lines 125–166.

`handleItemAssign` (125) and `handleItemKeepInBag` (130) predate the unified
`moveItem` (139). The item-node flow could route through `moveItem` with a
synthetic `from:{kind:'offer'}` source (no removal). Optional cleanup — current
code is correct, just three handlers where one generalized one would do. Only do
this if touching the item flow anyway; it's working today.

### C6. Orphaned assets & dead files (disk/bundle hygiene)
- **`src/assets/regions/Unova/MapAssets/`** — `Route1/3/4/6/7/8/9/16.png`,
  `Striaton_City_Summer_B2W2.png`, `UnovaMaps.tset` (~5.8 MB) have **zero**
  imports (unova.js only imports `Map1.png`, `Map2.png`, `BW_Dark_Grass_Sp.png`).
  Delete them, or keep only if per-map backgrounds (B6-style) will use them.
  **Confirm with the user before deleting** — they may be staged for real map art.
- **`src/assets/regions/Johto/`** — empty folder. Remove (or populate; Johto isn't
  in the registry or StarterSelect's real flow).
- **`src/components/CharacterSelect.jsx`** — imported nowhere (char select is
  skipped, App.jsx line 15). Intentionally kept per prior decision; leave it but
  add a one-line `// Unused — retained for future character-select flow` header so
  it's not mistaken for dead code.
- **`lucide-react`** dependency — verify it's still imported anywhere
  (`grep -rn "lucide-react" src`). If not, remove from package.json.

**Verify each deletion with `npm run build`** (Vite errors loudly on a missing
import) and a grep for the basename before removing.

### C7. `damageMultiplier` inconsistency across regions
Unova uses `2.5`, Kanto/Hoenn/Sinnoh stubs use `2`. Not a bug, but note that
balance is tuned around Unova's 2.5 and the shared level bands. When authoring
Hoenn (B6), set its `damageMultiplier` deliberately and re-verify TTK against the
same `MAP_LEVEL_RANGES`, or the loop will feel different per region.

---

## PART D — SUGGESTED EXECUTION ORDER
1. **A1** (type chart) — isolated 1-line correctness fix, ship immediately.
2. **B1 → B2 → B3 → B4 → B5** — the modularity refactor, in that order (each
   depends on the previous). After B5, grep-prove no component imports `regions/*`.
3. **C1** — delete the type/name tables (depends on B2 prewarm being in place).
4. **C2, C3** — dedupe closures/modals (independent, low risk).
5. **B6** — author Hoenn as pure data; this is the acceptance test for A/B/C.
6. **C6** — asset/dep cleanup (confirm deletions with user first).
7. **C4, C5, C7** — optional polish.

## VERIFICATION CHECKLIST (run after each part)
- `npm run build` is clean (Vite fails on missing imports — cheap safety net).
- Lint: no *new* errors beyond the ~45 pre-existing baseline
  (`design-doc-of-record` memory notes ~46 pre-existing).
- Playwright smoke on a running dev server (localhost): start a Unova run, clear
  a full map (grass + trainer + pokéball + item + boss), enter Elite Four, beat a
  member. Confirm levels, tooltips, catches, evolutions, and item drag all work.
- **Modularity acceptance:** `grep -rn "regions/" src/components` and
  `grep -rn "enemyTeams" src` both return nothing after Part B.
