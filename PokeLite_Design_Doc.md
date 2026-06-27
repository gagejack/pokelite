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

A new run is set up in three steps:

1. **Region Select** — the user picks one region. Each region card shows the region map, its three starters, and run stats. On selection, `prewarmCache()` begins fetching that region's Pokémon data.
2. **Character Select** — the user picks an avatar from the region's character roster. The chosen character represents the player throughout the run (shown in the top-left of the battle UI) and has no gameplay effect.
3. **Starter Select** — the user chooses their starter from 3 of the region's starters. The starter begins at level 5 with a small stat boost.

Selecting the starter starts the run on the region's first map. `mapIndex` is reset to 0 at the start of every run.

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
  * `basePower` — the flat power value for that tier (e.g. Tier 1 = 40)
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

The authored move data is a single table covering **all 18 types × 4 tiers** (72 moves). The same table is reused across **all generations/regions** — it is type-based, not region-based, so future regions reuse it as-is.

Representative rows (template — remaining types to be authored the same way):

| Type | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|------|--------|--------|--------|--------|
| Water | Water Gun | Bubble Beam | Hydro Pump | Hydro Cannon |
| Fire | Ember | Flamethrower | Fire Blast | Blast Burn |
| Grass | Vine Whip | Razor Leaf | Solar Beam | Frenzy Plant |

Each cell expands to the full move shape above (`name`, `tier`, `basePower`, `damageClass`, `levelRange`). `basePower` increases per tier (e.g. 40 / 65 / 90 / 120 — final numbers are balance knobs).

## **Levels & Experience**

* The player's **starter begins at level 5**
* After winning a **trainer battle**, all Pokémon in the roster gain **2 levels**
* After winning a **grass battle** (wild Pokémon), all Pokémon gain **1 level**
* Pokémon in **Pokéball nodes** have a level drawn from a pool defined per map
* A caught Pokémon joins the roster at the level it was presented
* **Evolution** happens immediately after the battle that caused the Pokémon to reach its evolution level
* Leveling up changes **stats only** (HP, Attack, Defense, Sp. Attack, Sp. Defense, Speed). It **does not** change a Pokémon's move tier — the starting Pokémon keeps its Tier 1 move until a Power Upgrade node raises it. (A higher level still increases damage indirectly, because Attack/Sp. Attack scale with level and feed the damage formula.)

# **Damage & Move Scaling**

Damage combines two things: **how strong the Pokémon is** (its PokéAPI stats, scaled by level) and **how strong its move is** (the tier's `basePower`). The damage formula keeps the same skeleton used in the official games but swaps the move's raw power for our authored **tier `basePower`**.

This system is **generation-agnostic** — it is type-based and stat-based, so every region (current and future) uses the same formula and the same Type Move Table.

## **Formula**

```
basePower    = the basePower of the move's current tier (e.g. Tier 1 = 40)
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
* **Region `damageMultiplier`** is kept as a final multiplier for per-region difficulty (e.g. Unova = 5, earlier regions = 2).
* **Crit (1/16, ×1.5)** and **random variance (0.85–1.00)** are kept.

## **What was intentionally removed**

* **No per-species "scaling" number.** An earlier idea added a hand-tuned scalar per Pokémon (e.g. Squirtle = 1.2). This was dropped because the **PokéAPI Attack/Sp. Attack stat already encodes per-species and per-level strength** — adding a separate species scalar would double-count it.
* **No extra level term on move power.** Level affects damage **only** through the Attack/Sp. Attack stat (as in the official games). `basePower` is a flat per-tier number.
* **No more learnset auto-upgrade.** Moves are no longer derived from the PokéAPI learnset, and they no longer change on level-up. Tier is set on spawn by level, and only a Power Upgrade node changes it afterward.

## **Worked Example**

Squirtle (Water), holding its **Tier 1** move **Water Gun** (`basePower = 40`), at **level 8**:

* Level 8 enters the formula through Squirtle's PokéAPI **Attack / Sp. Attack** stat (already scaled to level 8) — there is no separate level term on the move power.
* `basePower = 40` flows through the formula above, then is multiplied by type effectiveness (Water vs the defender's types), the region `damageMultiplier`, and the crit/random rolls.
* If Squirtle later hits a Power Upgrade node, Water Gun becomes the Tier 2 Water move (Bubble Beam) with its higher `basePower`, increasing damage from that point on.

> Note: the original sketch of this system used a 1.2 species scalar plus a `level × 0.01` term. Both were removed in the final design — the PokéAPI stats already represent species strength and level scaling, so the only authored knob is the tier `basePower`.

## **Implementation Notes (future work)**

This section documents the intended design; the code does not yet implement it. When built, the following changes apply:

* **New authored data file** (e.g. `src/game/typeMoves.js`) holding the 18 types × 4 tiers (name, basePower, damageClass, levelRange per move)
* **`src/game/pokemon.js`** — replace the current `resolveMove` learnset logic with **tier assignment by level** against the Type Move Table; remove move re-resolution on level-up
* **`src/game/battle.js`** — `calcDamage` uses the move's tier `basePower` in place of the raw PokéAPI `move.power` (formula skeleton otherwise unchanged)
* **`src/components/StarterSelect.jsx`** — the hardcoded starter move table becomes simply "Tier 1 of the starter's primary type"
* **`src/components/NodeMap.jsx`** — implement the Power Upgrade node handler (currently `NODE_TYPES.POWER_UPGRADE` falls through to "mark cleared"): show a roster picker, advance the chosen Pokémon's move by one tier (cap at Tier 4)

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

* Each trainer has a specific curated pool of Pokémon it can draw from

* Enemy Pokémon levels are drawn from a per-map level pool — nodes later in the map have a higher chance of rolling a higher level

* Each region has their own specific trainers (e.g. Youngster, Lass, Backpacker, Janitor for Unova Map 1)

* Also contains Gym Leaders and bosses as a trainer type — these have specific Pokémon with specific levels (see Regions section)

### **Pokeball**

* Presents **3 random Pokémon** from the catchable pool for that map, each with a level drawn from the map's level range

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
* *(Implementation status: currently a stub — the node clears without applying an upgrade. To be implemented.)*

### **Pokecenter**

* Appears exactly once per map, always in the second-to-last row (randomized between the 3 nodes in that row)

* **Fully restores HP** and **revives all fainted Pokémon** in the roster

### **Grass**

* Encountering a single wild Pokémon randomly selected from the curated pool for that map

* The user must battle it — no fleeing or catching

* Follows standard battle mechanics; winning returns the user to the map

* All roster Pokémon gain **1 level** on victory

# **Battle Mechanics**

A battle begins when the user clicks on a Trainer, Gym Leader, Boss, or Grass node that is one node away on the map.

## **Battle Order**

* The user's first Pokémon in their roster enters the battle first

* The opponent's first Pokémon enters the battle first

* The Pokémon with the higher Speed stat attacks first each **round**

* A round = both Pokémon attack once

* If Speed is tied, order is random

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

## **Losing**

* All user Pokémon faint → "Defeated..." shown in the battle UI (red text)

* A yellow **Play Again** button appears — clicking it resets the run (same starter, level 5) and returns to the map

* No separate game over screen — the loss result is shown inline in the battle card

# **Boss Selection**

# **Regions**

## **Unova**

For Unova Map 1 (Striaton City gym), the boss is determined by the player's chosen starter:

* **Snivy** (Grass) → **Chili** (Fire type)
* **Tepig** (Fire) → **Cress** (Water type)
* **Oshawott** (Water) → **Cilan** (Grass type)

### **Map 1 — Route 1 / Striaton City**

**Trainer level pool:** 3–8 (nodes later in the map weight toward higher levels)

**Trainer Pokémon count:** 1–2

**Catchable Pokémon pool (Pokéball nodes):** Patrat, Lillipup, Purrloin, Pidove, Blitzle, Audino

**Catchable level range:** 3–7

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

* Lillipup (Lv. 12)

* Pansage (Lv. 14)

***Chili — Fire type — awards the Trio Badge***

* Lillipup (Lv. 12)

* Pansear (Lv. 14)

***Cress — Water type — awards the Trio Badge***

* Lillipup (Lv. 12)

* Panpour (Lv. 14)

### **Gym 2 — Nacrene City**

***Lenora — Normal type — awards the Basic Badge***

* Herdier (Lv. 18)

* Watchog (Lv. 20)

### **Gym 3 — Castelia City**

***Burgh — Bug type — awards the Beetle Badge***

* Whirlipede (Lv. 21)

* Dwebble (Lv. 21)

* Leavanny (Lv. 23)

### **Gym 4 — Nimbasa City**

***Elesa — Electric type — awards the Bolt Badge***

* Emolga (Lv. 25)

* Emolga (Lv. 25)

* Zebstrika (Lv. 27)

### **Gym 5 — Driftveil City**

***Clay — Ground type — awards the Quake Badge***

* Krokorok (Lv. 29)

* Palpitoad (Lv. 29)

* Excadrill (Lv. 31)

### **Gym 6 — Mistralton City**

***Skyla — Flying type — awards the Jet Badge***

* Swoobat (Lv. 33)

* Unfezant (Lv. 33)

* Swanna (Lv. 35)

### **Gym 7 — Icirrus City**

***Brycen — Ice type — awards the Icicle Badge***

* Vanillish (Lv. 37)

* Cryogonal (Lv. 37)

* Beartic (Lv. 39)

### **Gym 8 — Opelucid City**

(Depends on version)

***Drayden — Dragon type (Pokémon Black) — awards the Legend Badge***

* Fraxure (Lv. 41)

* Druddigon (Lv. 41)

* Haxorus (Lv. 43)

***Iris — Dragon type (Pokémon White) — awards the Legend Badge***

* Fraxure (Lv. 41)

* Druddigon (Lv. 41)

* Haxorus (Lv. 43)

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
| Choice Band | +50% Sp. Atk | 120 | 12% |
| Choice Scarf | +50% Speed | 120 | 12% |
| Scope Lens | Raises crit rate by 30% | 100 | 10% |
| Rocky Helmet | Deals 1/3 HP damage to attackers on contact | 80 | 8% |
| Life Orb | +30% damage on all moves | 30 | 3% |
| Focus Sash | Survive any KO hit at full HP | 10 | 1% |

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
* **Win** is recorded when the final boss of the last map is defeated
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

## **Starter Select**

* Three starter cards sit side-by-side with small side padding on mobile, scaling up to a capped width on desktop
* All card dimensions (sprite, fonts, padding, stat bars) derive from a single card-width value via a scaling helper, so everything scales together uniformly — nothing scales independently
* Each card shows a large pixel sprite, the Pokémon name (white with a black stroke outline), level, a five-row stat bar block, and the starter's move (name, type chip, power)

## **Battle UI (Desktop)**

* Fixed **960×540** cinematic 16:9 card over a day battle background; the node map is hidden while a battle is active
* **Top-left:** player character avatar + roster cards (held-item icon shown per card)
* **Bottom-right:** enemy trainer avatar + roster cards
* **Bottom-left:** player arena (back sprite on battle grass) with an info card above it
* **Top-right:** enemy arena (front sprite on battle grass) with an info card below it
* **Info card:** light-gray card, black border — left-aligned name + level, centered HP text, and a two-tone green HP bar (lighter top half, darker bottom half) with a black border
* Victory / Defeat text appears **above** the card; the Continue / Play Again button sits **inside** the card at the bottom — there is no separate log bar
* Prep ("wants to battle!" + Fight) and fainted notices render as overlays inside the card

## **Battle UI (Mobile)**

* Two-column card (player left, enemy right) with a horizontal projectile between them and a battle log bar at the bottom

## **Move Animations & Sound**

* Attacks play a Gen 3 move-animation sprite sheet on the **defending** Pokémon at hit-time, with the matching sound effect played simultaneously
* Animations are looked up by PokéAPI move name (kebab-case) in `src/game/moveAnimations.js`; each entry maps to a sprite sheet (192px frames), frame count, and an OGG sound
* Moves not in the pack fall back to a plain type-colored projectile orb with no sound
* Frame stepping respects the user's battle-speed setting

# **Performance**

* All PokéAPI data (base stats, learnsets, move details) is cached in module-level Maps keyed by Pokémon ID
* On region select, `prewarmCache()` pre-fetches all Pokémon in that region's catch pools, trainer pools, and boss teams in parallel — subsequent node activations are served from cache with no network delay
* Evolution and move upgrade data is fetched on demand and also cached
