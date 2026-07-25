# Desktop In-Menu Region Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On desktop, let the player pick a region inside the main menu — the background art, logo, and corner furniture stay mounted while only the button column changes.

**Architecture:** `MainMenu` gains local `mode: 'menu' | 'region'` state. Desktop PLAY sets `mode` instead of changing screens. A new `RegionBar` component renders each region as a 320×56 bar in the same styling language as `MenuButton`. Region data moves to a shared module so `RegionSelect` and `RegionBar` cannot drift. Mobile keeps the existing screen swap entirely.

**Tech Stack:** React 19, Vite, Supabase JS v2. Layout is inline styles (this codebase's convention); Tailwind classes only for hover/active transitions.

## Global Constraints

- **Desktop breakpoint is 768px**, from `useIsDesktop()` in `src/lib/useIsDesktop.js`. No second breakpoint, no media queries.
- **The mobile path must not change at all.** Mobile PLAY still calls `onPlay()` → `setScreen('region')` → the existing `RegionSelect`. `mode` state must never affect the mobile branch.
- **Menu bars stay 320px × 40px. Region bars are 320px × 56px.** The extra height exists so starter sprites render at ~44px.
- **Styling language is fixed:** `borderStyle` = `dark ? '2px solid #121212' : '2px solid #2e2e2e'`; `shadowStyle` = `dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'`; `bevel` = `` `${shadowStyle}, inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)` ``. Fonts: `Upheaval` (bars/headings), `Orange Kid` (small text). Accent yellow is `#facc15`.
- **No SQL, no new Supabase policies, no RPCs.**
- **No test framework exists in this project.** Verification is `npm run lint`, `npm run build`, and visual inspection. Do not add a test runner or write test files.
- **Do not run `npm run dev`** in an automated context — it starts a long-lived server.
- The repo has ~43 **pre-existing** lint errors in unrelated files (`settings.jsx`, `theme.jsx`, others). Only files this plan touches must be clean.
- **Commit after every task.** Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/game/regions/regionList.js` | Shared region metadata (name, gen, map image, legendaries) — new |
| `src/components/RegionSelect.jsx` | Imports the shared list instead of declaring it |
| `src/components/menu/RegionBar.jsx` | One 320×56 region bar — new |
| `src/components/MainMenu.jsx` | `mode` state, region-mode column, bottom row |
| `src/App.jsx` | Forwards `onSelectRegion` / `onCustomSeed` to `MainMenu` |

---

### Task 1: Extract the shared region list

`REGIONS` is declared inside `RegionSelect.jsx:18-24`. `RegionBar` needs the same data. Duplicating it guarantees drift the first time a region is added, so it moves to a shared module first.

**Files:**
- Create: `src/game/regions/regionList.js`
- Modify: `src/components/RegionSelect.jsx:9-24`

**Interfaces:**
- Produces: `export const REGIONS` — an array of
  `{ name: string, gen: string, map: string, legendaries: [number, number] }`.
  Also `export const SPRITE = id => string`.

- [ ] **Step 1: Create the shared module**

Create `src/game/regions/regionList.js`:

```js
// Shared region metadata. Lives here rather than inside RegionSelect because
// the desktop main menu's RegionBar renders the same five regions — two copies
// would drift the first time a region is added.
//
// Card-background thumbnails (800px JPEG) — the full-res source PNGs were
// 0.8–8.3 MB each and only ever render blurred/darkened, so they were
// downscaled + recompressed (~14 MB → ~1 MB total).
import KantoMap from '../../assets/regions/KantoMap.jpg'
import JohtoMap from '../../assets/regions/JohtoMap.jpg'
import HoennMap from '../../assets/regions/HoennMap.jpg'
import SinnohMap from '../../assets/regions/SinnohMap.jpg'
import UnovaMap from '../../assets/regions/UnovaMap.jpg'

// PokéAPI sprite CDN. Matches the existing region screen's behavior.
export const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

export const REGIONS = [
  { name: 'Kanto',  gen: 'Gen 1', map: KantoMap,  legendaries: [150, 151] }, // Mewtwo, Mew
  { name: 'Johto',  gen: 'Gen 2', map: JohtoMap,  legendaries: [249, 250] }, // Lugia, Ho-Oh
  { name: 'Hoenn',  gen: 'Gen 3', map: HoennMap,  legendaries: [382, 383] }, // Kyogre, Groudon
  { name: 'Sinnoh', gen: 'Gen 4', map: SinnohMap, legendaries: [483, 484] }, // Dialga, Palkia
  { name: 'Unova',  gen: 'Gen 5', map: UnovaMap,  legendaries: [643, 644] }, // Reshiram, Zekrom
]
```

Note the `starters` key is deliberately dropped: starter ids already live in
`REGION_STARTERS` in `src/game/starters.js`, and `RegionSelect` never used the
`starters` field (it renders `legendaries`). Keeping a second copy would be the
same drift problem this task exists to remove.

- [ ] **Step 2: Point `RegionSelect` at the shared module**

In `src/components/RegionSelect.jsx`, delete the five `import ...Map from '../assets/regions/...'` lines (currently 9-13), the `SPRITE` const (16), and the whole `REGIONS` array (18-24). Replace with:

```js
import { REGIONS, SPRITE } from '../game/regions/regionList'
```

Keep the `DayBattleBackground` import — `ComingSoonCell` still uses it.

- [ ] **Step 3: Verify nothing else referenced the removed names**

Run: `grep -n "starters" src/components/RegionSelect.jsx`
Expected: no output (the file renders `legendaries`, not `starters`).

Then: `npx eslint src/components/RegionSelect.jsx src/game/regions/regionList.js`
Expected: clean.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds. The region screen is unchanged in behavior — this is a pure move.

- [ ] **Step 5: Commit**

```bash
git add src/game/regions/regionList.js src/components/RegionSelect.jsx
git commit -m "refactor: extract shared region list out of RegionSelect

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `RegionBar`

**Files:**
- Create: `src/components/menu/RegionBar.jsx`

**Interfaces:**
- Consumes: `REGIONS` / `SPRITE` (Task 1), `REGION_STARTERS` from `src/game/starters.js`, `getRegionConfig` from `src/game/regionRegistry`.
- Produces: `<RegionBar region={regionObj} dark={bool} onSelect={fn} />` where `regionObj` is one entry from `REGIONS`. `onSelect` is called with the region object, and only when the region is available.

- [ ] **Step 1: Create the component**

Create `src/components/menu/RegionBar.jsx`:

```jsx
import { getRegionConfig } from '../../game/regionRegistry'
import { REGION_STARTERS } from '../../game/starters'
import { SPRITE } from '../../game/regions/regionList'

// One region as a 320x56 bar for the desktop main menu's region mode.
// Same border/bevel language as MenuButton so the column reads as one family;
// taller than a menu bar (40px) so the three starter sprites stay legible.
export default function RegionBar({ region, dark, onSelect }) {
  // A region is playable only if its config has authored maps — the others
  // would crash at config.maps[0] when a run starts. Same gate as RegionSelect.
  const available = (getRegionConfig(region.name)?.maps?.length ?? 0) > 0
  const starters = REGION_STARTERS[region.name] ?? []

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  const bevel = `${shadowStyle}, inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)`

  return (
    <button
      onClick={available ? () => onSelect(region) : undefined}
      className={available ? 'relative overflow-hidden hover:scale-105 active:scale-95 transition-transform duration-150' : 'relative overflow-hidden'}
      style={{
        width: '320px', height: '56px',
        border: borderStyle,
        boxShadow: bevel,
        backgroundColor: '#1a1a1a',
        cursor: available ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 10px',
      }}
    >
      {/* Region map backdrop. Darkened harder than the region cards' 0.75
          because the name sits directly on the image here, with no scrim. */}
      <img src={region.map} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover',
        filter: available ? 'brightness(0.55)' : 'brightness(0.3) grayscale(0.5)',
      }} />

      {/* Name + gen, left-aligned */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '20px', color: '#fff', letterSpacing: '1px', textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95)' }}>
          {region.name.toUpperCase()}
        </span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#facc15', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
          {region.gen}
        </span>
      </div>

      {/* Starters, right-aligned — or COMING SOON for unauthored regions */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '2px' }}>
        {available ? starters.map(id => (
          <img key={id} src={SPRITE(id)} alt="" style={{
            width: '44px', height: '44px', objectFit: 'contain',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.9))',
          }} />
        )) : (
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: '#facc15', letterSpacing: '1px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            COMING SOON
          </span>
        )}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx eslint src/components/menu/RegionBar.jsx && npm run build`
Expected: both clean. Nothing renders it yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/menu/RegionBar.jsx
git commit -m "feat(menu): add RegionBar, a 320x56 region row for the desktop menu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Forward the region handlers from `App.jsx`

`MainMenu` needs `onSelectRegion` and `onCustomSeed`. Both exist in `App.jsx` today as **inline closures** passed to `RegionSelect` (`App.jsx:475-499`), so they must be extracted to named functions before two components can share them.

**Files:**
- Modify: `src/App.jsx:462-503`

**Interfaces:**
- Produces: `handleSelectRegion(region)` and `handleCustomSeed(code)` — the latter returns `{ error: string }` or `{ ok: true }`. Both passed to `MainMenu` and `RegionSelect`.

- [ ] **Step 1: Extract the two closures to named functions**

In `src/App.jsx`, above the `return (`, add:

```jsx
  // Shared by RegionSelect (mobile) and MainMenu's desktop region mode.
  function handleSelectRegion(region) {
    setRunSeed(null)        // normal run
    setRunMode('normal')
    setSelectedRegion(region)
    const config = getRegionConfig(region.name)
    if (config) prewarmCache(config)
    setScreen('starter')
  }

  function handleCustomSeed(code) {
    const decoded = decodeSeed(code)
    if (!decoded) return { error: 'Invalid seed' }
    // Match the decoded REGION against the playable region list — the
    // single source of truth (regionRegistry), so this never drifts
    // from what RegionSelect shows as playable.
    const region = regionNames({ playableOnly: true })
      .find(n => n.toUpperCase() === decoded.region)
    if (!region) return { error: 'Unknown region' }
    // decoded.code is already the normalized canonical string.
    setRunSeed({ region, seed: decoded.seed, code: decoded.code })
    setRunMode('custom')
    setSelectedRegion({ name: region })
    prewarmCache(getRegionConfig(region))
    setScreen('starter')
    return { ok: true }
  }
```

- [ ] **Step 2: Point `RegionSelect` at the named functions**

Replace the inline `onSelectRegion={region => {...}}` and `onCustomSeed={code => {...}}` props on `<RegionSelect>` with:

```jsx
          onSelectRegion={handleSelectRegion}
          onCustomSeed={handleCustomSeed}
```

- [ ] **Step 3: Pass them to `MainMenu`**

Add two props to the `<MainMenu>` element (`App.jsx:463-470`):

```jsx
          onSelectRegion={handleSelectRegion}
          onCustomSeed={handleCustomSeed}
```

- [ ] **Step 4: Verify the mobile path is untouched**

Run: `npx eslint src/App.jsx && npm run build`
Expected: clean.

This is a pure extraction — `RegionSelect` receives functions with identical bodies. Confirm by reading the diff that no logic inside either function changed.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: extract region handlers so the desktop menu can share them

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Region mode in `MainMenu`

**Files:**
- Modify: `src/components/MainMenu.jsx`

**Interfaces:**
- Consumes: `RegionBar` (Task 2), `REGIONS` (Task 1), the `onSelectRegion` / `onCustomSeed` props (Task 3), and the existing `MenuButton` / `buttonDefs` / `halfDefs`.

- [ ] **Step 1: Add imports, props, and state**

Add to the imports:

```jsx
import RegionBar from './menu/RegionBar'
import { REGIONS } from '../game/regions/regionList'
```

Add `onSelectRegion` and `onCustomSeed` to the destructured props in the function signature.

Add beside the existing state:

```jsx
  // Desktop only: 'region' swaps the button column in place instead of
  // changing screens, so the background art and logo never unmount.
  const [mode, setMode] = useState('menu')
  const [seedInput, setSeedInput] = useState('')
  const [seedError, setSeedError] = useState(null)
```

- [ ] **Step 2: Make desktop PLAY enter region mode**

`buttonDefs` currently has `onClick: onPlay` for the play entry. Change ONLY that entry's `onClick` to:

```jsx
      onClick: () => (isDesktop ? setMode('region') : onPlay()),
```

Mobile still calls `onPlay()` exactly as before.

- [ ] **Step 3: Reset mode on Home**

The `<Layout>` element's `onHome` is currently `() => setPokedexOpen(false)`. Change it to:

```jsx
    <Layout onHome={() => { setPokedexOpen(false); setMode('menu') }} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter statsOpen={statsOpen} setStatsOpen={setStatsOpen}>
```

Without this, leaving and returning to the menu strands the player on a stale region list.

- [ ] **Step 4: Build the region-mode column**

Add a `regionColumn` const beside `desktopLayout`'s definition:

```jsx
  // Region mode's column: Daily moves up into PLAY's slot, the five regions
  // become bars, and Back + the seed input share one row like DEX/STATS.
  const dailyDef = buttonDefs.find(d => d.id === 'daily')
  const regionColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
      <img src={speedmonLogo} alt="Speedmon" style={{ width: '320px', height: 'auto', display: 'block' }} />
      {dailyDef && <MenuButton def={dailyDef} dark={dark} />}
      {REGIONS.map(region => (
        <RegionBar key={region.name} region={region} dark={dark} onSelect={onSelectRegion} />
      ))}
      <div style={{ width: '320px', display: 'flex', gap: '8px' }}>
        <MenuButton
          def={{ id: 'back', label: 'BACK', background: '#6b7280', color: '#fff', fontSize: '16px', onClick: () => setMode('menu') }}
          dark={dark}
          style={{ flex: 1, width: 'auto' }}
        />
        <input
          value={seedInput}
          onChange={e => { setSeedInput(e.target.value); setSeedError(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const res = onCustomSeed?.(seedInput)
              if (res?.error) setSeedError(res.error)
            }
          }}
          placeholder="KANTO-7Q2"
          style={{
            flex: 1, height: '40px', minWidth: 0,
            fontFamily: 'Orange Kid', fontSize: '14px', padding: '6px 8px',
            textTransform: 'uppercase', textAlign: 'center',
            border: dark ? '2px solid #121212' : '2px solid #2e2e2e',
            backgroundColor: dark ? '#1a1a1a' : '#fff',
            color: dark ? '#DBDBDB' : '#333333',
          }}
        />
      </div>
      {/* Error sits BELOW the row so an invalid seed never resizes the column. */}
      {seedError && (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444', textShadow: '1px 1px 0 rgba(0,0,0,0.9)' }}>
          {seedError}
        </span>
      )}
    </div>
  )
```

- [ ] **Step 5: Swap the column inside `desktopLayout`**

In `desktopLayout`, the upper-left block currently renders the logo, `buttonDefs.map`, and the `halfDefs` row inside one `<div>`. Replace that entire `<div>` with:

```jsx
        {mode === 'region' ? regionColumn : (
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
        )}
```

- [ ] **Step 6: Verify**

Run: `npx eslint src/components/MainMenu.jsx && npm run build`
Expected: both clean.

Then confirm by reading the diff:
- `mobileLayout` is completely untouched.
- The only change to `buttonDefs` is the play entry's `onClick`.
- Exactly one `<LoginForm>` remains in `mobileLayout` and one in `desktopLayout`.

- [ ] **Step 7: Commit**

```bash
git add src/components/MainMenu.jsx
git commit -m "feat(menu): desktop region selection inside the main menu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Visual review checkpoint

**This task is a stop, not code.**

- [ ] **Step 1: Run the app and check both breakpoints**

`npm run dev`, then verify at 1440px:
1. PLAY swaps the column in place — the logo and background do **not** flicker or move.
2. Region bars align with the column; name left, starters right, ~44px sprites.
3. Unavailable regions are greyed and unclickable, showing COMING SOON.
4. An invalid seed shows its error without shifting the column.
5. BACK returns to the main menu; Home does too.

Then at 375px: PLAY still navigates to the **old** `RegionSelect` screen, unchanged.

- [ ] **Step 2: Present findings and apply any adjustments**

Sizing changes land in `RegionBar`'s style block — one place.

- [ ] **Step 3: Commit any adjustments**

```bash
git add -A
git commit -m "style(menu): region bar adjustments from visual review

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 In-menu mode, not a screen | Task 4 (Steps 1-2, 5) |
| §2 Column in region mode | Task 4 (Step 4) |
| §3 The region bar | Task 2 |
| §4 Bottom row (Back + seed, error below) | Task 4 (Step 4) |
| §5 Shared region data | Task 1 |
| §6 Wiring | Task 3 |
| Risk 1 mobile regression | Task 4 Step 6, Task 5 Step 1 |
| Risk 2 escape hatch | Task 4 Step 3 |
| Risk 3 sprite pop-in | Accepted; no task |
| Verification 1-7 | Task 4 Step 6, Task 5 Step 1 |

**Note on §5:** the spec says the shared list holds "name, gen, map image, and
legendaries". Task 1 drops the unused `starters` key that exists in the current
`RegionSelect` array, because starter ids are already canonical in
`REGION_STARTERS` — keeping both would reintroduce the drift this task removes.
`RegionSelect` renders `legendaries` and never read `starters`.

**Type consistency:** `REGIONS` entries are `{ name, gen, map, legendaries }` in
Task 1 and consumed as such in Tasks 2 and 4. `RegionBar` takes
`{ region, dark, onSelect }` in Task 2 and is called with exactly those in Task
4. `handleCustomSeed` returns `{ error }` / `{ ok }` in Task 3 and is checked for
`res?.error` in Task 4.
