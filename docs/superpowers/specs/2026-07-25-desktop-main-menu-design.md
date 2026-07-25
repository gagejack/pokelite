# Desktop Main Menu — Design

**Date:** 2026-07-25
**Status:** Design approved; not yet planned

## Problem

`MainMenu.jsx` has no desktop branch at all — it is the only pre-run screen
with zero `useIsDesktop()` usage. On every viewport it renders one centered
column: a 320px logo above a stack of 320px bars. On a phone that reads
correctly. On a 1440px monitor the same column floats in the middle of a mostly
empty screen, so the game's first impression wastes roughly three quarters of
the viewport and gives the artwork nowhere to live.

This is the "Desktop main-menu layout" item in `docs/Experimental_Features.md`
(priority 6), narrowed to what ships in one pass.

## Goal

A purpose-built desktop main menu that uses the full viewport and makes
`fullArtwork.webp` the centerpiece, without touching the mobile column.

## Design

### 1. Background: `fullArtwork.webp`, mirrored

`src/assets/fullArtwork.webp` (1440×815, ~298 kB) becomes a full-bleed fixed
background on the desktop main menu only.

**The image is mirrored horizontally** (`transform: scaleX(-1)`).

The reason is compositional. In the original, every subject — the Pokémon
cluster, Snorlax, the hillside — sits on the **left**, and the empty night sky
is on the **right**. The button column belongs on the left (see §2), so an
unmirrored image would put the logo over Rhydon and Pikachu and the buttons over
Bulbasaur and Squirtle.

Mirroring swaps them: the night sky moves to the upper-left where the column
goes, and the full cluster reads left-to-right into Pikachu and Rhydon on the
right. Nothing is cropped, nothing is covered, and no second asset is needed.

Rejected alternatives: a dark scrim panel behind a left column (permanently
hides the best part of the painting) and shifting the art right via
`object-position` (crops the left edge).

Sizing: `object-fit: cover`, centered.

### 2. Layout

Desktop only, gated on the existing `useIsDesktop()` (768px) hook.

```
┌────────────────────────────────────────────────────┐
│ [SPEEDMON logo]          ·  ·  night sky  ·        │
│ ┌──────────────┐                    ⋱ bat          │
│ │     PLAY     │                  Pikachu  Rhydon  │
│ ├──────────────┤            telescope   Charmander │
│ │DAILY CHALLENGE│         Slowpoke  Chansey Squirtle│
│ ├──────────────┤       Staryu         Caterpie Bulba│
│ │  RESUME RUN  │      hillside                     │
│ ├───────┬──────┤                                   │
│ │  DEX  │STATS │                                   │
│ └───────┴──────┘                                   │
│  Snorlax ▁▁▁                       ┌─────────────┐ │
│  This week: 12 maps beaten         │ calling card│ │
└────────────────────────────────────┴─────────────┴─┘
```

- **Logo + button stack** — pinned upper-left, over the empty night sky.
- **Calling card** — lower-right.
- **Weekly stat** — lower-left, over the dark treeline / Snorlax area.
- **Center hillside** — deliberately left clear. It is the brightest, most
  detailed part of the painting and nothing is placed on it.

### 3. Button sizing: unchanged from today

The desktop menu changes **where** the stack sits, not what it looks like.
Buttons keep their current dimensions and styling exactly:

- 320px wide, 40px tall
- Existing `borderStyle`, `bevel`, gradients, and Upheaval type
  (`MainMenu.jsx:65`)

At 320px the column occupies about a quarter of a 1280px viewport, which is the
intent: the painting is the hero and the column is a compact panel over the sky.

> **Open by design.** Sizing is a placeholder pending a visual mockup, not a
> settled decision. Because both layouts render from one shared button
> definition (§4), revisiting it means changing two numbers in one place — not
> a redesign.

### 4. Components

| File | Role |
|---|---|
| `src/components/MainMenu.jsx` | Branches on `useIsDesktop()`; both paths render from one shared button-definition array |
| `src/components/menu/CallingCard.jsx` | Profile card (new) |
| `src/components/menu/WeeklyStat.jsx` | The single weekly counter (new) |

The **shared button definition** is the important constraint. Both the mobile
column and the desktop stack map over one array of
`{ id, label, color, onClick, visible }`, so adding a mode or changing a size
touches one place rather than two divergent layouts.

`CallingCard` shows username, total runs, best maps cleared, favorite starter,
and shiny count, using the same border/shadow/bevel language as the bars.

### 5. Data

Both new components read **only the current user's own rows** from `runs` and
`catches`.

This matters: `runs_tracking.sql:35` defines `runs_select_own`, restricting
SELECT to `auth.uid() = user_id`. Personal stats work under that policy as-is,
and `created_at timestamptz not null default now()` already exists
(`runs_tracking.sql:21`), so "this week" is a real query.

**No SQL, no new policies, no new RPC.**

> The blocker recorded in `docs/Experimental_Features.md` ("`runs` rows carry no
> timestamp") is **stale** — the column exists. The real constraint is RLS, and
> it only blocks the community/online counters, which are out of scope.

**Empty states:** logged-out or zero-run users get the card with placeholder
dashes rather than a hidden element, so the layout does not reflow.
`LoginForm` keeps its current behavior — shown until authenticated.

## Risks

1. **Art readability across viewports.** `object-fit: cover` crops differently
   at 4:3 versus ultrawide, so the night sky's position shifts and brighter
   hillside can creep leftward under the column. Guard: a soft dark gradient
   scrim from the left edge,
   `linear-gradient(to right, rgba(0,0,0,0.55), transparent 45%)` — subtle
   enough not to flatten the art. Verify at three widths (below).
2. **Bundle weight.** `fullArtwork.webp` is 298 kB, `src/assets` is already
   ~25 MB, and the main chunk is ~1 MB. Importing the art into `MainMenu` puts
   it in the initial chunk, on the first screen every player sees.
   **Mitigation: move it to `public/` and reference it by URL**, so it loads as
   a separate request instead of inflating the JS bundle.
3. **Short viewports.** A 768×600 laptop window must not clip the calling card
   or trap the login form. The existing `overflowY: auto` pattern carries over.

## Implementation note: mockup checkpoint

The first implementation step is the **static desktop layout with placeholder
data** — no Supabase wiring. Button sizing gets judged visually at that point
and settled before the data work begins, so the card is not built twice.

## Verification

This project has no test framework; verification is lint, build, and inspection.

1. `npm run lint` and `npm run build` both clean.
2. **The mobile menu is pixel-identical to today.** This is the main regression
   risk, since both layouts now share one button definition.
3. Desktop layout correct at ~1024px, ~1440px, and an ultrawide width — logo and
   buttons legible over the sky, center hillside unobstructed at all three.
4. Calling card shows placeholder dashes when logged out, real values when
   signed in, with no layout shift between the two.
5. At 768×600 nothing is clipped and the login form stays reachable.

## Out of scope

- Community and players-online counters, and the `SECURITY DEFINER` RPC they
  would need to clear RLS.
- The mobile main menu.
- Extra-mode buttons beyond stubs in the shared definition.
- Every other desktop screen (region select, starter/character select, and the
  in-run screens, which already have desktop layouts).
- The artwork itself.
