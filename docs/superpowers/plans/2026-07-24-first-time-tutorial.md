# First-Time Tutorial — Implementation Plan

> Small self-contained UI feature (one new component + two edits), executed
> inline. Spec: docs/superpowers/specs/2026-07-23-first-time-tutorial-design.md

**Goal:** A one-time coachmark tour on the first node-map screen, stepping
through the five nav icons with a dimmed backdrop + spotlight + arrow + text box.

**Tech:** React 19, inline styles (codebase convention). No test framework —
verified by build/lint + manual reasoning.

## Global constraints

- `localStorage` key `speedmon.tutorialSeen`; set to `'1'` on finish or skip.
- Targets found via `data-tutorial` markers + `getBoundingClientRect()` (works
  across mobile/desktop; NavButtons renders once so markers are unique).
- Spotlight = a transparent element over the icon rect with
  `box-shadow: 0 0 0 9999px rgba(0,0,0,0.7)` (dims everything else), a bright
  ring, and `pointer-events:none`.
- A separate full-screen transparent layer captures clicks so the app is inert
  during the tour; clicking the backdrop does nothing.
- Text box clamped on-screen; arrow points up to the icon; re-measure on resize.
- Missing target → skip that step; no crash.
- No new lint errors vs the 46 baseline; build clean.

## Tasks

### Task 1: Mark the nav buttons (`Layout.jsx`)
Add `data-tutorial="home|pokedex|stats|auto|settings"` to the five buttons in
`NavButtons`. Non-visual. (Restart is NOT a target.)

### Task 2: `TutorialOverlay.jsx` (new)
Steps array (key + copy), `step` state, measure-and-position on step/resize via
`getBoundingClientRect()`, render click-capture layer + spotlight + arrow +
text box (counter "n / 5", Next/Done, Skip). On mount: return null if the flag
is set. On finish/skip: set flag, unmount.

### Task 3: Wire it up (`Layout.jsx` + `App.jsx`)
`App` passes `showTutorial={screen === 'nodemap'}` to the node-map `<Layout>`.
`Layout` accepts `showTutorial` and renders `{showTutorial && <TutorialOverlay/>}`.

## Verify
Build + lint clean. Manual: clear localStorage → first run → tour on node map,
5 steps correct, Skip/Done end it, no reappear on reload, mobile box on-screen.
