**PokeLite**

Design Document

# **Pokémon**

There will be the following types of pokemon and their strengths and weaknesses against each other:

***Normal***

* Super effective vs: nothing

* Weak to: Fighting 2×

* Immune to: Ghost 0×

* Resists: nothing

***Fighting***

* Super effective vs: Normal 2×, Rock 2×, Steel 2×, Ice 2×, Dark 2×

* Weak to: Flying 2×, Psychic 2×, Fairy 2×

* Immune to: nothing

* Resists: Rock ½×, Bug ½×, Dark ½×

***Flying***

* Super effective vs: Fighting 2×, Bug 2×, Grass 2×

* Weak to: Rock 2×, Electric 2×, Ice 2×

* Immune to: Ground 0×

* Resists: Fighting ½×, Bug ½×, Grass ½×

***Poison***

* Super effective vs: Grass 2×, Fairy 2×

* Weak to: Ground 2×, Psychic 2×

* Immune to: nothing

* Resists: Fighting ½×, Poison ½×, Bug ½×, Grass ½×, Fairy ½×

***Ground***

* Super effective vs: Poison 2×, Rock 2×, Steel 2×, Fire 2×, Electric 2×

* Weak to: Water 2×, Grass 2×, Ice 2×

* Immune to: Electric 0×

* Resists: Poison ½×, Rock ½×

***Rock***

* Super effective vs: Flying 2×, Bug 2×, Fire 2×, Ice 2×

* Weak to: Fighting 2×, Ground 2×, Steel 2×, Water 2×, Grass 2×

* Immune to: nothing

* Resists: Normal ½×, Flying ½×, Poison ½×, Fire ½×

***Bug***

* Super effective vs: Grass 2×, Psychic 2×, Dark 2×

* Weak to: Flying 2×, Rock 2×, Fire 2×

* Immune to: nothing

* Resists: Fighting ½×, Ground ½×, Grass ½×

***Ghost***

* Super effective vs: Ghost 2×, Psychic 2×

* Weak to: Ghost 2×, Dark 2×

* Immune to: Normal 0×, Fighting 0×

* Resists: Poison ½×, Bug ½×

***Steel***

* Super effective vs: Rock 2×, Ice 2×, Fairy 2×

* Weak to: Fighting 2×, Ground 2×, Fire 2×

* Immune to: Poison 0×

* Resists: Normal ½×, Flying ½×, Rock ½×, Bug ½×, Steel ½×, Grass ½×, Psychic ½×, Ice ½×, Dragon ½×, Fairy ½×

***Fire***

* Super effective vs: Bug 2×, Steel 2×, Grass 2×, Ice 2×

* Weak to: Ground 2×, Rock 2×, Water 2×

* Immune to: nothing

* Resists: Bug ½×, Steel ½×, Fire ½×, Grass ½×, Ice ½×, Fairy ½×

***Water***

* Super effective vs: Ground 2×, Rock 2×, Fire 2×

* Weak to: Grass 2×, Electric 2×

* Immune to: nothing

* Resists: Steel ½×, Fire ½×, Water ½×, Ice ½×

***Grass***

* Super effective vs: Ground 2×, Rock 2×, Water 2×

* Weak to: Flying 2×, Poison 2×, Bug 2×, Fire 2×, Ice 2×

* Immune to: nothing

* Resists: Ground ½×, Water ½×, Grass ½×, Electric ½×

***Electric***

* Super effective vs: Flying 2×, Water 2×

* Weak to: Ground 2×

* Immune to: nothing

* Resists: Flying ½×, Steel ½×, Electric ½×

***Psychic***

* Super effective vs: Fighting 2×, Poison 2×

* Weak to: Bug 2×, Ghost 2×, Dark 2×

* Immune to: nothing

* Resists: Fighting ½×, Psychic ½×

***Ice***

* Super effective vs: Flying 2×, Ground 2×, Grass 2×, Dragon 2×

* Weak to: Fighting 2×, Rock 2×, Steel 2×, Fire 2×

* Immune to: nothing

* Resists: Ice ½×

***Dragon***

* Super effective vs: Dragon 2×

* Weak to: Ice 2×, Dragon 2×, Fairy 2×

* Immune to: nothing

* Resists: Fire ½×, Water ½×, Grass ½×, Electric ½×

***Dark***

* Super effective vs: Ghost 2×, Psychic 2×

* Weak to: Fighting 2×, Bug 2×, Fairy 2×

* Immune to: Psychic 0×

* Resists: Ghost ½×, Dark ½×

***Fairy***

* Super effective vs: Fighting 2×, Dragon 2×, Dark 2×

* Weak to: Poison 2×, Steel 2×

* Immune to: Dragon 0×

* Resists: Fighting ½×, Bug ½×, Dark ½×

Each region will have its own set of specific pokemon.

## **Run Setup Flow**

A new run is set up in two steps:

1. **Region Select** — the user picks one region. Each region card shows the region map, its three starters, and run stats. On selection, `prewarmCache()` begins fetching that region's Pokémon data.
2. **Starter Select** — the user chooses their starter from 3 of the region's starters. The starter begins at level 5 with a stat boost (see Levels & Experience → Starter Power Scale).

Selecting the starter starts the run on the region's first map. `mapIndex` is reset to 0 at the start of every run.

The **Character Select** step is currently **skipped** — every run uses a default protagonist (Hilbert). The character sprite is shown in the battle UI and has no gameplay effect. (The character-select screen exists in the code and can be re-enabled later.)

# **Pokémon Stats**

Stats are pulled from PokéAPI at runtime. Each Pokémon has:

* **HP** — determines how much damage it can take before fainting
* **Attack** — used for physical moves
* **Defense** — reduces incoming physical damage
* **Sp. Attack** — used for special moves
* **Sp. Defense** — reduces incoming special damage
* **Speed** — determines turn order; higher Speed attacks first each round

## **Moves**

* Each Pokémon has exactly **one move** — always matching its **primary type**
* Every move belongs to a **tier system**: each of the 18 types has exactly **4 moves**, one per tier (Tier 1 → Tier 4), e.g. Water: **Water Gun → Bubble Beam → Hydro Pump → Hydro Cannon**
* **Every Pokémon starts on Tier 1** of its primary type's move
* When a Pokémon is **spawned or caught** (Pokéball nodes, trainer/enemy teams, grass encounters), its tier is set by its **level** against the tier level ranges — so a level-40 Water Pokémon spawns already holding the tier whose range covers level 40
* Moves **do not** auto-upgrade as a Pokémon levels up — leveling changes **stats only** (see Levels & Experience). The **only** way to raise a Pokémon's move tier is a **TM / Power Upgrade node** (see Node Types → Power Upgrade)
* Move data is **authored by this game** (not pulled from PokéAPI). Each move defines:
  * `name` — the move's display name
  * `tier` — 1–4
  * `basePower` — the flat power value for that tier (Tier 1 = 35)
  * `damageClass` — `physical` or `special` (authored per move; decides whether Attack/Defense or Sp. Attack/Sp. Defense is used)
  * `levelRange` — the level band that assigns this tier on spawn
  * (a move's **type** is implied by which type's list it belongs to)
* Battles are fully automatic — no player input during combat

### **Tier Level Ranges**

A spawned/caught Pokémon's tier is chosen by where its level falls in these bands. These are the **default** ranges (an even split toward ~100) and are balance knobs that can be retuned:

| Tier | Level Range |
|------|-------------|
| Tier 1 | 1–24 |
| Tier 2 | 25–49 |
| Tier 3 | 50–74 |
| Tier 4 | 75+ |

### **Type Move Table**

The authored move data is a single table covering **all 18 types × 4 tiers** (72 moves), **fully implemented** in `src/game/typeMoves.js`. The same table is reused across **all generations/regions** — it is type-based, not region-based, so future regions reuse it as-is.

Representative rows:

| Type | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|------|--------|--------|--------|--------|
| Water | Water Gun | Bubble Beam | Hydro Pump | Hydro Cannon |
| Fire | Ember | Flamethrower | Fire Blast | Blast Burn |
| Grass | Vine Whip | Razor Leaf | Solar Beam | Frenzy Plant |

Each cell expands to the full move shape above (`name`, `tier`, `basePower`, `damageClass`, `levelRange`). `basePower` per tier is **35 / 60 / 95 / 140** (balance knobs).

## **Levels & Experience**

* The player's **starter begins at level 5**
* After winning a **trainer battle**, all Pokémon in the roster gain **2 levels**
* After winning a **grass battle** (wild Pokémon), all Pokémon gain **1 level**
* Pokémon in **Pokéball nodes** have a level drawn from a pool defined per map
* A caught Pokémon joins the roster at the level it was presented
* **Evolution** happens immediately after the battle that caused the Pokémon to reach its evolution level
* Leveling up changes **stats only** (HP, Attack, Defense, Sp. Attack, Sp. Defense, Speed). It **does not** change a Pokémon's move tier — the starting Pokémon keeps its Tier 1 move until a Power Upgrade node raises it. (A higher level still increases damage indirectly, because Attack/Sp. Attack scale with level and feed the damage formula.)
* Leveling **never revives** a fainted Pokémon — its HP stays at 0 through the level-up. Only a Pokécenter (or a boss win) revives.

### **Evolution Triggers**

**Level-up is the only evolution trigger in the game.** There is no trading, no friendship/happiness, no time-of-day, and no location-based evolution. A run has no second player to trade with and no clock, so any trigger that depends on one is unreachable by design — not unimplemented.

Species that evolve by a **non-level-up trigger in the real games** (trade, stone, friendship) are still reachable here, through **one substitute path**: the **Evolve Stone** item (in-game name *Moon Stone*, `evolve_stone`, rare tier). Applying it evolves the holder **on the spot, at any level**, and consumes the stone.

This means:

* **Machoke, Haunter, Kadabra, Graveler, Onix, Golbat, Pikachu, Scyther, Seadra, Porygon, Slowpoke** (Slowking) and every other trade/stone/friendship evolver need an Evolve Stone. They will **never** evolve from a battle win, at any level.
* Lines that mix triggers work up to the wall. Machop → Machoke is level 28 and happens normally; Machoke → Machamp is a trade in canon, so it needs the stone.
* A Pokémon behind such a step is **not** a dead end — it is a **stone sink**. This is the main thing Evolve Stones are for, and it is why they sit at rare tier rather than legendary.

**The one exception is Eevee** (`AUTO_EVOLVE_NONLEVEL`, `BALANCE.pokemon.autoEvolveNonLevel`). Eevee auto-evolves at **level 20** (`BALANCE.pokemon.nonLevelEvoLevel`) on a battle win, branching through the EvolutionChoice popup like any multi-branch line. Eevee's whole identity is the branch, and gating it behind an item the player may never draw would remove that choice from most runs. It is an allowlist of exactly one species — adding a second is a balance decision, not a bug fix.

**Region generation still applies on top of this.** Evolution options are capped at `GEN_MAX_ID[config.generation]`, so a Kanto (gen 1) Eevee cannot become Espeon or Umbreon, and a Johto (gen 2) run cannot reach a gen-3 form. The stone does not lift this cap.

**Authoring consequence for region pools:** a species behind a trade/stone step is a legitimate pool entry, but treat it as a **terminal form** when picking catch and trainer pools — the player is not reliably going to evolve it. Do not build a map's difficulty curve on a trainer's Machamp appearing when the pool only holds Machoke. (The engine already enforces the other direction: `levelUpPathTo` in `evolutionChain.js` returns `null` for a species not reachable by a pure level-up chain, so the stage-downgrade logic leaves it alone instead of silently swapping in a form the player could never have.)

### **Starter Power Scale**

* The chosen starter gets a **1.3× multiplier applied to all of its stats** (HP, Attack, Defense, Sp. Attack, Sp. Defense, Speed).
* This boost **persists through level-ups and evolutions** — it is reapplied every time stats are recalculated, so an evolved starter keeps the bonus.
* Only the player's starter is boosted; caught Pokémon and enemies are not.

### **Victory Heal**

* On **any win**, every **surviving** roster Pokémon recovers **5% of its max HP** (capped at max). Fainted Pokémon are **not** healed or revived by this.
* **Boss wins** still fully heal and revive the entire roster (this overrides the 5% heal).
* The 5% heal is shown on the battle card during the victory celebration (HP bars tick up) and persists to the roster.

# **Damage & Move Scaling**

Damage combines two things: **how strong the Pokémon is** (its PokéAPI stats, scaled by level) and **how strong its move is** (the tier's `basePower`). The damage formula keeps the same skeleton used in the official games but swaps the move's raw power for our authored **tier `basePower`**.

This system is **generation-agnostic** — it is type-based and stat-based, so every region (current and future) uses the same formula and the same Type Move Table.

## **Formula**

```
basePower    = the basePower of the move's current tier (Tier 1 = 35)
physical     = (move.damageClass === 'physical')
atk          = physical ? attacker.Attack  : attacker.SpAtk     // PokéAPI stats, scaled by level
def          = physical ? defender.Defense : defender.SpDef
effectiveness = type-chart multiplier of move.type vs defender's type(s)
crit         = 6.25% chance (1/16) → ×1.5
random       = random roll between 0.85 and 1.00

base   = floor( ((2 × level / 5 + 2) × basePower × atk / def) / 50 ) + 2
damage = max(1, floor( base × effectiveness × random × damageMultiplier × (crit ? 1.5 : 1) ))
```

## **What feeds the formula**

* **PokéAPI stats are kept.** Each Pokémon's Attack, Defense, Sp. Attack, Sp. Defense (and HP, Speed) come from PokéAPI and scale with level. These represent the species appropriately (a strong attacker hits harder, a bulky defender takes less) without any custom per-species number.
* **Move strength comes from the tier `basePower`** — our authored value, the one knob we tune for this game's power curve. Higher tier = higher `basePower` = more damage.
* **`damageClass`** (authored per move) decides whether the move uses Attack/Defense (physical) or Sp. Attack/Sp. Defense (special).
* **Type effectiveness** is applied via the existing type chart (see Pokémon type section).
* **Region `damageMultiplier`** is kept as a final multiplier for per-region difficulty (Unova = **2.5**).
* **Crit (1/16, ×1.5)** and **random variance (0.85–1.00)** are kept.

## **What was intentionally removed**

* **No per-species "scaling" number.** An earlier idea added a hand-tuned scalar per Pokémon (e.g. Squirtle = 1.2). This was dropped because the **PokéAPI Attack/Sp. Attack stat already encodes per-species and per-level strength** — adding a separate species scalar would double-count it.
* **No extra level term on move power.** Level affects damage **only** through the Attack/Sp. Attack stat (as in the official games). `basePower` is a flat per-tier number.
* **No more learnset auto-upgrade.** Moves are no longer derived from the PokéAPI learnset, and they no longer change on level-up. Tier is set on spawn by level, and only a Power Upgrade node changes it afterward.

## **Worked Example**

Squirtle (Water), holding its **Tier 1** move **Water Gun** (`basePower = 35`), at **level 8**:

* Level 8 enters the formula through Squirtle's PokéAPI **Attack / Sp. Attack** stat (already scaled to level 8) — there is no separate level term on the move power.
* `basePower = 35` flows through the formula above, then is multiplied by type effectiveness (Water vs the defender's types), the region `damageMultiplier`, and the crit/random rolls.
* If Squirtle later hits a Power Upgrade node, Water Gun becomes the Tier 2 Water move (Bubble Beam) with its higher `basePower`, increasing damage from that point on.

> Note: the original sketch of this system used a 1.2 species scalar plus a `level × 0.01` term. Both were removed in the final design — the PokéAPI stats already represent species strength and level scaling, so the only authored knob is the tier `basePower`.

## **Implementation (built)**

This system is **fully implemented**:

* **`src/game/typeMoves.js`** — the authored data (18 types × 4 tiers: name, basePower, damageClass) plus `tierForLevel(level)` and `getTypeMove(type, tier)`
* **`src/game/pokemon.js`** — a Pokémon's move is assigned by **tier for its level** on spawn; there is no learnset resolution and no move change on level-up
* **`src/game/battle.js`** — `calcDamage` uses the move's tier `basePower` in place of the raw PokéAPI power
* **`src/components/StarterSelect.jsx`** — the starter simply gets Tier 1 of its primary type
* **`src/components/NodeMap.jsx`** + **`PowerUpgradeNode.jsx`** — the Power Upgrade node is implemented (roster picker → advance one Pokémon's move one tier, cap at Tier 4)

# **Roster**

* The player can hold up to **6 Pokémon** in their roster
* The **order** of Pokémon in the roster determines battle order — the first Pokémon fights first
* The player can **drag and reorder** Pokémon in the roster UI
* If the roster is full (6) and the player wants to pick up a new Pokémon from a Pokéball node, they must **remove one existing Pokémon** first — or decline the new Pokémon
* Fainted Pokémon remain in the roster but cannot battle until revived at a Pokécenter

# **Map Structure**

The user starts by picking the region. The region will have 8 maps, each with a diagonal grid structure with nodes in between similar to Slay the Spire. Nodes will have different types.

Hovering over any node (desktop) or long-pressing (mobile, 400ms hold) shows a tooltip above the node:
* **Trainer:** trainer name + type of their Pokémon pool ("fire type" / "various types")
* **Gym Leader/Boss:** trainer name + each Pokémon listed by name and level (one per line)
* **All other nodes:** node name + short description (e.g. "+1 LVL", "Full heal")

## **Node Types**

### **Trainer**

* Has a predetermined set of monsters to battle

* Amount of pokemon is randomized for a range specific to that map — Map 1: 1–2 Pokémon, scaling up to Map 8: 1–4 Pokémon

* Each trainer has a specific curated pool of Pokémon it can draw from (the pool determines **species only**)

* **Levels scale by position down the map.** Each map has a level band (see Regions), and a node's level is rolled from that band by its position (`positionWeight = node.id / totalNodes`): early nodes sit near the band **floor**, late nodes approach the band **ceiling** (that map's gym leader), with a loose random spread.

* Trainer levels always use the **current map's** band — **not** the trainer type's own historical range. The same trainer type (e.g. Backpacker) appears on multiple maps and scales to whichever map it's on.

* Each region has their own specific trainers (e.g. Youngster, Lass, Backpacker, Janitor for Unova Map 1)

* Also contains Gym Leaders and bosses as a trainer type — these have specific Pokémon with specific levels (see Regions section)

### **Pokeball**

* Presents **3 random Pokémon** from the catchable pool for that map, each with a level drawn from the **map's band, scaled by node position** (same position weighting as trainers)

* Each Pokémon card displays: name, sprite, level, types, stats, and its move

* The player can choose one to add to their roster, or decline all three

* If the roster is full, the player must remove one existing Pokémon before the new one can join

### **Item**

* Presents **3 random items** drawn by weighted random from the global item pool (weights out of 1000 — higher weight = more common)

* Each item card shows: item icon (pixelated PokéAPI sprite), item name, description

* Clicking a card immediately opens the **roster assignment panel** — no separate confirm step

* The assignment panel shows the selected item header (icon + name + description) above a vertical roster list:
  * One row per Pokémon — sprite, name (Upheaval), level (Orange Kid) on the left; held item icon or "— empty —" + **Equip** or **Swap** button on the right
  * **Equip** — assigns item to that Pokémon (empty slot)
  * **Swap** — assigns new item, old item returned to bag
  * **Keep in Bag** — stores item in bag without assigning
  * **Cancel** — returns to the 3-item selection screen (same items, not re-rolled)
  * **X** on the pick screen — closes modal, node clears, no item gained

* Items are never consumed — they are permanently held by a Pokémon or stored in the bag

* Items can appear as offers even if a Pokémon in the roster already holds the same item

* Held item icon (16px) is shown on each Pokémon's roster card

### **Power Upgrade (TM)**

* The **only** way to raise a Pokémon's move tier — moves never upgrade from leveling
* The player selects **one** Pokémon from the roster; its move advances **one tier** within its primary type (e.g. Tier 1 Water Gun → Tier 2 Bubble Beam)
* A Pokémon already on **Tier 4** is at the cap and cannot be upgraded further
* Upgrading only changes the move tier (and therefore `basePower`/`damageClass`/`name`) — it does not change the Pokémon's stats or level
* Implemented: the node opens a roster picker; a Tier-4 Pokémon shows "MAX" and can't be upgraded further

### **Pokecenter**

* Appears exactly once per map, always in the second-to-last row (randomized between the 3 nodes in that row)

* **Fully restores HP** and **revives all fainted Pokémon** in the roster

### **Grass**

* Encountering a single wild Pokémon randomly selected from that map's catch pool, at a level **~3 below the map's band** (also scaled by node position)

* The user must battle it — no fleeing or catching

* Follows standard battle mechanics; winning returns the user to the map

* All roster Pokémon gain **1 level** on victory

### **Master Ball (Legendary)** *(implemented — Unova only)*

* A **rare variant** of the Pokéball node. When a node rolls as a Pokéball, it has a small map-ramped chance to become a **Master Ball** node instead (`masterBallChance(mapIndex)` in `nodeMap.js`), so the overall node distribution is barely affected.

* **Spawn chance ramps by map:** 0% before Map 3, then **0.5% on Map 3**, rising linearly up to **~10% on Map 8**.

* **Visually distinct:** rendered with the **Master Ball icon** and the label **"Master Ball / Legendary!"** so a rare spawn stands out. (Gym/boss nodes use the leader's own sprite, so there is no icon conflict.)

* Clicking it triggers a **legendary battle** — a single high-level legendary from the region. It opens with a **prep intro** ("A wild {Name} appeared!" + Fight!), like a boss. On **defeating** it, the player is **offered the catch** (reuses the Pokéball catch UI: add to roster, or swap if the roster is full). **Declining is allowed** — the node clears with no catch, and the legendary still counts as **seen** in the Pokédex. Losing follows the normal defeat path.

* A caught legendary is **stat-tracked for the Pokédex** exactly like any other catch (flows through the same `pokemon_caught_ids`).

* **Map gating — weakest early → strongest late.** The legendary is drawn from a **per-map pool** (`legendaryPools` in the region config), tiered so a Lv70 legendary can't appear while the team is still low level:

  | Legendary | Level | Available from |
  |-----------|-------|----------------|
  | Cobalion | 40 | Map 3 |
  | Terrakion | 40 | Map 3 |
  | Virizion | 40 | Map 3 |
  | Tornadus | 45 | Map 6 |
  | Thundurus | 45 | Map 6 |
  | Keldeo | 45 | Map 6 |
  | Genesect | 50 | Map 6 |
  | Reshiram | 65 | Map 8 |
  | Zekrom | 65 | Map 8 |
  | Kyurem | 70 | Map 8 |

  Levels are **fixed** (not position-scaled). Maps 1–2 have no legendaries. Only Unova defines `legendaryPools`; other regions have none (safe — no Master Ball spawns there yet).

  *(Landorus is not yet in the pool — optional addition to complete the forces-of-nature trio.)*

### **Portal** *(future — not scheduled)*

* A rare **Portal** node. Clicking it **saves the current map, node position, and cleared nodes**, then teleports the player to a **bonus mini-map** (about half the node count, with custom art).

* At the end of the mini-map is a reward — a **legendary Pokémon** or a **strong item**.

* Completing or leaving the mini-map **returns the player to the saved checkpoint** (same map, same position). Spawn chance and reward tables are TBD.

# **Battle Mechanics**

A battle begins when the user clicks on a Trainer, Gym Leader, Boss, or Grass node that is one node away on the map.

## **Battle Order**

* The user's first Pokémon in their roster enters the battle first

* The opponent's first Pokémon enters the battle first

* The Pokémon with the higher Speed stat attacks first each **round**

* A round = both Pokémon attack once

* If Speed is tied, the tie-break order is decided **once per active pairing** (re-rolled only when a Pokémon faints/swaps in), not re-rolled every round — so a tied Pokémon can't appear to attack twice in a row across a round boundary

## **Roster Reorder (battle start)** *(spec — reorder-in-prep not yet implemented)*

* **Boss, gym, Elite Four, and Champion** battles open on a **prep screen** (the "Fight!" screen). On that screen the player can **drag to reorder** their roster before pressing Fight — letting them set their lead Pokémon for the matchup.
* Regular **trainer and grass** battles start immediately (no prep screen), as they do now.
* Reuses the existing roster drag/touch reorder system (`Roster.jsx` `onSwap`). (Currently the prep screen shows the "Fight!" button but not a reorderable roster — this adds the reorder.)

## **Turn Structure**

* Battles are fully automatic — no player input during combat

* Each round, both Pokémon use their single move

* Speed determines which attacks first within the round

* This repeats until one Pokémon faints

## **Fainting & Substitution**

* When a Pokémon faints, the next living Pokémon in the party automatically enters

* This applies to both the user and the opponent

* The battle continues until one side has no Pokémon remaining

* Fainted Pokémon can only be revived at a Pokécenter node

## **Winning**

* All opponent Pokémon faint → user wins

* Trainer battle: all roster Pokémon gain **2 levels**

* Grass battle: all roster Pokémon gain **1 level**

* Evolutions triggered by leveling up resolve immediately after the battle

* User is returned to the map screen; node is marked as cleared

* **Gym 8** win no longer ends the run — it heals the party and advances into the **Elite Four stage**. The **run is won when the Champion is defeated** (see Boss Selection & Elite Four).

## **Losing**

* All user Pokémon faint → "Defeated..." shown in the battle UI (red text)

* A yellow **Play Again** button appears — clicking it resets the run (same starter, level 5) and returns to the map

* No separate game over screen — the loss result is shown inline in the battle card

# **Boss Selection & Elite Four**

## **Gym Bosses (per map)**

* Each of the 8 maps ends in a **boss node** — the region's gym leader for that map (Map 1's is starter-assigned; Maps 2–8 are fixed).
* Boss teams and levels are authored per leader (see Regions → Unova → the gym tables).

## **Elite Four Stage** *(spec — not yet implemented)*

After the **8th gym leader** is defeated, the run does **not** end — it continues into a special **Elite Four stage**:

* On the Gym 8 win, the roster is **fully healed** and the **Elite Four stage loads** automatically. The four Elite Four members are presented as **sprites in a vertical line**, with the **Champion at the end** — a **linear path** (Member 1 → 2 → 3 → 4 → Champion), not a branching node map.
* The player battles each member in order. **Between each battle**: full heal + a **roster-reorder screen** (see Battle Mechanics → Roster Reorder), then the next battle begins.
* **Defeating the Champion = the run win** (this replaces "beat Gym 8" as the win condition — see Winning).
* Unova members are the canonical four (**Shauntal, Grimsley, Caitlin, Marshal**) and the Champion is **Alder**. Their exact teams/levels are TBD (authored above the Gym 8 range of 71–73).

Implemented as **additional map/stage entries** after Gym 8 in the region config (the engine already treats "boss defeated with no next map" as the run win, so the Champion becomes that final boss).

# **Regions**

## **Unova**

For Unova Map 1 (Striaton City gym), the boss is determined by the player's chosen starter:

* **Snivy** (Grass) → **Chili** (Fire type)
* **Tepig** (Fire) → **Cress** (Water type)
* **Oshawott** (Water) → **Cilan** (Grass type)

### **Map 1 — Route 1 / Striaton City**

**Trainer level band:** 3–10 (early nodes near 3–5, late nodes approach the gym's ace of 10; scaled by node position)

**Trainer Pokémon count:** 1–2

**Catchable Pokémon pool (Pokéball nodes):** Patrat, Lillipup, Purrloin, Pidove, Blitzle, Audino

**Catchable level range:** 3–10 (scaled by node position)

**Grass encounter pool:** Patrat, Lillipup, Purrloin, Pidove

**Trainer pool:** Youngster, Lass, Preschooler M, Preschooler F, Schoolkid M, Schoolkid F, Backpacker M, Backpacker F, Janitor

**Trainer Pokémon pools (per trainer type):**
* Youngster: Patrat, Lillipup, Purrloin
* Lass: Purrloin, Lillipup, Pidove
* Preschooler M/F: Patrat, Lillipup
* Schoolkid M/F: Patrat, Pidove, Blitzle
* Backpacker M/F: Lillipup, Patrat, Purrloin
* Janitor: Lillipup, Patrat

**Boss:** Determined by starter (Chili / Cress / Cilan) — see Boss Selection

### **Gym 1 — Striaton City**

(One of three, depending on your starter)

***Cilan — Grass type — awards the Trio Badge***

* Lillipup (Lv. 8)

* Pansage (Lv. 10)

***Chili — Fire type — awards the Trio Badge***

* Lillipup (Lv. 8)

* Pansear (Lv. 10)

***Cress — Water type — awards the Trio Badge***

* Lillipup (Lv. 8)

* Panpour (Lv. 10)

### **Gym 2 — Nacrene City**

***Lenora — Normal type — awards the Basic Badge***

* Herdier (Lv. 17)

* Audino (Lv. 19)

### **Gym 3 — Castelia City**

***Burgh — Bug type — awards the Beetle Badge***

* Sewaddle (Lv. 26)

* Venipede (Lv. 26)

* Whirlipede (Lv. 28)

### **Gym 4 — Nimbasa City**

***Elesa — Electric type — awards the Bolt Badge***

* Emolga (Lv. 35)

* Eelektrik (Lv. 35)

* Eelektross (Lv. 37)

### **Gym 5 — Driftveil City**

***Clay — Ground type — awards the Quake Badge***

* Excadrill (Lv. 44)

* Excadrill (Lv. 44)

* Krokorok (Lv. 46)

### **Gym 6 — Mistralton City**

***Skyla — Flying type — awards the Jet Badge***

* Sigilyph (Lv. 53)

* Swanna (Lv. 53)

* Tranquill (Lv. 55)

### **Gym 7 — Icirrus City**

***Brycen — Ice type — awards the Icicle Badge***

* Beartic (Lv. 62)

* Cryogonal (Lv. 62)

* Vanillish (Lv. 64)

### **Gym 8 — Opelucid City**

(Depends on version)

***Drayden — Dragon type — awards the Legend Badge*** (implemented)

* Fraxure (Lv. 71)

* Haxorus (Lv. 71)

* Hydreigon (Lv. 73)

*(Iris is the White-version alternative in the source games; only Drayden is implemented here.)*

### **Elite Four & Champion** *(spec — not yet implemented)*

A final **linear stage** entered automatically after Drayden (Gym 8) is beaten — the party is fully healed, then the stage loads with the four members shown as sprites in a vertical line, Champion at the end. Full heal + roster reorder between each battle. Defeating the Champion wins the run.

* **Shauntal** — Ghost type — team/levels TBD
* **Grimsley** — Dark type — team/levels TBD
* **Caitlin** — Psychic type — team/levels TBD
* **Marshal** — Fighting type — team/levels TBD
* **Champion Alder** — mixed — team/levels TBD

(All teams authored above the Gym 8 range of 71–73.)

### **Legendaries** *(implemented)*

Legendaries appear via the rare **Master Ball node** (see Node Types → Master Ball). Spawn chance ramps **0.5% on Map 3 → ~10% on Map 8**. The encounter opens with a prep intro, then a 1v1 battle; defeat the legendary to be offered the catch (declining is allowed). Species are **gated by map** (weakest early → strongest late): the Fighting-trio (Lv40) from Map 3, the forces-of-nature + Genesect (Lv45–50) from Map 6, and Reshiram/Zekrom/Kyurem (Lv65–70) on Map 8.

| Legendary | Level | Type |
|-----------|-------|------|
| Cobalion | 40 | Steel/Fighting |
| Terrakion | 40 | Rock/Fighting |
| Virizion | 40 | Grass/Fighting |
| Tornadus | 45 | Flying |
| Thundurus | 45 | Electric/Flying |
| Keldeo | 45 | Water/Fighting |
| Genesect | 50 | Bug/Steel |
| Reshiram | 65 | Dragon/Fire |
| Zekrom | 65 | Dragon/Electric |
| Kyurem | 70 | Dragon/Ice |

*(Landorus not yet included. Gating stronger legendaries to later maps is a future tuning knob.)*

## **Johto**

(To be defined)

## **Kanto**

(To be defined)

# **Items**

Items are held by Pokémon or stored in the player's bag. No items are one-time use in the current version — all effects are passive and tied to the holder.

## **Bag**

* The player has a persistent bag displayed in the right sidebar on desktop (90px wide, yellow BAG header)
* Items arrive in the bag via "Keep in Bag" or "Swap" during item node assignment
* Each bag item shows a small icon (20px) and truncated name
* Bag has no size limit
* Mobile: bag is shown in a compact header row above the map

## **Item Pool**

Each item has a `weight` out of 1000. The displayed rarity % = `weight / 10`.

| Item | Effect | Weight | Rarity |
|------|--------|--------|--------|
| Leftovers | Restores 10% max HP each turn | 200 | 20% |
| Shell Bell | Restores HP equal to 20% of damage dealt | 180 | 18% |
| Expert Belt | +20% damage on all moves | 160 | 16% |
| Choice Band | +50% Attack | 120 | 12% |
| Choice Scarf | +50% Speed | 120 | 12% |
| Scope Lens | Raises crit rate by 30% | 100 | 10% |
| Rocky Helmet | Deals 1/3 HP damage to attackers on contact | 80 | 8% |
| Life Orb | +30% damage on all moves | 30 | 3% |
| Focus Sash | Survive any KO hit at full HP | 10 | 1% |
| Muscle Band | +20% damage on physical moves | 130 | 13% |
| Wise Glasses | +20% damage on special moves | 130 | 13% |
| Assault Vest | Takes 33% less special damage | 110 | 11% |
| Sitrus Berry | Heals 25% HP once when it drops below 50% | 110 | 11% |
| King's Rock | 20% of hits deal +30% damage | 100 | 10% |
| Light Clay | Takes 20% less physical damage | 100 | 10% |
| Bright Powder | 15% chance an incoming hit is halved | 90 | 9% |
| Black Sludge | Restores 12% max HP each turn | 90 | 9% |
| Big Root | All HP recovery is 50% stronger | 80 | 8% |
| Razor Claw | +60% crit rate | 80 | 8% |
| Iron Ball | +35% damage dealt, but −40% Speed | 60 | 6% |
| Cell Battery | +30% damage after it is first hit | 55 | 5.5% |
| Eviolite | Takes 33% less damage from all moves | 50 | 5% |
| Weakness Policy | +50% damage after a super-effective hit | 45 | 4.5% |

### **Effects (implemented)**

All 23 effects are **live in battle** (`src/game/battle.js`). Player-held only for now, though the engine reads whichever side holds the item, so enemy/boss items are enablable later.

Original 9:

* **Expert Belt** — ×1.2 damage dealt
* **Life Orb** — ×1.3 damage dealt (stacks with Expert Belt)
* **Choice Band** — ×1.5 physical **Attack** (no effect on special moves)
* **Choice Scarf** — ×1.5 effective Speed for turn order
* **Scope Lens** — crit chance ×1.3
* **Shell Bell** — attacker heals 20% of the damage it dealt
* **Rocky Helmet** — attacker takes 1/3 of its max HP as recoil on contact (can faint it)
* **Leftovers** — heals 10% max HP at the end of each round
* **Focus Sash** — if at full HP and would be KO'd, survive at 1 HP (every time)

Added 14:

* **Muscle Band** — ×1.2 damage on **physical** moves only
* **Wise Glasses** — ×1.2 damage on **special** moves only
* **Assault Vest** — holder's Sp. Def ×1.5 (takes ~33% less special damage)
* **Eviolite** — holder's Def and Sp. Def ×1.5 (takes ~33% less from all moves)
* **Light Clay** — holder's Def ×1.25 (takes 20% less physical damage)
* **Razor Claw** — crit chance ×1.6
* **King's Rock** — 20% of the holder's hits deal ×1.3 damage
* **Bright Powder** — 15% of incoming hits deal ×0.5 damage
* **Iron Ball** — ×1.35 damage dealt, effective Speed ×0.6 (turn order)
* **Big Root** — all HP recovery the holder receives ×1.5 (Leftovers / Shell Bell / Black Sludge / Sitrus)
* **Black Sludge** — heals 12% max HP at the end of each round
* **Sitrus Berry** — once per battle, heals 25% max HP the first time the holder drops below 50% HP
* **Weakness Policy** — after taking a super-effective hit, ×1.5 damage for the rest of the battle
* **Cell Battery** — the first time the holder is hit, ×1.3 damage for the rest of the battle

Non-attack effects that recover or preserve HP (Shell Bell / Rocky Helmet / Leftovers / Focus Sash / Sitrus Berry / Black Sludge) show floating popups in the battle UI (green heal, red recoil, "Hung on!" for Focus Sash). The stateful bonuses (Weakness Policy / Cell Battery) use per-battle flags on the cloned combatants, so they never persist to the roster.

## **Unova**

(To be defined)

## **Johto**

(To be defined)

## **Kanto**

(To be defined)

# **User Accounts & Stats**

Authentication is optional — the game is fully playable without an account. Stats are only recorded when the user is logged in.

## **Auth**

* Email + password via Supabase Auth (signInWithPassword / signUp)
* Session persists on refresh via Supabase session listener
* Login / Register on the main menu — errors shown inline
* Successful login or register immediately starts the flow into region select

## **Stat Tracking**

Each completed run (win or loss) writes one row to the `runs` table in Supabase:

| Column | Type | Description |
|--------|------|-------------|
| user_id | uuid | references auth.users |
| result | text | 'win' or 'loss' |
| maps_cleared | int | number of maps advanced through |
| pokemon_caught | int | number of Pokémon added via Pokéball nodes |
| pokemon_caught_ids | int[] | PokéAPI IDs of all caught Pokémon (for Pokédex) |

* **Loss** is recorded when all player Pokémon faint in battle
* **Win** is recorded when the **Champion** (end of the Elite Four stage) is defeated
* Stats reset on every new run (Play Again or fresh start)

# **UI & Presentation**

The game is built mobile-first and scales up to desktop. Layout, text, and assets are text + image only — no tile graphics or sprite-walk animations.

## **Theme & Background**

* A light/dark toggle lives in the top nav bar
* The app background is the `lightModeBackground` image (cover, centered) behind a solid fallback color
* UI cards and panels use a consistent dark color scheme regardless of toggle so they stay readable over the background

## **Sprites**

* Battle and selection screens use PokéAPI **pixel sprites** (`front_default` / `back_default`, 96×96) rendered with `image-rendering: pixelated` — not the HD official-artwork
* Player Pokémon show their back sprite in battle; enemies show their front sprite

## **Pokédex** *(caught-state spec — not yet implemented)*

* The Pokédex lists every species per generation. A species the player **has not caught** shows **greyed out** (grayscale / dimmed); a species they **have caught** shows in full color with a small **Poké Ball icon in the top-left of its card**.
* **Caught is persistent across all runs** (account-level): the caught set is aggregated from the user's Supabase `runs.pokemon_caught_ids` history and threaded into the Pokédex. (Persistence requires being logged in.)
* *(Currently the Pokédex shows all species identically with no caught-state.)*

## **Starter Select**

* Three starter cards sit side-by-side with small side padding on mobile, scaling up to a capped width on desktop
* All card dimensions (sprite, fonts, padding, stat bars) derive from a single card-width value via a scaling helper, so everything scales together uniformly — nothing scales independently
* Each card shows a large pixel sprite, the Pokémon name (white with a black stroke outline), level, a five-row stat bar block, and the starter's move (name, type chip, power)

## **Battle UI (Desktop)**

* Fixed **960×540** cinematic 16:9 card over a day battle background; the node map is hidden while a battle is active
* **Vertical roster columns on the outer edges** — **player on the left, enemy on the right**. Each column = a trainer/character card on top + a roster panel of stacked rows below (no shadows; edge-to-edge with the card).
* **Roster row:** held-item icon, the Pokémon sprite (hugging the outer edge), and a name / level / two-tone-HP-bar group. The right column is **mirrored** so enemy sprites hug the right edge. The **active** Pokémon's row is highlighted.
* **Arenas (center):** the active player Pokémon (back sprite) and active enemy Pokémon (front sprite) stand on battle grass, nudged inward to clear the side columns. Each active Pokémon also has an **info card** — light-gray, black border, name + level, and a two-tone green HP bar (lighter top / darker bottom, black outline).
* **Hit feedback:** the defending Pokémon's sprite **squishes** and flashes a translucent **red** overlay on impact, in sync with the move animation.
* **HP bar behaviour:** when a Pokémon faints its bar visibly **drains to 0 before** the next Pokémon swaps in; a newly-sent Pokémon's bar **snaps to full** (no refill animation).
* **Victory celebration:** on a win, each surviving roster Pokémon's sprite **pops** and a glowing yellow **"+2 LVL"** popup floats above it (**"+1 LVL"** for grass wins); HP bars tick up ~5%.
* Victory / Defeat text appears **above** the card; the Continue / Play Again button sits **inside** the card — there is no separate log bar.
* Prep ("wants to battle!" + Fight) and fainted notices render as overlays inside the card.

## **Battle UI (Mobile)**

* Two-column card (player left, enemy right) with a horizontal projectile between them and a battle log bar at the bottom

## **Move Animations & Sound**

* Attacks play a Gen 3 move-animation sprite sheet on the **defending** Pokémon at hit-time, with the matching sound effect played simultaneously
* Animations are looked up by PokéAPI move name (kebab-case) in `src/game/moveAnimations.js`; each entry maps to a sprite sheet (192px frames), frame count, and an OGG sound
* Moves not in the pack fall back to a plain type-colored projectile orb with no sound
* Frame stepping respects the user's battle-speed setting

## **Nav Bar & Settings**

The top nav bar has: **Home**, **Pokédex**, **Stats**, a **Light/Dark** toggle, **Restart run**, and **Settings** (battle speed). Two additions:

* **Auto-close battle** — a nav-bar "Auto" toggle (persisted). When on, the battle UI **auto-closes shortly after a win** so you jump straight back to the map. It **never** auto-closes on a **loss** (the player must see the result and choose Play Again).
* **Skip to next map** — a nav-bar button that advances directly to the next map (same effect as clearing the boss). Only shown when a next map exists.

## **Map Card (Desktop)**

* The map is a **fixed 400×800px** panel — **static**: it does not scale with viewport height (nodes stay a constant size).
* The map background renders **pixelated** (`image-rendering: pixelated`) with `object-fit: contain`, sized to match the panel. Route/tilemap art is being authored per map.

# **Performance**

* Each Pokémon's base data (base stats, types, sprites) is fetched once from PokéAPI and cached in a module-level Map keyed by ID
* Moves are **not** fetched from PokéAPI — they come from the authored Type Move Table, so no learnset/move-detail requests are on the path
* On region select, `prewarmCache()` pre-fetches all Pokémon in that region's catch pools, trainer pools, and boss teams in parallel — subsequent node activations are served from cache with no network delay
* Evolution data is fetched on demand and also cached
