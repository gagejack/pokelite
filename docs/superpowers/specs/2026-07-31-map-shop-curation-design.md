# Map Shop Curation — Design

**Date:** 2026-07-31
**Status:** Design approved; ready for an implementation plan
**Builds on:** `2026-07-29-pokemart-shelf-design.md`
**Supersedes:** §1 (the generic shelf) and §3 (shelf composition) of that spec

## Problem

Every Kanto shop sells the same five items: four generics (`max_heal`,
`muscle_band`, `light_clay`, `mega_revive`) plus that map's gym-typed plate.
Four of five entries are identical on all eight maps, so ~80% of every shelf is
a repeat and only the plate says which town you are standing in.

Unova is worse: `shopPools` is empty, so all eight of its shops are the same
four generics with no curated item at all.

The per-map mechanism already exists and is unused. `getShopInventory` reads
`shopGeneric` then `shopPools[mapIndex]`, dedupes, and prices from
`BALANCE.economy` — the plumbing for eight distinct shops has been in place
since the shelf spec shipped. What is missing is content.

## Goal

Make each map's shop feel like *that map's* shop, so the reason to buy is
"that is a Cinnabar item" rather than "that is the item I can afford".

Two constraints inherited from the specs this builds on, both preserved:

- **The price ladder stays.** $150 heal → $200 mid-tier → $300 plate → $400+
  ceiling. Every shelf keeps at least three rungs.
- **Prices do not move and income does not move.** ~$293/map against richer
  shelves means the player affords less of what they see. That scarcity is the
  design, not a problem to solve.

## Design

### 1. Curation principle: location fiction

**A shop stocks what that place would plausibly sell.** Pewter is a museum town
of stone and fossils; Vermilion is a working port; Celadon is a department
store; Cinnabar is a volcanic research lab.

This was chosen over two alternatives:

- **Power curve by map index** (commons early, epics late) — clean to balance,
  but every region's shops end up the same shape, and the shelf tells you
  nothing about where you are.
- **Build archetypes** (a crit shop, a wall shop, a speed shop) — good for
  build-hunting, but it makes shops feel like a menu of strategies rather than
  like towns, and it fights the existing thematic-plate decision.

Location fiction is the only one of the three that makes the eight shops
*memorable individually*, which is the stated goal.

### 2. The generic shelf shrinks to one item

| | Before | After |
|---|---|---|
| `shopGeneric` | `max_heal`, `muscle_band`, `light_clay`, `mega_revive` | `max_heal` |

**Max Heal stays universal** because healing access must be guaranteed on every
map. A run that cannot buy a heal is a run decided by map layout rather than by
play.

**The other three become curated placements**, not removals. This is the key
correction to an earlier draft of this design, which cut Muscle Band and Light
Clay outright as "generic stat sticks". They are not filler: the shelf spec
priced them as a deliberate symmetrical rung — one offensive, one defensive,
both $200, both $50 above the heal so the choice is about the run you are
having rather than about value. Cutting them would leave the ladder jumping
$150 → $300 with nothing between.

They keep their price and their symmetry. They simply stop appearing eight
times each:

- **Light Clay → Pewter (map 1).** Physical damage reduction in the stone town,
  in front of the rock gym.
- **Muscle Band → Vermilion (map 3).** Physical power at the working port.

**Mega Revive → Celadon (map 4)**, and nowhere else. See §4.

### 3. Kanto's eight towns

Each shelf is Max Heal plus three curated items, for **four entries per shop**.
Celadon is the one exception: it curates only two new items and spends its third
slot restocking Max Heal to 3, so it also shows four entries.

The plate assignment is unchanged from `2026-07-29-pokemart-shelf-design.md` §2
— thematic, matched to that map's gym type, deliberately *not* counter-typed.

| Map | Town | Fiction | Curated (beyond Max Heal) |
|---|---|---|---|
| 1 | Pewter | Museum town; stone, fossils, defense | Stone Plate, **Light Clay**, **Eviolite** |
| 2 | Cerulean | Seaside, cape, recovery | Splash Plate, **Sitrus Berry**, **Big Root** |
| 3 | Vermilion | Working port; freight, labor, the S.S. Anne | Zap Plate, **Muscle Band**, **Iron Ball** |
| 4 | Celadon | The department store | Meadow Plate, **Mega Revive** (+ Max Heal restocked to 3) |
| 5 | Fuchsia | Safari Zone; poison, wardens, evasion | Toxic Plate, **Black Sludge**, **Bright Powder** |
| 6 | Saffron | Silph Co.; corporate tech, psychics | Mind Plate, **Wise Glasses**, **Assault Vest** |
| 7 | Cinnabar | Volcanic research lab | Flame Plate, **Life Orb**, **Type Prism** |
| 8 | Viridian | Giovanni's turf; the last stop before the League | Earth Plate, **King's Rock**, **Focus Sash** |

Item effects verified against `items.js` — each placement matches what the item
actually does, not just its name:

- **Big Root** ("all HP recovery is 50% stronger") pairs with Sitrus Berry on
  the same Cerulean shelf; buying both is a recovery build in one stop.
- **Iron Ball** ("+35% damage, −40% Speed") is freight — heavy, slow, hits hard.
- **Bright Powder** ("20% chance an incoming hit is halved") is the Safari
  Zone's evasion.
- **Wise Glasses** ("+20% special damage") is the special-attack mirror of
  Muscle Band, sold at the psychic gym's corporate tower.
- **Assault Vest** ("takes 33% less special damage") is the defensive answer to
  Saffron's own specialty, sold in the same building.

### 4. The three placements that carry the design

**Celadon is the logistics stop.** It is the only shop selling Mega Revive, and
the only shop stocking three Max Heals. It sits at map 4 — the midpoint. This
turns "save for Celadon" into a strategy rather than a habit, and gives the
$900 ceiling purchase a *location* instead of being perpetually available and
perpetually declined. Risk 2 of the shelf spec (Mega Revive may be unreachable)
is partly addressed: a player who knows it is coming at map 4 can plan for it.

**Cinnabar sells Type Prism.** The lab that rewrites what a Pokémon is, selling
the only item that permanently rewrites what a Pokémon is. The fiction and the
mechanic are the same sentence.

**Viridian sells Focus Sash.** You buy your second life at the last shop before
the Elite Four. Following the sash rework (survive a fainting blow, return at
half HP, item consumed), this is the highest-stakes purchase in the run placed
at the highest-stakes moment.

### 5. Per-map stock overrides

`shopStock` is currently global — `{ max_heal: 2 }` applies to every shop in
every region. Celadon-as-department-store is unexpressible under that.

**A `shopPools` entry becomes either a string or an object.** A bare string
keeps today's behaviour; an object carries an explicit stock count:

```js
shopPools: [
  ['plate_rock', 'light_clay', 'eviolite'],           // strings: default stock
  // Celadon, the department store
  [{ id: 'max_heal', stock: 3 }, 'plate_grass', 'mega_revive'],
]
```

`toEntry` resolves both forms. Precedence: an explicit per-map `stock` wins
over `BALANCE.economy.shopStock[id]`, which wins over the default of 1. The
global table stays as the fallback so nothing existing changes.

This is the only code change in the spec. Everything else is data.

### 6. Unova

Unova's `shopPools` is empty and its towns are not yet themed in this codebase.
Filling all eight Unova shelves is **out of scope** — it needs the same
town-by-town fiction pass Kanto gets here, and doing it blind would produce
exactly the generic shelves this spec exists to remove.

Unova instead gets the shrunk generic list plus a **documented pattern to
follow**, so its shops are no worse than today and the next pass has a template.
Its four current generics collapse to `max_heal`; `muscle_band`, `light_clay`
and `mega_revive` move into `shopPools` on maps 1, 3 and 4 respectively,
mirroring Kanto's rung placement without claiming a fiction that has not been
designed.

Hoenn and Sinnoh are stubs (`maps: []`) and are untouched.

## Pricing

Nine items become purchasable for the first time. Prices are assigned to
preserve the existing ladder, not to introduce a new one:

| Item | Price | Rung | Reasoning |
|---|---|---|---|
| Sitrus Berry | $150 | heal | Conditional one-shot heal; matches Max Heal's price because it is a heal you cannot aim. |
| Big Root | $200 | mid | Common tier, multiplies other recovery rather than providing it. |
| Wise Glasses | $200 | mid | Muscle Band's special-attack mirror; identical price by design. |
| Iron Ball | $250 | mid+ | Rare tier, strictly stronger than the $200 commons but carries a real Speed cost. |
| Black Sludge | $250 | mid+ | Rare tier passive recovery, stronger than Leftovers. |
| Assault Vest | $300 | plate | Rare tier, 33% special reduction — plate-class value. |
| Bright Powder | $400 | epic | Epic tier; above every plate. |
| Eviolite | $400 | epic | Epic tier, 33% reduction from *all* damage. |
| Life Orb | $450 | epic | Epic tier, the strongest unconditional damage item. |
| King's Rock | $450 | epic | Epic tier, crit payoff ceiling. |
| Type Prism | $600 | legendary | Below Mega Revive; permanent but single-target. |
| Focus Sash | $600 | legendary | Below Mega Revive; a second life for one Pokémon rather than the team. |

Max Heal ($150), Muscle Band ($200), Light Clay ($200), the plates ($300) and
Mega Revive ($900) are unchanged.

## What this does NOT change

- **No new items.** Every id is already in `items.js`.
- **No new mechanics.** Held items and consumables both already route through
  the existing purchase path.
- **No drop-pool changes.** Tiers and drop odds are untouched; being
  purchasable does not change how often an item drops.
- **No income changes.** Payouts stay exactly as specced.
- **No plate changes.** The gym-type mapping and the $300 uniform price stand.
- **Hoenn and Sinnoh.** Stubs, untouched.

## Risks

1. **Shelf value per map roughly doubles** (~$1,300–1,600 against ~$293
   income). Intended — see the scarcity constraint — but it sharpens the
   existing "most items go unbought" risk. Watch for an item that is *never*
   bought on its map: that is mispricing, not flavour.
2. **Gating Mega Revive to map 4 can strand a player.** A wipe on maps 5–8 has
   no purchasable team recovery. This is the intended tension, but if losing
   runs cluster after map 4, the fallback is stocking it at Viridian as well,
   which is a one-line change to that pool.
3. **Location fiction is invisible to a first-time player.** Someone who does
   not know Kanto reads the shelves as an arbitrary list. The fiction rewards
   knowledge rather than teaching it; the price ladder is what carries a new
   player. Acceptable, and the reason the ladder is preserved per-shelf.
4. **Four-item shelves worsen the known mobile crowding risk.** Risk 4 of the
   shelf spec flagged five stacked cards needing scroll; Celadon now shows
   four entries with one at stock 3. Must be re-checked at 375px.
5. **Sitrus Berry at $150 competes directly with Max Heal.** Same price, same
   shelf slot conceptually, but Cerulean sells the berry and every map sells the
   heal — so on map 2 the player faces two $150 healing options. If the berry
   never sells there, it is priced too close to a strictly more reliable item.

## Verification

No test framework; verification is lint, build, and play-testing.

1. `npm run lint` and `npm run build` clean.
2. `getShopInventory` accepts both string and `{ id, stock }` pool entries, and
   an unknown or unpriced id in either form is skipped rather than throwing.
3. Per-map stock precedence: explicit `stock` > `BALANCE.economy.shopStock` >
   1. Verify Celadon shows Max Heal at 3 while other maps show it at 2.
4. Every Kanto map's shop shows exactly four entries, matching §3 map by map.
5. Each map's plate still matches the §2 table of the shelf spec — all eight.
6. Prices match the pricing table exactly.
7. Buying a newly-purchasable held item (Eviolite) puts it in the bag and can
   then be equipped; buying a newly-purchasable consumable (Type Prism) applies
   through the existing consumable path.
8. Unova's shops show Max Heal on every map, plus the re-homed generics on maps
   1, 3 and 4.
9. Sold-out entries grey rather than disappear, re-checked with stock 3.
10. Shelves are usable at 375px — scrollable, no clipped entries, Buy targets
    still 44px.
