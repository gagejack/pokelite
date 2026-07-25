# Implementation Plan — 3.4 Central Balance/Tuning Module

> Handoff plan for implementing Experimental Feature 3.4. Pure reorganization,
> **zero behavior change**. Every numeric gameplay knob moves into one nested
> `BALANCE` object in a new `src/game/balance.js`; the modules that own the
> logic keep the logic and import their numbers.

## Context

Tunables are scattered across seven files, so playtest tweaks mean hunting
through sim code. A single `balance.js` makes tuning one-file work, and the
admin Balance dashboard (`src/components/BalanceDashboard.jsx`) plus future
headless sims (feature 4.1) can read the same source of truth.

Two things changed since the doc's 3.4 blurb was written — the plan accounts
for both:

- `damageMultiplier` is no longer a plain config constant. It is now a
  **dynamic per-region player/enemy pair** backed by Supabase
  (`src/lib/regionBalance.js`, `region_balance` table, admin sliders in the
  dashboard). **Do not move or wrap it.** The region config's
  `damageMultiplier` stays where it is as the offline fallback seed.
- `MAX_LEVEL = 100` now exists in `pokemon.js` (level clamp) — include it.

## Non-goals

- No behavior change of any kind. Same numbers, same draw algorithms, same RNG
  call order (do not reorder `Math.random()` calls).
- Do NOT touch: region data (pools/teams/level bands in `src/game/regions/*`),
  the Supabase balance sliders/`regionBalance.js`, UI animation timings
  (`PROJECTILE_MS`, `FAINT_DRAIN_MS`, etc. in BattleCard — presentation, not
  balance), `TIER_COLORS`/`TYPE_COLORS` (presentation).
- Do not implement 3.3 (item hook pipeline). Item *numbers* move; the if-chains
  stay exactly where they are.

## Design

New file `src/game/balance.js` — a **leaf module with zero imports** (so Node
scripts and future sim tooling can import it with no bundler). Deep-frozen
nested object plus nothing else:

```js
// Every gameplay tuning knob in one place. Data only — the algorithms stay in
// their owning modules and import numbers from here. Deep-frozen so a typo'd
// write fails loudly in dev instead of silently drifting balance.
export const BALANCE = Object.freeze({
  map: {
    rowWidths: [1, 2, 3, 4, 3, 4, 3],          // nodeMap.buildRows
    nodeTypeChances: [                          // was NODE_TYPE_CHANCES (order matters)
      { type: 'grass', chance: 28 }, { type: 'trainer', chance: 28 },
      { type: 'pokeball', chance: 19 }, { type: 'item', chance: 14 },
      { type: 'power_upgrade', chance: 5 }, { type: 'mystery', chance: 6 },
    ],
    masterBall: { startIndex: 2, endIndex: 7, start: 0.005, end: 0.10 },
    mysteryRerolls: 2,                          // was MYSTERY_REROLLS
  },
  items: {
    tierBudget: { common: 55, rare: 30, epic: 10, legendary: 5 }, // COPY CURRENT VALUES from items.js TIER_BUDGET — verify, don't trust this line
  },
  catch: {
    tierBudget: { common: 60, rare: 25, epic: 10, legendary: 5 }, // was CATCH_TIER_BUDGET
  },
  moves: {
    tierBasePower: { 1: 35, 2: 60, 3: 95, 4: 140 },  // was TIER_BASE_POWER
    tierLevels: { tier4: 75, tier3: 50, tier2: 25 }, // tierForLevel thresholds
  },
  pokemon: {
    maxLevel: 100,           // was MAX_LEVEL
    starterBoost: 1.3,       // buildPokemonInstance isStarter multiplier
    shinyOdds: 1 / 256,      // was SHINY_ODDS
    victoryHealPct: 0.05,    // applyBattleVictory survivor heal
    nonLevelEvoLevel: 20,    // was NON_LEVEL_EVO_LEVEL
    autoEvolveNonLevel: [133], // was AUTO_EVOLVE_NONLEVEL (Set built at import site)
  },
  progression: {
    levelsGained: { grass: 1, default: 2, rival: 4, eliteFour: 2 },
  },
  trainers: {
    // pickLevel spread: t = clamp01(positionWeight*posFactor + rand*randSpan - randOffset)
    level: { posFactor: 0.75, randSpan: 0.35, randOffset: 0.05 },
    // pickTrainerCount probability tables, keyed by map band
    count: {
      early:  { maxMap: 1, one: 0.5 },                    // 1-or-2
      mid:    { maxMap: 4, one: 0.4, two: 0.7 },          // 1/2/3
      late:   { two: 0.2 },                               // 2-or-3
    },
  },
  battle: {
    critChance: 1 / 16,
    critMultiplier: 1.5,
    randomRoll: { min: 0.85, span: 0.15 },
    heldItems: {
      choiceBand: 1.5, choiceScarf: 1.5, eviolite: 1.5, assaultVest: 1.5,
      lightClay: 1.25, scopeLens: 1.3, razorClaw: 1.6, expertBelt: 1.2,
      lifeOrb: 1.3, ironBall: 1.35, muscleBand: 1.2, wiseGlasses: 1.2,
      kingsRockCritFactor: 2 / 1.5, typePlate: 1.5, weaknessPolicy: 1.5,
      cellBattery: 1.3, brightPowderChance: 0.15, brightPowderFactor: 0.5,
      resistCharm: 0.5, bigRoot: 1.5,
      // NOTE: also sweep simulateBattle for leftovers/black-sludge %s and any
      // other inline numbers in battle.js; add entries with matching names.
    },
  },
})
```

**Important:** the values above are from a survey — the implementer must copy
each number from the live code, not from this document. Where this plan and
the code disagree, the code wins (zero behavior change is the contract).

`nodeTypeChances` uses string literals because `balance.js` must not import
`NODE_TYPES` (leaf module). `nodeMap.js` already defines the same strings —
add a dev-time assertion there that every `chance` entry's `type` matches a
`NODE_TYPES` value, so a typo can't silently drop a node type.

## Implementation steps

Work module by module; run `npm run build` after each step.

1. **Create `src/game/balance.js`** with the full object (copying values from
   code). Deep-freeze nested objects (small helper inside the file is fine).

2. **`src/game/nodeMap.js`** — `ROW_WIDTHS`, `NODE_TYPE_CHANCES` values,
   `MYSTERY_REROLLS`, and `masterBallChance`'s four constants now read from
   `BALANCE.map`. Keep the exports `NODE_TYPE_CHANCES` and `MYSTERY_REROLLS`
   (dashboard + NodeMap import them) as aliases of the BALANCE data with the
   `NODE_TYPES` values swapped in. Add the assertion described above.

3. **`src/game/items.js`** — `TIER_BUDGET` becomes
   `export const TIER_BUDGET = BALANCE.items.tierBudget`. Everything else in
   the file (weights, draw, odds) already reads `TIER_BUDGET`, so no other
   edits. Same pattern in **`src/game/catch.js`** for `CATCH_TIER_BUDGET`.

4. **`src/game/typeMoves.js`** — `TIER_BASE_POWER` aliases
   `BALANCE.moves.tierBasePower`; `tierForLevel` reads the three thresholds.

5. **`src/game/pokemon.js`** — `MAX_LEVEL`, `SHINY_ODDS`,
   `NON_LEVEL_EVO_LEVEL` become aliases; `AUTO_EVOLVE_NONLEVEL = new
   Set(BALANCE.pokemon.autoEvolveNonLevel)`; starter boost `1.3` and victory
   heal `0.05` read from BALANCE at their two call sites.

6. **`src/game/battleTeams.js`** — `pickLevel`'s three magic numbers and
   `pickTrainerCount`'s five probabilities read from `BALANCE.trainers`.
   Preserve the exact same expressions and `Math.random()` call counts.

7. **`src/game/battle.js`** — replace every inline item/crit/roll number with
   the `BALANCE.battle` entry (`calcDamage`, `effSpeed`, big-root heal, and a
   sweep of `simulateBattle` for leftovers/black-sludge/end-of-round numbers).
   This is the touchiest step: it is pure find-replace of literals, one
   commit, no restructuring.

8. **Components** — `levelsGained` ternaries in `NodeMap.jsx:679`,
   `BattleCard.jsx:37`, and the `levelsGained: 2` in `EliteFour.jsx:81` read
   from `BALANCE.progression.levelsGained` (grass/rival/default/eliteFour).

9. **Docs** — update `Agents.md` (one line: balance knobs live in
   `src/game/balance.js`) and mark 3.4 shipped in `Experimental_Features.md`.

## Back-compat strategy

Keep every existing export name (`TIER_BUDGET`, `CATCH_TIER_BUDGET`,
`TIER_BASE_POWER`, `NODE_TYPE_CHANCES`, `MYSTERY_REROLLS`, `SHINY_ODDS`,
`MAX_LEVEL`, `NON_LEVEL_EVO_LEVEL`, `AUTO_EVOLVE_NONLEVEL`) as aliases into
BALANCE. No importer (BalanceDashboard, NodeMap, ItemNode, scripts) needs to
change, and there is exactly one source of truth underneath.

## Verification (required before claiming done)

1. `npm run build` and `npx eslint` on every touched file — clean.
2. **Value-identity check** (the zero-behavior-change proof): small Node
   script that imports `itemOdds()`, `catchOdds()` (per Kanto/Unova map),
   `masterBallChance(0..7)`, `tierForLevel(1..100)`, and `TIER_BUDGET` /
   `CATCH_TIER_BUDGET` / `TIER_BASE_POWER`, and prints them JSON-stringified.
   Run it on `main` before the refactor, run it after, `diff` — must be
   byte-identical.
3. **Battle-sim spot check:** seedless sim of 200 battles (fixed teams, fixed
   multipliers) before/after — win-rate within noise (±5pp) and average log
   length within ±10%. Catches any accidentally changed battle number.
4. **Dashboard render:** drive the Balance dashboard (probe route pattern used
   before: temporary `?balanceprobe=1` in `main.jsx`, remove after) and
   confirm item %, catch %, node distribution, and tier-DPS panels show the
   same numbers as before the refactor.
5. `grep -rn` each moved literal (e.g. `1 / 512`, `0.005`, `{ 1: 35`) across
   `src/game` to confirm no orphaned duplicates remain.

## Gotchas

- **Leftover items in battle.js:** `simulateBattle` (below `calcDamage`) has
  more inline numbers than the survey grep showed (leftovers/black-sludge/
  shell-bell style end-of-round effects). Sweep the whole file.
- **RNG order:** `pickTrainerCount` chains `Math.random()` calls inside
  ternaries — keep the exact structure or map generation changes under the
  same seed (matters for future 2.3 seeded runs).
- **`balance.js` must import nothing** — that's what keeps it usable from
  `scripts/*.mjs` and keeps it out of every circular-import conversation.
- **Do not touch `regionBalance.js` / the Supabase sliders** — the dynamic
  player/enemy multipliers are a separate, live system. `BALANCE` holds only
  static shipped defaults.
- `checkEvolution`'s allowlist is a `Set` — rebuild it from the BALANCE array
  once at module load, don't expose the Set from balance.js (freeze doesn't
  protect Set contents).
