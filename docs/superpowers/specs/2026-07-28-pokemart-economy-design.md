# Pokémart & Run Economy — Design

**Date:** 2026-07-28
**Status:** Design approved; implementation approach not yet discussed

## Problem

The run has no economy. Every reward is either a level or a dropped item, both
awarded automatically — the player never *chooses* to convert one resource into
another. There is also no reason to prefer a grass node over a trainer node:
trainers give 2 levels, grass gives 1 (`balance.js:83`), so trainers strictly
dominate and the map fork is not a real decision.

## Goal

Add a currency earned in battle and a Pokémart node that spends it, tuned so the
grass-versus-trainer fork becomes a genuine choice.

## Design

### 1. The Pokémart node

A new node type, `NODE_TYPES.POKEMART`, rendering a shop popup.

**Placement.** Row 7 currently builds as one guaranteed Pokécenter at a random
index plus one random node (`nodeMap.js:128-133`). The random node becomes the
Pokémart, so **row 7 is always `[pokecenter, pokemart]` in random order**.

The coin-flip placement is kept; only the sibling changes from "random node" to
"always the mart".

**Consequence — this is a fork, not a freebie.** The player walks one node per
row, so taking the mart means skipping the heal, and vice versa:

> Arrive at the boss **healed**, or arrive **stocked**.

That tradeoff is the point. It is also what keeps the economy from trivializing
attrition: buying healing costs you the free heal.

### 2. Currency

**Name:** Speed Cash (`$`).

**Persistence: per-run, carried across maps.** Money earned on map 1 can be
spent at map 6's shop. It resets when the run ends.

This lives in the existing run-save `stats` object (`App.jsx:171-177`) beside
`pokemonCaught` and friends — **no schema change, no migration**. Saving for a
later map is a real strategy.

Rejected: per-map reset (wastes income on maps where you take the Pokécenter)
and cross-run persistence (needs a Supabase column and turns this into
meta-progression — a separate, larger design).

### 3. Income

**The principle: money compensates for forgone levels.** The weaker a fight's XP
reward, the stronger its cash reward.

This is what makes the fork real. Levels compound — every future battle is
easier, permanently — while money buys one consumable. If trainers paid more of
both, trainer nodes would win on every axis and the choice would collapse.

| Source | Payout | Levels | Reasoning |
|---|---|---|---|
| Grass | **50** | 1 | Weakest XP, so the best cash. This is the whole mechanism. |
| Trainer | **30** | 2 | XP *is* the reward here. |
| Rival | **60** | 4 | Best XP in the game; cash is a bonus. |
| Boss (gym leader) | **120** | 2 + full heal | Guaranteed once per map — the reliable income floor. |
| Legendary (Master Ball) | **250** | 2 | Hardest fight in the game for the same XP as a route trainer. Cash carries the reward. |
| Elite Four member | **200** | 2 | Endgame; no shop afterwards, so this is mostly score. |

**Legendary at 250 is deliberate** — higher than a gym leader. It is optional,
rare (~1–2% of Pokéball nodes), and dramatically harder (a Lv70 Mewtwo on map
7). Beating one should feel like it funded the run. It cannot be farmed, so it
does not distort the average.

**Expected income per map:** the player visits ~6 fightable nodes per map, which
by the node-type distribution (`balance.js:33-40`) is ~1.7 grass and ~1.7
trainer, plus the guaranteed boss:

```
1.7 × 50  +  1.7 × 30  +  120  ≈  $256 per map
```

Range is roughly **180** (trainer-heavy path) to **320** (grass-heavy path).

### 4. Prices and stock

**Max Heal: $150.** The only generic item for now.

Against ~$256 per map, that means a typical map affords one Max Heal, a
grass-heavy map affords one comfortably with change, and a trainer-heavy map
means skipping or saving. That is the intended pressure.

**Purchases go straight to the bag**, like any item pickup.

**Stock is limited: 2 Max Heals per shop.** Unlimited stock would turn money
into a straight HP faucet — a legendary windfall could buy five heals and
neutralize the attrition pressure the healing items were designed around
(`2026-07-26-healing-items-design.md`, Risk 1). Sold-out entries stay visible
and greyed, so the player can see what they missed.

### 5. Shop inventory

Two lists per map:

- **Generic** — offered at every map's shop. Currently just Max Heal.
- **Curated** — a small per-map set, authored by hand. **Empty for now**; the
  contents are a separate decision.

Shape, in the region config beside `legendaryPools`:

```js
shopGeneric: [{ id: 'max_heal', price: 150, stock: 2 }],
shopPools: [
  [], [], [], [], [], [], [], [],   // maps 1–8 — curated later
],
```

A map's shop shows `shopGeneric` followed by `shopPools[mapIndex]`. Items
reference existing `items.js` ids; the shop adds only price and stock.

### 6. Out of scope

- Curated per-map inventories (the lists exist but are empty).
- Selling items back.
- Any currency use outside the Pokémart.
- Cross-run/meta currency.
- Elite Four shops — there is no mart there and the Elite Four is a linear
  gauntlet.

## Risks

1. **Attrition softening.** Healing purchases reduce the HP pressure that makes
   runs tense. Mitigated three ways: the shop costs you the Pokécenter, stock is
   capped at 2, and $150 is over half a map's income. The signal to watch is
   whether Pokécenter nodes start feeling like the wrong pick every time.
2. **Grass becoming strictly better.** The fix for one strict dominance can
   create its reverse. $50 vs $30 is deliberately a smaller edge than 2 vs 1
   levels, so trainers stay the stronger pick for a player who wants to win
   fights, not shop.
3. **Row 7 loses a node type.** That row can no longer roll grass, trainer, item
   etc. — it is always heal-or-shop. This removes ~1 random node per map, a
   small reduction in map variety accepted for a guaranteed shop.

## Verification

No test framework; verification is lint, build, and play-testing.

1. `npm run lint` and `npm run build` clean.
2. Row 7 always contains exactly one Pokécenter and one Pokémart, in random
   order, on every generated map.
3. Money accrues at the specced rate per node type; the running total is visible
   during a run.
4. Buying a Max Heal deducts $150, adds it to the bag, and decrements stock.
5. A player with under $150 cannot buy — the entry is disabled with the reason
   shown, matching the healing-item block pattern (`1de3e80`).
6. Stock reaching 0 greys the entry rather than hiding it.
7. Money survives a mid-run save and resume.
8. Money resets to 0 on a new run.
