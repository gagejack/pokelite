# Trainer-Themed Species Pools — Plan

Give every route trainer a species pool that matches their trainer class
(Fisherman → Water, Bird Keeper → Flying, Hiker → Rock/Ground, …), authored
**per region** so a Kanto Fisherman fields Kanto Pokémon and a Unova Worker
fields Unova Pokémon. Gym leaders / Elite Four are untouched (they already have
fixed authored teams).

## How it works today (what we're changing)

- `TRAINER_POOLS[mapIndex]` (region file) decides which trainer **names** appear
  on each map — name only picks the sprite.
- `config.trainerSpeciesPools[mapIndex]` is one flat species list per map;
  **every** trainer on that map draws from it uniformly
  ([battleTeams.js](../src/game/battleTeams.js) `buildTrainerTeamSpec`, called
  from NodeMap's `fetchEnemyTeam`). That's why a Fisherman shows up with
  Voltorb/Magnemite.
- Evolution gating is achieved by hand-authoring the 8 per-map pools (base forms
  early, evolved late).
- The trainer hover tooltip derives "various types" from the map pool.

## Chosen design (recommended): per-trainer pools + the catch-node stage roll

Each region adds **one pool per trainer class**, authored as **base forms
only**, and the engine rolls the evolution stage from the node's level — the
exact system catch nodes already use (`resolveEvolutionLine` + level-gated
stage roll in NodeMap). This avoids authoring 8 map-banded pools per trainer
class (19 Unova classes × 8 maps would be unmanageable) while still guaranteeing
no Lv-8 trainer fields an Onix→Steelix or a Lv-60 trainer a Pidgey.

Why this fits the existing systems:
- `fetchEnemyTeam` is already async, so the (cached) evolution-line fetch is free
  to use there — same as `fetchOfferedPokemon` does today.
- The per-map `trainerSpeciesPools` **stay** as the fallback for any trainer
  class without a themed pool (Ace Trainer, Veteran, Schoolkid…), and for safety
  if an author forgets an entry. Nothing breaks region-by-region while pools are
  filled in.
- Region configs already carry all region-specific data; this is one new field.

### Rejected alternative (for the record)

*Type-tag filtering*: tag each class with types (`Fisherman: ['water']`) and
filter the map pool by `cachedType`. Rejected because most map pools contain 0–2
mons of a given type (Kanto map 3 has zero Water), the result depends on the
runtime PokéAPI cache inside game logic (CLAUDE.md wants game logic pure), and
it gives no control over flavor picks.

## Engine changes (region-agnostic, small)

1. **Config shape** (`regionRegistry.js` doc comment): add
   ```js
   trainerTypePools: { [trainerName]: [baseFormSpeciesId] }
   ```
   Keys must match the names used in that region's `TRAINER_POOLS` /
   `TRAINER_SPRITES`. A missing key = fall back to the map pool (current
   behavior).

2. **Shared stage roll** (`src/game/pokemon.js`): extract NodeMap's
   `rollCatchStage(id, level)` into an exported helper (e.g.
   `rollStageForLevel(id, level)`) so trainers and catch nodes share it.
   NodeMap's catch path switches to the shared helper — no behavior change.

3. **Team build** (`NodeMap.fetchEnemyTeam`, trainer branch):
   ```js
   const themed = config.trainerTypePools?.[node.trainer]
   const pool = themed?.length ? themed
     : config.trainerSpeciesPools?.[Math.min(mapIndex, ...)] ?? []
   specs = buildTrainerTeamSpec(pool, band, count, positionWeight)
   // then, for themed pools, roll each spec's evolution stage by its level:
   specs = await Promise.all(specs.map(async s =>
     themed ? { ...s, id: await rollStageForLevel(s.id, s.level) } : s))
   ```
   `buildTrainerTeamSpec` itself stays pure and unchanged.

4. **Tooltip** (`getNodeLabel`, trainer case): if the trainer has a themed pool,
   derive types from *that* pool instead of the map pool — most classes will now
   show a single clean chip line ("water type") instead of "various types".

5. **Prewarm** (`prewarmCache`): also warm `trainerTypePools` ids (and note the
   stage roll may fetch evolved forms on demand — same as catch nodes today).

6. **Mystery node**: no change — it borrows a trainer name from the map, and the
   themed pool follows the name automatically.

## Data authoring — per region

Author base forms only; the stage roll handles evolution. Aim for 3–6 species
per class. Classes marked *(fallback)* intentionally get **no** themed pool and
keep the route pool (they're "anything goes" classes).

### Kanto (`kanto.js`)

| Trainer | Theme | Suggested base forms (dex ids) |
|---|---|---|
| Bug Catcher | Bug | Caterpie 10, Weedle 13, Paras 46, Venonat 48 |
| Fisherman | Water | Magikarp 129, Poliwag 60, Goldeen 118, Staryu 120, Horsea 116 |
| Bird Keeper | Flying | Pidgey 16, Spearow 21, Doduo 84, Zubat 41, Farfetch'd 83 |
| Hiker | Rock/Ground | Geodude 74, Onix 95, Sandshrew 27, Diglett 50, Machop 66 |
| Camper | Ground/Rock | Sandshrew 27, Cubone 104, Nidoran♂ 32, Geodude 74 |
| Picnicker | Grass/Normal | Oddish 43, Bellsprout 69, Rattata 19, Nidoran♀ 29 |
| Lass | Cute/Normal | Rattata 19, Clefairy 35, Jigglypuff 39, Meowth 52, Pikachu 25 |
| Rocker | Electric | Voltorb 100, Magnemite 81, Pikachu 25, Electabuzz 125 |
| Gambler | Fire/Electric | Growlithe 58, Vulpix 37, Voltorb 100, Ponyta 77 |
| Psychic | Psychic | Abra 63, Slowpoke 79, Drowzee 96, Mr. Mime 122 |
| Channeler | Ghost | Gastly 92 (line covers Haunter/Gengar via roll) |
| Juggler | Psychic | Drowzee 96, Abra 63, Voltorb 100, Mr. Mime 122 |
| Burglar | Fire | Growlithe 58, Vulpix 37, Ponyta 77, Magmar 126 |
| Black Belt | Fighting | Machop 66, Mankey 56, Hitmonlee 106, Hitmonchan 107 |
| Crush Girl | Fighting | Machop 66, Mankey 56, Poliwag 60 |
| Poke Maniac | Rare/Fossil | Cubone 104, Rhyhorn 111, Slowpoke 79, Lapras 131, Kangaskhan 115 |
| Ruin Maniac | Rock/Ground | Geodude 74, Onix 95, Rhyhorn 111, Cubone 104 |
| Lady / Gentleman 1 / Gentleman 2 | Prestige/Normal | Meowth 52, Clefairy 35, Growlithe 58, Vulpix 37, Pikachu 25 |
| Ace Trainer 1 / 2 | *(fallback — route pool)* | — |

### Unova (`unova.js`)

| Trainer | Theme | Suggested base forms (dex ids) |
|---|---|---|
| Youngster | Normal/common | Patrat 504, Lillipup 506, Pidove 519 |
| Lass | Cute/Normal | Lillipup 506, Purrloin 509, Minccino 572, Audino 531 |
| Preschooler M/F | Baby/basic | Patrat 504, Pidove 519, Munna 517, Woobat 527 |
| Schoolkid M/F | *(fallback — route pool)* | — |
| Backpacker M/F | Ground/Rock | Sandile 551, Roggenrola 524, Drilbur 529, Dwebble 557 |
| Janitor | Normal/Electric | Minccino 572, Blitzle 522, Trubbish 568 |
| Nursery Aide | Cute | Audino 531, Munna 517, Cottonee 546, Petilil 548 |
| Twins | Pairs/cute | Minccino 572, Petilil 548, Cottonee 546, Woobat 527 |
| Hiker | Rock/Ground | Roggenrola 524, Drilbur 529, Sandile 551, Dwebble 557, Onix-equiv: Boldore via roll |
| Worker M/F | Ground/Steel/Fighting | Timburr 532, Drilbur 529, Roggenrola 524, Klink 599 |
| Roughneck | Dark/Poison | Scraggy 559, Purrloin 509, Venipede 543, Trubbish 568 |
| Cyclist M/F | Electric/fast | Blitzle 522, Emolga 587, Joltik 595 |
| Biker | Poison/Dark | Venipede 543, Scraggy 559, Trubbish 568, Pawniard 624 |
| Depot Agent | Steel/Electric | Klink 599, Joltik 595, Blitzle 522, Tynamo 602 |
| Pokemon Ranger M/F | Grass/nature | Sewaddle 540, Cottonee 546, Petilil 548, Deerling 585, Foongus 590 |
| Pilot | Flying | Pidove 519, Woobat 527, Ducklett 580, Rufflet 627 |
| Black Belt | Fighting | Timburr 532, Throh 538, Sawk 539, Mienfoo 619 |
| Battle Girl | Fighting | Timburr 532, Mienfoo 619, Scraggy 559 |
| Ace Trainer M/F, Veteran M/F | *(fallback — route pool)* | — |

*(Species picks are a starting point — tune freely; ids must exist in the
region's generation range.)*

## Edge cases & rules

- **Fallback chain**: themed pool → map pool → `fallbackSpeciesId`. A typo'd
  trainer name can never produce an empty battle.
- **Evolution gating**: the stage roll only offers stages whose evolution level
  ≤ the picked mon's level (same rule as catch nodes), so early maps always
  field base forms. Item/trade evolutions are skipped by the existing roll.
- **Duplicates**: `buildTrainerTeamSpec` already avoids repeats within a team;
  small themed pools (3–4 species) with 3-mon teams still work (it allows
  repeats only when the pool is exhausted).
- **Tooltips**: themed classes show their theme type; fallback classes keep
  "various types".
- **Kanto/Unova only for now**: other regions get the feature automatically when
  their configs add `trainerTypePools`.

## Decisions to confirm before implementing

1. **Fallback classes** — happy with Ace Trainer / Veteran / Schoolkid staying
   on the route pool, or should every class be themed? gage: its ok to have trainers with a various or random pool.
2. **Species picks** — the tables above are proposals; flag any you want
   changed (they're the bulk of the review). gage: looks good to me
3. **Team-size rules** — unchanged (1–2 early, up to 3 late)? gage: up to 3 late

## Verification

1. `npm run build` clean.
2. Playwright: force a trainer node (temp `nodeMap.js` patch), set `trainer` to
   a themed class (e.g. Fisherman on Kanto map 2), fight it, confirm the team is
   all Water-line species; repeat on a late map to confirm evolved stages
   appear (e.g. Poliwhirl/Seaking at Lv 40+).
3. Hover a themed trainer → tooltip shows "water type"; hover an Ace Trainer →
   "various types".
4. Mystery-node → trainer resolution still works (themed team follows the name).
5. Regression: one Unova map-1 battle and one boss battle (fixed teams
   unaffected).

## Effort

~30 min engine (shared stage roll + team-build branch + tooltip + prewarm),
~1–2 h data authoring/tuning both regions, ~30 min verification.
