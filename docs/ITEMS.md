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
| rare | 25% | 9 | **2.78%** | `#3b82f6` blue |
| epic | 10% | 6 | **1.67%** | `#a855f7` purple |
| legendary | 5% | 4 | **1.25%** | `#facc15` yellow |

> **Counterintuitive but correct:** a *common* item is individually rarer than a
> *rare* one (2.50% vs 2.78%), because the 18 type plates dilute the common
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

## Rare (9 items, 2.78% each)

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

## Legendary (4 items, 1.25% each)

| id | Name | Effect | Implementation |
|---|---|---|---|
| `focus_sash` | Focus Sash | Survive any KO hit at full HP | Once per battle, at full HP only |
| `weakness_policy` | Weakness Policy | +50% damage after a super-effective hit | `weaknessPolicy` ×1.5 |
| `resist_charm` | Resist Charm | Super-effective hits deal 50% less damage | `resistCharm` ×0.5 (icon: `chople-berry`) |
| `evolve_stone` | Moon Stone | Instantly evolves the Pokémon it is given to | **Consumable** — `consumable: 'evolve'` |

---

## Consumables

Most items are **held**: equipped to one Pokémon, modifying battle math. A
consumable is different — it is *used*, produces an immediate effect, and is
destroyed.

`evolve_stone` is currently the only one. Its mechanism:

- Carries `consumable: 'evolve'`, which the UI keys off. It never reaches
  `battle.js`, so the sim needs no case for it.
- Handled at two sites with identical logic: `NodeMap.jsx:925` and
  `EliteFour.jsx:193` (drag from bag onto a Pokémon), plus the offer popup at
  `NodeMap.jsx:1281` (use directly from the offer).
- On use, the caller fires `onMoveItem?.({ item, from, to: { kind: 'consumed' } })`.
  `moveItem` (`App.jsx:412`) removes it from its source and re-adds it nowhere,
  because no branch matches `'consumed'`.
- **If it can't be used, it is kept** — a stone dropped on a Pokémon with no
  evolution is not wasted.

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

## Planned

Not yet implemented — see
`docs/superpowers/specs/2026-07-26-healing-items-design.md`:

| id | Name | Effect | Tier |
|---|---|---|---|
| `max_heal` | Max Heal | Restores one Pokémon to full HP | rare |
| `max_revive` | Max Revive | Revives a fainted Pokémon at full HP; full-heals a healthy one | rare |
| `mega_revive` | Mega Revive | Revives and fully heals the whole roster | legendary |

All three are consumables following the `evolve_stone` pattern. Adding them
changes existing odds: rare 2.78% → 2.27% each (9→11 items), legendary
1.25% → 1.00% each (4→5 items).
