# Experimental Features & Reworks

Ideas for making Speedmon run smoother, feel better to play, and be easier to
modify and balance. Each idea has a short pitch plus a high-level implementation
sketch with the files it would touch.

Split into two top-level tracks — **Engineering** (cleanup, bug fixes,
efficiency, tooling) and **Game Features** (things a player can feel) — each
divided into what has shipped and what hasn't. Original section numbers are kept
in parentheses so older notes and commit messages still resolve.

**Status at a glance**

| Track | Implemented | Not implemented |
|---|---|---|
| Engineering | 3 | 7 |
| Game features | 3 (one partial) | 6 |

---

# Part I — Code Cleanup, Bug Fixes & Efficiency

## I-A. Implemented

### Bundle Pokémon base data locally instead of live PokéAPI calls *(was 1.2)*
Every run used to depend on runtime fetches to pokeapi.co — `prewarmCache` fired
hundreds of requests on region select, and a hiccup mid-run stalled node clicks.

> **Shipped:** `scripts/buildPokedex.mjs` (`npm run build:dex`) bundles the
> region configs via rolldown (image imports stubbed), resolves the full
> level-up evolution-line closure, and emits `public/data/pokedex.json`
> (360 species, ~194 kB) + `public/data/evolutions.json` (159 pruned chains).
> `pokemon.js` loads both lazily on first use and falls back to live PokéAPI
> for anything uncovered. Evolution chains are pruned to level-up branches
> only (`pruneChain`), and `checkEvolution` now resolves next stages by id.
> `REGION_STARTERS` moved to `src/game/starters.js`. The Pokédex browser
> overlay (`Pokedex.jsx`) still uses the live names-list endpoint by design.

### Central balance/tuning module *(was 3.4)*
Tunables were scattered across `nodeMap.js`, `items.js`, `catch.js`,
`typeMoves.js`, `pokemon.js`, `battleTeams.js`, `battle.js`, and the region
configs.

> **Shipped:** `src/game/balance.js` — a deep-frozen, import-free leaf module
> holding every gameplay knob (map gen, item/catch budgets, move tiers,
> pokémon/evolution, progression, trainer gen, and all battle item/crit/roll
> numbers). Owning modules keep their logic and alias their exports
> (`TIER_BUDGET`, `NODE_TYPE_CHANCES`, `MAX_LEVEL`, `SHINY_ODDS`, etc.) into
> `BALANCE`, so no importer changed. `nodeMap.js` asserts each
> `nodeTypeChances` string is a real `NODE_TYPES` value. The dynamic
> per-region player/enemy `damageMultiplier` stays in Supabase
> (`lib/regionBalance.js`) — `BALANCE` holds only static defaults. Verified
> zero-behavior-change: a before/after snapshot of every odds function, tier
> table, and per-map catch % (Kanto+Unova) is byte-identical, and a
> deterministic `calcDamage` matrix (15 item/crit cases) matches exactly.

### Dev balance dashboard *(was 4.3)*
`itemOdds()` existed for inspecting drop rates but was never rendered.

> **Shipped:** `src/components/BalanceDashboard.jsx`, rendered as a tab inside
> the Stats modal (`Stats.jsx:222`). `catchOdds(pool, tierBudget)` was added to
> `src/game/catch.js` mirroring `itemOdds()`, and `NODE_TYPE_CHANCES` is now
> exported from `nodeMap.js`. Panels cover item drop %, per-map catch odds,
> move-tier DPS, and node distribution — no chart lib, CSS-width bars only.
> Client-side gating hides the UI only; the numbers ship in the bundle
> regardless, which is fine for read-only balance data.

## I-B. Not Implemented

### Lazy-load region sprite assets *(was 1.1)*
Region configs statically import every sprite — `kanto.js` alone imports ~160
`.webp` files, and `src/assets` is ~25 MB. All four regions' sprites get
bundled into the module graph up front, which bloats the initial chunk and
slows first paint (only `NodeMap`/`EliteFour` are lazy today).
**Implementation:** Change `trainerSprites`/`trainerFullSprites`/`characters`
in `src/game/regions/*.js` from imported values to URL strings (move sprites to
`public/`) or use `import.meta.glob` with lazy loaders. `getRegionConfig()`
gains an async `loadRegionAssets(name)` called on region select, before
`prewarmCache`. Biggest single win for load time.

### Memoize map node rendering *(was 1.3)*
`NodeMap.jsx` keeps `hoveredNode` in top-level state, so every hover re-renders
the entire `MapSvg` (all `<image>` nodes) plus all overlay hit-buttons.
**Implementation:** Extract the per-node `<g>` and the per-node `<button>`
into `React.memo` components keyed on `(node, cleared, reachable, locked,
isHovered)`. Hover then only re-renders the two nodes whose hover state
changed. Also move `nodePositions` into a `useMemo` (currently rebuilt every
render). Note: `mapData` is already memoized (`NodeMap.jsx:400`); the per-node
extraction is what remains.

### Prefetch enemy sprites during map idle *(was 1.5)*
Battle sprites pop in after a node click because `fetchEnemyTeam` resolves the
trainer sprite URL but nothing preloads it.
**Implementation:** After `mapData` generates in `NodeMap.jsx`, fire
`new Image().src = ...` for each trainer node's full sprite (and the boss's).
Cheap; smooths every battle transition on the map. (The existing `new Image()`
at `NodeMap.jsx:457` measures the background's aspect ratio — unrelated.)

### Node-type handler registry *(was 3.1)*
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

### Move map-generation knobs into region config *(was 3.2)*
`ROW_WIDTHS`, `NODE_TYPE_CHANCES`, `masterBallChance`, the guaranteed
Pokéball/Pokécenter rows, the pinned row-1 fork (left node forced to Pokéball,
right node forced to anything but), and the rival placement (`rows[4][1]`
hardcoded in `kanto.js generate()`) are global constants, so every region is
forced into the same map shape.
**Implementation:** Add a `mapGen` section to the region config:
```js
mapGen: {
  rowWidths: [1,2,3,4,3,4,3], nodeChances: [...],
  masterBallRamp: { startIndex, endIndex, start, end },
  guarantees: [{ row: 1, col: 0, type: 'pokeball' }, ...],
  exclusions: [{ row: 1, col: 1, not: ['pokeball', 'master_ball'] }],
  fixedNodes: [{ map: 2, row: 4, col: 1, type: 'rival', trainer: 'Blue', rivalTeam: 'blueEarlyGame' }],
}
```
`buildRows` in `src/game/nodeMap.js` reads the config instead of constants.
Regions gain distinct pacing by editing data, not code.

### Data-driven item effects (hook pipeline) *(was 3.3)*
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

### Trim the battle log schema *(was 3.5)*
Attack entries carry legacy/duplicate fields (`side` vs `attackerSide`,
`playerActiveHp`/`enemyActiveHp` computed mid-loop) that couple the sim to
display details.
**Implementation:** Define the log entry shape once (JSDoc typedef in
`battle.js`), drop redundant fields, and have `BattleCard` derive active-HP
from the entry it's rendering. Small, but makes the sim/replay contract
explicit before adding interactive battles.

### Headless balance simulator *(was 4.1)*
`battle.js`, `battleTeams.js`, `items.js`, `catch.js` are already pure — they
can run in plain node with no DOM. A sim script can answer "what % of runs die
to map-3 Blue?" or "does nerfing Leftovers to 8% matter?" in seconds instead
of playtests.
**Implementation:** `scripts/simulate.mjs` builds synthetic rosters per map
band (using `mapLevelRanges` + `buildTrainerTeamSpec`), runs N battles per
node type per map via `simulateBattle`, and prints win rates, average rounds,
and damage-taken distributions. Seeded RNG has shipped, so reports are already
reproducible. Wrap in `npm run sim`.

### Live balance telemetry *(was 4.2)*
The `runs` table records outcomes but not *where* runs die.
**Implementation:** Extend the `recordRunEnd` payload in `App.jsx` with
`lost_to` (node type + trainer + mapIndex) and `roster_levels`; add an
optional per-battle insert for boss/rival fights (already special-cased).
Query win rate per boss/map in the Supabase SQL editor to find walling spots.

---

# Part II — Game Features

## II-A. Implemented

### Seeded runs / daily seed *(was 2.3)*
Deterministic runs enable sharing ("try seed KANTO-7Q2"), a daily leaderboard,
and reproducible bug reports.

> ✅ **Phase 1 shipped (2026-07-21):** deterministic seeded runs + shareable
> KANTO-7Q2 codes (`rng.js`/`seed.js`, custom-seed input, seed shown on
> defeat/victory + map badge). All `Math.random()` call sites now route through
> the injectable `rng` in `src/game/rng.js`.

> ✅ **Phase 2 shipped (2026-07-22):** daily challenge + leaderboard
> (`daily_attempts` table, `src/lib/daily.js`, `DailyChallenge` modal, Daily
> button on region-select; rotating region + date-seeded run, 10 attempts /
> first 3 scored, ranked by maps then time).

### Reroll offers — partial *(was 2.4)*
Item and catch offers were take-it-or-leave-it; a bad spread felt like a wasted
node.

> ⚠️ **Shipped in a different shape than proposed.** Rerolls are a *Mystery-node
> bonus*, not a per-map token economy. `MYSTERY_REROLLS`
> (`BALANCE.map.mysteryRerolls`) gives a fixed number of refreshes on offers
> that came from a Mystery node; `ItemNode.jsx` / `PokeballNode.jsx` render the
> button when `node.fromMystery` is set, driven by `rerollItemOffer` /
> `rerollPokeballOffer` in `NodeMap.jsx`. The reroll button replaced the old
> "extra choice + boosted odds" mystery bonus — offers now draw at normal odds.
>
> **Still open** if the original design is still wanted: run-wide `rerollsLeft`
> in `App.jsx` awarded +1 per map clear, usable on *any* item/catch node rather
> than Mystery-sourced ones only.

### First-fork Pokéball guarantee *(new — not in the original doc)*
The first fork off the start was a coin flip on whether a Pokéball appeared at
all, so the opening choice could be two unrelated nodes.

> **Shipped:** `buildRows` in `src/game/nodeMap.js` pins row 1's left node to
> `POKEBALL` and rerolls the right node until it is neither `POKEBALL` nor
> `MASTER_BALL` (a Pokéball variant), reusing the original node id so the map's
> id sequence is unchanged. The first fork is now always "catch something" vs.
> "something else". Verified over 20k generated maps: zero Pokéball/Master Ball
> on the right, ids unique. Caveat: a Mystery node on the right can still
> resolve into a Pokéball at click time (~8% of right-node rolls), since
> `resolveMysteryType` rolls separately.

## II-B. Not Implemented

### "Skip battle" / instant-resolve option *(was 1.4)*
Battles simulate instantly but replay frame-by-frame on timers; even at 3×
speed a long trainer gauntlet is dead time. `simulateBattle` already produces
the full result up front.
**Implementation:** Add a "Skip" button in `BattleCard.jsx` that cancels the
replay timer, jumps `logIndex` to the end, and applies `finalPlayerTeam`
immediately (same code path as the natural finish). Gate behind a settings
toggle next to `battleSpeed` in `src/lib/settings.jsx`.

*(Filed here rather than under performance: the sim is already instant, so this
is a pacing/feel change, not an optimization.)*

### Status effects & abilities *(was 2.2)*
Depth systems that create matchup texture without new art.
**Implementation:** Add a `status` field to instances. In `battle.js`, apply
burn (−attack, chip damage), paralysis (−speed, skip chance), poison (chip)
with the same `events` array pattern items already use — the UI popups
(`itemFx`) generalize to status popups. Abilities follow the item-hook model:
a per-species id consumed by the same hook pipeline.

### Meta-progression *(was 2.5)*
Between-run unlocks: new starters, starting items, or region modifiers earned
via lifetime stats (already tracked in `runs`/`catches`/`badges` tables).
**Implementation:** New `meta` table keyed by user; a small "unlock
conditions" config in `src/game/`; `StarterSelect.jsx` reads unlocked starters
from it. Purely additive — no run-loop changes.

### Desktop main-menu layout *(new)*
> ⚠️ **Blocked on a schema check** — the weekly counters need a timestamp on
> `runs` that may not exist. See *Blocker* below. The layout itself is
> unblocked; build it with placeholder numbers if the column is missing.

The main menu is one centered column — logo, then a stack of 320px bars — which
reads fine on a phone but wastes most of a desktop viewport and gives the game
no room to show off. Desktop gets a purpose-built layout instead of the mobile
column stretched wide.

**Layout (desktop only, ≥768px — the existing `useIsDesktop` breakpoint):**

```
┌─────────────────────────────────────────────────────┐
│  [SPEEDMON logo]                                    │
│                                                     │
│  ┌───────────────┐                                  │
│  │     PLAY      │              (background         │
│  ├───────────────┤               artwork fills      │
│  │ DAILY CHALLENGE│              top-right and      │
│  ├───────────────┤               center)            │
│  │  extra modes  │                                  │
│  ├───────────────┤                                  │
│  │  extra modes  │                                  │
│  └───────────────┘                                  │
│                                                     │
│  ● 47 playing now                                   │
│  This week: 128 maps beaten          ┌────────────┐ │
│  Community: 12,405 maps beaten       │ calling    │ │
│                                      │ card       │ │
│                                      └────────────┘ │
└─────────────────────────────────────────────────────┘
```

Everything actionable is left-aligned in one column: logo top-left, button
stack directly beneath it, live stats bottom-left. The player's profile
calling card sits bottom-right. Top-right and center stay clear as a canvas
for background artwork.

Mobile keeps the current centered column unchanged.

**Components:**
- `MainMenu.jsx` branches on `useIsDesktop()` — a `DesktopMenu` and the
  existing mobile column, sharing the same button definitions so a new mode is
  added in one place.
- `src/components/menu/StatsCorner.jsx` — the three live counters.
- `src/components/menu/CallingCard.jsx` — the profile card.

**Data (three new reads, all from existing tables):**
- *Active players* — needs a presence signal. Cheapest version: count distinct
  `user_id` in `runs` with an `ended_at` inside the last 15 minutes and label it
  "playing recently". True realtime needs Supabase Presence; not worth it yet.
- *Weekly user maps beaten* — `sum(maps_cleared)` from `runs` for this user
  since the week's start.
- *Weekly community maps beaten* — the same sum without the user filter.

**Blocker:** `runs` rows carry no timestamp in the insert payload
(`recordRunEnd` in `App.jsx` sends `user_id`, `result`, `maps_cleared`,
`pokemon_caught*`, `winning_roster`). If the table has no `created_at` default,
"weekly" is unanswerable — confirm the column exists before building, and add a
`created_at timestamptz default now()` if not. Everything else here is a client
query away.

**Calling card** shows: username, total runs, best maps cleared, favorite
starter, shiny count. All derivable from `runs` + `catches` today. It is the
natural surface for meta-progression unlocks (see above) later — card frames,
badges, titles.

**Extra modes** are stubs for now. The stack is a data-driven array so adding
one is a config line, not a layout change.

**Out of scope:** the background artwork itself (placeholder until art exists),
realtime presence, and any new game mode's actual rules.

### Mobile floating nav *(new)*
Delete the mobile nav bar. It eats a fixed strip of vertical space at the top
of every screen — the scarcest resource on a phone, where the map and battle
views are already tight.

Replace it with two pieces:

**1. Floating stack, top-right** — transparent grey, vertically stacked, above
all other content. Three buttons:

1. **Home**
2. **Settings**
3. **Fullscreen** (new — `requestFullscreen()` / `exitFullscreen()`)

**2. Dex + Stats bar** — a separate rectangular section holding both as
side-by-side buttons on one line. Each is shorter than a full-width bar, so the
two sit on the same row rather than stacking.

```
                                    ┌───┐
                                    │ ⌂ │
                                    ├───┤
                                    │ ⚙ │
                                    ├───┤
                                    │ ⛶ │
                                    └───┘

        ┌──────────┬──────────┐
        │   DEX    │  STATS   │
        └──────────┴──────────┘
```

Auto, Restart, and the admin Skip Map move into the settings panel or are
dropped on mobile.

**Notes:**
- Floats above all assets — needs a z-index above the map/battle layers
  (the nav bar sits at 150 today).
- Transparent grey background so the artwork behind stays visible; each button
  needs enough contrast to stay legible over both light map art and dark
  battle backgrounds.
- Mobile only. Desktop keeps its own layout (see above).
- The Speedmon logo and the attribution footer both live in the nav
  bar / `Layout` today — decide where each goes on mobile.

### Difficulty modes *(was 4.4)*
Easy/Normal/Hard as a first-class knob also doubles as a balance
experimentation harness.
**Implementation:** A `difficulty` field in settings that scales three
existing inputs: `damageMultiplier` (already per-region and asymmetric
player/enemy in `battle.js`), enemy level band offsets (applied in
`mapLevelRange`), and `levelsGained` on victory (`BattleCard`/`NodeMap`/
`EliteFour` call sites of `applyBattleVictory`). All multipliers live in
`balance.js`.

---

## Suggested order

The three foundational items (balance module, seeded RNG, dashboard) have
landed, so the remaining queue is:

| Priority | Item | Track | Why next |
|---|---|---|---|
| 1 | Headless simulator | Engineering | Seeded RNG is in place; balance stops being guesswork |
| 2 | Lazy region assets | Engineering | Biggest UX-perf win, low risk |
| 3 | Item hook pipeline | Engineering | Makes the 2.x gameplay additions cheap |
| 4 | Trim battle log schema | Engineering | Small; do before interactive battles |
| 5 | Skip battle | Game feature | Cheap pacing win, self-contained |
| 6 | Desktop main menu | Game feature | Self-contained; first impression of the game |
| 7 | Interactive battles | Game feature | Largest effort; do after 3 and 4 land |
