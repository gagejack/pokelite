# PokeLike — Design Document

## Tech Stack
- **React 19 + Vite** — frontend framework and dev server
- **Tailwind CSS 4** — utility-first styling; no custom CSS unless Tailwind can't do it
- **Framer Motion 12** — animations only (attack projectiles, transitions); no other use
- **Supabase** — auth (email/password) + PostgreSQL; not yet wired into UI
- **Vercel** — deployment target; env vars in `.env.local`, never committed

---

## Fonts
Declared in `src/index.css` via `@font-face`. All four are bundled locally under `src/assets/`.

| Font | File | Used for |
|------|------|----------|
| `Orange Kid` | `Orange Kid.otf` | Global default (`*` selector) — most body text |
| `Upheaval` | `upheavtt.ttf` | Headers, labels, buttons — primary UI font |
| `Pokemon Classic` | `Pokemon Classic.ttf` | Roster slot names / levels |
| `Pixeled` | `Pixeled.ttf` | Available but not actively used as default |

`index.css` also sets: `overscroll-behavior: none`, `touch-action: pan-x pan-y`, `overflow: hidden` on `html/body`, `-webkit-user-select: none`, `-webkit-tap-highlight-color: transparent`.

---

## Screen Flow
```
menu → region → character → starter → nodemap
                                      ↕
                               restarting (transient screen) → nodemap
```
- `resetRun()` → clears all state, returns to `menu`
- `restartRun()` → keeps starter/region/character, re-inits roster at level 5, remounts NodeMap (fresh seed)
- `advanceMap()` → increments `mapIndex`, remounts NodeMap with new map config
- `screen === 'restarting'` is a zero-duration transient used to force NodeMap to unmount/remount; a semi-transparent overlay div covers the flash

State lives entirely in `App.jsx`: `screen`, `selectedRegion`, `selectedCharacter`, `selectedStarter`, `roster`, `mapIndex`.

---

## Responsive Layout
- **Breakpoint:** `DESKTOP_BP = 768px` (`src/lib/useIsDesktop.js`)
- **Mobile (<768px):** top nav bar, horizontal roster strip at top, map fills remaining height, 2-column battle card
- **Desktop (≥768px):** top nav bar, left vertical roster sidebar (90px wide), center map (340px wide), right BAG panel (90px wide), 3-column battle card with center arena

### Safari/Mobile HTML button overlay fix
The map SVG uses `pointerEvents: 'none'` on the SVG layer. Invisible `<button>` elements are absolutely positioned over each node in DOM space (coordinates converted from SVG viewBox to container pixels via `mapScale`/`mapOffsetX`/`mapOffsetY`). This is required because Safari does not reliably fire click events on SVG elements.

---

## Theme System (`src/lib/theme.jsx`)
- `ThemeContext` → `{ dark, toggle }`, persisted to `localStorage('theme')`
- **Dark:** bg `#2e2e2e`, inner `#1a1a1a`, border `2px solid #121212`, shadow `-4px 6px 0 0 #121212`, text `#DBDBDB`, muted `#888`
- **Light:** bg `#DBDBDB`, inner `#c8c8c8`, border `2px solid #666666`, shadow `-4px 6px 0 0 #666666`, text `#333333`, muted `#777`
- **Accent colors:** yellow `#facc15` (active/level/XP), red `#ef4444` (defeat/faint), green `#22c55e` (victory/cleared edge), fight button `#dc2626`
- All sprites: `imageRendering: 'pixelated'`

---

## Type Colors
```
fire:#F08030  water:#6890F0  grass:#78C850  normal:#A8A878  fighting:#C03028
flying:#98D8D8  poison:#A040A0  ground:#E0C068  rock:#B8A038  bug:#A8B820
ghost:#705898  steel:#B8B8D0  electric:#F8D030  psychic:#F85888  ice:#98D8D8
dragon:#7038F8  dark:#705848  fairy:#EE99AC
```
Defined identically in `StarterSelect.jsx`, `BattleCard.jsx`, `Roster.jsx`, and `PokeballNode.jsx` (no shared constant yet).

---

## HP Bar (`src/lib/AnimatedHpBar.jsx`)
- Animated with double-rAF pattern so CSS transition always fires from a prior value
- Transition: `0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)` on width, `0.6s ease` on color
- **>50% HP:** `#22c55e` | **>25%:** `#facc15` | **≤25%:** `#ef4444`
- Exported: `AnimatedHpBar` component + `hpColor(hp, maxHp)` helper

---

## Node Map (`src/game/nodeMap.js`)

### Row Layout
`buildRows(trainerPool, bossTrainer)` generates 9 rows with fixed widths:
```
Row 0:  1 node  (start — always cleared/current at game open)
Row 1:  2 nodes
Row 2:  3 nodes
Row 3:  4 nodes
Row 4:  3 nodes
Row 5:  4 nodes
Row 6:  3 nodes
Row 7:  2 nodes  ← guaranteed 1 POKECENTER, 1 random
Row 8:  1 node   ← always BOSS
```
Row widths constant: `[1, 2, 3, 4, 3, 4, 3, 2, 1]`

Node IDs are assigned sequentially (0–23). The boss node always gets the highest ID.

### Node Types
```js
NODE_TYPES = {
  GRASS:         'grass',
  TRAINER:       'trainer',
  POKEBALL:      'pokeball',
  ITEM:          'item',
  POWER_UPGRADE: 'power_upgrade',
  POKECENTER:    'pokecenter',
  BOSS:          'boss',
}
```

### Node Type Chances (random nodes only)
| Type | Chance |
|------|--------|
| GRASS | 30% |
| TRAINER | 30% |
| POKEBALL | 20% |
| ITEM | 15% |
| POWER_UPGRADE | 5% |

POKECENTER and BOSS are not rolled — they are placed deterministically.

### Edges
Edges are defined as a fixed array in each region's map config (e.g. `unovaMap1.edges`), not computed dynamically. The general patterns used:
- **Expanding rows** (1→2, 2→3, 3→4): each node fans forward to 2 neighbors
- **Equal rows** (4→3, 3→4): straight + diagonal connections
- **Contracting rows** (3→2, 2→1): converges

Cleared edges render as solid green; uncleared edges render as dashed dark.

### Map Rendering (`NodeMap.jsx`)
- SVG viewBox: `(-svgWidth/2) 0 svgWidth svgHeight` — centered horizontally
- `NODE_SIZE = 44`, `ROW_HEIGHT = 80`, `COL_WIDTH = 70`, `PADDING_TOP = 20`
- `mapScale` computed to fit the SVG into its container div
- Trainer/Boss nodes render as clipped full-body overworld sprites (tall aspect ratio)
- Grass nodes render at 70% node size
- Current node renders the player's selected character sprite
- Hovered reachable node: SVG `hover-outline` filter (white dilate + yellow glow)
- **Touch-hold tooltip:** 400ms `setTimeout` on `onTouchStart` → shows node label popup; cleared on `onTouchEnd`/`onTouchMove`
- Locked nodes (not reachable from current path) render at 20% opacity

---

## Region System (`src/game/regionRegistry.js`)

Four regions registered: Kanto, Hoenn, Sinnoh, Unova.

**Only Unova is fully implemented.** Kanto, Hoenn, and Sinnoh exist as stub files with empty map arrays — selecting them will crash or show nothing. The region select screen shows all five (including Johto which is in `RegionSelect.jsx` but not in `regionRegistry.js`).

### Region Config Shape
```js
{
  characters: [{ id, name, sprite }],         // playable characters shown in CharacterSelect
  trainerSprites: { 'Trainer Name': url },    // overworld sprites for map nodes
  trainerFullSprites: { 'Trainer Name': url },// full battle sprites shown in BattleCard
  catchPools: [[id, id, ...], ...],           // indexed by mapIndex
  maps: [mapConfig, ...],                     // one per map
  damageMultiplier: 2,                        // passed to BattleCard
}
```

### Map Config Shape
```js
{
  generate(starter) → { rows },  // calls buildRows, returns node rows
  edges: [[fromId, toId], ...],  // fixed edge list
  background: imageUrl,          // map background image
  grassIcon: imageUrl,           // grass node icon
}
```

### Unova Maps
All 8 maps are implemented in `src/game/regions/unova.js`:

| Map | Route BG | Boss | Trainer Pool | Level Range |
|-----|----------|------|-------------|-------------|
| 1 | Route 1 | Chili / Cress / Cilan* | Youngster, Lass, Preschooler M/F, Schoolkid M/F, Backpacker M/F, Janitor | 1–5 |
| 2 | Route 3 | Lenora | Nursery Aide, Youngster, Lass, Twins, Backpacker M/F | 10–15 |
| 3 | Route 4 | Burgh | Hiker, Worker M/F, Backpacker M/F, Roughneck | 20–25 |
| 4 | Route 6 | Elesa | Cyclist M/F, Roughneck, Biker, Depot Agent | 30–35 |
| 5 | Route 7 | Clay | Hiker, Worker M/F, Pokemon Ranger M/F, Backpacker M/F | 35–40 |
| 6 | Route 8 | Skyla | Pilot, Backpacker M/F, Ace Trainer M/F, Pokemon Ranger M/F | 40–45 |
| 7 | Route 9 | Brycen | Roughneck, Biker, Black Belt, Battle Girl, Ace Trainer M/F | 45–50 |
| 8 | Route 16 | Drayden | Ace Trainer M/F, Veteran M/F, Pokemon Ranger M/F | 50–60 |

*Map 1 boss is assigned by starter: Snivy→Chili, Tepig→Cress, Oshawott→Cilan

**Map advancement:** Defeating the boss calls `onAdvanceMap()` if a next map exists. Roster carries over; map layout is freshly seeded each time.

---

## Region Select (`src/components/RegionSelect.jsx`)
- Five regions hardcoded in component: Kanto (Gen 1), Johto (Gen 2), Hoenn (Gen 3), Sinnoh (Gen 4), Unova (Gen 5)
- Each card shows the region map image, 3 starter sprites, region name, and placeholder run stats (Attempts, Successful Runs, Pokemon Caught, Shiny Caught — all show `-`)
- **Desktop:** tall portrait cards (`9:21` aspect ratio, `min(60vh, 460px)` height) in a horizontal row
- **Mobile:** horizontal bar cards (`320×100px`) in a vertical list

---

## Character Select (`src/components/CharacterSelect.jsx`)
- Characters come from `getRegionConfig(region.name).characters`
- Displayed in a scrollable grid: 5 columns on desktop, 4 columns on mobile
- Selection highlighted with yellow border + glow; confirm button disabled until one is selected
- Clicking a character sprite sets it as `selectedCharacter` and shows "Play as {name}" button

---

## Starter Select (`src/components/StarterSelect.jsx`)
- Starter IDs hardcoded per region in `REGION_STARTERS` map within the component
- Move per starter hardcoded in `STARTER_MOVES` map (keyed by Pokémon ID):
  - Bulbasaur→`vine-whip`, Charmander→`ember`, Squirtle→`water-gun`
  - Chikorita→`razor-leaf`, Cyndaquil→`ember`, Totodile→`water-gun`
  - Treecko→`absorb`, Torchic→`ember`, Mudkip→`water-gun`
  - Turtwig→`absorb`, Chimchar→`ember`, Piplup→`bubble`
  - Snivy→`vine-whip`, Tepig→`ember`, Oshawott→`water-gun`
- **6 parallel API calls** via `Promise.all`: for each of the 3 starters, fetches `pokemon/{id}` and `move/{moveName}` simultaneously
- Stats shown: HP bar (green), then highest of ATK/SP.ATK, SPD, DEF, SP.DEF (all gray bars)
- Move box shows: name, type badge (colored), power
- Clicking a card immediately calls `onSelectStarter(pokemon)` — no confirm step

---

## Pokémon Stats (`src/game/pokemon.js`)
Gen 5 formula, 31 IVs, neutral nature, 0 EVs:
```
HP:    floor(((2*base + 31) * level / 100)) + level + 10
Other: floor(((2*base + 31) * level / 100)) + 5
```

### Move Resolution
Each Pokémon has exactly one move — always matching its primary type. `resolveMove()` finds the strongest same-type level-up move known at the current level. If none are known yet, it gives the first one in the learnset.

`buildMoveCache(base)` fetches PokéAPI move data for all same-type level-up moves in the learnset; this cache is stored on the instance as `_moveCache` so level-ups don't require re-fetching.

### Level-Up
- Trainer/Boss node win: +2 levels to all roster Pokémon
- Grass node win: +1 level to all roster Pokémon
- `levelUp(pokemon, base, levelsGained, moveCache)` recalculates all stats and upgrades move if a stronger one is now available
- `_base` and `_moveCache` are stored on each instance for this purpose
- After level-up, `checkEvolution(pokemon, level)` is called; if evolution triggers, a notice modal appears

---

## Enemy Teams (`src/game/enemyTeams.js`)

### Trainer Team Building
`buildTrainerTeamSpec(trainerType, count, positionWeight)` → array of `{ id, level }`:
- Picks `count` random Pokémon from the trainer's pool
- Level = `floor(min + positionWeight * (max - min))` with ±1 random variance

`pickTrainerCount(mapIndex)` → 1 or 2 for Map 1 (50/50); scales up for later maps.

### Boss Teams (`BOSS_TEAMS`)
Fixed arrays of `{ id, level }` keyed by trainer name.

| Boss | Team |
|------|------|
| Chili | Lillipup lv12, Pansear lv14 |
| Cress | Lillipup lv12, Panpour lv14 |
| Cilan | Lillipup lv12, Pansage lv14 |
| Lenora | Herdier lv18, Audino lv20 |
| Burgh | Whirlipede lv21, Dwebble lv21, Leavanny lv23 |
| Elesa | Emolga lv25, Emolga lv25, Zebstrika lv27 |
| Clay | Krokorok lv29, Palpitoad lv29, Excadrill lv31 |
| Skyla | Swoobat lv33, Unfezant lv33, Swanna lv35 |
| Brycen | Vanillish lv37, Cryogonal lv37, Beartic lv39 |
| Drayden | Fraxure lv41, Druddigon lv41, Haxorus lv43 |

### Grass Node
Currently hardcoded to `{ id: 504, level: 4 }` (Patrat lv4) — wild Pokémon pool not yet implemented.

---

## Battle System (`src/components/BattleCard.jsx`)

### Layout
- **Mobile:** fixed overlay, `380×640px`, two side-by-side roster columns, horizontal projectile orb travels left↔right between them, battle log at bottom
- **Desktop:** fixed overlay, `590×680px`, left roster column (165px), center arena with vertical projectile (260px), right roster column (165px), battle log spans full width at bottom

### Phases
1. **prep** (boss only) — shows trainer name + "Fight!" button; regular trainers/grass skip to `battle` immediately
2. **battle** — runs `simulateBattle()`, steps through log entries
3. **result** — shows "Victory!" or "Defeated..." + "Continue" button

### Battle Simulation
`simulateBattle(playerRoster, enemyTeam, damageMultiplier)` in `src/game/battle.js`:
- Returns `{ playerWon, finalPlayerTeam, log }`
- `log` entries: `{ side, moveType, defenderHpAfter, defenderFainted, defenderName, crit, effectiveness }`
- Damage formula (Gen 5 simplified):
  ```
  base   = floor(((2*level/5 + 2) * power * atk/def) / 50) + 2
  damage = max(1, floor(base * effectiveness * random(0.85–1.0) * DAMAGE_MULTIPLIER))
  ```
- Physical moves use Attack/Defense; Special moves use SpAtk/SpDef
- Turn order by Speed stat; random 50/50 on tie

### Animation Timing
- `PROJECTILE_MS = 400` — projectile travel (ms)
- `PAUSE_AFTER_HIT = 350` — delay before next attack (ms)
- Both divided by `battleSpeed` setting
- Flash text (Critical hit! / Super effective! / Not very effective...) appears on the hurt side for `PAUSE_AFTER_HIT + 500` ms

### Battle Speed (`src/lib/settings.jsx`)
- Slots: `1, 1.5, 2, 2.5, 3` — persisted to `localStorage('battleSpeed')`

### Boss Flow
- After boss win: all roster Pokémon are fully healed (HP restored, fainted revived)
- Evolution notices are shown in a modal before returning to map
- If `config.maps[mapIndex + 1]` exists, `onAdvanceMap()` is called instead of marking the node cleared

---

## Roster System (`src/components/Roster.jsx`)

### Layout
- **Desktop:** vertical sidebar, 90px wide, blue "ROSTER" header, 6 slots (filled + dashed empty slots)
- **Mobile:** horizontal bar, 360px wide, no header, only filled slots shown

### PokemonSlot
Each slot shows: sprite (40px desktop / 34px mobile), name in `Pokemon Classic` font, level in yellow, animated HP bar. Fainted slots are 40% opacity with a red "FNT" badge.

### Drag & Touch Swap
- Desktop: HTML5 `draggable` + `onDragStart`/`onDragEnter`/`onDrop` events
- Mobile: `onTouchStart`/`onTouchMove`/`onTouchEnd` — uses `document.elementFromPoint` to find the slot under the finger, keyed by `data-slot-index` attribute
- Drag source fades to 35% opacity; drop target gets yellow border highlight

### Popup on Click
Clicking any slot opens `PokemonPopup` (fixed overlay, `220px` wide) showing: sprite, name, level, type badges, current HP bar, all 6 stats with blue bars relative to max stat, move details (name, type, power, accuracy, damage class).

---

## Pokéball Node (`src/components/PokeballNode.jsx`)
- Shows 3 random Pokémon from `config.catchPools[mapIndex]`
- Level formula: `baseLevel = round(5 + positionWeight * 10)`, ±random(0–9) − 2, min 5
- Each card shows: sprite, name, level, types, stat bars (HP, best attack, SPD, DEF, SP.DEF), move box
- **Roster not full:** clicking a card immediately adds it and closes
- **Roster full:** clicking a card selects it (yellow highlight), then reveals a swap panel showing current roster; player clicks a slot to mark it for removal (red highlight), then confirms with "Swap" button
- "Decline" button closes without catching anything (node still marks cleared)

---

## Pokécenter Node
Implemented inline in `NodeMap.jsx` `handleNodeClick`:
```js
setRoster(prev => prev.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } })))
```
No overlay or animation — instant full heal on click.

---

## Item / Power Upgrade Nodes
Both node types mark themselves cleared when clicked but have no implemented effect. They are placeholders.

---

## Nav Bar (`src/components/Layout.jsx`)
Single top bar across all screens. Icons:
- **Home:** local `homeIcon.png` asset → calls `onHome`
- **Pokédex:** local `pokedexIcon.png` asset → opens `Pokedex` component
- **Stats:** local `statsIcon.png` asset → no-op (not wired)
- **Dark/Light toggle:** text button
- **Restart** (NodeMap only): `items/fluffy-tail.png` from PokéAPI sprites
- **Settings:** `items/town-map.png` from PokéAPI sprites → opens `SettingsPanel`

---

## Deferred / Not Yet Implemented
- Supabase auth (login/register UI exists but handlers are stubs)
- Item node effect
- Power upgrade node effect
- Wild Pokémon pool for grass nodes (hardcoded Patrat lv4)
- Game over screen (loss state calls `onBattleEnd({ won: false })` but no dedicated screen)
- Kanto, Hoenn, Sinnoh, Johto region configs (selecting them will break)
- Run history / stats (Supabase `run_history` table)
- Stats nav button
- BAG panel (rendered as empty yellow-labeled box)
