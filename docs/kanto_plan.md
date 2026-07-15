# Kanto Region — Implementation Plan

A plan for implementing the Kanto region using the region-config modularity built for Unova.
**Reference implementation: `src/game/regions/unova.js` + `src/game/regions/unova.teams.js`.**
Copy its structure exactly; only the data changes.

## Ground rules

- **No engine, component, or generic game-module changes.** The game loop (App, NodeMap,
  EliteFour, BattleCard) reads everything region-specific through `getRegionConfig(name)`
  (`src/game/regionRegistry.js`). The config shape is documented in a comment at the top of
  that file — it is the authoritative checklist. Kanto is already registered
  (`Kanto: kantoConfig`), so no registry edits are needed either.
- **All work happens in two files:** `src/game/regions/kanto.js` (rewrite the config; keep
  the existing `CHARACTERS` array — it's already authored) and a new
  `src/game/regions/kanto.teams.js` (mirrors `unova.teams.js`).
- Species ids are **National Dex ids 1–151**. Types/names for tooltips are fetched at
  runtime from PokéAPI (`pokemon.js` cache) — do **not** author type/name tables.
- Follow CLAUDE.md: pure data, no side effects, no new dependencies, don't touch other regions.
- `RegionSelect.jsx` already lists Kanto and auto-unlocks it once `config.maps.length > 0`.
  No UI changes needed.

## Assets (already present)

All under `src/assets/regions/Kanto/`:

| Directory | Contents | Used for |
|---|---|---|
| `Maps/` | `Electric.png, Grass.png, Poison.png, Psychic.png, Rock.png, Water.png` (6) | map backgrounds — reuse 2 for the 8 maps, like Unova reuses Nacrene/Striaton |
| `Badges/` | Boulder, Cascade, Thunder, Rainbow, Soul, Marsh, Volcano, Earth (webp; ignore `Marsh_Badge (1).webp`) | `BADGES` array |
| `Kanto Trainer Overworlds/` | ~83 webp (`Brock 1.webp`, `Bug Catcher.webp`, …) | `TRAINER_SPRITES` (node icons) |
| `Kanto Trainer Sprites/` | ~114 webp | `TRAINER_FULL_SPRITES` (BattleCard) |
| `Kanto Character Sprites/` | already imported in kanto.js `CHARACTERS` | keep as-is |
| `kantoGrass.png` (folder root) | Kanto grass tile | grass icon on catch nodes |

Grass icon: `import grassIcon from '../../assets/regions/Kanto/kantoGrass.png'`.
Note some filenames contain spaces — import paths must match exactly.

## Region structure (the design)

8 maps = 8 gym cities, in canonical order, followed by the Elite Four:

| Map | City | Gym Leader | Gym Type | Level band |
|---|---|---|---|---|
| 1 | Pewter City | Brock (starter-assigned, see below) | Rock | [3, 10] |
| 2 | Cerulean City | Misty | Water | [10, 19] |
| 3 | Vermilion City | Lt. Surge | Electric | [18, 28] |
| 4 | Celadon City | Erika | Grass | [26, 37] |
| 5 | Fuchsia City | Koga | Poison | [34, 46] |
| 6 | Saffron City | Sabrina | Psychic | [42, 55] |
| 7 | Cinnabar Island | Blaine | Fire | [50, 64] |
| 8 | Viridian City | Giovanni | Ground | [58, 73] |

Copy `MAP_LEVEL_RANGES` verbatim from Unova (same pacing). `MAP_NAMES` = the city names above.

**Map 1 starter-assigned boss:** Unova uses three Striaton brothers keyed by starter id.
Kanto has only Brock, so mirror the mechanic with rival-flavored variants or simply map all
three starters to Brock:

```js
const STARTER_BOSS = { 1: 'Brock', 4: 'Brock', 7: 'Brock' } // Bulbasaur/Charmander/Squirtle
```

(`generate()` falls back to `STARTER_BOSS[starter?.id] ?? 'Brock'`.)

`MAP_BOSSES = [null, 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine', 'Giovanni']`

**Map backgrounds** (thematic match, 6 images across 8 maps):

```js
// Rock=Pewter, Water=Cerulean, Electric=Vermilion, Grass=Celadon,
// Poison=Fuchsia, Psychic=Saffron; Cinnabar reuses Rock, Viridian reuses Grass.
const MAP_BACKGROUNDS = [bgRock, bgWater, bgElectric, bgGrass, bgPoison, bgPsychic, bgRock, bgGrass]
```

**MAP_EDGES:** copy Unova's shared edge layout verbatim (same node graph for all maps).

**Badges** (map order, `{ name, icon }`):
Boulder, Cascade, Thunder, Rainbow, Soul, Marsh, Volcano, Earth.
⚠️ Badge order ≠ file alphabetical order — Thunder is map 3, Marsh is map 6.

**damageMultiplier:** keep the stub's `2` initially; tune during playtesting if runs feel
too long/short vs Unova's `2.5`.

**fallbackSpeciesId:** `19` (Rattata).

## kanto.teams.js (new file — mirror unova.teams.js exports)

Export: `TRAINER_SPECIES_POOLS`, `BOSS_TEAMS`, `ELITE_FOUR_TEAMS`, `MAP_LEVEL_RANGES`.

### TRAINER_SPECIES_POOLS — 8 arrays of species ids
Route-appropriate, evolution-gated (base forms early, evolved forms late). Suggested:

1. Pidgey 16, Rattata 19, Caterpie 10, Weedle 13, Spearow 21, Nidoran♀ 29, Nidoran♂ 32
2. Pidgeotto 17, Oddish 43, Bellsprout 69, Psyduck 54, Poliwag 60, Staryu 120, Goldeen 118, Abra 63
3. Raticate 20, Pikachu 25, Magnemite 81, Voltorb 100, Diglett 50, Machop 66, Sandshrew 27
4. Gloom 44, Weepinbell 70, Vileplume 45, Growlithe 58, Vulpix 37, Drowzee 96, Meowth 52, Exeggcute 102
5. Venonat 48, Venomoth 49, Grimer 88, Koffing 109, Weezing 110, Arbok 24, Nidorino 33, Nidorina 30, Golbat 42
6. Kadabra 64, Hypno 97, Mr. Mime 122, Jynx 124, Slowbro 80, Poliwrath 62, Kingler 99, Marowak 105
7. Arcanine 59, Ninetales 38, Rapidash 78, Magmar 126, Rhydon 112, Electrode 101, Muk 89, Cloyster 91
8. Nidoking 34, Nidoqueen 31, Dugtrio 51, Golem 76, Sandslash 28, Gyarados 130, Dragonair 148, Alakazam 65, Machamp 68, Gengar 94

### BOSS_TEAMS — keys must match MAP_BOSSES/STARTER_BOSS names exactly
2–3 mon each, last mon +2 levels (Unova pattern: top of band, ace above it):

```js
'Brock':     [{ id: 74,  level: 8  }, { id: 95,  level: 10 }],                       // Geodude, Onix
'Misty':     [{ id: 120, level: 17 }, { id: 121, level: 19 }],                       // Staryu, Starmie
'Lt. Surge': [{ id: 100, level: 26 }, { id: 25,  level: 26 }, { id: 26,  level: 28 }], // Voltorb, Pikachu, Raichu
'Erika':     [{ id: 71,  level: 35 }, { id: 114, level: 35 }, { id: 45,  level: 37 }], // Victreebel, Tangela, Vileplume
'Koga':      [{ id: 109, level: 44 }, { id: 89,  level: 44 }, { id: 110, level: 46 }], // Koffing, Muk, Weezing
'Sabrina':   [{ id: 64,  level: 53 }, { id: 122, level: 53 }, { id: 65,  level: 55 }], // Kadabra, Mr. Mime, Alakazam
'Blaine':    [{ id: 58,  level: 62 }, { id: 78,  level: 62 }, { id: 59,  level: 64 }], // Growlithe, Rapidash, Arcanine
'Giovanni':  [{ id: 111, level: 71 }, { id: 51,  level: 71 }, { id: 112, level: 73 }], // Rhyhorn, Dugtrio, Rhydon
```

### ELITE_FOUR_TEAMS — 3 mon each at 74/74/76; champion 5 mon at 77/77/78/78/80

```js
'Lorelei': [{ id: 87,  level: 74 }, { id: 91,  level: 74 }, { id: 131, level: 76 }], // Dewgong, Cloyster, Lapras
'Bruno':   [{ id: 95,  level: 74 }, { id: 106, level: 74 }, { id: 68,  level: 76 }], // Onix, Hitmonlee, Machamp
'Agatha':  [{ id: 93,  level: 74 }, { id: 42,  level: 74 }, { id: 94,  level: 76 }], // Haunter, Golbat, Gengar
'Lance':   [{ id: 130, level: 74 }, { id: 142, level: 74 }, { id: 149, level: 76 }], // Gyarados, Aerodactyl, Dragonite
'Blue':    [{ id: 18,  level: 77 }, { id: 65,  level: 77 }, { id: 112, level: 78 }, { id: 103, level: 78 }, { id: 6, level: 80 }], // Pidgeot, Alakazam, Rhydon, Exeggutor, Charizard (ace)
```

## kanto.js config fields

### eliteFour array (in map order, matches ELITE_FOUR_TEAMS keys)

```js
eliteFour: [
  { name: 'Lorelei', type: 'ice',      sprite: owLorelei, fullSprite: Lorelei },
  { name: 'Bruno',   type: 'fighting', sprite: owBruno,   fullSprite: Bruno },
  { name: 'Agatha',  type: 'ghost',    sprite: owAgatha,  fullSprite: Agatha },
  { name: 'Lance',   type: 'dragon',   sprite: owLance,   fullSprite: Lance },
  { name: 'Blue',    type: 'champion', sprite: owBlue,    fullSprite: Blue, champion: true },
]
```

⚠️ Overworlds dir has `Lorelei 2.webp` only (no `Lorelei 1`) — use it. Check exact
filenames with `ls` before writing imports; a few numbered variants are missing
(e.g. `Blue 4` exists in Sprites but not Overworlds, `Red 4` overworld missing).

### TRAINER_SPRITES / TRAINER_FULL_SPRITES
Import only what the pools use — every name in `TRAINER_POOLS`, `MAP_BOSSES`,
`STARTER_BOSS` values, and `eliteFour` needs an entry in **both** maps (overworld for the
node, full sprite for BattleCard). Do not import all 114 files.

### TRAINER_POOLS (generic route trainers per map) — pick from available overworlds

1. Bug Catcher, Lass 1, Youngster (use `Camper` if no Youngster), Picnicker
2. Lass 2, Camper, Picnicker, Fisherman, Bird Keeper
3. Fisherman, Gambler, Rocker, Hiker
4. Lady, Gentleman 1, Beauty, Gambler
5. Juggler, Bird Keeper, Poke Maniac, Ruin Maniac
6. Psychic, Channeler, Juggler, Gentleman 2
7. Burglar, Ace Trainer 1, Ace Trainer 2, Black Belt
8. Ace Trainer 1, Ace Trainer 2, Ruin Maniac, Black Belt, Crush Girl

Verify each name against the actual files in `Kanto Trainer Overworlds/` (names must be
keys into `TRAINER_SPRITES`; missing keys render broken node icons).

### CATCH_POOLS — 8 arrays of `{ id, rarity }`
Follow Unova's rules exactly (see its comment block):
- ~9–14 entries per map; mostly `common`, 1–4 `rare`, 1–2 `epic`, exactly 1 `legendary`
  (the "legendary" rarity slot = the map's chase mon, not an actual legendary).
- Evolution-gated: a species appears only where the map's level band reaches its evo level.
- Each species appears on **one map only**; cover as many Kanto lines as possible.
- Suggested chase ("legendary" rarity) picks per map: 1 Pikachu 25 · 2 Growlithe 58 ·
  3 Lapras-line stand-in Eevee 133 · 4 Scyther 123 · 5 Chansey 113 · 6 Porygon 137 ·
  7 Aerodactyl 142 · 8 Dratini→Dragonite line: put Dragonair 148 epic, Snorlax 143 legendary.
- Base the commons on each map's trainer species pool neighborhood (implementer's judgment;
  keep it route-flavored).

### LEGENDARY_POOLS (Master Ball nodes) — tiered like Unova

```js
const LEG_BIRDS = [
  { id: 144, level: 45 }, // Articuno
  { id: 145, level: 45 }, // Zapdos
  { id: 146, level: 45 }, // Moltres
]
const LEG_MYTHIC = [
  { id: 151, level: 60 }, // Mew
  { id: 150, level: 70 }, // Mewtwo
]
const LEGENDARY_POOLS = [
  [], [], [],                      // Maps 1–3 — none
  LEG_BIRDS, LEG_BIRDS, LEG_BIRDS, // Maps 4–6
  [...LEG_BIRDS, ...LEG_MYTHIC],   // Map 7
  [...LEG_BIRDS, ...LEG_MYTHIC],   // Map 8
]
```

(Exact map cutoffs are the implementer's call; keep birds ≥ map 4 and Mewtwo maps 7–8,
mirroring Unova's weakest→strongest tiering. `legendaryIds` derives from the pools:
`[...new Set(LEGENDARY_POOLS.flat().map(l => l.id))]` — this feeds the Stats screen.)

### Everything else (copy the Unova pattern verbatim)

- `catchTierBudget: CATCH_TIER_BUDGET` and `pickCatchOffer` — import from `../catch.js`.
- `maps:` built exactly like Unova's `MAP_BACKGROUNDS.map((background, i) => ...)` with
  `buildRows` from `../nodeMap.js`, `region: 'Kanto'`, shared `MAP_EDGES`, `grassIcon`.
- Keep the existing `CHARACTERS` export/array in kanto.js untouched.

## Verification (required — runtime, not just build)

1. `npm run build` — clean.
2. `npm run dev` + Playwright (existing patterns in the session scratchpad; DOM-eval clicks,
   not coordinate clicks): menu → Play → **Kanto** card (must no longer show COMING SOON) →
   starter select shows Bulbasaur/Charmander/Squirtle → pick one → map 1 renders (Rock
   background, trainer node icons visible, no broken images).
3. Hover a trainer node → tooltip shows species typings + "+2 levels to all mon".
   Hover a Master Ball node (temp-force node types via the nodeMap.js patch trick if needed)
   → "??? Lv X".
4. Fight through map 1 → beat Brock → Boulder Badge colorizes in the badge list; map 2 loads.
5. Spot-check a late map (temp-set map index) → Elite Four gauntlet reachable, sprites render.
6. Confirm Unova still plays (regression: one map-1 battle).
7. Zero console errors throughout. Note: logged-in Supabase writes (catches/badges tables)
   can't be Playwright-verified without a session — verify by code inspection.

## Effort summary

~30 min asset wiring (imports + sprite maps), ~2–3 h data authoring (pools/teams/levels),
~30 min runtime verification. No changes outside `src/game/regions/kanto.js` and
`src/game/regions/kanto.teams.js`.
