# Design — First-Time Tutorial Overlay

> A one-time coachmark tour that runs on a new player's first node-map screen,
> stepping through the top-nav icons (Home, Pokédex, Stats, Auto, Settings) with
> a dimmed backdrop, a spotlight on each icon, an arrow, and a text box. Shown
> once per browser (localStorage), never again after it's finished or skipped.

## Goal

Help first-time players understand the always-present nav controls. Point at
each of the five nav icons in sequence with an arrow + short explanation, on the
first run's node map (the first screen where every target — including the
run-only **Auto** button — is on screen).

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| Persistence | When is "first time" over | **Per-browser** `localStorage` flag (`speedmon.tutorialSeen`). Re-triggers on a new device / cleared cache — accepted. Works for guests too; no DB change. |
| Trigger screen | Where it runs | **First node-map (mid-run)** — all five icons exist there, including Auto/Restart which don't appear on the menu. |
| Interaction | Flow | **Sequential coachmark tour** with a **dimmed backdrop** + spotlight, one step at a time, Next + Skip. |
| Targeting | How arrows find icons | **Measured positioning** — each nav button gets a `data-tutorial` marker; the overlay reads `getBoundingClientRect()` at runtime. Survives mobile/desktop layout differences and resizes. |

Non-goals: account-synced tutorial state, replaying the tutorial from settings,
tutorials for any other screen, automated tests.

## Architecture

A self-contained `src/components/TutorialOverlay.jsx`, rendered once inside
`Layout` (where the nav bar and all target icons live). `Layout` decides only
*whether* to render it; the overlay owns all tutorial logic (step state,
DOM measurement, positioning, the localStorage flag). The five nav buttons gain
a `data-tutorial="..."` attribute and are otherwise unaware of the tutorial.

**Trigger conditions (both required):**
1. The tutorial hasn't been seen: `!localStorage.getItem('speedmon.tutorialSeen')`.
2. The node-map screen is showing — signalled by a new explicit boolean prop
   `showTutorial` passed from `App` to `Layout` (true only when
   `screen === 'nodemap'`). An explicit prop is used rather than inferring from
   `onRestart`, so the trigger is unambiguous.

**On finish (last step's "Done") or "Skip":** set
`localStorage['speedmon.tutorialSeen'] = '1'` and unmount. It never shows again
on that browser.

## Components & data flow

- **`Layout.jsx`** (edited):
  - Add `data-tutorial="home" | "pokedex" | "stats" | "auto" | "settings"` to the
    five corresponding `<button>`s inside `NavButtons`. Non-visual markers only.
  - Accept a `showTutorial` prop; render
    `{showTutorial && <TutorialOverlay />}` (the overlay itself also checks the
    localStorage flag, so it self-suppresses if already seen).
- **`App.jsx`** (edited): pass `showTutorial={screen === 'nodemap'}` to the
  `<Layout>` used by the node-map screen (or globally, since the overlay gates on
  its own flag too — but scoping to nodemap avoids any measurement on menu).
- **`TutorialOverlay.jsx`** (new): holds `step` state (0–4), the five step
  definitions (target key + copy), does measurement + positioning, renders the
  backdrop/spotlight/arrow/box, and writes the flag on end.

**The five steps (nav order):**

| # | `data-tutorial` | Copy |
|---|---|---|
| 1 | `home` | "Home — return to the main menu anytime. Your run auto-saves." |
| 2 | `pokedex` | "Pokédex — every species you've caught or seen." |
| 3 | `stats` | "Stats — your run history, catches, and badges." |
| 4 | `auto` | "Auto — toggle to auto-advance through battle animations." |
| 5 | `settings` | "Settings — theme, battle speed, and log out." |

## Rendering & positioning

Each step:
1. `const el = document.querySelector('[data-tutorial="<key>"]')`.
2. If `el` is null (icon not present for any reason), **skip to the next step**
   rather than crash. If no steps remain, finish.
3. `const r = el.getBoundingClientRect()`.
4. **Backdrop + spotlight (chosen technique):** a small transparent element
   positioned exactly over the icon's rect (with a few px of padding), given a
   huge spread `box-shadow: 0 0 0 9999px rgba(0,0,0,0.7)`. That single shadow
   dims the entire screen *except* the element's own rect — the icon shows
   through bright, no SVG mask needed, and it's well-supported on mobile. A
   subtle bright ring (`outline`/`border`) on that element makes the spotlight
   read clearly. The element also has `pointer-events: none` so it doesn't eat
   the icon's own clicks — but a separate full-screen transparent layer beneath
   it captures clicks to keep the app inert (see interaction rules).
5. **Text box:** positioned **below the nav bar**, near the target horizontally,
   **clamped** so it never overflows the viewport (`left` bounded to
   `[8, window.innerWidth - boxWidth - 8]`). Shows the copy, a **"n / 5"**
   counter, a **Next** button ("Done" on step 5), and a **Skip tutorial** link.
6. **Arrow:** points from the text box up to the icon's rect.

**Interaction rules:**
- Backdrop **captures clicks** (app underneath is inert during the tour). Only the
  overlay's Next / Skip are interactive. Clicking the backdrop does nothing (no
  accidental dismiss).
- **Next** → `step + 1`; **Done** (step 5) and **Skip** → set the flag + unmount.
- **Resize / orientation change:** a `resize` listener re-measures and
  repositions so the arrow/box/spotlight never drift.
- **Mount timing:** measure after one `requestAnimationFrame` (or a mount
  effect) so the nav has laid out before the first measurement.

## Edge cases

- **Target missing:** skip that step (see above) — no crash.
- **Mobile vs desktop nav:** handled automatically by measuring real positions;
  no separate code paths.
- **Already seen:** overlay returns null immediately (flag check on mount), so
  even if `showTutorial` is true it renders nothing.
- **Screen changes mid-tour** (user somehow leaves nodemap): `showTutorial` goes
  false → `Layout` unmounts the overlay. The flag is only set on explicit
  finish/skip, so an interrupted tour could reappear next nodemap — acceptable
  and rare.

## Files touched

- **New:** `src/components/TutorialOverlay.jsx`.
- **Edited:** `src/components/Layout.jsx` (markers + render), `src/App.jsx`
  (`showTutorial` prop).

## Testing / verification

Manual (no automated tests — pure UI/DOM overlay, matching the app's other UI
work):
1. Clear `localStorage`, start a first run → tutorial appears on the node map.
2. Steps 1–5 each highlight the correct icon with an on-target arrow + readable
   box; counter reads "1 / 5" … "5 / 5".
3. **Skip** on any step ends it; **Done** on step 5 ends it. Reload → it does
   **not** reappear.
4. Narrow mobile viewport: the text box stays fully on-screen for every step
   (especially the right-edge Settings icon). Desktop: arrows still land right.
5. Resize the window mid-tour → arrow/box/spotlight reposition correctly.
