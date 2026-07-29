# Pokémart & Run Economy — Design

**Date:** 2026-07-28
**Status:** Design approved. Revised 2026-07-28 after critique — see Revision log.

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

**Two counters, not one.** `speedCash` is the spendable balance. `cashEarned` is
the running total ever earned this run — it only goes up, purchases never touch
it. Both live in the run-save `stats` object.

`cashEarned` exists because Elite Four payouts are otherwise pure waste: there
is no mart in the Elite Four, so $200 × 4 plus the final gym's $120 accrues into
a void. Rather than delete the payout or add a Supabase column, the total is
shown on the run-end screen as a run statistic — "Speed Cash earned: $1,240".
Local only, no `runs` column, no migration.

This also gives the *whole* economy a visible endpoint. Without it a player who
saves and never shops sees no evidence the system exists.

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
| Elite Four member | **200** | 2 | Endgame. Unspendable — see "Total accrued" below. |
| Pokéball / Item / TM | **10** | — | The floor. Non-fight nodes pay a token so no row pays nothing. |

**Legendary at 250 is deliberate** — higher than a gym leader. It is optional
and dramatically harder (a Lv70 Mewtwo on map 7). Beating one should feel like
it funded the run. It cannot be farmed — the player walks one node per row and
never revisits — so it does not distort the average.

Note the rarity honestly: the Master Ball ramp is `start: 0.005` at map 4 rising
to `end: 0.10` at map 8 (`balance.js:43`). That is ~0.5% of Pokéball nodes early
but **10% by map 8** — a late-game legendary is uncommon, not rare.

**The $10 floor exists to kill the dead map.** Without it, a map whose six random
rows all roll Pokéball/Item/TM pays only the boss's $120 — less than a single Max
Heal, so the guaranteed shop is guaranteed useless. $10 per non-fight node lifts
that worst case to $180, which affords one Max Heal with $30 to spare. It is
deliberately small: at a fifth of a grass node it can't compete with fighting.

**Mystery nodes pay whatever they resolve into.** A "?" that becomes grass pays
$50; one that becomes an item pays $10; one that becomes a Master Ball pays $250.
The payout follows the resolved node type, so a mystery node is an income gamble
on top of its reward gamble. No special-casing — resolution happens before the
node is dispatched (`NodeMap.resolveMysteryNode`), so the normal payout logic
already sees the resolved type.

**Expected income per map.** `rowWidths` is `[1,2,3,4,3,4,3]` — seven rows, but
**row 0 is the start node**: it is pre-cleared (`new Set([0])`, `NodeMap.jsx:419`)
and never fought. So there are **6 random rows** plus the guaranteed boss.

By the node-type distribution (`balance.js:33-40`): grass 28%, trainer 28%,
pokéball 19%, item 14%, TM 5%, mystery 6%.

```
grass     6 × 0.28 × 50   =  84
trainer   6 × 0.28 × 30   =  50
floor     6 × 0.38 × 10   =  23     (pokéball + item + TM)
mystery   6 × 0.06 × ~45  =  16     (resolves across all outcomes)
boss                      = 120
                            ────
                            ≈ $293 per map
```

Range: **$180** (every random row a non-fight node) to **~$420** (every row
grass). A legendary adds $250 on top and is not in the average.

**Max Heal at $150 against ~$293** means a typical map affords one comfortably,
a grass-heavy map affords one with real change, and the floor guarantees one is
always *reachable* even on the worst roll. That is the intended pressure.

### 4. Prices and stock

**Max Heal: $150.** The only generic item for now.

See §3 for how $150 sits against the ~$293 expected income and the $180 floor.

**Purchases go straight to the bag**, like any item pickup.

**Stock is limited: 2 Max Heals per shop.** Unlimited stock would turn money
into a straight HP faucet — a legendary windfall could buy five heals and
neutralize the attrition pressure the healing items were designed around
(`2026-07-26-healing-items-design.md`, Risk 1). Sold-out entries stay visible
and greyed, so the player can see what they missed.

### 5. Making the tradeoff visible

**Node tooltips must show the cash payout beside the level reward.** Today
`getNodeLabel` (`NodeMap.jsx:865-873`) shows `+1 LVL` for grass and
`+2 levels to all mon` for a trainer. Neither mentions money.

The entire design rests on grass-versus-trainer being a tradeoff the player can
*see* and weigh. If the payouts are invisible, the player learns the economy by
accident over many runs, or never — and the fork stays exactly as fake as it was
before, just for a different reason.

So every node label gains its payout:

| Node | Label sub-line |
|---|---|
| Grass | `+1 LVL · $50` |
| Trainer | `+2 levels to all mon` / `$30` |
| Rival | `+4 levels + full heal · $60` |
| Pokéball / Item / TM | existing text · `$10` |
| Master Ball | existing `???` row · `$250` |
| Pokécenter | `Full heal` (no payout) |
| Pokémart | `Spend Speed Cash` |

Mystery stays `???` — revealing the payout would leak the outcome.

This is not polish. It is the mechanism.

### 6. Legendary payout timing

**The $250 is awarded for winning the battle, never for catching.** A Master Ball
win leads to a catch offer the player may decline; tying the money to the catch
would mean declining torches $250 for no stated reason.

Concretely: the payout fires inside `handleBattleEnd`'s `if (won)` branch,
alongside every other payout — **never** in `handleLegendaryCatch`. Same for the
Pokéball node's $10: it is paid when the node is taken, whether or not the player
keeps anything.

### 7. Shop inventory

Two lists per map:

- **Generic** — offered at every map's shop. Currently just Max Heal.
- **Curated** — a small per-map set, authored by hand. **Empty for now**; the
  contents are a separate decision.

Shape, in the region config beside `legendaryPools` — **ids only**:

```js
shopGeneric: ['max_heal'],
shopPools: [
  [], [], [], [], [], [], [], [],   // maps 1–8 — curated later
],
```

A map's shop shows `shopGeneric` followed by `shopPools[mapIndex]`.

**Price and stock live in `BALANCE.economy`, not here.** AGENTS.md is explicit
that numeric knobs belong in `balance.js`, and an inline price would also be
duplicated into every region that sells the item. The region config authors
*what is on the shelf*; `balance.js` says *what it costs*. Resolution happens in
a new pure module, `src/game/shop.js`.

### 8. Where the numbers live

All of it in `BALANCE.economy` (`src/game/balance.js`):

```js
economy: {
  payouts: { grass: 50, trainer: 30, rival: 60, boss: 120,
             legendary: 250, eliteFour: 200, node: 10 },
  prices:    { max_heal: 150 },
  shopStock: { max_heal: 2 },
}
```

Nothing in this feature hardcodes a gameplay number in a component. The admin
balance dashboard reads `BALANCE`, so it picks the economy up for free.

### 9. Where the money is earned

Two touchpoints, both existing victory handlers:

- **`NodeMap.handleBattleEnd`** (`NodeMap.jsx:709-721`) — grass, trainer, rival,
  boss, and Master Ball all funnel through here. One insertion point covers
  every map fight.
- **`EliteFour.handleBattleEnd`** (`EliteFour.jsx:84`) — the separate gauntlet.

Non-fight nodes ($10) are credited where their node is cleared in
`handleNodeClick` — Pokéball, Item, and TM.

State lives in `App.jsx` beside the other run stats and threads down as props,
matching how `pokemonCaught` and friends already work.

### 10. Out of scope

- Curated per-map inventories (the lists exist but are empty).
- Selling items back.
- Any currency use outside the Pokémart.
- Cross-run/meta currency.
- Elite Four shops — there is no mart there and the Elite Four is a linear
  gauntlet.
- A `runs` column for money. `cashEarned` is shown on the run-end screen and
  then discarded.

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
4. **Map 8's fork is degenerate — accepted, not fixed.** A gym-leader win already
   full-heals the roster (`fullHeal: isBoss || isRival`, `NodeMap.jsx:721`), so on
   the final map the Pokécenter is nearly worthless while the mart's two Max Heals
   carry into the Elite Four gauntlet. The mart strictly dominates row 7 there —
   the exact inverted dominance Risk 2 warns about, in one specific place.
   Knowingly shipped as-is; revisit after play-testing.
5. **Seeded-run continuity breaks once, on deploy.** See below.

## The rng stream shift

AGENTS.md:49 states: *"Never reorder rng() calls."* **This change reorders
them, deliberately, with sign-off.**

Row 7's non-Pokécenter slot currently calls `randomNode()`, which consumes 1–2
`rng()` values (one for `pickType`, plus one for a Master Ball roll or a trainer
name). A fixed Pokémart consumes none. Every downstream consumer therefore shifts
by 1–2 draws: later battles, catch offers, shiny rolls, and subsequent maps.

Consequence: **the same seed produces a different run before and after deploy.**

- Normal runs — no impact, nobody replays a seed.
- Custom seed codes — a saved code now yields a different map. Minor.
- **Daily challenge — the real cost.** A deploy mid-day puts morning players and
  afternoon players on different maps for the same date, on one leaderboard.

**Decision: accept it.** Preserving the stream would mean burning throwaway
`rng()` calls in the mart branch, and it *cannot even work* — the old call count
was variable (1 or 2 depending on what it rolled), so no fixed number of burned
draws restores alignment. That trades a permanent, confusing piece of dead code
for a partial fix to a one-day problem.

**Mitigation: deploy at UTC midnight**, when the daily seed rolls over and no
one is mid-day. Damage is then zero rather than one day.

## Verification

No test framework; verification is lint, build, and play-testing.

1. `npm run lint` and `npm run build` clean (no growth past the recorded
   baselines: App.jsx 1, NodeMap.jsx 3).
2. Row 7 always contains exactly one Pokécenter and one Pokémart, in random
   order, on every generated map.
3. Money accrues at the specced rate per node type; the balance is visible on
   the map without opening the shop.
4. **Every node tooltip shows its payout** — grass `$50`, trainer `$30`, the
   $10 nodes, rival `$60`, Master Ball `$250`. Mystery shows none.
5. **A declined legendary still pays $250.** Beat a Master Ball node, decline
   the catch, confirm the money is there.
6. **Non-fight nodes pay $10** — Pokéball, Item, and TM — whether or not the
   player keeps anything.
7. **A mystery node pays its resolved type's rate**: "?" → grass pays $50,
   "?" → item pays $10.
8. Buying a Max Heal deducts $150, adds it to the bag, and decrements stock.
9. A player with under $150 cannot buy — the entry is disabled with the reason
   shown, matching the healing-item block pattern (`1de3e80`).
10. Stock reaching 0 greys the entry rather than hiding it.
11. Money survives a mid-run save and resume; **so does remaining shop stock**
    (a refresh must not restock a sold-out shelf — that would be a free
    duplicate).
12. Money resets to 0 on a new run and on Play Again.
13. **The run-end screen shows total Speed Cash earned**, and that total is
    unaffected by purchases.
14. A full run never produces a map paying less than $180.

## Revision log

**2026-07-28, post-critique.** Changes from the first draft:

- **Expected income corrected** $256 → **~$293**. The original counted 6
  fightable rows but ignored mystery resolution and the new floor. (The "7 rows"
  reading of `rowWidths` is wrong — row 0 is the pre-cleared start node.)
- **Added the $10 non-fight floor.** Worst case was $120 — under one Max Heal,
  making the guaranteed shop useless on a bad roll.
- **Price and stock moved** from the region config into `BALANCE.economy`, per
  AGENTS.md. Region configs now hold item ids only.
- **Node tooltips must show payouts** (new §5). Previously the entire mechanism
  was invisible to the player.
- **Legendary pays on win, never on catch** (new §6), so declining costs nothing.
- **Mystery nodes pay their resolved type's rate** — stated explicitly.
- **Added `cashEarned`**, a separate total-ever-earned counter shown on the
  run-end screen. Elite Four payouts were otherwise unspendable and invisible.
- **Named the two earning touchpoints** and where state lives (new §9).
- **rng stream shift documented** as an accepted, signed-off exception to
  AGENTS.md:49, with the UTC-midnight deploy mitigation.
- **Map-8 degenerate fork** recorded as Risk 4, knowingly unfixed.
- **Legendary rarity claim corrected** — "~1–2%" was wrong; the ramp reaches
  10% by map 8.
