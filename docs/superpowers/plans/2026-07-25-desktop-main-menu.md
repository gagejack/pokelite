# Desktop Main Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the main menu a purpose-built desktop layout (≥768px) with `fullArtwork.webp` mirrored as a full-bleed background, leaving the mobile column untouched.

**Architecture:** `MainMenu.jsx` gains a desktop branch via the existing `useIsDesktop()` hook. Both layouts render from one shared button-definition array so sizing and new modes are changed in one place. Two new presentational components (`CallingCard`, `WeeklyStat`) read only the current user's own Supabase rows, which the existing RLS policies already permit.

**Tech Stack:** React 19, Vite, Tailwind v4 (utility classes for hover/transition only — layout is inline styles, matching this file's existing convention), Supabase JS v2.

## Global Constraints

- **Desktop breakpoint is 768px**, from `useIsDesktop()` in `src/lib/useIsDesktop.js`. Do not introduce a second breakpoint or a media query.
- **The mobile layout must render pixel-identically to today.** This is the primary regression risk.
- **Buttons keep their current dimensions: 320px wide, 40px tall.** Sizing is a placeholder pending visual review — do not "improve" it.
- **No SQL, no new Supabase policies, no new RPCs.** Every query reads only the signed-in user's own rows.
- **Styling language is fixed:** `borderStyle` = `dark ? '2px solid #121212' : '2px solid #666666'`; `shadowStyle` = `dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'`; `bevel` = `` `${shadowStyle}, inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)` ``. Fonts are `Upheaval` (buttons/headings) and `Orange Kid` (small text).
- **This project has no test framework.** Verification is `npm run lint`, `npm run build`, and visual inspection at stated viewport widths. Do not add a test runner.
- **Commit after every task.**

---

## File Structure

| File | Responsibility |
|---|---|
| `public/fullArtwork.webp` | The background art, moved out of `src/assets` so it does not enter the JS bundle (Task 1) |
| `src/components/MainMenu.jsx` | Branches on `useIsDesktop()`; owns the shared button definition and both layouts |
| `src/components/menu/MenuButton.jsx` | One bar, rendered from a button definition. Used by both layouts. |
| `src/components/menu/WeeklyStat.jsx` | "This week: N maps beaten" — self-loading |
| `src/components/menu/CallingCard.jsx` | Profile card — self-loading |

---

### Task 1: Move the artwork out of the bundle

`src/assets/fullArtwork.webp` is 298 kB. Anything under `src/assets` imported by a component is bundled into the JS chunk; the main chunk is already ~1 MB and this is the game's first screen. Files in `public/` are served as separate static requests instead.

**Files:**
- Move: `src/assets/fullArtwork.webp` → `public/fullArtwork.webp`

- [ ] **Step 1: Confirm nothing imports it yet**

Run: `grep -rn "fullArtwork" src/`
Expected: no output. (If there are hits, stop — this plan assumes the asset is currently unused.)

- [ ] **Step 2: Move the file with git**

```bash
git mv src/assets/fullArtwork.webp public/fullArtwork.webp
```

- [ ] **Step 3: Verify it is served**

```bash
npm run build
ls -la dist/fullArtwork.webp
```

Expected: the file exists in `dist/` at ~298 kB.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: move fullArtwork.webp to public/ so it stays out of the JS bundle"
```

---

### Task 2: Extract `MenuButton`

Both layouts must render identical bars. Extract the bar first, then reuse it — this is what keeps the mobile layout byte-identical while the desktop one is added.

**Files:**
- Create: `src/components/menu/MenuButton.jsx`
- Modify: `src/components/MainMenu.jsx`

**Interfaces:**
- Produces: `<MenuButton def={def} dark={bool} style={obj} />` where `def` is
  `{ id: string, label: string, background: string, color: string, fontSize: string, onClick: fn, visible: bool, className?: string }`.
  `style` is merged last so a layout can override width/height.

- [ ] **Step 1: Create the component**

Create `src/components/menu/MenuButton.jsx`:

```jsx
// One main-menu bar. Both the mobile column and the desktop stack render
// through this, so the two layouts can never drift apart visually.
export default function MenuButton({ def, dark, style }) {
  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'
  // Hard (0 blur) inner bevel to match the pixel-art styling, appended after
  // the drop shadow so both render.
  const bevel = `${shadowStyle}, inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)`

  // The Daily bar animates its box-shadow via --btn-shadow (index.css), which
  // would otherwise replace the bevel outright.
  const usesGlow = def.className?.includes('daily-glow')

  return (
    <button
      onClick={def.onClick}
      className={`hover:scale-105 active:scale-95 transition-transform duration-150${def.className ? ` ${def.className}` : ''}`}
      style={{
        width: '320px', maxWidth: '100%', height: '40px',
        background: def.background,
        border: borderStyle,
        ...(usesGlow ? { '--btn-shadow': bevel } : { boxShadow: bevel }),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}
    >
      <span style={{ fontSize: def.fontSize, color: def.color, letterSpacing: '2px', fontFamily: 'Upheaval' }}>
        {def.label}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Build the shared definition array in `MainMenu.jsx`**

Add this above the `return` in `MainMenu.jsx`, after the existing `bevel` const:

```jsx
  // Single source of truth for the menu bars. Both layouts map over this, so
  // adding a mode or changing a size happens in exactly one place.
  const buttonDefs = [
    { id: 'play',  label: 'PLAY',  background: 'linear-gradient(to top, #16a34a, #4ade80)',
      color: '#fff', fontSize: '26px', onClick: onPlay, visible: true },
    { id: 'daily', label: 'DAILY CHALLENGE', background: 'linear-gradient(to top, #dc2626, #f97316)',
      color: '#fff', fontSize: '22px', onClick: onOpenDaily, visible: true, className: 'daily-glow' },
    { id: 'resume', label: 'RESUME RUN', background: '#3b82f6',
      color: '#fff', fontSize: '22px', onClick: onResume, visible: !!hasSavedRun },
  ].filter(d => d.visible)

  // Dex + Stats share one bar's footprint, so they are defined separately.
  const halfDefs = [
    { id: 'dex',   label: 'DEX',   background: '#facc15', color: '#1a1a1a', fontSize: '16px',
      onClick: () => setPokedexOpen(true), visible: true },
    { id: 'stats', label: 'STATS', background: '#6b7280', color: '#fff', fontSize: '16px',
      onClick: () => setStatsOpen(true), visible: true },
  ]
```

- [ ] **Step 3: Replace the three full-width bars in the mobile column**

In `MainMenu.jsx`, replace the Play button, the Daily Challenge button, and the `{hasSavedRun && (...)}` Resume block (currently lines 60–113) with:

```jsx
        {buttonDefs.map(def => (
          <MenuButton key={def.id} def={def} dark={dark} />
        ))}
```

Add the import at the top: `import MenuButton from './menu/MenuButton'`

- [ ] **Step 4: Replace the Dex + Stats row**

Replace the two inline `<button>` elements inside the existing
`<div style={{ width: '320px', maxWidth: '100%', display: 'flex', gap: '8px' }}>`
with:

```jsx
          {halfDefs.map(def => (
            <MenuButton key={def.id} def={def} dark={dark} style={{ flex: 1, width: 'auto' }} />
          ))}
```

- [ ] **Step 5: Verify the mobile menu is unchanged**

```bash
npm run lint
npm run dev
```

In the browser at a **375px-wide** viewport, compare against `git stash` / unstash if needed. Confirm: Play, Daily (still glowing), Resume (only with a saved run), and the Dex/Stats row all render at the same sizes, colors, and spacing as before. The Daily bar must still have both its glow **and** its offset shadow.

- [ ] **Step 6: Commit**

```bash
git add src/components/menu/MenuButton.jsx src/components/MainMenu.jsx
git commit -m "refactor(menu): extract MenuButton and a shared button definition"
```

---

### Task 3: `WeeklyStat`

**Files:**
- Create: `src/components/menu/WeeklyStat.jsx`

**Interfaces:**
- Produces: `<WeeklyStat dark={bool} />` — self-loading, renders one line of text.

Reads `runs` filtered to `auth.uid()`, which `runs_select_own` permits. `runs.created_at` exists (`supabase/runs_tracking.sql:21`), so the week filter is a real query.

- [ ] **Step 1: Create the component**

Create `src/components/menu/WeeklyStat.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// "This week: N maps beaten" for the signed-in user.
// Reads only the user's own rows — runs_select_own RLS permits this with no
// extra policy. Community-wide totals would need a SECURITY DEFINER RPC and
// are deliberately out of scope.
export default function WeeklyStat({ dark }) {
  const [maps, setMaps] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      // Start of the current week (Monday 00:00 local).
      const now = new Date()
      const day = (now.getDay() + 6) % 7            // Mon=0 … Sun=6
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      const { data, error } = await supabase
        .from('runs')
        .select('maps_cleared')
        .eq('user_id', user.id)
        .gte('created_at', weekStart.toISOString())
      if (cancelled) return
      if (error || !data) { setMaps(null); return }
      setMaps(data.reduce((s, r) => s + (r.maps_cleared ?? 0), 0))
    })()
    return () => { cancelled = true }
  }, [])

  if (maps === null) return null

  return (
    <span style={{
      fontFamily: 'Orange Kid', fontSize: '16px',
      color: dark ? '#e5e5e5' : '#f5f5f5',
      textShadow: '1px 1px 0 rgba(0,0,0,0.9)',
    }}>
      This week: {maps} maps beaten
    </span>
  )
}
```

Note the `textShadow`: this text sits over artwork, not a flat panel, so it needs its own contrast.

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/menu/WeeklyStat.jsx
git commit -m "feat(menu): add WeeklyStat, the personal maps-this-week counter"
```

---

### Task 4: `CallingCard`

**Files:**
- Create: `src/components/menu/CallingCard.jsx`

**Interfaces:**
- Produces: `<CallingCard dark={bool} />` — self-loading, fixed 220px width.

**Fields:** username, total runs, best maps cleared, shiny count.

> **Deliberately four fields, not five.** The spec listed "favorite starter", but
> the starter is **never persisted**: `recordRunEnd` in `App.jsx` writes no
> starter column, and `winning_roster` only exists on wins (so losses have no
> roster, and post-swap `roster[0]` is not reliably the starter). Adding it needs
> a schema change, which is out of scope. Do not fake it from `winning_roster`.

Column names verified against the working queries in `Stats.jsx:71-98` and
`supabase/username_auth.sql:10-15`.

- [ ] **Step 1: Create the component**

Create `src/components/menu/CallingCard.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Player profile card for the desktop menu's lower-right corner.
// Every field comes from the user's OWN rows, which existing RLS already
// allows (runs_select_own / profiles_select_own).
// Renders with em-dash placeholders when signed out so the layout never
// reflows between states.
export default function CallingCard({ dark }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return

      const [{ data: profile }, { data: runs }, { data: catches }] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
        supabase.from('runs').select('maps_cleared').eq('user_id', user.id),
        supabase.from('catches').select('shiny').eq('user_id', user.id),
      ])
      if (cancelled) return

      setStats({
        username: profile?.username ?? 'Trainer',
        totalRuns: runs?.length ?? 0,
        bestMaps: (runs ?? []).reduce((m, r) => Math.max(m, r.maps_cleared ?? 0), 0),
        shinies: (catches ?? []).filter(c => c.shiny).length,
      })
    })()
    return () => { cancelled = true }
  }, [])

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'
  const rows = [
    ['RUNS',  stats ? stats.totalRuns : '—'],
    ['BEST',  stats ? `${stats.bestMaps} maps` : '—'],
    ['SHINY', stats ? stats.shinies : '—'],
  ]

  return (
    <div style={{
      width: '220px',
      border: borderStyle,
      boxShadow: shadowStyle,
      backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
    }}>
      <div style={{ backgroundColor: '#facc15', padding: '3px 10px', display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a' }}>
          {stats ? stats.username.toUpperCase() : 'NOT SIGNED IN'}
        </span>
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: dark ? '#888' : '#666' }}>{label}</span>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: dark ? '#e5e5e5' : '#1a1a1a' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/menu/CallingCard.jsx
git commit -m "feat(menu): add CallingCard profile panel"
```

---

### Task 5: The desktop layout

**Files:**
- Modify: `src/components/MainMenu.jsx`

**Interfaces:**
- Consumes: `MenuButton` (Task 2), `WeeklyStat` (Task 3), `CallingCard` (Task 4), `useIsDesktop` from `src/lib/useIsDesktop.js`.

- [ ] **Step 1: Add the imports and the hook**

At the top of `MainMenu.jsx`:

```jsx
import { useIsDesktop } from '../lib/useIsDesktop'
import WeeklyStat from './menu/WeeklyStat'
import CallingCard from './menu/CallingCard'
```

Inside the component, beside the existing `const { dark } = useTheme()`:

```jsx
  const isDesktop = useIsDesktop()
```

- [ ] **Step 2: Extract the existing mobile column into a variable**

Wrap the current outer `<div>` (the one with `flex: 1, minHeight: 0, overflowY: 'auto'`) in a `const mobileLayout = (...)`, leaving its contents untouched.

- [ ] **Step 3: Build the desktop layout**

Add below it:

```jsx
  // Desktop: the artwork is the hero. fullArtwork.webp is MIRRORED
  // (scaleX(-1)) because every subject in the original sits on the left —
  // unmirrored, the logo and buttons would cover Pikachu and the whole group.
  // Flipped, the night sky lands under the column and the cluster reads
  // left-to-right on the right-hand side.
  const desktopLayout = (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <img
        src="/fullArtwork.webp"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          transform: 'scaleX(-1)',
          pointerEvents: 'none',
        }}
      />
      {/* Readability scrim: `cover` crops differently per aspect ratio, so on
          wide viewports the bright hillside can creep under the column. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to right, rgba(0,0,0,0.55), transparent 45%)',
      }} />

      <div style={{
        position: 'relative', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '32px 40px', overflowY: 'auto',
      }}>
        {/* Upper-left: logo + button stack over the night sky */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
          <img src={speedmonLogo} alt="Speedmon" style={{ width: '320px', height: 'auto', display: 'block' }} />
          {buttonDefs.map(def => (
            <MenuButton key={def.id} def={def} dark={dark} />
          ))}
          <div style={{ width: '320px', display: 'flex', gap: '8px' }}>
            {halfDefs.map(def => (
              <MenuButton key={def.id} def={def} dark={dark} style={{ flex: 1, width: 'auto' }} />
            ))}
          </div>
        </div>

        {/* Bottom row: weekly stat left, calling card right */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <WeeklyStat dark={dark} />
            <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: dark ? '#888' : '#ccc', textShadow: '1px 1px 0 rgba(0,0,0,0.9)' }}>
              v1.0
            </span>
          </div>
          <CallingCard dark={dark} />
        </div>
      </div>
    </div>
  )
```

- [ ] **Step 4: Branch inside `Layout`**

Replace the `<Layout ...>` body with:

```jsx
      {isDesktop ? desktopLayout : mobileLayout}
```

`LoginForm` is already rendered *inside* the mobile column (`MainMenu.jsx:156`),
so wrapping that column into `mobileLayout` in Step 2 carries it along
automatically. Do **not** add a second `<LoginForm>` call. Desktop deliberately
shows no auth card in this task — signed-out desktop users get the calling
card's "NOT SIGNED IN" state instead.

- [ ] **Step 5: Verify both layouts**

```bash
npm run lint
npm run build
npm run dev
```

Check in the browser:
- **375px** — mobile column identical to before.
- **1024px, 1440px, and ~2560px** — logo and buttons legible over the sky; the center hillside is not covered; the calling card is not clipped.
- **768×600** — nothing clipped, page scrolls.

- [ ] **Step 6: Commit**

```bash
git add src/components/MainMenu.jsx
git commit -m "feat(menu): desktop main menu over mirrored fullArtwork background"
```

---

### Task 6: Desktop sign-in route

Task 5 leaves desktop with **no way to sign in**: `LoginForm` lives inside the
mobile column, so a signed-out desktop user sees "NOT SIGNED IN" on the calling
card with no route to fix it. That is a functional regression against the
current build, where the form is always reachable.

**Files:**
- Modify: `src/components/MainMenu.jsx`

- [ ] **Step 1: Render the auth card under the calling card when signed out**

In `desktopLayout`, replace `<CallingCard dark={dark} />` with:

```jsx
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
            <CallingCard dark={dark} />
            {!loggedIn && <LoginForm onAuthSuccess={onPlay} />}
          </div>
```

`loggedIn` is already tracked in `MainMenu.jsx` via the existing
`supabase.auth.onAuthStateChange` effect — no new state is needed.

- [ ] **Step 2: Verify both states at 1440px**

Signed out: the login card appears under the calling card, which reads
"NOT SIGNED IN". Sign in: the form disappears and the card fills with real
values without the layout jumping.

Then confirm the bottom row still fits at **768×600** with the form open —
if it overflows, the container's `overflowY: 'auto'` (Task 5) must let it
scroll rather than clip.

- [ ] **Step 3: Commit**

```bash
git add src/components/MainMenu.jsx
git commit -m "feat(menu): reachable sign-in on the desktop main menu"
```

---

### Task 7: Mockup review checkpoint

**This task is a stop, not code.** The spec fixes button sizing at 320×40 as a
placeholder pending visual review. It runs last so the screenshots show the
finished screen, auth card included.

- [ ] **Step 1: Screenshot the desktop menu at 1440px**

Run `npm run dev`, open at 1440px wide, in both light and dark theme, and in
both signed-in and signed-out states.

- [ ] **Step 2: Present the screenshots and ask whether button sizing, logo size, and card placement should change**

Do not proceed past this step without an answer. If changes are requested, they
are made in `buttonDefs` / `MenuButton`'s default style — one place, per the
Global Constraints.

- [ ] **Step 3: Apply any requested adjustments and commit**

```bash
git add -A
git commit -m "style(menu): desktop sizing adjustments from mockup review"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Background, mirrored | Task 1 (asset), Task 5 (`scaleX(-1)`, scrim) |
| §2 Layout regions | Task 5 |
| §3 Button sizing unchanged | Task 2 (`MenuButton` defaults), Task 7 (review gate) |
| §4 Components + shared definition | Tasks 2, 3, 4 |
| §5 Data, own-rows only, empty states | Tasks 3, 4 |
| Risk 1 readability | Task 5 scrim + Step 5 three-width check |
| Risk 2 bundle weight | Task 1 |
| Risk 3 short viewports | Task 5 Step 5 (768×600) |
| Verification 1–5 | Task 2 Step 5, Task 5 Step 5 |
| Auth reachable on desktop | Task 6 |

**Deviation from spec:** the calling card ships **four** fields, not five —
"favorite starter" is not derivable from current data (documented in Task 4).

**Type consistency:** `def` shape is defined once in Task 2 and consumed
identically in Task 5. `dark` is the only prop on `WeeklyStat` and `CallingCard`.
Asset path is `/fullArtwork.webp` in both Task 1 and Task 5.
