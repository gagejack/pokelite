# Account Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An account level derived from lifetime Speed Cash earned, shown on the Stats page, the desktop calling card, and the Daily Seed leaderboard.

**Architecture:** A pure leaf module (`src/game/level.js`) turns an XP number into a level plus progress. XP is `SUM(runs.speed_cash_earned)` — derived on read, never stored, so there is no migration for the two own-data surfaces. The leaderboard shows *other* players, whose runs RLS forbids reading, so it goes through one `SECURITY DEFINER` RPC that returns an aggregate XP integer per user. A shared `LevelBar` component renders progress on the two surfaces that show it.

**Tech Stack:** React 19, Vite, Supabase JS v2, inline `style={{}}` for layout (Tailwind classes only for `hover:`/`transition:` — this codebase's convention), no test framework.

## Global Constraints

Copy these verbatim; every task inherits them.

- **XP = `SUM(runs.speed_cash_earned)` for the user.** Not a multiple, not a separate stat. Only *earned* counts — purchases never reduce it.
- **Curve:** leaving level *n* costs `n × 100` XP. `xpToReach(L) = 100 × L(L-1)/2`. Level 1 is the starting state at **0 XP** — a new account is level 1, never level 0.
- **`MAX_LEVEL = 100`**, total 495,000 XP. Level 100 is terminal: `xpForNext` is `0` and `progress` is `1` there, so no consumer divides by zero.
- **Numbers live in `src/game/balance.js`** under a new `levels` block. No gameplay number hardcoded in a component.
- **`level.js` is a LEAF module** — it imports `balance.js` and nothing else. No React, no Supabase, no rng.
- **No `xp` column and no `level` column.** Level is derived on read everywhere.
- **Never render Upheaval or Orange Kid below 12px** — they are pixel display faces that stop resolving (see `docs/UI_TOUCHUPS.md`). The one exception already in the codebase is `Stats.jsx`'s 9px tile labels; match that file's existing pattern rather than "fixing" it.
- **Muted text uses `muted(dark)`** from `src/lib/colors.js`. Never re-declare `dark ? '#888' : '#777'`.
- **The level renders as `LV 16`** — uppercase, one space, no padding — on all three surfaces. One format so the same number reads the same everywhere.
- **Pre-existing lint baselines — count ERRORS, not eslint's bundled "N problems" total** (which includes warnings). Whole repo: **43 errors, 5 warnings**. Per file: `Stats.jsx` 9, `Roster.jsx` 3, `App.jsx` 1, `NodeMap.jsx` 3, `BattleCard.jsx` 18, `DailyChallenge.jsx` 2. Do not let these grow and do not "fix" them.
- **`react-hooks/static-components` fires once per `<Stat>` call site** in `Stats.jsx`. A new `<Stat>` grows that file's baseline, which is why the Speed Cash tile at `Stats.jsx:282` is inlined. Follow that precedent.
- **Verification is `npm run lint`, `npm run build`, and a Node check of the pure module.** No test framework exists; never add one.
- **Commit after every task** with the message given in that task's final step.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/game/level.js` | Pure: XP → level + progress. Nothing else. |
| `src/components/LevelBar.jsx` | The XP progress bar, shared by two surfaces. |
| `supabase/user_levels.sql` | The `SECURITY DEFINER` aggregate RPC. |

**Modified:**

| File | Change |
|---|---|
| `src/game/balance.js` | New `levels` block. |
| `src/lib/colors.js` | `STAT_BAR_LIGHT`/`STAT_BAR_DARK` + `twoTone` move here from Roster. |
| `src/components/Roster.jsx` | Import those four from `colors.js` instead of declaring them. |
| `src/components/Stats.jsx` | Level tile (inlined) + XP bar under the grid. |
| `src/components/menu/CallingCard.jsx` | Level in the header, bar below it, one column added to its query. |
| `src/lib/daily.js` | `getLeaderboard` calls the RPC and attaches `xp` per row. |
| `src/components/DailyChallenge.jsx` | `LV n` badge left of each username. |

**No documentation task.** `docs/ITEMS.md` is an item reference — its own header
says so, and levels are not an item. The design spec
(`docs/superpowers/specs/2026-07-29-account-levels-design.md`) already covers the
curve, the derivation, and the RPC in more depth than a reference entry would,
and `level.js` and `balance.js` carry the arithmetic in comments. A second prose
copy of the same numbers is a thing that drifts — which is exactly why ITEMS.md
exists in the first place (see its header note about `docs/DESIGN.md`).

---

## Task 1: The curve module

Pure arithmetic, no consumers yet. Everything downstream depends on these exact names.

**Files:**
- Modify: `src/game/balance.js`
- Create: `src/game/level.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```js
  export const MAX_LEVEL           // 100, read from BALANCE.levels.maxLevel
  export function xpToReach(level)  // total XP required to reach `level`
  export function levelForXp(xp)    // { level, xpIntoLevel, xpForNext, progress }
  ```
  `levelForXp` returns everything a display needs so no consumer re-derives thresholds:
  - `level` — 1..MAX_LEVEL, clamped both ends
  - `xpIntoLevel` — XP earned past the current level's threshold
  - `xpForNext` — the current level's step cost; **`0` at MAX_LEVEL**
  - `progress` — 0..1 toward the next level; **`1` at MAX_LEVEL**

  **Remaining XP is `xpForNext - xpIntoLevel`, computed by the caller.** It is deliberately not returned — one derived field is enough, and returning both invites picking the wrong one (see Task 4).

  Task 3 adds one more export to this same file:
  ```js
  export function sumSpeedCashEarned(rows)  // rows from `runs` -> total XP
  ```
  It lives here beside the curve because both surfaces that sum the column need
  the identical reduce, and the spec's §6 says the sum moves to one place as
  soon as a second consumer exists. Task 4 is that second consumer.

- [ ] **Step 1: Add the balance block**

In `src/game/balance.js`, insert immediately **after** the closing `},` of the `pokemon:` block and **before** the `// ── XP / level rewards` comment:

```js
  // ── Account levels (game/level.js) ───────────────────────────────────────
  // Lifetime XP is SUM(runs.speed_cash_earned) — the same number the Stats
  // page already shows. Leaving level n costs n * xpPerLevelStep, so total XP
  // to reach level L is step * L(L-1)/2.
  //
  // At 100: level 2 costs 100, level 50 sits at 122,500, level 100 at 495,000
  // (~216 winning runs at ~$2,300 a win). Tuned so every finished run levels a
  // new player up — even a first-map death earns ~$296 and clears level 2 —
  // because a progression number has to move on the first run to be believed.
  //
  // This multiplier scales every threshold linearly, so it is the one knob to
  // turn if pacing needs work. Do not reshape the curve.
  levels: { maxLevel: 100, xpPerLevelStep: 100 },
```

- [ ] **Step 2: Write `src/game/level.js`**

```js
// Account level derivation (see docs/superpowers/specs/2026-07-29-account-levels-design.md).
//
// LEAF module: imports only balance.js, so the threshold arithmetic — where an
// off-by-one is the likeliest defect in this feature — is Node-testable in
// isolation. No React, no Supabase, no rng.
//
// XP is lifetime Speed Cash earned. There is no xp column and no level column:
// level is a pure function of a number that already exists, so retuning a
// payout or deleting a run recomputes correctly instead of drifting from a
// stale counter.
import { BALANCE } from './balance.js'

export const MAX_LEVEL = BALANCE.levels.maxLevel
const STEP = BALANCE.levels.xpPerLevelStep

// Total XP required to REACH `level`. Level 1 is the starting state, so it
// requires 0 — a new account is level 1, never level 0.
//   xpToReach(1) = 0, xpToReach(2) = STEP, xpToReach(100) = STEP * 4950
export function xpToReach(level) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  return STEP * L * (L - 1) / 2
}

// Everything a display needs from one call, so no consumer re-derives a
// threshold and no two surfaces can disagree about the same XP.
//
// Non-numeric, negative, and absurdly large inputs all resolve rather than
// throw: this reads a summed database column, and a null from an empty table
// must render as level 1, not crash the Stats page.
export function levelForXp(xp) {
  const total = Number.isFinite(Number(xp)) ? Math.max(0, Number(xp)) : 0

  let level = 1
  while (level < MAX_LEVEL && xpToReach(level + 1) <= total) level++

  const xpIntoLevel = total - xpToReach(level)
  // At the cap there is no next level: report a full bar and a zero cost so a
  // progress consumer neither divides by zero nor renders an empty bar for a
  // maxed account. XP past the cap is retained in the sum but grants nothing.
  const atMax = level >= MAX_LEVEL
  const xpForNext = atMax ? 0 : STEP * level

  return {
    level,
    xpIntoLevel: atMax ? 0 : xpIntoLevel,
    xpForNext,
    progress: atMax ? 1 : xpIntoLevel / xpForNext,
  }
}
```

- [ ] **Step 3: Verify the arithmetic**

Write this to a scratch file and run it with `node`. It covers verification items 2–9 from the spec, and the loop at the end is the one that matters: it catches every off-by-one in a single pass.

```js
// scratch: verify-levels.mjs
import { levelForXp, xpToReach, MAX_LEVEL } from './src/game/level.js'

let fails = 0
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} = ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`)
}

chk('MAX_LEVEL', MAX_LEVEL, 100)
chk('f(0).level', levelForXp(0).level, 1)
chk('f(0).progress', levelForXp(0).progress, 0)
chk('f(99).level', levelForXp(99).level, 1)
chk('f(100).level', levelForXp(100).level, 2)
chk('f(999).level', levelForXp(999).level, 4)
chk('f(1000).level', levelForXp(1000).level, 5)
chk('xpToReach(100)', xpToReach(100), 495000)
chk('f(495000).level', levelForXp(495000).level, 100)
chk('f(495000).xpForNext', levelForXp(495000).xpForNext, 0)
chk('f(495000).progress', levelForXp(495000).progress, 1)
chk('f(1e9).level', levelForXp(1e9).level, 100)
chk('f(-5).level', levelForXp(-5).level, 1)
chk('f(null).level', levelForXp(null).level, 1)
chk('f(undefined).level', levelForXp(undefined).level, 1)
chk('f("abc").level', levelForXp('abc').level, 1)

// The real test: every threshold lands exactly, and one XP below lands one
// level lower.
let roundTrip = true
for (let n = 1; n <= MAX_LEVEL; n++) {
  if (levelForXp(xpToReach(n)).level !== n) roundTrip = false
  if (n > 1 && levelForXp(xpToReach(n) - 1).level !== n - 1) roundTrip = false
}
chk('round-trip 1..100', roundTrip, true)

// The real recorded total at time of writing: 12,740 lifetime cash.
const real = levelForXp(12740)
chk('12740 -> level 16', real.level, 16)
chk('12740 -> 740 into level', real.xpIntoLevel, 740)
chk('12740 -> 1600 step', real.xpForNext, 1600)
chk('12740 -> 860 remaining', real.xpForNext - real.xpIntoLevel, 860)

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
```

Run: `node verify-levels.mjs`
Expected: every line `PASS`, then `ALL PASS`, exit 0.

Delete the scratch file after it passes — this repo has no test directory and a stray `.mjs` at the root would be confusing.

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: `level.js` and `balance.js` report zero errors; repo total stays 43 errors / 5 warnings; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/game/balance.js src/game/level.js
git commit -m "feat(levels): add the account level curve"
```

---

## Task 2: Share the bar tokens, then build the bar

`twoTone` and the two stat-bar colors are module-private in `Roster.jsx`. Two new surfaces need them, so they move to `colors.js` first, then `LevelBar` consumes them.

**Files:**
- Modify: `src/lib/colors.js`
- Modify: `src/components/Roster.jsx:10-18`
- Create: `src/components/LevelBar.jsx`

**Interfaces:**
- Consumes: `levelForXp` from Task 1 (only its `progress` field; `LevelBar` takes a number, not the object).
- Produces:
  ```js
  // src/lib/colors.js
  export function twoTone(light, dark)   // 50/50 hard-split linear-gradient string
  export const STAT_BAR_LIGHT            // '#6890F0'
  export const STAT_BAR_DARK             // '#3b5aa8'

  // src/components/LevelBar.jsx
  export default function LevelBar({ progress, dark, height = '6px' })
  ```
  `progress` is `0..1`. Values outside that clamp. `LevelBar` renders only the bar — no label, no level number — so each surface can caption it differently.

- [ ] **Step 1: Move the tokens into `colors.js`**

Append to `src/lib/colors.js`:

```js
// Two-tone bar fill: the light shade on the top half, a darker shade of the
// same hue on the bottom half (hard 50/50 split). Shared by the roster stat
// bars and the account-level XP bar so both read as the same object.
// Lived in Roster.jsx's module scope until the level bar needed it too.
export function twoTone(light, dark) {
  return `linear-gradient(to bottom, ${light} 0%, ${light} 50%, ${dark} 50%, ${dark} 100%)`
}

// The stat bars' blue and its darker partner shade.
export const STAT_BAR_LIGHT = '#6890F0'
export const STAT_BAR_DARK = '#3b5aa8'
```

- [ ] **Step 2: Point Roster at the shared copy**

In `src/components/Roster.jsx`, change the colors import (line 3) to:

```js
import { muted, twoTone, STAT_BAR_LIGHT, STAT_BAR_DARK } from '../lib/colors'
```

Then **delete** the local `twoTone` function (lines 10-13) and the two `STAT_BAR_*` consts (lines 17-18). **Keep `HP_DARK`** (line 16) — it is HP-specific and has no second consumer.

The comment above the deleted `twoTone` explains the 50/50 split; it moved to `colors.js` in Step 1, so deleting it here is correct rather than a lost note.

- [ ] **Step 3: Verify Roster still renders its bars**

Run: `npm run lint && npm run build`
Expected: `Roster.jsx` stays at its **3-error** baseline (three pre-existing `no-unused-vars` at lines 232 and 435 — do not fix them). Build succeeds.

Then `npm run dev`, start a run, and hover a roster Pokémon: the HP bar and the five stat bars must look exactly as before. This step is the whole risk of the token move — if the stat bars render flat instead of two-tone, the import is wrong.

- [ ] **Step 4: Write `src/components/LevelBar.jsx`**

```jsx
import { twoTone, STAT_BAR_LIGHT, STAT_BAR_DARK } from '../lib/colors'

// The account-level XP bar. Deliberately just the bar — no level number, no
// label — because the two surfaces that show it caption it differently: the
// Stats page prints the remaining XP beneath, the calling card prints nothing
// and lets the header's level number speak for it.
//
// Uses the same twoTone fill as the roster stat bars so progress reads as the
// same kind of object the player already knows, rather than a new widget.
export default function LevelBar({ progress, dark, height = '6px' }) {
  // Clamp rather than trust: this renders a value derived from a summed
  // database column, and a bar wider than its track is a visible bug.
  const pct = Math.max(0, Math.min(1, Number(progress) || 0)) * 100
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        width: '100%', height,
        backgroundColor: dark ? '#333' : '#aaa',
        borderRadius: '1px',
        overflow: 'hidden',
      }}
    >
      <div style={{
        height: '100%', width: `${pct}%`,
        background: twoTone(STAT_BAR_LIGHT, STAT_BAR_DARK),
        transition: 'width 0.3s',
      }} />
    </div>
  )
}
```

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: `LevelBar.jsx` reports zero errors. `LevelBar` is not rendered anywhere yet — that is Tasks 3 and 4 — so there is no visual check here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/colors.js src/components/Roster.jsx src/components/LevelBar.jsx
git commit -m "feat(levels): share the two-tone bar tokens, add LevelBar"
```

---

## Task 3: Stats page — level tile and XP bar

The first visible surface. Stats already sums `speed_cash_earned`, so this needs no query change at all.

**Files:**
- Modify: `src/components/Stats.jsx`

**Interfaces:**
- Consumes: `levelForXp` (Task 1), `LevelBar` (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Import what you need**

In `src/components/Stats.jsx`, add after the `BalanceDashboard` import (line 8):

```js
import LevelBar from './LevelBar'
import { levelForXp, sumSpeedCashEarned } from '../game/level.js'
```

- [ ] **Step 2: Derive the level beside the existing cash total**

`Stats.jsx` already computes `totalCashEarned` (around line 88). The level is a pure function of it — no new query, no new column, no extra round trip.

Find this line:

```js
      const totalCashEarned = rows.reduce((s, r) => s + (r.speed_cash_earned ?? 0), 0)
```

Add immediately after it:

```js
      // Account level is derived from that same lifetime total — XP IS the cash
      // earned, so there is nothing extra to fetch.
      const levelInfo = levelForXp(totalCashEarned)
```

**Also replace the `totalCashEarned` line itself** with a call to the shared
helper you are about to write, so the reduce exists in one place:

```js
      const totalCashEarned = sumSpeedCashEarned(rows)
```

Task 4 adds a second consumer of this exact sum, and the design says the sum
moves to a shared helper the moment that happens. Doing it now rather than after
means the two surfaces cannot drift apart on `?? 0` handling or column name.

Add to `src/game/level.js`, below `levelForXp`:

```js
// Sum lifetime XP from `runs` rows. Every caller does the same reduce over the
// same column, so it lives here beside the curve rather than being copied into
// each surface. `?? 0` covers runs recorded before speed_cash_earned existed.
export function sumSpeedCashEarned(rows) {
  return (rows ?? []).reduce((sum, r) => sum + (r.speed_cash_earned ?? 0), 0)
}
```

(Step 1's import line already brings it in.)
```

Then add `levelInfo` to the object passed to `setStats(...)` in the same function, alongside `totalCashEarned`.

- [ ] **Step 3: Add the level panel ABOVE the tile grid**

One full-width panel — level number, bar, and remaining-XP label together —
placed **before** the tile grid, as the first child of the
`<div className="flex flex-col gap-6">` at `Stats.jsx:273`.

Not a ninth tile in the grid. Three reasons, and the first is the one that
matters:

1. **The level summarizes the tiles below it.** Runs, wins, badges and catches
   are the tallies; the level is what they add up to. A summary belongs above
   its inputs, not filed as one more equal-weight cell among them.
2. **A bar wants width.** The bar has to live next to the number it belongs to,
   and a grid cell is roughly square. Full width gives the bar room and keeps
   the pairing intact.
3. **It avoids an orphan.** The grid is `repeat(4, 1fr)` on desktop
   (`Stats.jsx:274`) and holds 8 tiles today, so a ninth would sit alone on a
   third row.

```jsx
              {/* Account level — a full-width panel above the tiles, not a
                  ninth tile in them. The level is what the tallies below add
                  up to, so it reads as a summary rather than a peer; and the
                  progress bar needs width a ~square grid cell can't give it.
                  Inlined markup (not the <Stat> helper) because
                  react-hooks/static-components fires once per <Stat> call
                  site, and another call would grow this file's 9-error
                  baseline — the same reason the Speed Cash tile below is
                  inlined. */}
              <div style={{
                backgroundColor: innerBg, border: panelBorder,
                boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '28px' : '22px', color: '#facc15' }}>
                    LV {stats.levelInfo.level}
                  </span>
                  {/* The REMAINING XP (xpForNext - xpIntoLevel), not the XP
                      earned into the level. Both are on hand and mixing them
                      up is the easy mistake here — at 12,740 this reads 860,
                      not 740. */}
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>
                    {stats.levelInfo.xpForNext === 0
                      ? 'Max level'
                      : `${(stats.levelInfo.xpForNext - stats.levelInfo.xpIntoLevel).toLocaleString()} XP to level ${stats.levelInfo.level + 1}`}
                  </span>
                </div>
                <LevelBar progress={stats.levelInfo.progress} dark={dark} height="10px" />
              </div>
```

The `xpForNext === 0` branch is not decorative: at level 100 the arithmetic
would otherwise read "0 XP to level 101", which is both wrong and
unreachable-sounding.

The label sits on the same line as the level rather than under the bar, so the
panel is two rows instead of three and reads as one object.

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: `Stats.jsx` stays at its **9-error** baseline. Count ERRORS, not eslint's "N problems" total. If it reports 10, you used the `<Stat>` helper instead of inlining — fix that rather than the baseline.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, sign in, open Stats:

1. The level panel sits **above** the tile grid, spanning the full panel width.
2. Its level is consistent with the Speed Cash tile below. With 12,740 earned it reads **LV 16**.
3. The bar's fill matches the label — a level just reached reads near-empty, not near-full. (Filling from the wrong end is the classic bug here.)
4. The label reads the REMAINING XP: at 12,740 it says **"860 XP to level 17"**, not "740".
5. The tile grid below still holds 8 tiles in two clean rows of four on desktop — the level did NOT become a ninth tile leaving an orphan row.
6. Check both light and dark themes: the bar's track and fill are both visible in each.
7. Check at 375px: the panel's level and label stay on one line without wrapping, and the bar spans the panel without overflowing.

- [ ] **Step 6: Commit**

```bash
git add src/components/Stats.jsx
git commit -m "feat(levels): show level and XP progress on the Stats page"
```

---

## Task 4: Desktop calling card — level in the identity header

**Files:**
- Modify: `src/components/menu/CallingCard.jsx`

**Interfaces:**
- Consumes: `levelForXp` (Task 1), `LevelBar` (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Import and extend the query**

In `src/components/menu/CallingCard.jsx`, add after the supabase import (line 2):

```js
import LevelBar from '../LevelBar'
import { levelForXp, sumSpeedCashEarned } from '../../game/level.js'
```

Note the paths: this file is in `src/components/menu/`, so both need `../` / `../../`.

Change the runs query (line 19) to select the cash column too:

```js
        supabase.from('runs').select('maps_cleared, speed_cash_earned').eq('user_id', user.id),
```

No new request — the same query gains a column.

- [ ] **Step 2: Derive the level into state**

In the `setStats({...})` call (line 24), add one field after `shinies`:

```js
        levelInfo: levelForXp(sumSpeedCashEarned(runs)),
```

`sumSpeedCashEarned` is the shared helper Task 3 added to `level.js` — it
handles the null rows and the `?? 0` for pre-column runs. This surface and the
Stats page now sum the column through the same function, so they cannot drift.

- [ ] **Step 3: Put the level in the header band**

`RUNS`, `BEST`, and `SHINY` are things the player did; the level is what those things made them. A fourth row would bury the one number meant to summarize the others, so it goes in the yellow identity band beside the username.

Replace the header `<div>` (lines 53-57) with:

```jsx
      {/* Username and level share the identity band. The level is not a fourth
          stat row: RUNS/BEST/SHINY are things you did, and the level is what
          they made you — filing it alongside them would bury it. */}
      <div style={{
        backgroundColor: '#facc15', padding: '3px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <span style={{
          fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {stats ? stats.username.toUpperCase() : 'NOT SIGNED IN'}
        </span>
        {/* Signed out shows an em-dash like every other field, so the band's
            height and the card's layout never reflow between states. */}
        <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a', flexShrink: 0 }}>
          {stats ? `LV ${stats.levelInfo.level}` : '—'}
        </span>
      </div>
```

The username gains `overflow/ellipsis` because it now shares the band — a long name previously had the full width.

- [ ] **Step 4: Add the bar under the band**

Replace the opening tag of the rows container (line 58) so the bar sits above the rows, inside the same padded block:

```jsx
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* The only continuous element on a card otherwise made of discrete
            numbers — which is what makes the level read as momentum rather
            than one more tally. */}
        <LevelBar progress={stats?.levelInfo.progress ?? 0} dark={dark} height="4px" />
```

The rest of the rows block is unchanged. Note `stats?.levelInfo.progress ?? 0` — signed out, `stats` is null and the bar renders empty rather than crashing.

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: `CallingCard.jsx` reports zero errors; repo total stays 43. Build succeeds.

- [ ] **Step 6: Manual verification**

Run `npm run dev` on a **desktop-width** window (≥768px) — this card is desktop-only and does not render on mobile:

1. Signed in: the band shows `GAGE` and `LV 16`, and the bar below is partly filled.
2. The level matches what the Stats page shows for the same account. They come from separate code paths, so this is a real check.
3. Signed out: the band reads `NOT SIGNED IN` and `—`, the bar is empty, and **the card is exactly the same height as when signed in** — no reflow.
4. The card is 220px wide and the band does not wrap.

- [ ] **Step 7: Commit**

```bash
git add src/components/menu/CallingCard.jsx
git commit -m "feat(levels): show level on the desktop calling card"
```

---

## Task 5: The leaderboard RPC

The only migration in this feature. `runs` is `runs_select_own`, so a client can sum its own cash and nobody else's — but the leaderboard shows other players.

**Files:**
- Create: `supabase/user_levels.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a Postgres function callable as
  ```js
  supabase.rpc('user_levels', { p_user_ids: [uuid, ...] })
  // -> { data: [{ user_id: uuid, xp: number }], error }
  ```
  Returns **one aggregate integer per user**, never rows and never cash-per-run. Users with no runs are simply absent from the result — Task 6 defaults them.

- [ ] **Step 1: Write the SQL file**

Create `supabase/user_levels.sql`, matching the style of the existing files in that directory (a header comment explaining why, then idempotent statements):

```sql
-- Account levels: aggregate lifetime XP per user, for the daily leaderboard.
--
-- WHY THIS EXISTS. Level is derived from SUM(runs.speed_cash_earned), and the
-- Stats page and calling card compute it client-side from the caller's own
-- rows. The leaderboard cannot: `runs` is guarded by runs_select_own
-- (auth.uid() = user_id), and the board shows OTHER players.
--
-- So this runs as SECURITY DEFINER — it bypasses RLS deliberately. Two things
-- keep that safe:
--   1. It returns ONE AGGREGATE INTEGER per user. Never rows, never
--      cash-per-run, never anything else about a run.
--   2. `set search_path = public` is NOT optional. Without it, a caller can
--      point the search path at their own schema and hijack what `runs`
--      resolves to inside a definer function.
--
-- The client maps xp -> level through game/level.js, so the curve lives in one
-- place and retuning it needs no migration.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New
-- query). Idempotent — safe to re-run.

create or replace function public.user_levels(p_user_ids uuid[])
returns table (user_id uuid, xp bigint)
language sql
security definer
set search_path = public
as $$
  select r.user_id, coalesce(sum(r.speed_cash_earned), 0)::bigint
  from public.runs r
  where r.user_id = any(p_user_ids)
  group by r.user_id
$$;

-- Signed-in users may call it. It exposes only the aggregate above.
grant execute on function public.user_levels(uuid[]) to authenticated;
-- The leaderboard is public (daily_attempts_select_public), so a signed-out
-- visitor sees the board and should see levels on it too.
grant execute on function public.user_levels(uuid[]) to anon;
```

**On the cardinality cap.** `p_user_ids` is caller-supplied and execute is
granted to `anon`, so this is a batch endpoint any visitor can call with an
arbitrary array. The exposure is small — `user_id` is already public via
`getLeaderboard`, and the return is one integer per user — but "small payload"
and "unbounded work per request" are different properties, and only the first is
covered by returning an aggregate.

The `where` clause is therefore bounded by `array_length`. Add this line to the
function body, immediately after the `where r.user_id = any(p_user_ids)` line
and before `group by`:

```sql
    and array_length(p_user_ids, 1) <= 100
```

100 is five times the leaderboard's `limit = 20` default, so no legitimate call
comes close. A larger array returns zero rows rather than erroring, which the
client already treats as "no levels available" via its `?? 0` fallback.

- [ ] **Step 2: Run it**

Paste the file's contents into the Supabase SQL editor and execute. This is the one step in the plan that touches the live database.

**This step gates Tasks 6 and 7.** Do not start them until Step 3 passes. The
client degrades gracefully when the RPC is missing (Task 6 logs a warning, Task 7
hides the badge), which is correct behaviour in production and actively
dangerous during implementation: a forgotten migration looks exactly like "no
one has any XP yet". Task 7's verification catches it, but only if you know to
look — hence the explicit gate here.

- [ ] **Step 3: Verify the function**

In the same SQL editor:

```sql
-- Returns one row per user that has runs, with their lifetime total.
select * from public.user_levels(array(select distinct user_id from public.runs limit 5));

-- Must return ZERO ROWS, not an error.
select count(*) as empty_array_rows from public.user_levels('{}'::uuid[]);

-- Cardinality cap: 101 ids must return zero rows, not 101 results.
select count(*) as over_cap_rows
from public.user_levels(array(select gen_random_uuid() from generate_series(1, 101)));
```

Expected: the first returns `user_id` / `xp` pairs with plausible totals; the
second and third both return `0`.

- [ ] **Step 4: Verify the client can actually reach it**

The SQL editor runs as a privileged role, so passing Step 3 proves the function
exists — not that the browser's anon key may call it. A missing `grant` fails
only from the client, and fails the same silent way a missing function does.

With the dev server running (`npm run dev`), paste this into the browser console
on any page of the app:

```js
const { data, error } = await (await import('/src/lib/supabase.js')).supabase
  .rpc('user_levels', { p_user_ids: [] })
console.log({ data, error })
```

Expected: `{ data: [], error: null }`.

A `404` or "function not found" in `error` means the SQL did not apply, or the
grants did not. **Do not proceed to Task 6 until this returns `error: null`** —
past this point a missing RPC is indistinguishable from an empty leaderboard.

- [ ] **Step 5: Commit**

```bash
git add supabase/user_levels.sql
git commit -m "feat(levels): add the user_levels aggregate RPC"
```

---

## Task 6: Attach XP to leaderboard rows

**Files:**
- Modify: `src/lib/daily.js:68-75`

**Interfaces:**
- Consumes: the `user_levels` RPC (Task 5).
- Produces: `getLeaderboard(dateStr, limit)` rows gain an **`xp: number`** field. Every row has it — users the RPC omitted default to `0`, which `levelForXp` resolves to level 1. Task 7 reads this field.

- [ ] **Step 1: Fetch and attach XP**

Replace the whole `getLeaderboard` function in `src/lib/daily.js`:

```js
// The day's leaderboard (each user's best attempt, ranked), capped at `limit`.
// Rows carry `xp` (lifetime Speed Cash earned) so the board can show account
// levels. That number can't be summed client-side — `runs` is own-rows-only
// under RLS and this board shows other players — so it comes from the
// user_levels RPC (see supabase/user_levels.sql).
export async function getLeaderboard(dateStr, limit = 20) {
  const { data, error } = await supabase
    .from('daily_attempts')
    .select('user_id, username, attempt_no, maps_cleared, elapsed_ms, starter')
    .eq('daily_date', dateStr)
  if (error || !data) return []
  const ranked = rankLeaderboard(data).slice(0, limit)
  if (ranked.length === 0) return ranked

  // One call for the whole page, not one per row.
  const { data: levels, error: lvlErr } = await supabase
    .rpc('user_levels', { p_user_ids: ranked.map(e => e.user_id) })
  // A failed lookup must not take the board down with it: rank and score are
  // the point here, the level is an adornment. Rows fall back to xp 0, and the
  // UI hides the badge at 0 rather than printing "LV 1" on everyone — a wrong
  // number reads as data, while a missing one reads as missing.
  if (lvlErr) console.warn('user_levels failed:', lvlErr.message)
  const xpByUser = new Map((levels ?? []).map(r => [r.user_id, Number(r.xp) || 0]))

  return ranked.map(e => ({ ...e, xp: xpByUser.get(e.user_id) ?? 0 }))
}
```

- [ ] **Step 2: Verify in the browser**

Run `npm run dev`, open the Daily Seed modal, and check the console + network tab:

1. No `user_levels failed` warning.
2. Exactly **one** `rpc/user_levels` request per modal open — not one per row.
3. In the console, confirm rows carry `xp`. The leaderboard has no level UI yet (Task 7), so this is the only way to see it.

- [ ] **Step 3: Verify graceful failure**

Temporarily change the RPC name to `'user_levels_nope'`, reload, and open the modal.

Expected: the leaderboard still renders every row with its rank, maps, and run number. One `user_levels failed` warning in the console. Nothing crashes and no row disappears.

**Change the name back** before continuing.

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: `daily.js` reports zero errors; repo total stays 43. Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/daily.js
git commit -m "feat(levels): attach lifetime XP to leaderboard rows"
```

---

## Task 7: The leaderboard level badge

**Files:**
- Modify: `src/components/DailyChallenge.jsx`

**Interfaces:**
- Consumes: `levelForXp` (Task 1) and the `xp` field on leaderboard rows (Task 6).
- Produces: nothing downstream.

- [ ] **Step 1: Import the derivation**

In `src/components/DailyChallenge.jsx`, add after the `SeedCodeChip` import (line 5):

```js
import { levelForXp } from '../game/level.js'
```

- [ ] **Step 2: Add the badge left of the username**

The row's username cell is around line 196. Insert the badge immediately **before** it — after the starter sprite, before the name.

Left of the name rather than as a new right-hand column: the level is identity, and the two right-hand columns (`maps`, `run n`) are the ranking, which the level does not affect. Among them it would imply it ranks.

```jsx
                {/* Account level — identity, so it sits with the name rather
                    than among the ranking columns to its right.
                    BLANK, not absent, at xp 0: the cell keeps its width so
                    usernames stay aligned down the column, exactly as the medal
                    cell above does for ranks 4+. xp 0 means a brand-new account
                    or a failed user_levels lookup, and printing "LV 1" there
                    would read as real data where a blank reads as absent.
                    46px fits "LV 100" — the widest value — at 12px Upheaval.
                    Sizing to "LV 16" would let the cap overflow into the name.
                    Desktop only: the mobile row is already at its width limit
                    with rank, medal, sprite, name, maps and run. */}
                {isDesktop && (
                  <span style={{
                    fontFamily: 'Upheaval', fontSize: '12px', color: text,
                    opacity: 0.75, flexShrink: 0, width: '46px',
                  }}>
                    {e.xp > 0 ? `LV ${levelForXp(e.xp).level}` : ''}
                  </span>
                )}
```

- [ ] **Step 3: Get `isDesktop` into scope**

`DailyChallenge.jsx` does not currently use the hook. Add the import after `useTheme` (line 2):

```js
import { useIsDesktop } from '../lib/useIsDesktop'
```

And inside the component, right after `const { dark } = useTheme()`:

```js
  const isDesktop = useIsDesktop()
```

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: `DailyChallenge.jsx` stays at its **2-error** baseline (a pre-existing `set-state-in-effect` at line ~52 and an unused `canPlay` at ~64 — do not fix either). Build succeeds.

- [ ] **Step 5: Manual verification**

Run `npm run dev` and open the Daily Seed modal. This needs at least one leaderboard entry; play a daily if the board is empty.

1. **Every row shows a level, including other players' rows.** This is what proves the RPC works — RLS makes it impossible client-side, so if other players show a level, the whole server path is correct.
2. Your own row's level matches what the Stats page and calling card show.
3. The badge sits left of the username and does not push `maps` or `run n` out of alignment.
4. At **375px**: the badge is gone and the username is NOT ellipsised any more than before.
5. A user with no recorded runs shows no badge rather than a blank gap of fixed width.

- [ ] **Step 6: Commit**

```bash
git add src/components/DailyChallenge.jsx
git commit -m "feat(levels): show account level on the Daily Seed leaderboard"
```

---

## Known gaps (deliberate, not defects)

State these plainly if asked; do not "fix" them without a new decision.

1. **Guests earn no XP.** No account means no `runs` row, so a signed-out player has no level. Consistent with the Pokédex, badges, and catches.
2. **Levels unlock nothing.** They are a number that goes up. Rewards are a separate design.
3. **No level-up moment.** Nothing stores the previous level, so nothing can detect the instant one is crossed. A "You reached level 17" celebration needs a stored high-water mark.
4. **No level on mobile's menu.** The calling card is desktop-only and mobile's menu is the stacked button column. Mobile players see their level on the Stats page, which both platforms share.
5. **Retuning a payout moves everyone's level.** Correct behaviour for a derived value, but it means economy changes are now progression changes too.
6. **Every level read is a full scan of the user's runs.** Fine at 43 rows, fine at a few thousand. At tens of thousands it wants a materialized total; watch the Stats page load time as the signal.
7. **Two code paths show the same level.** Stats and the calling card sum client-side; the leaderboard uses the RPC. They should always agree — if they ever don't, the RPC is authoritative and the client sum is the one to suspect.
8. **`getLeaderboard` still fetches every `daily_attempts` row for the date.** It ranks client-side and slices 20, so a popular day loads every attempt from every player. Pre-existing, and Task 6 rewrites that exact function without fixing it — deliberately. A `.limit()` on the query would cut rows *before* the best-attempt reduction in `rankLeaderboard`, silently changing who ranks. Doing it correctly means moving the ranking into SQL, which is its own change with its own verification. Flagged, not smuggled in.
9. **`Stats.jsx:283`'s existing comment miscounts the `<Stat>` call sites** (there are 7, not 8). Harmless — the surrounding reasoning about `react-hooks/static-components` is correct and the count is incidental. Left alone rather than fixed, since touching it grows the diff of a file this plan already edits for real reasons.
