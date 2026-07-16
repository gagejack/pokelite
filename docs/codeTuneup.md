# Code Tune-Up — Performance Review

Findings from a full pass over the render cycle, data structures, memory, and
build output (measured against the actual `dist/` — total **24 MB**). Ordered by
impact within each section. Each item: what/where → why it hurts → fix.

## TL;DR — the five that matter most

| # | Finding | Cost today | Fix effort |
|---|---|---|---|
| 1 | Region-select loads ~14 MB of map PNGs (Kanto alone is 8.3 MB) | slow first paint on the region screen, mobile data | low |
| 2 | 5.6 MB of `.ogg` battle audio ships in dist but sound is disabled | deploy bloat; wasted build work | trivial |
| 3 | One 1.4 MB JS chunk (656 KB gz) — no code splitting | slow first load; everything (all regions, framer-motion, 156 animation imports) parses up front | medium |
| 4 | `_base.learnset` dead weight on every Pokémon instance | memory/GC + 291 KB saved-run writes | trivial |
| 5 | Pokédex "All" tab fires ~649 individual PokéAPI requests | multi-second stall, API hammering | low-medium |

---

## 1. Load time & bundle size

### 1a. Region map images are enormous (biggest single win)
`dist/assets/KantoMap.png` **8.3 MB**, HoennMap 2.0 MB, SinnohMap 1.6 MB,
JohtoMap 1.1 MB, UnovaMap 844 KB — ~14 MB downloaded by the **Region Select
screen alone** ([RegionSelect.jsx:6-10](../src/components/RegionSelect.jsx)),
where each image renders as a ~230 px **blurred card background**
(`blur(1.5px) brightness(0.75)`). A 8.3 MB PNG shrunk to a blurred thumbnail.
**Fix:** batch-convert to WebP at card resolution (≤ 800 px wide). Expect
~14 MB → ~300–500 KB total. No code change beyond the import filenames.

### 1b. Dead audio: 78 `.ogg` files (5.6 MB) shipped, never played
[moveAnimations.js:82+](../src/game/moveAnimations.js) imports an `.ogg` per
move, but [MoveAnimation.jsx](../src/components/MoveAnimation.jsx) says
*"Sound effects are disabled — move animations play silently."* Vite emits all
78 files to dist (5.6 MB of the 24 MB deploy). They're only *downloaded* if
referenced, so this is deploy/build bloat rather than page weight — but it's
pure waste until sound ships. **Fix:** delete the ogg imports (keep the files
in the repo for later), or gate them behind a dynamic import when sound lands.

### 1c. Single 1.4 MB JS chunk — no code splitting
`dist/assets/index.js` 1.4 MB (656 KB gz). Everything is eager: all four
region configs + their sprite imports, `moveAnimations.js` (156 static asset
imports), framer-motion, Supabase client, the Elite Four screen, Stats, Pokédex.
The build already warns about it. **Fix (in rough win order):**
- `React.lazy` the screens not needed at boot (Pokedex, Stats, EliteFour,
  BattleCard/MoveAnimation).
- Make region configs dynamically imported by `getRegionConfig` (each region's
  hundreds of sprite imports currently load even if you never play it).
- `moveAnimations.js` is only used inside battles — lazy-load with BattleCard.

### 1d. `lightModeBackground.jpeg` is 1.8 MB
Loaded unconditionally as the app-wide background
([Layout.jsx](../src/components/Layout.jsx)). It's used in both themes, so it
can't be dropped — but a WebP re-encode at screen resolution should be
~150–250 KB for identical visuals.

### 1e. Misc
- `homeIcon.png` 160 KB and `pokedexIcon.png` 120 KB for 22 px nav icons —
  resize to source scale (few KB each).
- No `<link rel="preconnect">` for `pokeapi.co` / `raw.githubusercontent.com`
  in [index.html](../index.html) — a free ~100–300 ms saving on the first
  sprite/API fetch of a session.

## 2. Network bursts (runtime "load time")

### 2a. Pokédex "All" tab: ~649 sequential-ish detail fetches
[Pokedex.jsx:71-83](../src/components/Pokedex.jsx) fetches the list, then **one
request per Pokémon** for details. The "All" tab = up to 649 requests in a
burst; a gen tab is 100–156. Cached after the first pass, but the first open is
a multi-second stall and impolite to PokéAPI. **Fix:** PokéAPI's
`GET /pokemon?limit=649` already returns names; types are the only reason for
the per-mon call. Ship a tiny static id→type table (or derive from the region
configs' prewarmed cache) and drop the per-mon fetches entirely.

### 2b. Region prewarm burst
`prewarmCache` ([pokemon.js:30](../src/game/pokemon.js)) now warms every pool
species **plus every evolution line** (2 requests per line + a base per evolved
form) the moment a region is picked — roughly 150–300 requests up front. It's
fire-and-forget (doesn't block the UI) and it's what makes node clicks instant,
but it re-fires on every `startRun`/`resumeRun` region entry (cache-hits after
the first, so cheap — the burst is once per session per region). **Fix if it
ever bites:** warm only the current map's pools first, then trickle the rest
`requestIdleCallback`-style. Not urgent.

## 3. Render cycle & unnecessary re-renders

### 3a. Hovering a node re-renders the entire map
`hoveredNode` lives in NodeMap's top-level state
([NodeMap.jsx:359](../src/components/NodeMap.jsx)) and is passed into `MapSvg`,
so **every mouse-enter/leave re-renders the whole component**: the SVG (all ~23
nodes + ~40 edges + filters), all overlay buttons, roster, bag, badges. Worse,
the overlay map calls `getNodeLabel(node)` for **every node on every render**
([NodeMap.jsx:219](../src/components/NodeMap.jsx)) — including the boss-team
`cachedType`/`cachedName` lookups — even though only the hovered node shows a
tooltip. On desktop, sweeping the cursor across the map triggers dozens of
full re-renders per second. It's not user-visible jank today (the tree is
small), but it's the hottest wasted work in the app. **Fixes, cheapest first:**
- Compute `getNodeLabel` only when `isHovered` (one-line move).
- Keep hover in a leaf component (per-node `useState`) or `memo` MapSvg and the
  overlay nodes so hover only re-renders the two affected nodes.

### 3b. `NavButtons` is defined inside `Layout`
[Layout.jsx:53](../src/components/Layout.jsx) declares `const NavButtons = () =>`
per render — a new component identity every time, so React **unmounts and
remounts the whole nav** (icons re-created, images re-decoded) whenever Layout
re-renders (theme toggle, username load, any popup open). This is the exact bug
class RegionSelect already fixed and documented ("all regions flash" —
[RegionSelect.jsx:23-27](../src/components/RegionSelect.jsx)). **Fix:** hoist
`NavButtons` to module scope and pass props.

### 3c. Battle replay timers
[BattleCard.jsx:142-234](../src/components/BattleCard.jsx) advances the log via
chained `setTimeout`s; the main one is tracked in `timerRef`, but several
side-effect timeouts (`setHurtSide(null)`, `setFlashText(null)`,
`setItemFx(null)`) are fire-and-forget — if the card unmounts mid-battle
(Home/restart), they fire against an unmounted component. React 18 tolerates it
silently; it's hygiene, not a leak (they self-expire). **Fix:** collect them
into the cleanup, low priority.

### 3d. Inline `<style>` keyframes re-inserted per MapSvg render
The `nodeSpin` keyframes `<style>` tag ([NodeMap.jsx](../src/components/NodeMap.jsx))
re-renders with the map card. Trivial cost; move to `index.css` when convenient.

## 4. Data structures & repeated work

Honest framing: these are all **small-n** (≤ 40 items, ≤ 25 species, ≤ 6 mons)
and none is measurable in profile — listed so they don't get copied into a
bigger context later.

- **`itemWeight` refilters `ITEMS` per call** inside `pickThreeItems`'s
  weighted draw ([items.js:115-119](../src/game/items.js)) → O(items²) per
  offer. Precompute a per-tier count once per draw.
- **`pickCatchOffer`'s `weightOf` refilters `remaining` per candidate per
  draw** ([catch.js:15-19](../src/game/catch.js)) — same pattern, same fix.
- **`recordSpeciesSeen`/`recordCaught` use `Array.includes` + spread**
  ([App.jsx:235-243](../src/App.jsx)) → O(n²) growth over a run. A `Set`
  mirrors the existing `caughtSet` pattern.
- **`simulateBattle` calls `alivePlayers()`/`aliveEnemies()` (filters) every
  round** ([battle.js:114](../src/game/battle.js)) — 6-element filters,
  irrelevant in practice; the sim is microseconds.

## 5. Memory

### 5a. `_base.learnset` — dead weight on every Pokémon instance (real fix)
`fetchPokemonBase` stores the **full PokéAPI moves array** as
`learnset` ([pokemon.js:95](../src/game/pokemon.js)), and every instance
carries `_base` ([pokemon.js:136](../src/game/pokemon.js)). `learnset` is
**never read anywhere** (verified by grep). Cost: bigger objects for every
roster/enemy mon, deep-cloned per battle ([battle.js:91-92](../src/game/battle.js)),
and it's most of the **291 KB** saved-run blob written to localStorage/Supabase
on every Home click. **Fix:** drop `learnset:` from the base object (one line);
`_base` itself must stay (level-ups read it).

### 5b. Caches — bounded, fine
`baseCache`, `chainCache`, `evoCache`, Pokédex gen cache all grow only to the
species count (≤ ~650 entries of small objects). No cap needed. Event
listeners/observers audited: NodeMap, Layout, BattleCard, AnimatedHpBar,
useIsDesktop all clean up on unmount; the module-level `touchstart` probe is
`once: true`. **No leaks found.**

### 5c. Supabase loads grow with account age
`caughtSet` ([App.jsx:46-60](../src/App.jsx)) and Stats each select **every
`runs` row** for the user and reduce client-side. Fine at dozens of runs;
at hundreds it's a growing download on every login/stats-open. **Fix when it
matters:** a Postgres view/RPC returning the distinct caught ids + aggregates.

---

## Suggested order of attack

1. **(1a)** Compress the five region maps to WebP thumbnails — one sitting,
   ~13 MB saved, biggest felt improvement.
2. **(5a)** Delete `learnset` — one line, shrinks every instance + saves.
3. **(1b)** Drop the unused audio imports — 5.6 MB off the deploy.
4. **(3a + 3b)** Hover-scoped tooltips + hoist NavButtons — the two real
   re-render wastes.
5. **(1c)** Code-split screens & regions — the big-but-invasive one; do last.
6. **(2a)** Pokédex static type table — kills the 649-request burst.
