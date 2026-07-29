# Pokémart Shelf — Design

**Date:** 2026-07-29
**Status:** Design approved; ready for an implementation plan
**Builds on:** `2026-07-28-pokemart-economy-design.md`

## Problem

The Pokémart ships with one item. `shopGeneric` holds `['max_heal']` and every
entry of `shopPools` is an empty array — the curated per-map lists exist as
structure with nothing in them.

One item is not a shop. With a single $150 purchase and ~$293 of income per
map, the only decision is "buy the Max Heal or don't", and money past the first
$150 has nowhere to go. The economy works; the shelf does not use it.

## Goal

Fill the shelf. Give the player a spread of prices so income has somewhere to
go at every scale, and make each map's shop feel like *that map's* shop.

**Every item in this spec already exists in `src/game/items.js`.** Nothing new
is authored. This is a pricing and placement change — data only.

## Design

### 1. The generic shelf

Four items, offered at every map's shop, spanning the price range:

| Item | Price | Effect | Tier |
|---|---|---|---|
| Max Heal | **$150** | Restores one Pokémon to full HP | rare |
| Muscle Band | **$200** | +20% damage on physical moves | common |
| Light Clay | **$200** | Takes 20% less physical damage | common |
| Mega Revive | **$900** | Revives and fully heals the whole team | legendary |

**The spread is the point.** At ~$293 per map the player now faces a real
ladder: one cheap heal, a pair of mid-priced permanent upgrades, and one
purchase that costs three maps of saving.

**Muscle Band and Light Clay at $200** are deliberately just above the Max
Heal. They are permanent held items where the heal is consumed once, so the
extra $50 buys durability. They are also symmetrical — one offensive, one
defensive, same price, same tier — so the choice between them is about the run
you are having, not about value.

**Mega Revive at $900** is the ceiling. Three maps of income, or a legendary
kill plus most of a map. It cannot be an impulse buy: at $900 the player who
wants it must pass on roughly six Max Heals to get there, and that sustained
refusal to spend is the strategy. Lower prices were rejected — $400 makes it
buyable twice a run, which turns a wipe-recovery into routine maintenance and
undoes the attrition pressure the healing items were designed around
(`2026-07-26-healing-items-design.md`, Risk 1).

Note this is the first shop item that is not `consumable: 'heal'`-family:
Muscle Band and Light Clay are held items, so a purchase goes to the bag and is
then equipped like any dropped item. No new mechanics — `onItemKeepInBag`
already handles both kinds.

### 2. The map plates

**One type-boost plate per map, thematically matched to that map's gym type.**

Kanto's gyms happen to cover eight distinct types in order, so the mapping is
one-to-one with no repeats:

| Map | City | Gym leader | Gym type | Plate | Item id |
|---|---|---|---|---|---|
| 1 | Pewter | Brock | rock | Stone Plate | `plate_rock` |
| 2 | Cerulean | Misty | water | Splash Plate | `plate_water` |
| 3 | Vermilion | Lt. Surge | electric | Zap Plate | `plate_electric` |
| 4 | Celadon | Erika | grass | Meadow Plate | `plate_grass` |
| 5 | Fuchsia | Koga | poison | Toxic Plate | `plate_poison` |
| 6 | Saffron | Sabrina | psychic | Mind Plate | `plate_psychic` |
| 7 | Cinnabar | Blaine | fire | Flame Plate | `plate_fire` |
| 8 | Viridian | Giovanni | ground | Earth Plate | `plate_ground` |

Types verified against each leader's lead Pokémon in `kanto.teams.js`.

**Price: $300, uniform.** A plate is +50% damage on one type — the strongest
single-item damage effect in the game — but only for a Pokémon of that type. It
costs more than the $200 generics because the ceiling is higher, and less than
Mega Revive because it is conditional.

**Thematic, not counter-typed — and the consequence is real.** The plate on a
map matches the gym you are walking toward, which is the gym that plate helps
you least against. A Flame Plate does nothing to Blaine.

This was chosen deliberately over counter-typing (Cinnabar selling the Splash
Plate). Thematic placement means **the shop is where you invest in the next
map, not where you tool up for this one.** It reads as a regional speciality —
Cinnabar is a fire town, it sells fire goods — and it keeps plates from
competing with the Max Heal for the same urgent money. The heal is what you buy
for the fight in front of you; the plate is what you buy for the run.

The tradeoff accepted: a player who does not read ahead may buy a plate that
looks immediately useful and is not. The plate's description already names its
type, so the information is present.

### 3. Shelf composition

A map's shop shows `shopGeneric` then `shopPools[mapIndex]` — so **five items
per shop**: the four generics plus that map's plate.

Stock stays at the existing default. `getShopInventory` reads
`BALANCE.economy.shopStock[id] ?? 1`, so any item without an explicit entry
stocks one unit. Only Max Heal has an entry (2). The rest stock one each, which
is correct: a second Muscle Band on the same shelf is a strictly worse buy than
almost anything else, and one Mega Revive is already the ceiling purchase.

## What this does NOT change

- **No new items.** Every id here is already in `items.js`.
- **No new mechanics.** Held items already route through `onItemKeepInBag`.
- **No drop-pool changes.** These items keep their existing tiers and drop
  odds; being purchasable does not alter how often they drop.
- **No income changes.** Payouts stay exactly as specced.
- **The Reroll Token is out of scope.** It needs a new item plus changes to
  `PokeballNode` and `ItemNode` (both own their reroll count as local state,
  which a bag-held token would have to override). Separate spec, separate
  cycle.

## Risks

1. **Total shelf value is $1,750 against ~$293 per map.** The player can never
   buy everything, which is intended — but it does mean most items go unbought
   most runs. Watch for whether anything is *never* chosen: an item that never
   sells is mispriced, not decorative.
2. **Mega Revive may be unreachable in practice.** $900 assumes the player
   saves across three maps while passing on heals. If play-testing shows nobody
   ever affords it, the fix is lowering it toward $600 rather than raising
   income.
3. **Thematic plates may read as a mistake.** A player who expects the shop to
   arm them against the coming gym will find the opposite. If this reads as
   broken rather than as flavour, counter-typing is the fallback — it is a
   one-line change to the mapping table.
4. **Five items may crowd the shop UI.** `PokemartNode` stacks entries on
   mobile; it was built and checked against a one-item shelf. Five stacked
   cards will need scrolling on a phone.

## Verification

No test framework; verification is lint, build, and play-testing.

1. `npm run lint` and `npm run build` clean, no growth past the recorded
   baselines.
2. Every map's shop shows exactly five items: four generics plus one plate.
3. Map *i*'s plate matches the table in §2 — check all eight.
4. Prices match §1 and §2 exactly.
5. Buying a held item (Muscle Band) puts it in the bag, and it can then be
   equipped onto a Pokémon like any dropped item.
6. Buying Mega Revive at $900 works and revives the whole team.
7. Sold-out entries grey rather than disappear (existing behaviour, re-checked
   with a five-item shelf).
8. The five-item shelf is usable at 375px width — scrollable, no clipped
   entries, Buy targets still 44px.
