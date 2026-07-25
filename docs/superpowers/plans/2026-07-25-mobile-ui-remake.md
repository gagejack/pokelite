# Mobile UI Remake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclaim ~72px of mobile chrome so the map is bigger: delete the
mobile nav bar in favor of a floating top-right stack, widen the map to a 5px
gutter, drop its shadow on mobile, gate the footer to menu screens, and add a
Dex + Stats row to the main menu.

**Architecture:** All changes branch on the existing `useIsDesktop()` hook
(768px breakpoint). Desktop renders exactly what it renders today — the nav
bar, footer, and map shadow are unchanged there. Mobile swaps the nav bar for
a new `FloatingNav` component and relocates the nav bar's secondary actions
into the settings panel.

**Tech Stack:** React 18 + Vite, inline styles (no CSS framework). No
component-test framework exists and none may be added — UI verification is
`npx vite build` plus the manual checklist in Task 5.

**Spec:** `docs/superpowers/specs/2026-07-25-mobile-ui-remake-design.md`

## Global Constraints

- **Mobile-only.** Every visual change is gated by `useIsDesktop()` from
  `src/lib/useIsDesktop.js` (`window.innerWidth >= 768`). Desktop behavior must
  be byte-identical: nav bar, footer on every screen, map shadow all stay.
- **Z-order (fixed, do not improvise):** battle overlay `zIndex: 100`
  (`BattleCard.jsx:342`) < floating nav `150` (same slot the nav bar occupies
  today) < modals `200` (`SettingsPanel.jsx:32`). The floating nav must sit
  above the battle overlay and below open modals — exactly like today's bar.
- **`[data-navbar]` disappearance is safe and intended.** `BattleCard.jsx:122`
  measures it with `?.getBoundingClientRect().height ?? 0`; with no navbar the
  battle card simply reclaims that height. Do not add a fake `[data-navbar]`
  element on mobile.
- **`data-tutorial` markers must survive.** `TutorialOverlay` targets
  `data-tutorial="home|pokedex|stats|auto|settings"`; a missing target is
  skipped, not crashed. The FloatingNav buttons carry the markers for
  home/pokedex/stats/settings; the `auto` step will be skipped on mobile —
  acceptable.
- **Map gutter is exactly 5px per side.** Not 8, not 10.
- **No test framework.** Verification is `npx vite build` (a pre-existing
  "chunks larger than 500 kB" warning is NOT a failure) plus Task 5's manual
  checklist.
- Commit after every task.

---

### Task 1: Relocate Auto + Restart into the settings panel (mobile only)

Land this before deleting the nav bar so mobile never loses access to these
actions. The admin Skip Map button is **dropped on mobile** (desktop keeps it)
— record that in the commit message, add nothing for it.

**Files:**
- Modify: `src/components/SettingsPanel.jsx`
- Modify: `src/components/Layout.jsx` (one line: pass `onRestart` through)

**Interfaces:**
- Consumes: `useSettings()` from `src/lib/settings` — already exposes
  `autoClose` / `setAutoClose` (the nav bar's Auto button uses them today).
- Produces: `SettingsPanel({ onClose, username, onRestart })` — new optional
  `onRestart` prop. Task 2 relies on this exact name.

- [ ] **Step 1: Add the mobile-only rows to SettingsPanel**

In `src/components/SettingsPanel.jsx`, extend the imports and hook usage:

```jsx
import { useIsDesktop } from '../lib/useIsDesktop'
```

```jsx
export default function SettingsPanel({ onClose, username, onRestart }) {
  const { dark, cards, toggle } = useTheme()
  const isDesktop = useIsDesktop()
  const { battleSpeed, setSpeed, autoClose, setAutoClose } = useSettings()
```

Insert the Auto row **after** the Battle Speed block's closing `</div>` and
**before** the Logout block, matching the Theme row's structure exactly:

```jsx
        {/* Auto-close battle — mobile only: the nav bar's Auto button doesn't
            exist on mobile (FloatingNav replaces the bar), so the toggle
            lives here. Desktop keeps the nav bar button and hides this row. */}
        {!isDesktop && (
          <div style={{
            padding: '14px', borderTop: borderStyle,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: textColor }}>
              Auto-Close Battle
            </span>
            <button
              onClick={() => setAutoClose(!autoClose)}
              style={{
                fontFamily: 'Upheaval', fontSize: '9px',
                color: autoClose ? '#1a1a1a' : textColor,
                border: borderStyle, padding: '4px 10px',
                backgroundColor: autoClose ? '#facc15' : innerBg, cursor: 'pointer',
              }}
            >
              {autoClose ? 'On' : 'Off'}
            </button>
          </div>
        )}

        {/* Restart Run — mobile only, and only when the current screen has a
            run to restart (Layout passes onRestart through from NodeMap /
            EliteFour; menu screens don't). */}
        {!isDesktop && onRestart && (
          <div style={{ padding: '0 14px 10px' }}>
            <button
              onClick={() => { onRestart(); onClose() }}
              style={{
                width: '100%',
                fontFamily: 'Upheaval', fontSize: '10px', color: textColor,
                border: borderStyle, backgroundColor: innerBg,
                padding: '8px', cursor: 'pointer',
              }}
            >
              Restart Run
            </button>
          </div>
        )}
```

Note: the Battle Speed block has no bottom border today, which is why the Auto
row carries `borderTop`.

- [ ] **Step 2: Pass onRestart through Layout**

In `src/components/Layout.jsx`, the settings panel is rendered near the bottom:

```jsx
{settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} username={username} />}
```

becomes

```jsx
{settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} username={username} onRestart={onRestart} />}
```

`onRestart` is already a Layout prop (the nav bar's Restart button uses it).

- [ ] **Step 3: Verify build and behavior**

Run: `npx vite build` — expect `✓ built`.
Run: `npm run dev`, open a **desktop** viewport → settings panel shows NO new
rows. Narrow to a phone viewport (<768px) → settings shows Auto-Close Battle;
on the map screen it also shows Restart Run; on the main menu it does not
(no `onRestart` there).

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.jsx src/components/Layout.jsx
git commit -m "feat(mobile): Auto and Restart move into the settings panel

Preparation for deleting the mobile nav bar: its Auto toggle and Restart
button relocate to SettingsPanel, gated to mobile so desktop is unchanged.
The admin Skip Map button will be desktop-only once the bar is gone."
```

---

### Task 2: FloatingNav + delete the mobile nav bar + footer gating

The core swap. After this task, mobile has no nav bar; a floating stack
(Home, Settings, Dex, Stats) sits top-right above everything, and the footer
appears only on the main menu and region select (desktop untouched).

**Files:**
- Create: `src/components/FloatingNav.jsx`
- Modify: `src/components/Layout.jsx`
- Modify: `src/components/MainMenu.jsx` (pass `mobileFooter`)
- Modify: `src/components/RegionSelect.jsx` (pass `mobileFooter`)

**Interfaces:**
- Consumes: `SettingsPanel`'s `onRestart` prop from Task 1.
- Produces:
  - `FloatingNav({ onHome, setSettingsOpen, setPokedexOpen, setStatsOpen })`
  - `Layout` gains two optional props used by later tasks:
    `mobileFooter` (boolean, default `false`) and externally-controlled
    `statsOpen` / `setStatsOpen` (default to internal state when omitted).
    Task 4's MainMenu Stats button depends on the stats pair.

- [ ] **Step 1: Create FloatingNav**

Create `src/components/FloatingNav.jsx`:

```jsx
import homeIcon from '../assets/Icons/homeIcon.png'
import pokedexIcon from '../assets/Icons/pokedexIcon.png'
import statsIcon from '../assets/Icons/statsIcon.png'
import settingsIcon from '../assets/Icons/blueSettingsIcon.png'

// Mobile-only floating nav — replaces the top nav bar so the map can use its
// height. A translucent grey pill fixed to the top-right, above the map and
// battle layers (zIndex 150, the bar's old slot: battle overlay is 100,
// modals are 200). Each icon carries a drop shadow so it stays legible over
// light map art and dark battle backgrounds alike.
//
// data-tutorial markers match the old nav bar buttons so TutorialOverlay's
// tour still finds its targets; the "auto" step has no target on mobile and
// is skipped by the overlay's missing-target handling.
export default function FloatingNav({ onHome, setSettingsOpen, setPokedexOpen, setStatsOpen }) {
  const buttons = [
    { key: 'home',     icon: homeIcon,     alt: 'Home',     tutorial: 'home',     onClick: onHome },
    { key: 'settings', icon: settingsIcon, alt: 'Settings', tutorial: 'settings', onClick: () => setSettingsOpen(true) },
    { key: 'dex',      icon: pokedexIcon,  alt: 'Pokedex',  tutorial: 'pokedex',  onClick: () => setPokedexOpen(true) },
    { key: 'stats',    icon: statsIcon,    alt: 'Stats',    tutorial: 'stats',    onClick: () => setStatsOpen(true) },
  ]
  return (
    <div style={{
      position: 'fixed', top: '8px', right: '5px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      backgroundColor: 'rgba(46, 46, 46, 0.55)',
      borderRadius: '6px', padding: '6px 4px',
      zIndex: 150,
    }}>
      {buttons.map(b => (
        <button
          key={b.key}
          data-tutorial={b.tutorial}
          onClick={b.onClick}
          className="hover:opacity-60 transition-opacity"
          style={{ padding: '2px', cursor: 'pointer' }}
        >
          <img
            src={b.icon}
            alt={b.alt}
            style={{
              width: '22px', height: '22px', display: 'block',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            }}
          />
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Branch Layout on isDesktop**

In `src/components/Layout.jsx`:

1. Add imports:

```jsx
import { useIsDesktop } from '../lib/useIsDesktop'
import FloatingNav from './FloatingNav'
```

2. Extend the signature and stats state. `statsOpen` becomes optionally
   controlled — same pattern as `pokedexOpen`, which is already a prop:

```jsx
export default function Layout({ children, onHome, onRestart, onSkipMap, pokedexOpen, setPokedexOpen, showTutorial, mobileFooter = false, statsOpen: statsOpenProp, setStatsOpen: setStatsOpenProp }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const { autoClose, setAutoClose } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpenInternal, setStatsOpenInternal] = useState(false)
  // Stats is optionally controlled by the screen (MainMenu's STATS button);
  // uncontrolled screens keep the old internal behavior.
  const statsOpen = statsOpenProp ?? statsOpenInternal
  const setStatsOpen = setStatsOpenProp ?? setStatsOpenInternal
```

(Delete the old `const [statsOpen, setStatsOpen] = useState(false)` line.
Everything downstream — NavButtons, the Stats modal — already reads the
`statsOpen` / `setStatsOpen` names and needs no edits.)

3. Wrap the nav bar in the desktop branch and add FloatingNav for mobile.
   The whole `<div data-navbar …>…</div>` block (bar + NavButtons + logo)
   moves inside the conditional **unchanged**:

```jsx
      {isDesktop ? (
        <div data-navbar style={{ /* …existing bar, byte-identical… */ }}>
          {/* …existing NavButtons + logo… */}
        </div>
      ) : (
        <FloatingNav
          onHome={onHome}
          setSettingsOpen={setSettingsOpen}
          setPokedexOpen={setPokedexOpen}
          setStatsOpen={setStatsOpen}
        />
      )}
```

4. Gate the footer. The attribution footer `<div>` (bottom of the component)
   renders when `isDesktop || mobileFooter`:

```jsx
      {(isDesktop || mobileFooter) && (
        <div style={{ /* …existing footer, unchanged… */ }}>…</div>
      )}
```

- [ ] **Step 3: Menu screens keep their mobile footer**

- `src/components/MainMenu.jsx`: `<Layout onHome={…} …>` → add `mobileFooter`.
- `src/components/RegionSelect.jsx`: same — add `mobileFooter` to its
  `<Layout …>`.

The other four screens (CharacterSelect, StarterSelect, NodeMap, EliteFour)
are NOT changed — their mobile footer disappears by default, which is the
point.

- [ ] **Step 4: Verify build and both platforms**

Run: `npx vite build` — expect `✓ built`.
Dev server, desktop viewport: nav bar, logo, footer all present on every
screen — unchanged. Phone viewport: no top bar anywhere; floating stack
top-right on every screen; footer only on main menu and region select; tapping
each stack icon opens Home/Settings/Dex/Stats; during a battle the stack stays
visible above the dimmed overlay; opening Settings covers the stack.

- [ ] **Step 5: Commit**

```bash
git add src/components/FloatingNav.jsx src/components/Layout.jsx src/components/MainMenu.jsx src/components/RegionSelect.jsx
git commit -m "feat(mobile): floating nav replaces the top bar; footer gated to menus

Deletes the mobile nav bar (~42px) for a translucent top-right stack of
Home/Settings/Dex/Stats at the bar's old zIndex (150). Attribution footer
(~30px) now renders on mobile only for MainMenu and RegionSelect. BattleCard's
[data-navbar] measurement degrades to 0 by design, so battles reclaim the
height automatically. Desktop is untouched."
```

---

### Task 3: Map gutter + shadow removal (NodeMap, mobile)

**Files:**
- Modify: `src/components/NodeMap.jsx` (two lines)

**Interfaces:**
- Consumes: nothing new. `isDesktop` already exists in NodeMap
  (`NodeMap.jsx:390`).

- [ ] **Step 1: 5px side gutter on the mobile map slot**

The mobile branch's outer container (`NodeMap.jsx:~1080`) currently has
`padding: '8px 0 8px'` (no side padding — the inset came from the card being
height-bound; with the bar gone, width will bind more often and the card would
touch the edges). Change to:

```jsx
padding: '8px 5px',
```

The bottom rows are constrained to the card's width already, so they inherit
the gutter.

- [ ] **Step 2: Drop the map shadow on mobile**

`mapSvgProps` (`NodeMap.jsx:~899`) feeds the shared `MapSvg`, whose container
applies `border: borderStyle, boxShadow: shadowStyle` (`NodeMap.jsx:110`).
The shadow is `-4px 6px 0 0` (`NodeMap.jsx:486`) — a negative-x offset that
would eat the left gutter at near-full width. Change the prop, not MapSvg:

```jsx
  const mapSvgProps = {
    dark, borderStyle,
    // Mobile drops the offset drop shadow: at near-full width it pushes the
    // card visually left and eats the 5px gutter. The border stays.
    shadowStyle: isDesktop ? shadowStyle : 'none',
```

- [ ] **Step 3: Verify**

Run: `npx vite build` — expect `✓ built`.
Dev server, phone viewport, start a run: map is larger than before, a thin
band of background shows each side with the card's border fully visible, no
shadow. Desktop: map card unchanged, shadow present.

- [ ] **Step 4: Commit**

```bash
git add src/components/NodeMap.jsx
git commit -m "feat(mobile): 5px map gutter, no map shadow

The mobile map slot gets 5px side padding so the card's border stays visible
at its new near-full width, and the -4px offset drop shadow (which would eat
the left gutter) is dropped on mobile. Desktop keeps both."
```

---

### Task 4: Main-menu Dex + Stats row

**Files:**
- Modify: `src/components/MainMenu.jsx`

**Interfaces:**
- Consumes: Layout's optional `statsOpen` / `setStatsOpen` props from Task 2.
  `setPokedexOpen` is already a MainMenu prop.

- [ ] **Step 1: Add stats state and pass it to Layout**

In `MainMenu.jsx`:

```jsx
  const [statsOpen, setStatsOpen] = useState(false)
```

and extend its Layout usage (which already carries `mobileFooter` from Task 2):

```jsx
    <Layout onHome={() => setPokedexOpen(false)} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter statsOpen={statsOpen} setStatsOpen={setStatsOpen}>
```

- [ ] **Step 2: Add the row**

Insert between the Resume Run block's closing `)}` and the version tag:

```jsx
        {/* Dex + Stats — two half-width buttons sharing one bar's footprint.
            Same border/shadow/bevel language as the bars above. */}
        <div style={{ width: '320px', maxWidth: '100%', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setPokedexOpen(true)}
            className="hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{
              flex: 1, height: '40px',
              backgroundColor: '#facc15',
              border: borderStyle,
              boxShadow: bevel,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '16px', color: '#1a1a1a', letterSpacing: '2px', fontFamily: 'Upheaval' }}>DEX</span>
          </button>
          <button
            onClick={() => setStatsOpen(true)}
            className="hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{
              flex: 1, height: '40px',
              backgroundColor: '#6b7280',
              border: borderStyle,
              boxShadow: bevel,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '16px', color: '#fff', letterSpacing: '2px', fontFamily: 'Upheaval' }}>STATS</span>
          </button>
        </div>
```

Colors are the spec's: Dex solid yellow (`#facc15`, dark text — same pairing
as the nav bar's active Auto button), Stats solid grey (`#6b7280`, white
text). No gradients — the spec assigns those only to Play and Daily.

- [ ] **Step 3: Verify**

Run: `npx vite build` — expect `✓ built`.
Dev server: menu reads logo → PLAY → DAILY CHALLENGE → (RESUME RUN) →
DEX | STATS → v1.0, all aligned at 320px. DEX opens the Pokédex overlay;
STATS opens the Stats modal (via Layout's controlled props). Works on both
desktop and mobile viewports.

- [ ] **Step 4: Commit**

```bash
git add src/components/MainMenu.jsx
git commit -m "feat(menu): Dex + Stats half-width row under the run buttons

Two buttons sharing one 320px bar footprint -- Dex yellow, Stats grey, same
border/bevel language as the stack. Stats opens Layout's modal via the new
controlled statsOpen props."
```

---

### Task 5: Manual verification (acceptance)

**Files:** none — fixes only if a check fails.

Run `npm run dev` and check against the spec's verification list.

- [ ] **Phone viewport (<768px):**
  - [ ] Map screen: no top bar; map larger than before; 5px band each side
        with the border fully visible; no drop shadow.
  - [ ] Every map node visible and tappable — none cropped.
  - [ ] Floating stack legible over a light route map AND over the dark battle
        overlay; it stays above the battle, below open modals.
  - [ ] Roster / bag / badges behave exactly as before.
  - [ ] Settings panel: Auto-Close toggle present; Restart Run present on the
        map screen only.
  - [ ] Footer on main menu + region select only.
  - [ ] First-run tutorial: steps for home/dex/stats/settings point at the
        floating stack; the auto step is skipped without crashing.
- [ ] **Desktop viewport (≥768px):**
  - [ ] Nav bar with logo, Auto, Restart, Settings, admin Skip Map — unchanged.
  - [ ] Footer on every screen; map shadow present; settings panel has no new
        rows.
- [ ] Commit any fixes with messages naming the specific check that failed.

---

## Self-Review

**Spec coverage:** nav bar deletion + 4-button floating stack → Task 2; Auto/
Restart relocation and Skip Map dropped → Task 1; 5px gutter + shadow removal
→ Task 3; footer gating → Task 2; bag/badges untouched → no task (verified in
Task 5); Dex + Stats menu row → Task 4; every Verification bullet → Task 5.

**Placeholder scan:** none — all steps carry literal code.

**Type consistency:** `FloatingNav({ onHome, setSettingsOpen, setPokedexOpen,
setStatsOpen })` matches Task 2's render; `SettingsPanel`'s `onRestart` is
named identically in Tasks 1 and 2; Layout's `mobileFooter` / `statsOpen` /
`setStatsOpen` match Task 4's usage. Task 3's `shadowStyle: 'none'` flows into
`MapSvg`'s existing `boxShadow: shadowStyle` (`boxShadow: 'none'` is valid
CSS).

**Known risk:** the floating stack overlaps the top-right of the map art. The
map's own nodes never reach the extreme top-right corner (row 0 is a single
start node), but if a node proves hard to tap under the stack, nudge the
stack's `top` — do not change the map.
