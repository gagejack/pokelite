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

The user will choose their starter pokemon from 3 choices of the regions starters after choosing their region.

# **Pokémon Stats**

Stats are pulled from PokéAPI at runtime. Each Pokémon has:

* **HP** — determines how much damage it can take before fainting
* **Attack** — used for physical moves
* **Defense** — reduces incoming physical damage
* **Sp. Attack** — used for special moves
* **Sp. Defense** — reduces incoming special damage
* **Speed** — determines turn order; higher Speed attacks first each round

## **Moves**

* Each Pokémon has exactly **one move** — always matching its primary type
* The move starts as the weakest same-type move the Pokémon learns (e.g. Squirtle → Water Gun)
* As the Pokémon levels up it automatically upgrades to the next same-type move at the level it is normally learned (e.g. Water Gun → Aqua Jet → Hydro Pump)
* Move power, accuracy, and damage class (physical/special) are sourced from PokéAPI
* Battles are fully automatic — no player input during combat

## **Levels & Experience**

* The player's **starter begins at level 5**
* After winning a **trainer battle**, all Pokémon in the roster gain **2 levels**
* After winning a **grass battle** (wild Pokémon), all Pokémon gain **1 level**
* Pokémon in **Pokéball nodes** have a level drawn from a pool defined per map
* A caught Pokémon joins the roster at the level it was presented
* **Evolution** happens immediately after the battle that caused the Pokémon to reach its evolution level

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

* Each item card shows: item icon (pixelated sprite), item name, rarity percentage

* Player picks **one** item to keep, or declines (item is lost, node clears)

* After picking, a **roster assignment panel** appears (hamburger list):
  * One row per Pokémon — sprite on the left, name + level centered to its right, held item slot to the right of that
  * If the slot is empty: shows "— empty —" and a **Give** button
  * If the Pokémon already holds an item: shows that item and a **Swap** button (old item returns to bag)
  * At the bottom: **Keep in Bag** button (stores item in bag without assigning) and **Decline** button (item is lost)

* Items are never consumed — they are permanently held by a Pokémon or stored in the bag

* Items can appear as offers even if a Pokémon in the roster already holds the same item

### **Power Upgrade**

* Upgrades the move power for a single player-selected Pokémon

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

* All user Pokémon faint → Game Over

* User is shown a Game Over screen displaying their full party

* A "Play Again" button restarts the run from the beginning

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

* The player has a persistent bag displayed in the right sidebar on desktop (currently a placeholder panel)
* Items in the bag can be dragged onto a Pokémon in the roster to assign them
  * **Desktop:** drag item icon from bag onto a roster slot
  * **Mobile:** tap item in bag → tap Pokémon in roster (two-tap assignment)
* If the target Pokémon already holds an item, the old item is returned to the bag
* Bag has no size limit in the current version

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

## **Unova**

(To be defined)

## **Johto**

(To be defined)

## **Kanto**

(To be defined)
