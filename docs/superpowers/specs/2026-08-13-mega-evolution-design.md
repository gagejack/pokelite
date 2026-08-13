# Mega Evolution — Design Spec

Date: 2026-08-13

## Summary

A new rare map node, Mega Stone, that lets the player permanently-for-the-run
transform an eligible, fully-evolved roster Pokémon into its Mega Evolution
form — new sprite, types, and (real, PokéAPI-sourced) stats — for as long as
the stone stays equipped as that Pokémon's held item. Equipping (and every
real species evolution) now plays a new animated "flashing sprite" popup that
replaces the old static side-by-side evolution notice.

## Scope

In scope:
- New `MEGA_STONE` node type: rare, flat-% spawn from map 3 onward, capped at
  one spawn per run.
- Mega-eligible species data (~44 species across all generations with an
  official Mega Evolution) baked into a new local JSON file at build time,
  independent of which species are currently catchable in this game's region
  pools.
- Mega Evolve popup: roster list, equip/unequip, X/Y branch picker for
  Charizard and Mewtwo, "keep in bag" option.
- New animated evolution popup, replacing the existing static one, used for
  both real species evolutions and Mega Stone equip.
- Reversible mega state: unequipping the stone (swapping in a different held
  item) instantly reverts the Pokémon to its base form/stats/typing.

Out of scope (explicitly deferred):
- Expanding the game's catchable species pool / region catch tables. Mega
  eligibility is independent of catchability — a species just needs to be in
  the player's roster, however it got there.
- Battle-only/temporary mega (reverts after each fight) — mega persists for
  the whole run, matching how held items and evolution already behave here.
- Any change to node types other than adding `MEGA_STONE`.

## 1. Mega species data

New build script `scripts/buildMegaData.mjs`, run alongside the existing
`buildPokedex.mjs` (via `npm run build:dex`). Fetches every official
mega-eligible species from PokeAPI (`pokemon/{name}-mega` /
`pokemon/{name}-mega-x` / `-mega-y`, per species) and writes
`public/data/megas.json`, keyed by base national-dex `pokeId`:

```json
{
  "6": [
    { "formId": 10034, "formName": "charizard-mega-x", "label": "Mega Charizard X",
      "types": ["fire","dragon"], "baseStats": {"hp":78,"attack":130,"defense":111,"spAtk":130,"spDef":85,"speed":100},
      "sprite": "...", "spriteBack": "...", "shinySprite": "...", "shinySpriteBack": "..." },
    { "formId": 10035, "formName": "charizard-mega-y", "label": "Mega Charizard Y", "...": "..." }
  ],
  "1": [
    { "formId": 10033, "formName": "venusaur-mega", "label": "Mega Venusaur", "...": "..." }
  ]
}
```

Every species has one entry except Charizard and Mewtwo, which have two (X
and Y — different types/stats/sprites). This file is authoritative for
eligibility: a species not present here has no Mega Evolution. `megas.json`
is loaded lazily the same way `pokedex.json` is (`ensureLocalMegaData()`,
mirroring `ensureLocalData()` in `pokemon.js`), cached in memory.

A species is **mega-eligible for a specific roster Pokémon** only if:
1. Its `pokeId` is a key in `megas.json`, AND
2. It is fully evolved (no further evolution in its chain — checkable via
   the existing `loadEvolutionChain`/evolution-chain data already used by
   `checkEvolution`).

## 2. Instance shape — reversible, baked-in fields

Every other place in this codebase that reads a Pokémon's stats, types, or
sprite (`battle.js` damage math, roster/dex display, `roster.js` healing)
reads them directly off the instance, computed once at construction time —
nothing derives them live from `heldItem` on each render. Mega Evolution
follows that same convention rather than introducing a new derived-at-render
path: equipping/unequipping the stone **rewrites the instance's fields
directly**, the same way `buildEvolvedInstance` rewrites them for a real
evolution.

New optional fields on a roster instance:

```js
_megaBase: {          // present only while mega'd — pre-mega snapshot
  types, stats, sprite, spriteBack, move,
},
_megaFormId: 10034,    // which entry in megas.json[pokeId] is active
```

**Equip** (player picks a form in the Mega Evolve popup, or re-equips the
stone from the bag onto a different Pokémon):
1. Snapshot the instance's current `{types, stats, sprite, spriteBack,
   move}` into `_megaBase`.
2. Recompute `stats` via the existing `calcStat`/`calcHP` formulas
   (`pokemon.js`), run against the mega form's `baseStats` at the
   Pokémon's *current* level — identical formula path to
   `buildPokemonInstance`/`buildEvolvedInstance`, just fed a different base
   stats object. HP ratio is preserved across the swap (not reset to full),
   matching evolution's existing rule.
3. Swap `types` to the mega form's types.
4. Swap `sprite`/`spriteBack` to the mega form's (shiny variant selected
   the same way `buildPokemonInstance` already picks shiny vs. non-shiny —
   `instance.shiny` carries over unchanged).
5. Re-pick the type-move via the existing `getTypeMove`/`attackTypeFor`
   helpers if the typing changed (a Pokémon whose mega form gains/changes a
   type gets a new attacking move at the same tier it already had).
6. Set `heldItem` to the Mega Stone item, `_megaFormId` to the chosen form.

**Unequip** (the Mega Stone is displaced by equipping a different held item,
or explicitly unequipped in the popup):
1. Restore `types`/`stats.attack..speed`/`sprite`/`spriteBack`/`move` from
   `_megaBase`, preserving current HP ratio against the restored `maxHp`.
2. Clear `_megaBase` and `_megaFormId`.
3. `heldItem` is set to whatever displaced it (or `null`), per the existing
   held-item-swap contract in `App.jsx`.

This hooks into the existing `moveItem({ item, from, to })` path in
`App.jsx` (`App.jsx:948-989`) — when the item being moved onto a Pokémon
slot is a Mega Stone, or when a Mega Stone already on a Pokémon is being
displaced, run the equip/unequip transform above before/after the existing
`heldItem` assignment. No new item-movement mechanism.

## 3. Mega Stone item

Added to `src/game/items.js` as a normal held item (no `consumable` field —
same category as Leftovers/Choice Band/Focus Sash):

```js
{ id: 'mega_stone', name: 'Mega Stone', description: "Mega Evolves the Pokémon it's given to, for as long as it's held", tier: 'legendary', icon: 'mega-stone' }
```

`itemIconUrl` already builds PokeAPI-sprite-mirror URLs from `icon` — PokeAPI
has a `mega-stone` item sprite, so no new asset-loading path is needed.

Only one Mega Stone can exist per run (one node spawn per run, see §4), so
in practice at most one roster Pokémon is mega'd at a time — moving the
stone to a different Pokémon un-megas the first and megas the second, via
the equip/unequip transform in §2.

## 4. Node type & spawn mechanics

New entry in `NODE_TYPES` (`src/game/nodeMap.js`): `MEGA_STONE`.

This node needs three properties none of the existing mechanisms provide
together: zero chance before map 3, a flat chance from map 3 on, and a hard
cap of one spawn per run. Rather than forcing it into the
always-active, fixed-sum-to-100 `NODE_TYPE_CHANCES` table, it's handled as a
post-roll override in `randomNode`, mirroring how Master Ball overrides a
Pokéball roll (`nodeMap.js:101-109`):

```js
// balance.js
megaStone: { startIndex: 2, chance: 0.03 },  // 3% flat, from map index 2 (map 3) on
```

```js
// nodeMap.js
export function megaStoneChance(mapIndex) {
  const { startIndex, chance } = BALANCE.map.megaStone
  return mapIndex >= startIndex ? chance : 0
}
```

`randomNode(id, trainerPool, mapIndex, megaStoneAvailable)` — after the
normal `pickType()` roll, if `megaStoneAvailable` and
`rng() < megaStoneChance(mapIndex)`, override the picked type to
`MEGA_STONE` (stealing the slot from whatever type was rolled, same
mechanic as Master Ball stealing from Pokéball — not restricted to
stealing from one specific type).

`buildRows` gains a `megaStoneAvailable` option (default `true`, threaded
through the same `options` object Safari Mode already uses), passed down
into every `randomNode` call for that map.

Run-level state, in `App.jsx`: `megaStoneSpawnedThisRun` (boolean, reset to
`false` on new run start). Each map's `buildRows` call passes
`megaStoneAvailable: !megaStoneSpawnedThisRun`. The moment a `MEGA_STONE`
node is generated anywhere in a row, `App.jsx` sets
`megaStoneSpawnedThisRun = true`, so no later map's `buildRows` call will
roll another one.

**Rendering**: `ITEM_ICONS` in `NodeMap.jsx` gains a `MEGA_STONE` entry
(PokeAPI item-sprite mirror URL for `mega-stone`, same pattern as every
other node icon). `handleNodeClick`'s switch gains a `MEGA_STONE` case →
`setPendingMega(true)`. Rendered conditionally at the bottom of
`NodeMap.jsx` alongside the other `pending*` modals:
`{pendingMega && <MegaStoneNode ... />}`.

## 5. MegaStoneNode popup

New component, `src/components/MegaStoneNode.jsx`, modeled directly on
`PowerUpgradeNode.jsx`'s structure (header, roster list, footer action,
`onClose`).

Header: **"Mega Evolve"**, close button.

Roster list — one row per Pokémon, same visual shape as
`PowerUpgradeNode.jsx`'s rows (sprite, name, status line, action button):

- **Not eligible** (species not in `megas.json`, or not fully evolved):
  row rendered greyed out (reduced opacity, disabled interaction), status
  line reads `No Mega Evolution` or `Must be fully evolved`.
- **Eligible, single mega form, not currently mega'd**: `Equip` button.
  Clicking it runs the equip transform (§2) and plays the new animated
  popup (§6) with the reveal text `"{Name} Mega Evolved!"`.
- **Eligible, two forms (Charizard, Mewtwo)**: row shows `Choose Form`
  instead of a direct equip button. Tapping it opens a small sub-screen —
  same shape as `EvolutionChoice.jsx` (`src/components/EvolutionChoice.jsx`)
  — showing both forms' sprite, typing, and stat block side by side.
  Picking one runs the same equip transform against that form.
- **Currently mega'd** (instance has `_megaBase` set): row shows `Unequip`
  instead. Clicking it runs the unequip transform (§2) immediately — no
  animated popup, this is a quiet revert (matches your answer that only
  the equip moment gets ceremony).

Footer: `Keep in Bag` button — adds the Mega Stone item to `bag` without
equipping it to anyone, same pattern as `ItemNode.jsx`'s "Keep in Bag"
path. Present whenever the player hasn't already equipped the stone from
this node visit.

This popup is specifically the "you just found the stone" flow, reached
only from the `MEGA_STONE` node. Re-assigning an already-owned stone from
the bag to a different Pokémon later goes through the existing bag
`moveItem` drag interaction — unchanged by this feature.

## 6. New animated evolution popup

New component `src/components/EvolutionAnimation.jsx`, **replaces**
`EvolutionNotice.jsx` (which is deleted). Used for:
- Real species evolutions (post-battle, Rare Candy, Evolve Stone) — existing
  `evolutionNotices` queue in `useEvolutionFlow.jsx`.
- Mega Stone equip (§5).

Full-screen overlay (`position: fixed; inset: 0`), no card border — this is
the one moment in the game that goes full-bleed instead of the usual boxed
modal, to sell the flash.

**Sequence**:

1. **Flash phase** (~2.5s total): the "from" sprite and "to" sprite
   alternate, centered on screen. Frame interval starts at ~400ms and
   accelerates (eased, not linear, so it reads as a buildup rather than a
   metronome) down to ~80ms by the end of the phase. The background flips
   between black and white in sync with each frame. Whichever sprite is
   currently showing is given a color-inverted overlay relative to the
   *current* background (i.e. sprite reads inverted against a white
   background, normal against black, or the reverse — opposite of
   whatever the background is at that instant), via a CSS filter/blend
   mode toggle rather than pre-rendered inverted image assets.
2. **Settle**: lands on the "to" sprite at normal (non-inverted) color,
   background settles to the game's usual modal backdrop
   (`rgba(0,0,0,0.7)`).
3. **Reveal text**: fades/slides in below the sprite, Upheaval font,
   matching the tone of the old evolution copy:
   - Real evolution: `"{From} is evolving into {To}!"`
   - Mega equip: `"{Name} Mega Evolved!"`
   An `OK` button appears alongside it (focus-trapped like the old modal,
   Escape/click-outside dismisses).
4. **Skip**: a click/tap anywhere during phase 1 jumps immediately to the
   settled state (phase 2) with the reveal text already shown — no
   partial-skip states, no skipping once phase 3 has started (it's already
   the resting state).

Props: `{ fromSprite, toSprite, fromName, toName, mode, onDismiss }` where
`mode` is `'evolve' | 'mega'` (selects which reveal-text template to use).

## 7. Sequential queueing (multiple simultaneous evolutions)

`useEvolutionFlow.jsx` changes:

- `evolutionNotices` remains an array-valued queue, but `render()` now
  passes only `evolutionNotices[0]` into `EvolutionAnimation`, not the
  whole array (the old component rendered all of them stacked in one
  static card — the new animated one plays one at a time).
- `onDismiss` advances the queue via `setEvolutionNotices(prev =>
  prev.slice(1))` instead of clearing it entirely, so the next queued
  evolution's animated popup opens immediately after.
- `applyVictory`'s current `setEvolutionNotices(notices)` (a **replace**,
  `useEvolutionFlow.jsx:40`) becomes `setEvolutionNotices(prev => [...prev,
  ...notices])` (an **append**), for consistency with `useRareCandy` and
  `evolveWithStone`, which already append. This means back-to-back battles
  that each cause an evolution will correctly queue rather than the second
  battle's notice silently replacing an unshown first one — a latent bug
  fixed as a side effect of this change.
- Mega equip's animated popup is a separate, one-off invocation (not part
  of this queue) — the Mega Evolve popup calls `EvolutionAnimation`
  directly with `mode: 'mega'` and closes back to the roster list on
  dismiss.

`EvolutionChoice.jsx` (the Eevee-style multi-branch picker) is unchanged —
it still resolves to a single evolution, which then queues into
`evolutionNotices` exactly as today, now rendered through the new animated
component.

## 8. Stats & typing

Mega form `baseStats`/`types` are used exactly as PokéAPI reports them —
no scaling or normalization against this game's own balance curve. Boost
size therefore varies by species, same as the real games (Mega Mewtwo Y is
a much bigger jump than Mega Audino). `stats` on the instance are
recomputed via the existing `calcStat(base, level)` / `calcHP(base,
level)` formulas in `pokemon.js`, run against the mega form's base stats —
the same formula path every other stat calculation in the game already
uses, just fed a different stats source.

## Testing notes

- `rosterRowPadY`-style pure-function tests for `megaStoneChance(mapIndex)`
  (zero below map 3, flat above) and the equip/unequip transform (stat
  recompute correctness, HP-ratio preservation, revert-to-exact-original
  fidelity).
- `buildRows` test (alongside existing `safariBake.test.js` patterns):
  confirm `megaStoneAvailable: false` never produces a `MEGA_STONE` node
  regardless of roll.
- Manual verification: Charizard/Mewtwo X/Y branch picker; unequip mid-run
  reverting typing correctly (attack-type move re-pick); shiny mega sprite
  selection.
