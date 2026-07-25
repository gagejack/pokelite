# Unova Trainer Revamp — Design

**Date:** 2026-07-24
**Status:** Approved for planning

## Problem

Unova's route trainers read as generic and repetitive. Measured against the
current data:

1. **Backpacker M/F appears on 6 of 8 maps**, and its species pool is
   byte-identical to Hiker's (`[524, 529, 551, 557]`). It is the single largest
   source of repeat fights.
2. **The strongest classes have no themed pool at all.** Ace Trainer M/F and
   Veteran M/F fall through to the map's generic species pool. Map 8 is 4 of 6
   trainers untyped, making the late game the *most* generic stretch of the
   region.
3. **Only 32 distinct species across 22 classes**, and 5 classes are pure
   sprite-swaps of another (M/F pairs sharing one list).

Kanto does not have this problem because each class reads as a type identity —
Bug Catcher is Bug, Fisherman is Water. Unova's classes are mostly
"generic early-route mon" with type incidental.

## Goal

Every route trainer is a **type specialist**. A class's pool is every Unova
line carrying that type, gated so species appear only once the run has reached
the map where they belong.

## Design

### Type ownership: one class per type

No two classes share a primary type identity. A species may appear in two
classes only when it is genuinely dual-typed (see "Dual-type overlap").

| Class | Type rule | Lines |
|---|---|---|
| Fisher | Water | 7 |
| Bug Catcher | Bug | 8 |
| Baker | Fire | 5 |
| Black Belt | Fighting | 5 |
| Cyclist M/F | Electric | 5 |
| Depot Agent | Steel | 6 |
| Pilot | Flying | 8 |
| Pokémon Ranger M/F | Grass | 8 |
| Janitor | Poison | 3 |
| Roughneck | Dark | 7 |
| Youngster | Normal | 8 |
| Nursery Aide | Normal | 8 |
| Hiker | Ground **or** Rock | 9 |

**Selection rule:** any Unova-dex species carrying that type qualifies,
including dual-types. Starters (495–503) and legendaries/mythicals (638–649)
are excluded.

### Roster changes

**Removed (10 classes):** Backpacker M/F, Lass, Twins, Preschooler M/F,
Schoolkid M/F, Ace Trainer M/F, Veteran M/F, Battle Girl, Biker, Worker M/F.

**Kept (13):** the table above.

**Added (3):** Fisher (native Unova sprite), Bug Catcher and Baker.

**Sprite handling:** borrowed sprites are **physically duplicated** into
`src/assets/regions/Unova/Trainer Full Sprites/` and
`src/assets/regions/Unova/Trainers Overworlds/` using Unova's existing naming
convention. No lookup or fallback code is added — the region config resolves
them like any native sprite.

- `Fisher` — native Unova, already present (full + overworld)
- `Bug Catcher` — copy from `src/assets/regions/Kanto/Kanto Trainer Sprites/`
  and `Kanto Trainer Overworlds/`
- `Baker` — native Unova, already present (full + overworld)

Gen 5 has no Bug Catcher, Bird Keeper, or Firebreather class; Bug Catcher is
the only borrow required. Flying is covered natively by Pilot.

### Placement: fixed vs roaming

**Roaming (3):** Fisher, Bug Catcher, Baker appear in every map's trainer pool.
Their species pool is what changes with progression, not their presence.

**Fixed (10):** the remaining classes are pinned to the maps matching their
Black/White route and city locations, preserving regional flavor.

### Progression: flat pools + a global unlock map

Pools are authored as **base forms only**. The existing engine
(`rollStageForLevel`, `NodeMap.jsx:552-566`) already rolls the evolution stage
by the node's level, so a pool entry of Tympole yields Tympole on map 2 and
Seismitoad on map 6 with no extra data.

Progression therefore only needs to control **when a species first becomes
eligible**, not its stage. This is one global table rather than per-class
bands:

```js
// unova.js
const SPECIES_MIN_MAP = { 592: 6, 594: 6, 564: 5, ... }  // speciesId -> 1-based map

const TRAINER_TYPE_POOLS = {
  'Fisher': [515, 535, 550, 564, 580, 592, 594],
  ...
}
```

At generation time the class pool is filtered to
`SPECIES_MIN_MAP[id] <= mapIndex + 1`.

**Why one global table instead of per-class bands:** six species are shared
across two classes each via dual typing (see below). Per-class bands would
require keeping each shared species' unlock in sync by hand and could silently
drift. One table cannot drift.

### Dual-type overlap (intentional)

Because any species carrying a type qualifies, these appear in two pools:

| Species | Types | Classes |
|---|---|---|
| Joltik / Galvantula (595) | Bug/Electric | Bug Catcher, Cyclist |
| Larvesta / Volcarona (636) | Bug/Fire | Bug Catcher, Baker |
| Durant (632) | Bug/Steel | Bug Catcher, Depot Agent |
| Ferroseed (597) | Grass/Steel | Ranger, Depot Agent |
| Ducklett (580) | Water/Flying | Fisher, Pilot |
| Emolga (587) | Electric/Flying | Cyclist, Pilot |
| Pawniard (624), Vullaby (629) | Dark/Steel, Dark/Flying | Roughneck + Depot Agent / Pilot |
| Tirtouga (564), Archen (566) | Water/Rock, Rock/Flying | Fisher + Hiker / Pilot |
| Sandile (551), Scraggy (559) | Ground/Dark, Dark/Fighting | Hiker + Roughneck / Black Belt |
| Stunfisk (618) | Ground/Electric | Hiker, Cyclist |

This is desirable: the same species reads differently depending on which
trainer sends it out.

### SPECIES_MIN_MAP derivation

Initial values are derived from `CATCH_POOLS` — the map where a species' line
first becomes catchable. All 59 referenced species resolve; there are no gaps.

Thirteen values are then **hand-corrected upward in availability** (earlier
than the catch pool debut), because when a *trainer* should own a species is
not the same question as when the *player* can catch it. Without these, six
classes have fewer than two lines available on early maps:

| Species | Catch debut | Trainer unlock | Class served |
|---|---|---|---|
| Panpour (515), Tympole (535) | 2 | 1 | Fisher |
| Pansear (513) | 2 | 1 | Baker |
| Darumaka (554) | 3 | 2 | Baker |
| Emolga (587), Joltik (595) | 4 | 2 | Cyclist |
| Tynamo (602) | 6 | 3 | Cyclist |
| Excadrill (530), Klink (599) | 2, 8 | 2 | Depot Agent |
| Ferroseed (597) | 8 | 3 | Depot Agent |
| Pawniard (624) | 8 | 4 | Depot Agent |
| Trubbish (568) | 3 | 2 | Janitor |
| Foongus (590) | 5 | 3 | Janitor |

Resulting availability (lines per class per map):

```
CLASS            m1  m2  m3  m4  m5  m6  m7  m8
Fisher            2   2   3   3   4   7   7   7
Bug Catcher       2   3   4   4   4   4   4   8
Baker             1   2   2   2   2   2   4   5
Black Belt        1   2   3   3   4   4   5   5
Cyclist           1   3   4   4   4   4   4   5
Depot Agent       0   2   3   4   4   4   4   6
Pilot             1   3   4   4   5   6   6   8
Ranger            1   4   7   7   8   8   8   8
Janitor           1   2   3   3   3   3   3   3
Roughneck         4   4   4   5   5   5   5   7
Youngster         3   4   4   4   6   7   7   8
Nursery Aide      3   4   4   4   6   7   7   8
Hiker             1   4   5   5   7   7   8   9
```

Depot Agent's 0 on map 1 is intentional — Steel is a genuinely late type in
BW, and Depot Agent is a fixed mid/late class that never appears on map 1.

### Known thin pools

**Janitor has 3 Poison lines** (Venipede, Trubbish, Foongus) — the thinnest
class. Acceptable: it is a flavor class on few maps, and stage rolling gives
Trubbish/Garbodor variety. Revisit only if it reads as repetitive in play.

**Water has 7 lines**, the scarcest of the requested types. This is faithful to
BW, where Water is genuinely uncommon outside surfing. No Swimmer class is
added — one class per type.

### Youngster vs Nursery Aide

Both are Normal. They split the 8 Normal lines by flavor rather than
duplicating:

- **Youngster** — early-route: Patrat, Lillipup, Pidove, Rufflet
- **Nursery Aide** — caretaker: Audino, Minccino, Deerling, Bouffalant

## Files touched

| File | Change |
|---|---|
| `src/game/regions/unova.js` | Rewrite `TRAINER_TYPE_POOLS`, `TRAINER_POOLS`, `TRAINER_SPRITES`; add `SPECIES_MIN_MAP` |
| `src/components/NodeMap.jsx` | Filter themed pool by `SPECIES_MIN_MAP` before `buildTrainerTeamSpec` |
| `src/assets/regions/Unova/Trainer Full Sprites/` | Add `Bug Catcher.webp` |
| `src/assets/regions/Unova/Trainers Overworlds/` | Add `Bug Catcher.webp` |

No engine changes beyond the one pool filter. `rollStageForLevel`,
`buildTrainerTeamSpec`, and the generation-gate work already in place are
reused as-is.

## Out of scope

- Kanto (may adopt this model later if it plays well)
- New node types, battle mechanics, or balance changes
- Boss / Elite Four teams
- Ghost, Psychic, Ice, Dragon, Fairy classes — no class claims these types.
  Psychic 1/2 sprites exist unused if a Psychic class is wanted later.

## Verification

1. Every class pool is non-empty on every map it appears on.
2. Every species id in every pool is a real Unova-dex entry (494–649),
   excluding starters and legendaries.
3. No class draws a species whose `SPECIES_MIN_MAP` exceeds the current map.
4. `npm run build` passes.
5. Play a Kanto run to confirm zero regression (shared code path).
