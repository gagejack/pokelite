# Seeded Runs — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make runs deterministic from a seed and let players share/replay a run via a `KANTO-7Q2` code — with no Supabase, no daily/leaderboard (that's Phase 2).

**Architecture:** A zero-import leaf module `src/game/rng.js` holds a swappable module-level generator; `seedRng(seed)` installs a mulberry32 PRNG, `clearRng()` restores `Math.random`. All 18 `Math.random()` sites in the six pure sim files call `rng()` instead — call order preserved exactly, so a seed reproduces the whole run. `src/game/seed.js` encodes/decodes the shareable code. `App.jsx` seeds at run start, restores rng state on resume, and clears at run end; the seed code shows (tap-to-copy) on the region-select input, the defeat and victory screens, and a "🌱 Seeded" map badge.

**Tech Stack:** React 19, Vite 8, plain ES modules. **No test framework is installed** — verification uses Node harness scripts under `scripts/` (the repo's existing convention, e.g. `buildPokedex.mjs`), run with `node`.

## Global Constraints

- **RNG call order is sacred.** Never reorder, add, or remove a `Math.random`/`rng()` call. Each site becomes a literal `Math.random` → `rng` rename, nothing else. Unseeded behavior must stay byte-identical to today.
- **`src/game/rng.js` and `src/game/seed.js` import nothing from the app** (leaf modules), so `node` scripts import them with no bundler. `seed.js` may import `regionRegistry.js` only in Phase 2; in Phase 1 it needs no imports.
- **Seed is a uint32.** Always coerce with `>>> 0` before seeding.
- **Region names** are capitalized in app data (`'Kanto'`), lowercased nowhere yet. The seed code uppercases the region; decode matches case-insensitively against the app's region list.
- Run `npm run build` and `npm run lint` after each task; both must be clean.
- Commit after every task.

---

### Task 1: RNG core module (`src/game/rng.js`)

**Files:**
- Create: `src/game/rng.js`
- Test: `scripts/verify-rng.mjs`

**Interfaces:**
- Produces:
  - `rng(): number` — float in [0,1), like `Math.random`.
  - `seedRng(seed: number): void` — installs mulberry32 seeded by `seed >>> 0`.
  - `clearRng(): void` — restores `Math.random`.
  - `isSeeded(): boolean` — true while a seeded generator is active.
  - `getRngState(): number | null` — current mulberry32 accumulator (uint32), or `null` when unseeded.
  - `setRngState(state: number): void` — resume a seeded sequence from a saved accumulator.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-rng.mjs`:

```js
// Node harness for src/game/rng.js — determinism + state save/restore.
import { rng, seedRng, clearRng, isSeeded, getRngState, setRngState } from '../src/game/rng.js'

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

// Same seed → identical sequence.
seedRng(12345)
const a = [rng(), rng(), rng(), rng(), rng()]
seedRng(12345)
const b = [rng(), rng(), rng(), rng(), rng()]
check('same seed reproduces sequence', a.every((v, i) => v === b[i]))

// Different seed → different sequence (overwhelmingly likely).
seedRng(999)
const c = [rng(), rng(), rng()]
check('different seed differs', !a.slice(0, 3).every((v, i) => v === c[i]))

// Range.
check('in [0,1)', a.every(v => v >= 0 && v < 1))

// isSeeded / clearRng.
seedRng(1); check('isSeeded true when seeded', isSeeded() === true)
clearRng(); check('isSeeded false after clear', isSeeded() === false)
check('getRngState null when unseeded', getRngState() === null)

// State save/restore: consume, snapshot, consume more, restore, replay must match.
seedRng(777)
rng(); rng(); rng()
const state = getRngState()
const after = [rng(), rng(), rng()]
setRngState(state)
const replay = [rng(), rng(), rng()]
check('setRngState replays identical tail', after.every((v, i) => v === replay[i]))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-rng.mjs`
Expected: FAIL — `Cannot find module '../src/game/rng.js'` (module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/game/rng.js`:

```js
// Seeded-run RNG core (Experimental Feature 2.3, Phase 1).
//
// A LEAF module: imports nothing, so plain Node scripts and future sim tooling
// can import it with no bundler. Holds one swappable module-level generator.
// Default is Math.random (byte-identical to pre-seed behavior); seedRng swaps
// in a deterministic mulberry32 so the same seed reproduces a whole run.
//
// IMPORTANT: game-logic modules must call rng() everywhere they previously
// called Math.random(), in the SAME ORDER — the reproducibility contract.

// mulberry32: tiny, fast 32-bit seeded PRNG. Its entire state is one uint32
// accumulator, so a run snapshot can save/restore it in a single number.
let _state = 0
function mulberry32() {
  _state = (_state + 0x6d2b79f5) >>> 0
  let t = _state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

let _rng = Math.random // active generator

export function rng() { return _rng() }

export function seedRng(seed) {
  _state = seed >>> 0
  _rng = mulberry32
}

export function clearRng() {
  _rng = Math.random
}

export function isSeeded() { return _rng !== Math.random }

// null when unseeded so a snapshot of a normal run stores no rng state.
export function getRngState() { return _rng === mulberry32 ? _state : null }

export function setRngState(state) {
  _state = state >>> 0
  _rng = mulberry32
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/verify-rng.mjs`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/rng.js scripts/verify-rng.mjs
git commit -m "feat(rng): seeded PRNG leaf module with state save/restore"
```

---

### Task 2: Seed code encode/decode (`src/game/seed.js`)

**Files:**
- Create: `src/game/seed.js`
- Test: `scripts/verify-seed.mjs`

**Interfaces:**
- Consumes: nothing (leaf module in Phase 1).
- Produces:
  - `encodeSeed(region: string, seed: number): string` — e.g. `encodeSeed('Kanto', 12345)` → `'KANTO-...'`. Uppercases region, base32-encodes the uint32 seed with an ambiguous-char-free alphabet.
  - `decodeSeed(code: string): { region: string, seed: number } | null` — inverse; case-insensitive, tolerant of surrounding whitespace; returns `null` for malformed input. `region` is returned uppercased (the caller matches it against the app's region list case-insensitively).

**Note on alphabet:** Crockford base32 (radix 32) — the standard set with the four confusable letters `I L O U` removed. 32-bit seeds encode to at most 7 chars.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-seed.mjs`:

```js
import { encodeSeed, decodeSeed } from '../src/game/seed.js'

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

// Round-trip across a spread of seeds and regions.
const seeds = [0, 1, 42, 12345, 0xdeadbeef, 4294967295]
const regions = ['Kanto', 'Unova', 'Hoenn']
for (const r of regions) {
  for (const s of seeds) {
    const code = encodeSeed(r, s)
    const back = decodeSeed(code)
    check(`round-trip ${r}/${s} → ${code}`, back && back.region === r.toUpperCase() && back.seed === (s >>> 0))
  }
}

// Format: REGION-XXXX, uppercase.
check('format has dash + uppercase', /^KANTO-[0-9A-Z]+$/.test(encodeSeed('Kanto', 999)))

// The most confusable letters (I L O U) never appear in the encoded seed part.
const codePart = encodeSeed('Kanto', 0xdeadbeef).split('-')[1]
check('no confusable letters', !/[ILOU]/.test(codePart))

// Case-insensitive + whitespace-tolerant decode.
check('lowercase decodes', decodeSeed('kanto-' + encodeSeed('Kanto', 42).split('-')[1].toLowerCase())?.seed === 42)
check('whitespace trimmed', decodeSeed('  ' + encodeSeed('Kanto', 42) + '  ')?.seed === 42)

// Garbage → null.
check('empty → null', decodeSeed('') === null)
check('no dash → null', decodeSeed('KANTO7Q2') === null)
check('bad char → null', decodeSeed('KANTO-!!!') === null)
check('null input → null', decodeSeed(null) === null)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-seed.mjs`
Expected: FAIL — `Cannot find module '../src/game/seed.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/seed.js`:

```js
// Shareable seed codes for seeded runs (Experimental Feature 2.3, Phase 1).
//
// Format: "REGION-XXXX" e.g. "KANTO-7Q2P". The region is embedded so a pasted
// code knows which region to load; the suffix is the uint32 seed in Crockford
// base32 (the four confusable letters I L O U removed) so codes are easy to
// read aloud and retype. Leaf module: imports nothing in Phase 1.

// Crockford base32: 32 chars with I, L, O, U removed (they read ambiguously),
// giving a clean radix-32 with no confusable characters.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function encodeSeed(region, seed) {
  let n = seed >>> 0
  if (n === 0) return `${region.toUpperCase()}-0`
  let out = ''
  while (n > 0) {
    out = B32[n % 32] + out
    n = Math.floor(n / 32)
  }
  return `${region.toUpperCase()}-${out}`
}

export function decodeSeed(code) {
  if (typeof code !== 'string') return null
  const trimmed = code.trim().toUpperCase()
  const dash = trimmed.indexOf('-')
  if (dash <= 0 || dash === trimmed.length - 1) return null
  const region = trimmed.slice(0, dash)
  const body = trimmed.slice(dash + 1)
  if (!/^[0-9A-HJKMNP-TV-Z]+$/.test(body)) return null // Crockford chars only
  let n = 0
  for (const ch of body) {
    const v = B32.indexOf(ch)
    if (v < 0) return null
    n = n * 32 + v
  }
  return { region, seed: n >>> 0 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/verify-seed.mjs`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/seed.js scripts/verify-seed.mjs
git commit -m "feat(seed): shareable REGION-XXXX seed code codec"
```

---

### Task 3: Swap `Math.random` → `rng()` across the six sim files

**Files:**
- Modify: `src/game/nodeMap.js` (lines 71, 75, 90, 108 — `pick`, `pickType`, `randomNode` master-ball roll, pokecenter index)
- Modify: `src/game/battleTeams.js` (lines 22, 46, 47, 48 — `pickLevel`, `pickTrainerCount`)
- Modify: `src/game/catch.js` (line 43 — weighted draw)
- Modify: `src/game/items.js` (line 135 — weighted draw)
- Modify: `src/game/battle.js` (lines 65, 67, 87, 137, 148 — crit, damage roll, bright powder, turn-order ties)
- Modify: `src/game/pokemon.js` (lines 231, 352, 377 — shiny, evolution branch, stage roll)
- Test: `scripts/verify-determinism.mjs`

**Interfaces:**
- Consumes: `rng` from Task 1.
- Produces: no signature changes. After this task, seeding before calling these functions makes their output deterministic.

**This is a mechanical rename.** In each file, add `import { rng } from './rng.js'` at the top with the other imports, then replace every `Math.random` token with `rng`. Do NOT touch any other logic, whitespace, or call order. Line numbers above are a guide — grep to confirm.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-determinism.mjs`. It seeds, generates map + teams + offers, and asserts two seeded passes match and an unseeded pass differs:

```js
import { seedRng, clearRng } from '../src/game/rng.js'
import { buildRows } from '../src/game/nodeMap.js'
import { pickTrainerCount, buildTrainerTeamSpec } from '../src/game/battleTeams.js'

// A deterministic scenario touching several sim files.
function scenario() {
  const rows = buildRows([1, 4, 7, 25], 6, 3)          // nodeMap: pickType/pick/masterball/pokecenter
  const count = pickTrainerCount(3)                     // battleTeams: chained rolls
  const team = buildTrainerTeamSpec([1, 4, 7, 25], [10, 20], 3, 0.5) // pickLevel + pick
  // Flatten to a comparable string.
  return JSON.stringify({ rows: rows.map(r => r.map(n => n.type)), count, team })
}

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

seedRng(2024); const s1 = scenario()
seedRng(2024); const s2 = scenario()
check('same seed → identical scenario', s1 === s2)

seedRng(9999); const s3 = scenario()
check('different seed → different scenario', s1 !== s3)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-determinism.mjs`
Expected: FAIL — `same seed → identical scenario` fails, because the sim files still call `Math.random` (ignores the seed), so two seeded passes differ.

- [ ] **Step 3: Make the six edits**

In each file, add the import and rename. Concretely:

`src/game/nodeMap.js` — add `import { rng } from './rng.js'` near the top imports, then:
- `pool[Math.floor(Math.random() * pool.length)]` → `pool[Math.floor(rng() * pool.length)]`
- `const roll = Math.random() * 100` → `const roll = rng() * 100`
- `Math.random() < masterBallChance(mapIndex)` → `rng() < masterBallChance(mapIndex)`
- `const pcIndex = Math.random() < 0.5 ? 0 : 1` → `const pcIndex = rng() < 0.5 ? 0 : 1`

`src/game/battleTeams.js` — add `import { rng } from './rng.js'`, then in `pickLevel` replace `Math.random()` with `rng()`; in `pickTrainerCount` replace all three `Math.random()` with `rng()` **preserving order** (they're chained in ternaries — same positions).

`src/game/catch.js` — add `import { rng } from './rng.js'`, `let roll = Math.random() * total` → `let roll = rng() * total`.

`src/game/items.js` — add `import { rng } from './rng.js'`, `let roll = Math.random() * pool` → `let roll = rng() * pool`.

`src/game/battle.js` — add `import { rng } from './rng.js'`, then:
- `const crit = Math.random() < critChance` → `const crit = rng() < critChance`
- `const random = B.randomRoll.base + Math.random() * B.randomRoll.span` → `... + rng() * B.randomRoll.span`
- `Math.random() < HI.brightPowderChance` → `rng() < HI.brightPowderChance`
- `let tieFirst = Math.random() < 0.5` → `let tieFirst = rng() < 0.5`
- `tieFirst = Math.random() < 0.5` → `tieFirst = rng() < 0.5`

`src/game/pokemon.js` — add `import { rng } from './rng.js'`, then:
- `const shiny = Math.random() < SHINY_ODDS` → `const shiny = rng() < SHINY_ODDS`
- `branches[Math.floor(Math.random() * branches.length)]` → `branches[Math.floor(rng() * branches.length)]`
- `let roll = Math.random() * total` → `let roll = rng() * total`

Verify none remain: `grep -rn "Math.random" src/game/*.js` must print nothing.

- [ ] **Step 4: Run tests to verify they pass**

```
grep -rn "Math.random" src/game/*.js   # expect: no output
node scripts/verify-determinism.mjs     # expect: ALL PASS
node scripts/verify-rng.mjs             # still ALL PASS
npm run build                           # clean
npm run lint                            # clean
```

- [ ] **Step 5: Commit**

```bash
git add src/game/nodeMap.js src/game/battleTeams.js src/game/catch.js src/game/items.js src/game/battle.js src/game/pokemon.js scripts/verify-determinism.mjs
git commit -m "feat(rng): route all sim RNG through seedable rng()"
```

---

### Task 4: App run-state fields + seed lifecycle (start / clear)

**Files:**
- Modify: `src/App.jsx` — imports (line ~13 area), new state (line ~26 area), `startRun` (line 103), `clearRunState` (line 188), RegionSelect render (line 379).

**Interfaces:**
- Consumes: `seedRng`, `clearRng`, `getRngState`, `setRngState` from Task 1; `decodeSeed`, `encodeSeed` from Task 2.
- Produces: state `runSeed` (`{ region, seed, code } | null`), `runMode` (`'normal' | 'custom' | 'daily'`), refs `runStartedAt`, `dailyDate`; a `beginSeededRun(region, seed, mode)` helper wired to a new `onCustomSeed` prop on `<RegionSelect>`; the region-select screen can start a custom-seeded run.

**Note:** Phase 1 uses only `'normal'` and `'custom'` modes and never sets `dailyDate` (Phase 2 adds `'daily'`). The fields exist now so the snapshot format (Task 5) is stable.

- [ ] **Step 1: Add imports**

In `src/App.jsx`, after the `import { getRegionConfig } ...` line, add:

```js
import { seedRng, clearRng, getRngState, setRngState } from './game/rng.js'
import { encodeSeed, decodeSeed } from './game/seed.js'
```

- [ ] **Step 2: Add run-mode state near the other `useState`/`useRef` (around line 40)**

```js
  const [runSeed, setRunSeed] = useState(null)   // { region, seed, code } or null
  const [runMode, setRunMode] = useState('normal')
  const runStartedAt = useRef(0)
  const dailyDate = useRef(null)                  // Phase 2 (daily) sets this
```

- [ ] **Step 3: Seed at run start**

In `startRun` (line 103), immediately after `resetRunStats()` add the seeding. `startRun` runs for every mode; the seed was already chosen when the region was picked (normal → none). Add:

```js
    // Install the run's RNG. runSeed is set before startRun for seeded modes;
    // a normal run clears back to Math.random.
    if (runSeed) seedRng(runSeed.seed)
    else clearRng()
    runStartedAt.current = Date.now()
```

- [ ] **Step 4: Add the custom-seed entry point + clear on region change**

Replace the `<RegionSelect ... />` block (line 379) with one that passes an `onCustomSeed` handler and clears any prior seed when a region is picked normally:

```jsx
      {screen === 'region' && (
        <RegionSelect
          onBack={() => setScreen('menu')}
          onSelectRegion={region => {
            setRunSeed(null)        // normal run
            setRunMode('normal')
            setSelectedRegion(region)
            const config = getRegionConfig(region.name)
            if (config) prewarmCache(config)
            setScreen('starter')
          }}
          onCustomSeed={code => {
            const decoded = decodeSeed(code)
            if (!decoded) return { error: 'Invalid seed' }
            // Match the decoded REGION against the app's region list.
            const region = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova']
              .find(n => n.toUpperCase() === decoded.region)
            const config = region && getRegionConfig(region)
            if (!config || (config.maps?.length ?? 0) === 0) return { error: 'Unknown region' }
            setRunSeed({ region, seed: decoded.seed, code: encodeSeed(region, decoded.seed) })
            setRunMode('custom')
            setSelectedRegion({ name: region })
            prewarmCache(config)
            setScreen('starter')
            return { ok: true }
          }}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
```

- [ ] **Step 5: Clear rng + seed state when a run ends / run state is cleared**

In `clearRunState` (line 188), after `setSelectedRegion(null)` add:

```js
    clearRng()
    setRunSeed(null)
    setRunMode('normal')
    runStartedAt.current = 0
    dailyDate.current = null
```

- [ ] **Step 6: Verify build/lint**

```
npm run build   # clean
npm run lint    # clean
```

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): seed lifecycle + custom-seed run-state wiring"
```

---

### Task 5: Persist seed state through save/resume

**Files:**
- Modify: `src/App.jsx` — `buildRunSnapshot` (line 119), `resumeRun` (line 159).

**Interfaces:**
- Consumes: `getRngState`, `setRngState`, `seedRng`, `clearRng` (Task 1); state from Task 4.
- Produces: snapshots that round-trip seeded runs — a resumed seeded run continues the exact RNG sequence.

- [ ] **Step 1: Add seed fields to the snapshot**

In `buildRunSnapshot` (line 119), add to the returned object (after `savedAt: Date.now(),` or alongside it):

```js
      runSeed,
      runMode,
      runStartedAt: runStartedAt.current,
      dailyDate: dailyDate.current,
      rngState: getRngState(),   // null for normal runs
```

- [ ] **Step 2: Restore seed fields on resume**

In `resumeRun` (line 159), after `setMapIndex(run.mapIndex ?? 0)` add:

```js
    setRunSeed(run.runSeed ?? null)
    setRunMode(run.runMode ?? 'normal')
    runStartedAt.current = run.runStartedAt ?? Date.now()
    dailyDate.current = run.dailyDate ?? null
    // Restore the exact RNG position so resumed rolls match an uninterrupted run.
    if (run.rngState != null) setRngState(run.rngState)
    else clearRng()
```

- [ ] **Step 3: Verify with a Node harness**

Create `scripts/verify-resume-rng.mjs`:

```js
// Simulate snapshot/restore of rng state mid-sequence (mirrors resumeRun).
import { seedRng, rng, getRngState, setRngState, clearRng } from '../src/game/rng.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

seedRng(555)
const pre = [rng(), rng()]            // consumed before "save"
const snap = getRngState()            // buildRunSnapshot writes this
const uninterrupted = [rng(), rng(), rng()]

// "Resume": fresh module state, restore, continue.
clearRng()
setRngState(snap)                     // resumeRun does this
const resumed = [rng(), rng(), rng()]
check('resumed tail matches uninterrupted', uninterrupted.every((v, i) => v === resumed[i]))
check('pre-save rolls were real', pre.length === 2)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
```

Run: `node scripts/verify-resume-rng.mjs`
Expected: `ALL PASS`.

- [ ] **Step 4: Verify build/lint**

```
npm run build   # clean
npm run lint    # clean
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx scripts/verify-resume-rng.mjs
git commit -m "feat(app): persist rng state + seed context through save/resume"
```

---

### Task 6: Custom-seed input on region-select

**Files:**
- Modify: `src/components/RegionSelect.jsx` — component signature (line 1 area / the `export default function`), and the control area just above the Back button (the tail shown in the file).

**Interfaces:**
- Consumes: `onCustomSeed(code) → { ok } | { error }` prop from Task 4.
- Produces: a text input + "Go" button between the region grid and Back. (The Daily Challenge button is Phase 2 — leave a comment placeholder, do not build it.)

- [ ] **Step 1: Accept the new prop**

Find the `export default function RegionSelect({ ... })` signature and add `onCustomSeed` to its destructured props.

- [ ] **Step 2: Add local input state**

Inside the component body, near the existing `useState` usage, add:

```jsx
  const [seedInput, setSeedInput] = useState('')
  const [seedError, setSeedError] = useState(null)
```

- [ ] **Step 3: Render the seed row above the Back button**

Immediately before the `<button onClick={onBack} ...>Back</button>` in the render, insert:

```jsx
        {/* Custom seed entry. Daily Challenge button goes here in Phase 2. */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: cards ? '#DBDBDB' : '#333333' }}>
            Custom Seed:
          </span>
          <input
            value={seedInput}
            onChange={e => { setSeedInput(e.target.value); setSeedError(null) }}
            placeholder="KANTO-7Q2"
            style={{
              fontFamily: 'Orange Kid', fontSize: '14px', padding: '6px 8px',
              width: '140px', textTransform: 'uppercase',
              border: borderStyle, backgroundColor: cards ? '#1a1a1a' : '#fff',
              color: cards ? '#DBDBDB' : '#333333',
            }}
          />
          <button
            onClick={() => {
              const res = onCustomSeed?.(seedInput)
              if (res?.error) setSeedError(res.error)
            }}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '12px',
              color: cards ? '#DBDBDB' : '#333333',
              border: borderStyle, boxShadow: shadowStyle,
              backgroundColor: cards ? '#2e2e2e' : '#DBDBDB', padding: '8px 16px',
            }}
          >
            Go
          </button>
          {seedError && (
            <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444' }}>
              {seedError}
            </span>
          )}
        </div>
```

(`borderStyle`, `shadowStyle`, `cards` are already in scope in the render — they're used by the existing Back button.)

- [ ] **Step 4: Verify manually**

```
npm run build   # clean
npm run lint    # clean
npm run dev
```
In the browser: go to region-select, type `KANTO-7Q2` → Go → lands on starter select for Kanto. Type garbage → inline "Invalid seed" appears. Type `JOHTO-5` (no maps) → "Unknown region".

- [ ] **Step 5: Commit**

```bash
git add src/components/RegionSelect.jsx
git commit -m "feat(region-select): custom seed input"
```

---

### Task 7: Seed code on defeat + victory, and a seeded map badge

**Files:**
- Modify: `src/components/BattleCard.jsx` — `BattleCard` signature (line 32), `DefeatScreen` (line 741) and its render (line 323), and the victory text block (line 458 area).
- Modify: `src/App.jsx` — pass `seedCode={runSeed?.code}` where `<NodeMap>` / battle stack is rendered; add the "🌱 Seeded" badge on the node map.

**Interfaces:**
- Consumes: `runSeed.code` (Task 4).
- Produces: a copyable seed code in the defeat and victory UIs; a seeded indicator on the map.

- [ ] **Step 1: Thread `seedCode` into BattleCard**

Add `seedCode` to the `BattleCard({ ... })` destructured props (line 32). Pass it to `<DefeatScreen ... seedCode={seedCode} />` at line 323.

- [ ] **Step 2: Add a reusable copyable-code snippet inside BattleCard.jsx**

Above `DefeatScreen`, add a small component:

```jsx
function SeedCodeChip({ code, dark }) {
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }
  return (
    <button onClick={copy} title="Copy seed"
      style={{
        fontFamily: 'Orange Kid', fontSize: '14px',
        color: dark ? '#DBDBDB' : '#333333',
        border: dark ? '2px solid #121212' : '2px solid #444444',
        backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
        padding: '4px 10px', cursor: 'pointer',
      }}>
      🌱 {copied ? 'Copied!' : code}
    </button>
  )
}
```

(`useState` is already imported in BattleCard.jsx.)

- [ ] **Step 3: Show it in `DefeatScreen`**

Add `seedCode` to the `DefeatScreen({ roster, dark, onRestart, onMainMenu })` signature. Immediately after the `Defeated...` `<span>` (line ~766), add:

```jsx
        <SeedCodeChip code={seedCode} dark={dark} />
```

- [ ] **Step 4: Show it on victory**

In the victory text block (around line 458 — the "Continue inside card at top (win only)" area), render `<SeedCodeChip code={seedCode} dark={dark} />` near the victory heading. Use the existing `dark`/theme variable in that scope.

- [ ] **Step 5: Pass `seedCode` from App + add the map badge**

In `src/App.jsx`, add `seedCode={runSeed?.code}` to the `<NodeMap ... />` render props (line ~404). Then, on the node-map screen, add a small fixed badge when seeded — after the `<NodeMap>` (inside the same `screen === 'nodemap'` block):

```jsx
          {runSeed && (
            <div style={{
              position: 'fixed', top: '8px', right: '8px', zIndex: 50,
              fontFamily: 'Orange Kid', fontSize: '13px', color: '#DBDBDB',
              backgroundColor: 'rgba(0,0,0,0.55)', padding: '4px 8px',
              borderRadius: '4px', pointerEvents: 'none',
            }}>
              🌱 {runSeed.code}
            </div>
          )}
```

(If `NodeMap` forwards `seedCode` to its inner `BattleCard`, thread it through NodeMap's props; otherwise the badge above covers the map screen and the BattleCard `seedCode` comes from wherever BattleCard is rendered. Confirm by grepping `NodeMap` for `BattleCard` and passing `seedCode` down.)

- [ ] **Step 6: Verify manually**

```
npm run build   # clean
npm run lint    # clean
npm run dev
```
Start a custom-seeded run (`KANTO-7Q2`): confirm the 🌱 badge shows on the map; lose a battle → defeat popup shows the code at top, tapping it copies (paste elsewhere to confirm); win → victory shows the code. Start a NORMAL run → no badge, no code anywhere.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/components/BattleCard.jsx
git commit -m "feat(ui): show copyable seed code on defeat/victory + map badge"
```

---

### Task 8: Determinism acceptance + docs

**Files:**
- Modify: `Experimental_Features.md` — mark 2.3 Phase 1 shipped.
- Modify: `Agents.md` — one line: seeded-run RNG lives in `src/game/rng.js`, seed codes in `src/game/seed.js`.
- Test: reuse `scripts/verify-determinism.mjs`.

- [ ] **Step 1: Full determinism sweep**

Run all harnesses:

```
node scripts/verify-rng.mjs           # ALL PASS
node scripts/verify-seed.mjs          # ALL PASS
node scripts/verify-determinism.mjs   # ALL PASS
node scripts/verify-resume-rng.mjs    # ALL PASS
grep -rn "Math.random" src/game/*.js  # no output
npm run build && npm run lint         # clean
```

- [ ] **Step 2: Manual end-to-end reproduction**

`npm run dev`. Start `KANTO-7Q2`, note the first map's layout (node types top to bottom) and the first item/catch offer. Refresh, start `KANTO-7Q2` again — same map, same first offers. Change to `KANTO-ABC` — different map.

- [ ] **Step 3: Update docs**

In `Experimental_Features.md`, under `### 2.3 Seeded runs / daily seed`, append:

```
> ✅ Phase 1 shipped (2026-07-21): deterministic seeded runs + shareable
> KANTO-7Q2 codes (rng.js/seed.js, custom-seed input, seed shown on
> defeat/victory + map badge). Phase 2 (daily challenge + leaderboard) pending.
```

In `Agents.md`, add one line near the balance-module note:

```
- Seeded-run RNG: all sim randomness flows through `src/game/rng.js` (seedable);
  shareable seed codes in `src/game/seed.js`. Never reorder rng() calls.
```

- [ ] **Step 4: Commit**

```bash
git add Experimental_Features.md Agents.md
git commit -m "docs: mark 2.3 seeded-runs Phase 1 shipped"
```

---

## Self-Review

**Spec coverage (Phase 1 scope of SEEDED_RUNS_PLAN.md):**
- RNG core `rng.js` incl. `getRngState`/`setRngState` → Task 1 ✅
- `seed.js` codec (ambiguous-char-free, round-trip, null on garbage) → Task 2 ✅ (daily derivation is Phase 2 — correctly excluded)
- `Math.random` → `rng()` sweep, order-preserving, all 6 files/18 sites → Task 3 ✅
- App run-state fields (`runSeed`/`runMode`/`runStartedAt`/`dailyDate`) + seed lifecycle → Task 4 ✅
- Snapshot/resume of rng state + seed context → Task 5 ✅
- Custom Seed input on region-select → Task 6 ✅
- Seed code (tap-to-copy) on defeat + victory + 🌱 map badge → Task 7 ✅
- Unseeded parity / determinism verification + docs → Tasks 3 & 8 ✅
- Explicitly deferred to Phase 2: Daily button, `daily_attempts`, `daily.js`, `DailyChallenge.jsx`, countdown, leaderboard — none appear here ✅

**Placeholder scan:** Task 2 Step 3 intentionally shows-then-removes a dead `ALPHABET` line with an explicit instruction to delete it; all other steps contain complete code. No TBD/TODO.

**Type consistency:** `runSeed` shape `{ region, seed, code }` consistent across Tasks 4/5/7. `onCustomSeed` returns `{ ok } | { error }` in both Task 4 (producer) and Task 6 (consumer). `SeedCodeChip`/`DefeatScreen` `seedCode` prop consistent in Task 7. `getRngState`/`setRngState` signatures match Task 1 across Tasks 5.

One flagged uncertainty for the implementer (Task 7 Step 5): whether `BattleCard` is rendered under `NodeMap` (needs `seedCode` threaded through NodeMap) or directly by App — resolved by a grep, noted inline.
