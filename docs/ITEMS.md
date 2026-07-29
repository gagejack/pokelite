# Item Reference

Complete inventory of every item in Speedmon, verified against
`src/game/items.js`, `src/game/battle.js`, and `src/game/balance.js`.

**`src/game/items.js` is the source of truth.** This document is a reference;
when the two disagree, the code is right and this file needs updating.

> Supersedes the item table formerly in `docs/DESIGN.md`, which had drifted:
> hyphenated ids (`shell-bell`) where the code uses underscores (`shell_bell`),
> a `weight` column that does not exist, and no mention of the 18 generated
> type-boost plates.

**Last verified:** 2026-07-26 — every multiplier below was checked against its
implementation, and every description against its actual effect.

---

## How drop odds work

Each item has a rarity `tier`. Each tier owns a share of total drop probability
(`BALANCE.items.tierBudget`), and **items inside a tier split that budget
equally**. Per-item odds are derived, never hand-tuned:

```
item %  =  TIER_BUDGET[tier]  ÷  (number of items in that tier)
```

To change odds you either move an item to another tier or change a tier's
budget. See `itemWeight()` in `items.js:119`.

| Tier | Budget | Items | Each | Border color |
|---|---|---|---|---|
| common | 60% | 24 | **2.50%** | `#9ca3af` grey |
| rare | 25% | 11 | **2.27%** | `#3b82f6` blue |
| epic | 10% | 6 | **1.67%** | `#a855f7` purple |
| legendary | 5% | 5 | **1.00%** | `#facc15` yellow |

> **Counterintuitive but correct:** a *common* item is individually rarer than a
> *rare* one (2.50% vs 2.27%), because the 18 type plates dilute the common
> tier. The tier names describe the tier's total share, not per-item odds.

Adding an item to a tier makes every existing item in that tier proportionally
rarer. Budgets currently sum to 100, though the draw normalizes regardless.

---

## Item shape

```js
{
  id: 'leftovers',          // snake_case, unique
  name: 'Leftovers',        // display name
  description: '...',       // shown in the UI
  tier: 'common',           // common | rare | epic | legendary
  icon: 'leftovers',        // PokeAPI sprite slug (hyphenated)
  boostType: 'fire',        // optional — type-boost plates only
  consumable: 'evolve',     // optional — used, not equipped
}
```

Icons resolve through `itemIconUrl()` to the PokeAPI item sprite CDN.

On a Pokémon: `pokemon.heldItem = { id, name, icon } | null`. One item per
Pokémon; equipping over an existing item displaces it to the bag.

---

## Common (24 items, 2.50% each)

### Hand-authored (6)

| id | Name | Effect | Implementation |
|---|---|---|---|
| `leftovers` | Leftovers | Restores 10% max HP each turn | `passiveHeal.leftovers` 0.10 |
| `muscle_band` | Muscle Band | +20% damage on physical moves | `muscleBand` ×1.2 |
| `wise_glasses` | Wise Glasses | +20% damage on special moves | `wiseGlasses` ×1.2 |
| `light_clay` | Light Clay | Takes 20% less physical damage | `lightClay` def ×1.25 |
| `big_root` | Big Root | All HP recovery is 50% stronger | `bigRootHeal` ×1.5 |
| `sitrus_berry` | Sitrus Berry | Heals 25% HP once when it drops below 50% | `sitrusThreshold` 0.5, once per battle |

### Type-boost plates (18, generated)

Generated from `TYPE_BOOST_PLATES` (`items.js:38`) — one per type, id
`plate_<type>`, each granting **+50% damage on moves of that type**
(`typePlate` ×1.5, via the `boostType` field read at `battle.js:81`).

| Type | Item | Type | Item |
|---|---|---|---|
| normal | Silk Scarf | ground | Earth Plate |
| fire | Flame Plate | flying | Sky Plate |
| water | Splash Plate | psychic | Mind Plate |
| electric | Zap Plate | bug | Insect Plate |
| grass | Meadow Plate | rock | Stone Plate |
| ice | Icicle Plate | ghost | Spooky Plate |
| fighting | Fist Plate | dragon | Draco Plate |
| poison | Toxic Plate | dark | Dread Plate |
| steel | Iron Plate | fairy | Pixie Plate |

Normal uses Silk Scarf because no Normal plate exists. **At most one plate is
offered per node** — once drawn, the rest are removed from that node's pool
(`pickThreeItems`, `items.js:129`).

---

## Rare (11 items, 2.27% each)

| id | Name | Effect | Implementation |
|---|---|---|---|
| `expert_belt` | Expert Belt | +20% damage on all moves | `expertBelt` ×1.2 |
| `choice_band` | Choice Band | +50% Attack | `choiceBand` ×1.5 |
| `choice_scarf` | Choice Scarf | +50% Speed | `choiceScarfSpeed` ×1.5 |
| `scope_lens` | Scope Lens | +30% crit rate | `scopeLensCrit` ×1.3 |
| `assault_vest` | Assault Vest | Takes 33% less special damage | `assaultVest` def ×1.5 |
| `rocky_helmet` | Rocky Helmet | Deals 1/3 HP damage to attackers | `rockyHelmetRecoil` 1/3 max HP |
| `iron_ball` | Iron Ball | +35% damage dealt, but −40% Speed | `ironBallDmg` ×1.35, `ironBallSpeed` ×0.6 |
| `shell_bell` | Shell Bell | Restores HP = 20% of damage dealt | `shellBellHeal` 0.2 |
| `black_sludge` | Black Sludge | Restores 12% max HP each turn | `passiveHeal.blackSludge` 0.12 |
| `max_heal` | Max Heal | Restores one Pokémon to full HP | **Consumable** — `consumable: 'heal'` |
| `max_revive` | Max Revive | Revives a fainted Pokémon at full HP; full-heals a healthy one | **Consumable** — `consumable: 'revive'` |

---

## Epic (6 items, 1.67% each)

| id | Name | Effect | Implementation |
|---|---|---|---|
| `life_orb` | Life Orb | +30% damage on all moves | `lifeOrb` ×1.3 |
| `razor_claw` | Razor Claw | +60% crit rate | `razorClawCrit` ×1.6 |
| `bright_powder` | Bright Powder | 15% chance an incoming hit is halved | `brightPowderChance` 0.15, `brightPowderFactor` 0.5 |
| `eviolite` | Eviolite | Takes 33% less damage from all moves | `eviolite` def ×1.5 |
| `cell_battery` | Cell Battery | +30% damage after it is first hit | `cellBattery` ×1.3 |
| `kings_rock` | King's Rock | Critical hits deal 100% more damage | `kingsRockCritFactor` 2/1.5 |

---

## Legendary (5 items, 1.00% each)

| id | Name | Effect | Implementation |
|---|---|---|---|
| `focus_sash` | Focus Sash | Survive any KO hit at full HP | Once per battle, at full HP only |
| `weakness_policy` | Weakness Policy | +50% damage after a super-effective hit | `weaknessPolicy` ×1.5 |
| `resist_charm` | Resist Charm | Super-effective hits deal 50% less damage | `resistCharm` ×0.5 (icon: `chople-berry`) |
| `evolve_stone` | Moon Stone | Instantly evolves the Pokémon it is given to | **Consumable** — `consumable: 'evolve'` |
| `mega_revive` | Mega Revive | Revives and fully heals the whole roster | **Consumable** — `consumable: 'revive_all'` |

---

## Consumables

Most items are **held**: equipped to one Pokémon, modifying battle math. A
consumable is different — it is *used*, produces an immediate effect, and is
destroyed.

There are four: `evolve_stone`, `max_heal`, `max_revive`, and `mega_revive`.
They share one mechanism:

- Each carries a `consumable` field the UI keys off. None reaches `battle.js`,
  so the sim needs no case for any of them.
- Handled at three sites: drag-from-bag in `NodeMap.jsx` and `EliteFour.jsx`,
  plus the item-offer popup in `NodeMap.jsx` (use directly from the offer).
- On use, the caller fires `onMoveItem?.({ item, from, to: { kind: 'consumed' } })`.
  `moveItem` (`App.jsx`) removes it from its source and re-adds it nowhere,
  because no branch matches `'consumed'`.
- **If it can't do anything, it is kept** — a stone dropped on a Pokémon with no
  evolution, or a Max Heal on a full-HP Pokémon, is not wasted.

The three healing items route through `applyConsumable` in `App.jsx`, which
calls a pure helper in `src/game/roster.js` (`healOne` / `reviveOne` /
`reviveAll`). Each helper returns `{ roster, used }`; `used: false` is what
tells the caller to keep the item.

| `consumable` | Helper | Target |
|---|---|---|
| `evolve` | `evolveWithStone` (useEvolutionFlow) | one Pokémon |
| `heal` | `healOne` | one Pokémon |
| `revive` | `reviveOne` | one Pokémon |
| `revive_all` | `reviveAll` | whole roster — drop target ignored |

One exception to keep-on-no-op: using **any** consumable straight from an offer
clears the node even if it did nothing — this has always been true of the
Evolve Stone and is true of the healing items. There the player is choosing one
of three items, so banking an unchosen item would be more surprising. The
keep-on-no-op rule is about the bag path, where the player spends something
they already own.

Both drop paths — mouse (`resolveItemMove`) and touch (`bagTouchEnd`) — route
through one `applyConsumableTo` helper in `NodeMap.jsx`. The touch path used to
call `onMoveItem` directly, which equipped consumables as dead held items.

Any new consumable follows this same shape.

---

## Notes

- **Passive heal decay.** Leftovers and Black Sludge taper off over a long
  battle (`passiveHeal.decayStart` 20 → `decayEnd` 40 rounds), so an
  over-healing matchup cannot loop forever.
- **Enemies hold items too.** Trainer teams draw from the same pool.
- **Bag ↔ roster.** Items move by drag on the map and Elite Four screens.
  Equipping onto an occupied slot displaces the old item to the bag.
- **Mystery-node rerolls** (`BALANCE.map.mysteryRerolls`) let an offer sourced
  from a Mystery node be redrawn; odds are unchanged by a reroll.

- **Healing items are map-screen only.** They work on the map and Elite Four
  screens, not mid-battle — battles are a non-interactive simulation.

---

## Pokémart & Speed Cash

Speed Cash (`$`) is a per-run currency. It is earned in battle, spent at the
Pokémart node (row 7, always paired with the Pokécenter), carried across maps,
and reset when a run starts or restarts. It is stored in the run-save `stats`
object — there is no Supabase column for the live balance.

### Payouts

| Source | Speed Cash | Levels |
|---|---|---|
| Grass | $50 | 1 |
| Trainer | $30 | 2 |
| Rival | $60 | 4 |
| Gym leader | $120 | 2 + full heal |
| Legendary (Master Ball) | $250 | 2 |
| Elite Four member | $200 | 2 |
| Pokéball / Item / TM | $10 | — |

Money compensates for forgone levels: weaker XP pays better cash. Grass out-earns
trainers because trainers already pay double the levels, and levels compound.
Expected income is roughly **$293 per map** (floor $180, ceiling ~$420).

The $10 on non-fight nodes is the income floor — without it a map of all
Pokéball/Item/TM rows would pay only the boss's $120, less than one Max Heal.

**Legendary money is paid for winning, not catching** — declining the catch
still pays $250. A mystery node pays whatever type it resolves into.

Node tooltips show the payout beside the level reward, so the grass-versus-
trainer tradeoff is visible rather than learned by accident.

Two counters are tracked: the spendable balance, and total ever earned this run
(shown on the run-end screen, unaffected by purchases). The total earned is also
written to the `runs.speed_cash_earned` column when a run ends, and the Stats
page sums that column across every run to show lifetime Speed Cash earned.

### Shop

| Item | Price | Stock per shop |
|---|---|---|
| Max Heal | $150 | 2 |

Purchases go straight to the bag. A sold-out entry stays visible and greyed.

Inventory is authored per region: `shopGeneric` (offered at every map) plus
`shopPools[mapIndex]` (curated per map, currently empty). Both are arrays of
item ids; price and stock come from `BALANCE.economy`. See `src/game/shop.js`.

All numbers live in `src/game/balance.js` under `economy`.
