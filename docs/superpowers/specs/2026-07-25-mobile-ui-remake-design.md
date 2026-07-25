# Mobile UI Remake — Design

**Date:** 2026-07-25
**Status:** Design approved; not yet planned

## Problem

The map is too small on phones. Three things squeeze it:

1. **The nav bar** takes a fixed strip off the top of every screen — roughly
   42px (22px icons + 8px padding × 2 + 2px border × 2).
2. **The attribution footer** takes roughly another 30px off the bottom
   (11px text + 6px padding × 2 + 1px border).
3. **The map card is centered and inset**, so it never reaches the screen's
   side edges even when horizontal room is available.

Together the chrome costs about 72px of vertical space — ~11% of a 667px
phone viewport — before the map competes with the roster, bag, and badge rows
below it.

## Goal

Give the map the reclaimed height and let it run edge-to-edge horizontally,
without cropping any of the map art or moving the roster/bag/badges out of
reach.

## Design

### 1. Delete the mobile nav bar

Replaced by two pieces.

**Floating stack, top-right.** Transparent grey, vertically stacked, rendered
above all other content. Five buttons:

1. Home
2. Settings
3. Fullscreen (new — `requestFullscreen()` / `exitFullscreen()`)
4. Dex
5. Stats

**Auto, Restart, and the admin Skip Map** move into the settings panel or are
dropped on mobile.

```
                                   ┌───┐
                                   │ ⌂ │  home
                                   ├───┤
                                   │ ⚙ │  settings
                                   ├───┤
                                   │ ⛶ │  fullscreen
                                   ├───┤
                                   │ ▤ │  dex
                                   ├───┤
                                   │ ▦ │  stats
                                   └───┘
```

Requirements:
- Floats above every layer. The nav bar sits at `zIndex: 150` today; the stack
  must clear the map and battle layers.
- Transparent grey so artwork stays visible behind it. Each icon needs enough
  contrast to stay legible over **both** light map art and dark battle
  backgrounds — this is the main visual risk.
- Mobile only. Desktop keeps its own layout.

### 2. Map fills the width, letterboxed

The map card currently sizes to the background image's aspect ratio and centers
inside its slot. Keep that — only remove the width constraint so the card can
reach both side edges.

The existing sizing logic already does the right thing:

```js
const width = Math.min(w, h * ratio)   // NodeMap.jsx:895
```

It fits to whichever axis binds, so with a wider slot the map grows until
height becomes the limit. Consequences:

- **Every node stays visible.** No cropping, so `nodePositions` and the overlay
  hit-buttons need no rework — they are laid out against the image box, which
  is exactly what still gets sized here.
- **No distortion.** Aspect ratio is preserved.
- On a tall phone this letterboxes: bands remain above and below the map, and
  the roster/bag/badge rows occupy them as they do now.

Rejected alternatives: cropping vertically to fill (biggest map, but node
positions are computed against the image box and would all need to track the
crop) and stretching to fit (distorts the art, which the current code
deliberately avoids).

### 3. Footer moves off gameplay screens

The attribution footer stays on the **main menu** and **region select**. It is
removed from the map, battle, and Elite Four screens, where vertical space is
scarcest.

### 4. Bag and badges unchanged

The roster, bag, and badge rows keep their current behavior and position below
the map. They were considered for collapsing behind a toggle — rejected, since
that is an interaction change rather than a layout one, and the reclaimed 72px
already addresses the problem.

### 5. Main menu gets a Dex + Stats row

Below the Daily Challenge / Resume buttons, add two smaller rectangles sharing
one bar's footprint — side by side on a single line, each roughly half the
width of a full bar.

```
┌─────────────────────────────┐
│            PLAY             │  green gradient
├─────────────────────────────┤
│      DAILY CHALLENGE        │  orange→red gradient
├─────────────────────────────┤
│         RESUME RUN          │  blue (only when a save exists)
├──────────────┬──────────────┤
│     DEX      │    STATS     │  yellow │ grey
└──────────────┴──────────────┘
             v1.0
```

- **Dex** — yellow
- **Stats** — grey
- Same button styling as the others: 2px border, offset drop shadow, inner
  bevel, Upheaval text.
- Combined width matches a single full bar (320px) so the stack stays aligned.

## Files likely touched

| File | Change |
|---|---|
| `src/components/Layout.jsx` | Delete the mobile nav bar; render the floating stack; gate the footer by screen |
| `src/components/NodeMap.jsx` | Remove the map slot's width constraint |
| `src/components/MainMenu.jsx` | Add the Dex + Stats row |
| new: `src/components/FloatingNav.jsx` | The top-right stack |

Desktop paths must be untouched — the app already branches on `useIsDesktop()`
(768px) in 10 components.

## Open questions

- **Fullscreen on iOS Safari.** `requestFullscreen()` is unsupported on iPhone.
  The button needs a fallback or should hide where the API is unavailable.
- **Icon contrast** over arbitrary map backgrounds may need a subtle scrim or
  outline behind the stack.

## Out of scope

- The desktop main-menu remake (specced separately in
  `docs/Experimental_Features.md`).
- Any change to battle-screen layout beyond removing the nav bar and footer.
- New game modes or the artwork itself.

## Verification

1. On a phone viewport, the map is measurably larger than before and touches
   both side edges.
2. Every map node is visible and tappable; no node is cropped.
3. The floating stack is legible over both a light route map and a dark battle
   background.
4. Desktop layout is unchanged.
5. Footer still present on the main menu and region select.
