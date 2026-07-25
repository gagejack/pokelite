# Desktop In-Menu Region Select — Design

**Date:** 2026-07-25
**Status:** Design approved; not yet planned
**Builds on:** `2026-07-25-desktop-main-menu-design.md`

## Problem

Today `menu` and `region` are separate screens that swap wholesale
(`App.jsx:462-472`). On desktop that throws away the entire main-menu
composition — the mirrored background art, the logo, the calling card — and
replaces it with a differently-shaped screen, one beat after the player first
sees it.

The desktop main menu was built so the artwork is the hero. Swapping it out on
the very first click wastes that.

## Goal

On desktop, choosing a region happens **inside** the main menu: the background,
logo, and corner furniture stay put, and only the button column changes.

## Design

### 1. In-menu mode, not a screen

`MainMenu` gains local state `mode: 'menu' | 'region'`.

On desktop, PLAY sets `mode = 'region'` instead of calling `onPlay`. Because no
screen change occurs, `Layout`, the background image, the logo, `WeeklyStat`,
and `CallingCard` never unmount — there is no remount flash.

**Mobile is untouched.** PLAY still calls `onPlay()` → `setScreen('region')` →
the existing `RegionSelect` component. Both paths converge on
`onSelectRegion(region)`, so starter select and everything downstream is
unchanged.

Rejected alternatives: re-rendering the same shell inside a real `region` screen
(the art remounts — a visible flash unless cached) and replacing `RegionSelect`
on desktop for all entry points (a larger navigation change than this needs).

### 2. The column in region mode

```
[SPEEDMON logo]              ← unchanged, never unmounts

┌──────────────────────────┐
│      DAILY CHALLENGE     │  moved up into PLAY's slot
├──────────────────────────┤
│ KANTO          [s][s][s] │  region bars, 320×56
├──────────────────────────┤
│ JOHTO          [s][s][s] │
├──────────────────────────┤
│ HOENN          [s][s][s] │
├──────────────────────────┤
│ SINNOH         [s][s][s] │
├──────────────────────────┤
│ UNOVA          [s][s][s] │
├────────────┬─────────────┤
│    BACK    │  KANTO-7Q2  │  half-width row, like DEX/STATS
└────────────┴─────────────┘
```

PLAY, RESUME RUN, DEX, and STATS are hidden in this mode. BACK returns to
`mode = 'menu'`.

### 3. The region bar

New component: `src/components/menu/RegionBar.jsx`.

**320 wide × 56 tall.** Width matches the column so the stack stays aligned;
height is taller than a menu bar's 40px so the starter sprites render at a
readable ~44px rather than ~32px.

Same styling language as `MenuButton` — identical `borderStyle` and the same
`bevel` (offset drop shadow plus inset white/dark edges) — so it reads as the
same family of control.

Layers, back to front:

1. **Region map** — the existing `.jpg` thumbnail from `src/assets/regions/`,
   `objectFit: cover`, `filter: brightness(0.55)`. Darker than the region
   cards' current `0.75` because text sits directly on the image here rather
   than on a radial scrim.
2. **Region name** — left-aligned, `Upheaval`, white, text-shadowed. Gen label
   (`Gen 1`) beneath in `Orange Kid` yellow (`#facc15`), matching today's card.
3. **Three starters** — right-aligned row, ~44px each,
   `imageRendering: 'pixelated'`, drop-shadowed.

**Hover:** `hover:scale-105 active:scale-95` — the menu bars' treatment, not the
region cards' lift-and-grow-shadow, because these live in the button column.

**Unavailable regions** (no authored maps): `brightness(0.3) grayscale(0.5)`, no
click handler, `COMING SOON` in yellow where the starters would go — mirroring
`RegionSelect.jsx:66` exactly. Availability is gated the same way it is today:
`(getRegionConfig(name)?.maps?.length ?? 0) > 0`.

### 4. Bottom row

BACK and the seed input share one 320px row, half each, mirroring the DEX/STATS
pattern. BACK is grey (`#6b7280`), matching STATS.

The seed input keeps its uppercase transform, `KANTO-7Q2` placeholder, and
Enter-to-submit behavior from `RegionSelect.jsx:197-213`. Its error message
renders **beneath** the row, so an invalid seed does not resize the column.

### 5. Shared region data

The `REGIONS` array currently lives inside `RegionSelect.jsx:18-24`. It moves to
`src/game/regions/regionList.js`, holding name, gen, map image, and legendaries.
Both `RegionSelect.jsx` and `RegionBar.jsx` import it.

Starter species ids come from the existing `REGION_STARTERS` in
`src/game/starters.js` — not re-declared.

Duplicating either list into the menu would guarantee drift the first time a
region is added.

### 6. Wiring

`MainMenu` needs two new props from `App.jsx`: `onSelectRegion` and
`onCustomSeed`. Both already exist there and are already passed to
`RegionSelect`, so this is forwarding, not new logic. `onOpenDaily` is already a
`MainMenu` prop.

## Risks

1. **Mobile regression.** `MainMenu` is the file this entire branch has been
   modifying. `mode` must never affect the mobile branch — PLAY's behavior
   there stays `onPlay()`.
2. **Escape hatch.** If `mode === 'region'` and the user presses Home in
   `Layout`, the menu must reset to `'menu'`, or they return to a stale region
   list instead of the main menu.
3. **Sprite pop-in.** Starter sprites load from the PokeAPI CDN
   (`RegionSelect.jsx:16`) — 15 remote requests. Accepted: it matches how the
   existing region screen already works. Changing it is a separate concern.

## Verification

No test framework exists; verification is lint, build, and inspection.

1. `npm run lint` and `npm run build` clean.
2. **Mobile PLAY still routes to the existing `RegionSelect` screen**, unchanged.
3. Desktop PLAY swaps the column in place — the logo and background do not
   flicker or reposition.
4. Region bars align with the column; name left, starters right.
5. Unavailable regions are greyed, unclickable, and show COMING SOON.
6. An invalid seed shows its error without shifting the column.
7. Home while in region mode returns to the main menu, not a stale list.

## Out of scope

- The mobile `RegionSelect` screen — unchanged.
- The region artwork itself.
- Region availability (which regions have authored maps).
- The two outstanding findings from the desktop-main-menu final review (stale
  `CallingCard` after sign-in; `WeeklyStat` layout shift).
