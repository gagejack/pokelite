# Alternate-Type System — Design

**Date:** 2026-07-30
**Status:** Design approved; implemented
**Builds on:** `attackTypes.js`, `items.js`, `balance.js`

## Problem

Every dual-type Pokémon attacked with the move type of `types[0]` — the order
PokéAPI happens to list types in. That order has no game meaning, and it left
the 18 normal/flying species attacking as Normal, the only type in the game with
zero super-effective matchups. Pidgeot used body slams instead of wing attacks
because Normal came first in a list.

The fix needed two things: a table that names the right attacking type for every
dual-type species, and items that let a player override it at runtime.

## Goal

An authored table keying each dual-type species to its attacking type, plus two
items built on the same primitive: one that swaps the move (reversible), one
that wholesale retypes the Pokémon (permanent).

## Design

### 1. The attacking-type primitive

`src/game/attackTypes.js` is a 162-row table keyed by national dex id. Each row
names which of a dual-type Pokémon's two types it attacks with. Single-type
species are absent — there is nothing to choose, and they fall back to
`types[0]`.

```js
export const ATTACK_TYPE = {
  1:   'grass',     // bulbasaur — grass/poison
  16:  'flying',    // pidgey — normal/flying
  31:  'poison',    // nidoqueen — poison/ground  // ground scores higher (5 vs 2)
  ...
}

export function attackTypeFor(pokeId, types) {
  // If the mon has one type (natural, or after a Type Prism), the table cannot
  // override it — a prismed Swampert must stay Ground.
  if (!types || types.length === 1) return types?.[0] ?? 'normal'
  return ATTACK_TYPE[pokeId] ?? types[0]
}

export function alternateTypeFor(pokeId, types) {
  if (!types || types.length < 2) return null
  const chosen = attackTypeFor(pokeId, types)
  return types.find(t => t !== chosen) ?? null
}
```

`attackTypeFor` short-circuits on single-type input so a Type Prism'd Pokémon
cannot be dragged back to its old type by a later TM or evolution reading the
authored table.

### 2. Hand-tuned, not scored

Pure scoring — "pick the type with more super-effective matchups" — flips 79 of
162 entries and gets several badly wrong. Charizard would attack as Flying
(3 super-effective) instead of Fire (4), Blaziken as Fighting, Swampert as
Ground. Those are not what those Pokémon are.

The defaulting rule is simpler: each row starts from the canonical primary type
(the type the species is "about"), except where that primary is Normal — Normal
has zero super-effective matchups, so a normal/X species always attacks as X.

Rows where the other type scores higher carry a comment naming the tradeoff:

```
  31:  'poison',    // nidoqueen — poison/ground  // ground scores higher (5 vs 2)
```

Changing one is a one-word edit with the reasoning already sitting next to it.

**Authoring rule:** add one row for each new dual-type species. A missing row is
not an error — it falls back to `types[0]`. 61 of the 162 existing rows carry
the tradeoff comment; the remaining 101 have an unambiguous canonical type.

### 3. Polarity Band (rare, held)

**Effect:** the Pokémon's move uses its alternate type, and deals 25% more
damage. Types are untouched — only the move changes.

**Reversible.** Unequipping the band, swapping it off, or having it displaced by
another held item rebuilds the move back to the original type. Move tier
survives the swap — a TM-upgraded move stays upgraded at the new type.

**Build-time retype.** The move is rebuilt at equip time (`App.moveItem`,
`App.handleItemAssign`) rather than reinterpreted during battle. This is the
load-bearing decision: a Swampert wearing a Polarity Band shows **Bulldoze** in
the UI, not "Bubble Beam dealing Ground damage." The displayed move name always
matches the damage it deals.

Battle owes it only the ×1.25 multiplier:
```js
if (aItem === 'polarity_band') itemDmg *= HI.polarityBand  // 1.25
```

**Inert on single-types.** Pikachu has no alternate — the band is kept rather
than wasted when equipped on a Pokémon that can't use it. The equip path is a
no-op on the move and the ×1.25 fires anyway, so the held slot is still spent
for the damage bonus alone.

### 4. Type Prism (legendary, consumed)

**Effect:** the Pokémon permanently becomes its alternate type. `types` collapses
from `['water', 'ground']` to `['ground']`. The move is rebuilt to match the new
single type. A later TM, evolution, or level-up cannot undo this:
`attackTypeFor` short-circuits on single-type input.

**Irreversible.** The item is consumed. There is no way back — the Prism
rewrites what the Pokémon is.

**This changes defense as much as offense, and that is the point.**

| | Swampert water/ground | → pure Ground |
|---|---|---|
| 4× weak | Grass | none |
| 2× weak | none | Water, Grass, Ice |
| Resist | 5 types | 2 types |
| Immune | Flying, Electric | Flying, Electric |

Removing a 4× weakness in exchange for resistances is a real trade, not a
straight upgrade. Gyarados sheds 4× Electric the same way (water/flying → pure
Flying). Every dual-type Pokémon trades something, and on a monotype with no
4× weakness the Prism is strictly a downgrade — it removes STAB on one type
without gaining anything back.

**Inert on single-types.** Kept rather than consumed. The ItemNode guard shows
"No alternate type" so the UI never offers a dead tap.

### 5. The two items together

The Prism always applies before the Band, because the Prism is consumed from the
bag while the Band is equipped. After a Prism, the Pokémon has one type and the
Band's retype is inert — but the ×1.25 damage still fires, so holding a Band on
a prismed single-type is legal and functional.

## Numbers

| Stat | Value |
|---|---|
| Total species in dex | 371 |
| Single-type (items inert) | 209 |
| Dual-type / table rows | 162 / 162 |
| Normal/X species (the original bug) | 18 (13 flying, 3 fairy, 2 grass) |
| Normal super-effective vs | 0 types |
| Flying super-effective vs | 3 types |
| Rows where scoring would flip | 79 (hand-tuning blocks 18 of these) |
| Rows carrying "scores higher" tradeoff comment | 61 |
| Polarity Band — tier / per-slot odds | Rare / 1.79% |
| Type Prism — tier / per-slot odds | Legendary / 1.00% |
| Band damage multiplier | ×1.25 (`BALANCE.battle.heldItems.polarityBand`) |

## Where the code lives

| File | Responsibility |
|---|---|
| `src/game/attackTypes.js` | The table + `attackTypeFor` / `alternateTypeFor` |
| `src/game/pokemon.js` | `retypeMove` (rebuild for alternate type), `applyTypePrism` |
| `src/game/items.js` | Both item definitions + `isRosterConsumable` |
| `src/game/balance.js` | `polarityBand` multiplier under `battle.heldItems` |
| `src/game/battle.js` | Band ×1.25 branch in `calcDamage` |
| `src/App.jsx` | Band equip/unequip/displace retype in `moveItem` and `handleItemAssign`; Prism in `applyConsumable` |
| `src/components/NodeMap.jsx` | TM reroll via `attackTypeFor`; band/consumable dispatch branches |
| `src/components/EliteFour.jsx` | Band/consumable dispatch branch |
| `src/components/ItemNode.jsx` | "Only one type — nothing to swap" guard for Prism and Band |

## What this does NOT include

- **The 8 unresolved authoring decisions.** 61 rows carry a tradeoff comment, and
  8 of those are genuinely debatable (e.g. Nidoqueen → Ground, Lapras → Ice).
  They were left at the canonical type, with the comment as a prompt for later
  review.
- **Scored fallback.** A missing row falls to `types[0]`, not to a score.
  Scoring was rejected as a fallback because it silently changes behaviour when a
  new region's data arrives.
- **Schema validation.** No build step checks that every table entry names a
  type its species actually has. The 0 discovered type was caught by manual
  verification at commit time.

## Risks

1. **New region author must write table rows.** Johto added 26 dual-type species
   with no entries — they'd all attack as `types[0]` until authored. The build
   script (`npm run build:dex`) does not validate this.
2. **Single-type short-circuit masks table bugs.** If a species is authored to
   attack as a type it doesn't have, nobody notices until someone equips a Band
   and wonders why the move didn't change. The table was verified at commit time
   but drifts on its own.
3. **Prism'd Pokémon have no visible history.** Nothing marks a Swampert as
   "was once Water." The type change is silent — stats, sprite, and name are
   unchanged. A player who forgets they prismed it has no way to know.
4. **Band equip paths must all fire.** The offer-screen equip (`handleItemAssign`)
   and the bag-drag equip (`moveItem`) must both rebuild the move. A third equip
   path added later would miss this and leave the move at the original type.
5. **Prism + Polarity Band interaction is undocumented to the player.**
   Prisming and then equipping a Band yields the damage boost with no retype.
   Prisming while wearing the Band leaves the Band equipped — the Prism is
   consumed from the bag and never touches held items. The Band's retype goes
   inert (the mon no longer has an alternate), but its ×1.25 keeps firing.

## Verification

No test framework; verification is lint, build, and Node checks.

1. `npm run lint` and `npm run build` clean.
2. All 162 entries name a type the species actually possesses.
3. Every dual-type species has an entry (none uncovered).
4. No dual-type species attacks as Normal.
5. `attackTypeFor` called on a single-type array returns that type, ignoring the
   table.
6. `alternateTypeFor` returns `null` on a single-type and the correct other type
   on a dual-type.
7. Polarity Band retypes Swampert water→ground and cleanly reverts. Inert on
   Pikachu. Tier-4 move survives the swap.
8. Type Prism makes Swampert pure Ground with a Ground move. Gyarados→pure
   Flying. Refuses Pikachu (used: false).
9. `attackTypeFor` on a prismed Swampert returns `'ground'` despite the table
   saying `'water'` — the single-type short-circuit.
10. Prism'd Swampert through a TM tier boost stays Ground.

(End of file — total 168 lines)
