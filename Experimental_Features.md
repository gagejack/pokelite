# Experimental Features & Reworks

Ideas for making Speedmon run smoother, feel better to play, and be easier to
modify and balance. Grouped by goal, roughly ordered by impact-per-effort
inside each section. Each idea has a short pitch plus a high-level
implementation sketch with the files it would touch.

---

## 1. Performance & Responsiveness

### 1.1 Lazy-load region sprite assets
Region configs statically import every sprite — `kanto.js` alone imports ~160
`.webp` files, and `src/assets` is ~25 MB. All four regions' sprites get
bundled into the module graph up front, which bloats the initial chunk and
slows first paint (only `NodeMap`/`EliteFour` are lazy today).
**Implementation:** Change `trainerSprites`/`trainerFullSprites`/`characters`
in `src/game/regions/*.js` from imported values to URL strings (move sprites to
`public/`) or use `import.meta.glob` with lazy loaders. `getRegionConfig()`
gains an async `loadRegionAssets(name)` called on region select, before
`prewarmCache`. Biggest single win for load time.

### 1.2 Bundle Pokémon base data locally instead of live PokéAPI calls
Every run depends on runtime fetches to pokeapi.co — `prewarmCache` fires
hundreds of requests on region select, and a hiccup mid-run stalls node
clicks. The data used per species is tiny (id, name, types, 6 base stats, 4
sprite URLs).
**Implementation:** Add a one-time build script (node) that walks all species
ids referenced by the region configs + evolution lines and emits
`src/game/data/pokedex.json` (a few hundred KB). `fetchPokemonBase` in
`src/game/pokemon.js` reads from that map first, falling back to the network
for misses. Evolution chains get the same treatment (`evolutions.json`). Runs
become offline-capable and node clicks become instant.

### 1.3 Memoize map node rendering
`NodeMap.jsx` keeps `hoveredNode` in top-level state, so every hover re-renders
the entire `MapSvg` (all `<image>` nodes) plus all overlay hit-buttons.
**Implementation:** Extract the per-node `<g>` and the per-node `<button>`
into `React.memo` components keyed on `(node, cleared, reachable, locked,
isHovered)`. Hover then only re-renders the two nodes whose hover state
changed. Also move `nodePositions` into a `useMemo` (currently rebuilt every
render).

### 1.4 "Skip battle" / instant-resolve option
Battles simulate instantly but replay frame-by-frame on timers; even at 3×
speed a long trainer gauntlet is dead time. `simulateBattle` already produces
the full result up front.
**Implementation:** Add a "Skip" button in `BattleCard.jsx` that cancels the
replay timer, jumps `logIndex` to the end, and applies `finalPlayerTeam`
immediately (same code path as the natural finish). Gate behind a settings
toggle next to `battleSpeed` in `src/lib/settings.jsx`.

### 1.5 Prefetch enemy sprites during map idle
Battle sprites pop in after a node click because `fetchEnemyTeam` resolves the
trainer sprite URL but nothing preloads it.
**Implementation:** After `mapData` generates in `NodeMap.jsx`, fire
`new Image().src = ...` for each trainer node's full sprite (and the boss's).
Cheap; smooths every battle transition on the map.

---

## 2. Gameplay Enjoyment

### 2.1 Interactive battles (the big one)
Battles are fully auto-simulated — the player only watches. Adding even one
decision per round would transform the game.
**Implementation (incremental path):**
1. *Switching:* between rounds, let the player swap the active Pokémon for a
   bench slot (consumes that Pokémon's turn). `simulateBattle` in
   `src/game/battle.js` becomes step-based: expose `simulateRound(state)`
   instead of one monolithic loop; `BattleCard` drives it, pausing for player
   input at round boundaries. The log format stays the same, so the replay UI
   is untouched.
2. *Second move:* give each Pokémon its secondary type's move (already have
   `types[1]` and `getTypeMove`), and let the player pick which to use each
   round.
3. *Bag items in battle:* allow one consumable per battle.

### 2.2 Status effects & abilities
Depth systems that create matchup texture without new art.
**Implementation:** Add a `status` field to instances. In `battle.js`, apply
burn (−attack, chip damage), paralysis (−speed, skip chance), poison (chip)
with the same `events` array pattern items already use — the UI popups
(`itemFx`) generalize to status popups. Abilities follow the item-hook model
(see 3.3): a per-species id consumed by the same hook pipeline.

### 2.3 Seeded runs / daily seed
Deterministic runs enable sharing ("try seed KANTO-7Q2"), a daily leaderboard,
and reproducible bug reports.
**Implementation:** Replace all `Math.random()` call sites with an injectable
PRNG (e.g. mulberry32) threaded through `nodeMap.js`, `items.js`, `catch.js`,
`battleTeams.js`, `battle.js`, `pokemon.js` (shiny/stage rolls). Start with a
module-level `rng` object that defaults to `Math.random`; add a seed input on
the region-select screen. Also the foundation for section 4 tooling.

### 2.4 Reroll tokens for offers
Item and catch offers are take-it-or-leave-it; a bad spread feels like a wasted
node. A limited number of rerolls per map adds agency without new node types.
**Implementation:** Track `rerollsLeft` in run state (`App.jsx`), award +1 per
map clear. `ItemNode.jsx`/`PokeballNode.jsx` get a reroll button that re-runs
`pickThreeItems`/`pickCatchOffer` on the same node.

### 2.5 Meta-progression
Between-run unlocks: new starters, starting items, or region modifiers earned
via lifetime stats (already tracked in `runs`/`catches`/`badges` tables).
**Implementation:** New `meta` table keyed by user; a small "unlock
conditions" config in `src/game/`; `StarterSelect.jsx` reads unlocked starters
from it. Purely additive — no run-loop changes.

---

## 3. Easier Gameplay-Loop Modification

### 3.1 Node-type handler registry
`handleNodeClick` in `NodeMap.jsx` is a hardcoded if/else chain over
`NODE_TYPES` — adding a node type means editing the dispatcher, the icon map,
the sizing helper, and the battle-detection list.
**Implementation:** Create `src/game/nodeHandlers.js`:
```js
export const NODE_HANDLERS = {
  [NODE_TYPES.ITEM]: { isBattle: false, icon, isBossSized: false,
                       activate: async (node, ctx) => ... },
  ...
}
```
`handleNodeClick` becomes `NODE_HANDLERS[node.type].activate(node, ctx)`.
New node types are registered in one place; regions can even override handlers
via their config.

### 3.2 Move map-generation knobs into region config
`ROW_WIDTHS`, `NODE_TYPE_CHANCES`, `masterBallChance`, the guaranteed
Pokéball/Pokécenter rows, and the rival placement (`rows[4][1]` hardcoded in
`kanto.js generate()`) are global constants, so every region is forced into
the same map shape.
**Implementation:** Add a `mapGen` section to the region config:
```js
mapGen: {
  rowWidths: [1,2,3,4,3,4,3], nodeChances: [...],
  masterBallRamp: { startIndex, endIndex, start, end },
  guarantees: [{ row: 1, col: 0, type: 'pokeball' }, ...],
  fixedNodes: [{ map: 2, row: 4, col: 1, type: 'rival', trainer: 'Blue', rivalTeam: 'blueEarlyGame' }],
}
```
`buildRows` in `src/game/nodeMap.js` reads the config instead of constants.
Regions gain distinct pacing by editing data, not code.

### 3.3 Data-driven item effects (hook pipeline)
All 28 item effects are inline if-chains inside `calcDamage` and
`simulateBattle` (`battle.js`) — adding or tweaking an item means editing the
core sim, and item descriptions in `items.js` can drift from actual behavior.
**Implementation:** Give each item in `items.js` declarative hooks:
```js
{ id: 'choice_band', hooks: { modifyAttack: ({ atk, isSpecial }) => isSpecial ? atk : atk * 1.5 } }
```
`battle.js` exposes hook points (`modifyAttack`, `modifyDefense`,
`modifyDamage`, `onAfterHit`, `endOfRound`, `onSuperEffectiveTaken`...) and
runs the holder's hooks at each. `calcDamage`/`simulateBattle` shrink to a
generic pipeline, and item behavior lives next to its description.

### 3.4 Central balance/tuning module
Tunables are scattered: node odds (`nodeMap.js`), item budgets (`items.js`),
catch budgets (`catch.js`), tier powers (`typeMoves.js`), starter boost + heal
% (`pokemon.js`), trainer counts + level curves (`battleTeams.js`), item
effects (`battle.js`), `damageMultiplier` (region config + defaulted again in
`BattleCard`).
**Implementation:** One `src/game/balance.js` exporting a nested `BALANCE`
object; every module imports its knobs from there. Pure reorganization, zero
behavior change — but now playtesting tweaks happen in a single file, and the
sim tooling below can import it.

### 3.5 Trim the battle log schema
Attack entries carry legacy/duplicate fields (`side` vs `attackerSide`,
`playerActiveHp`/`enemyActiveHp` computed mid-loop) that couple the sim to
display details.
**Implementation:** Define the log entry shape once (JSDoc typedef in
`battle.js`), drop redundant fields, and have `BattleCard` derive active-HP
from the entry it's rendering. Small, but makes the sim/replay contract
explicit before adding interactivity (2.1).

---

## 4. Easier Balancing

### 4.1 Headless balance simulator
`battle.js`, `battleTeams.js`, `items.js`, `catch.js` are already pure — they
can run in plain node with no DOM. A sim script can answer "what % of runs die
to map-3 Blue?" or "does nerfing Leftovers to 8% matter?" in seconds instead
of playtests.
**Implementation:** `scripts/simulate.mjs` builds synthetic rosters per map
band (using `mapLevelRanges` + `buildTrainerTeamSpec`), runs N battles per
node type per map via `simulateBattle`, and prints win rates, average rounds,
and damage-taken distributions. Requires 2.3 (seeded RNG) for reproducible
reports. Wrap in `npm run sim`.

### 4.2 Live balance telemetry
The `runs` table records outcomes but not *where* runs die.
**Implementation:** Extend the `recordRunEnd` payload in `App.jsx` with
`lost_to` (node type + trainer + mapIndex) and `roster_levels`; add an
optional per-battle insert for boss/rival fights (already special-cased).
Query win rate per boss/map in the Supabase SQL editor to find walling spots.

### 4.3 Dev balance dashboard
`itemOdds()` already exists for inspecting drop rates but is never rendered.
**Implementation:** A dev-only route (or `?dev=1` panel in `Stats.jsx`)
showing: item drop %s (`itemOdds()`), catch odds per map, move-tier DPS at
each level band (`TIER_BASE_POWER` × `calcStat` curves), and node-type
distribution per map. Read-only views over existing data — no game changes.

### 4.4 Difficulty modes
Easy/Normal/Hard as a first-class knob also doubles as a balance
experimentation harness.
**Implementation:** A `difficulty` field in settings that scales three
existing inputs: `damageMultiplier` (already per-region), enemy level band
offsets (applied in `mapLevelRange`), and `levelsGained` on victory
(`BattleCard`/`NodeMap`/`EliteFour` call sites of `applyBattleVictory`). All
multipliers live in `balance.js` per 3.4.

---

## Suggested order

| Priority | Item | Why first |
|---|---|---|
| 1 | 3.4 Central balance module | Pure refactor; everything below builds on it |
| 2 | 2.3 Seeded RNG | Unlocks sims, dailies, reproducible bugs |
| 3 | 4.1 Headless simulator | Balance stops being guesswork |
| 4 | 1.1 Lazy region assets | Biggest UX-perf win, low risk |
| 5 | 3.3 Item hook pipeline | Makes 2.x gameplay additions cheap |
| 6 | 1.2 Local Pokédex data | Removes the runtime network dependency |
| 7 | 2.1 Interactive battles | Largest effort; do after 3.3/3.5 land |
