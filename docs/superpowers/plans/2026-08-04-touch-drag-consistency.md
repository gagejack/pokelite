# Touch Drag Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every touch drag in the app — bag→Pokémon equip, roster reorder, battle roster reorder — behave the same way, by routing all three through one shared gesture hook and one shared geometry module.

**Architecture:** The `fix/mobile-bag-drag` branch already built the right foundation: `src/game/dragHit.js` (pure geometry, unit-tested) and `src/lib/useBagTouchDrag.js` (the gesture, consumed by NodeMap and EliteFour). That work fixed the bag drag and left the two *reorder* drags untouched, so the app now has one good drag and two bad ones with different activation rules, different hit testing, and no interruption handling. This plan fixes one live regression in the new hook, then generalizes the hook so the reorder drags can adopt it, deleting three hand-rolled copies of the same gesture.

**Tech Stack:** React 19, Vite 8, vitest + jsdom + @testing-library/react (installed by Task 0). Pure geometry is unit-tested in `src/game/dragHit.js`; gesture and hook behavior is tested against a real DOM.

## Global Constraints

- **Task 0 installs a DOM test harness (vitest + jsdom + @testing-library/react) and every behavior change in this plan gets a real automated test.** Manual device checks remain in each task as a final confirmation, but they are no longer the primary evidence — a task is not done until its tests pass.
- After Task 0, `npm test` runs **vitest**, which discovers both the existing `src/game/*.test.js` files and the new component/hook tests. The pre-existing `node:test`-style files keep working unchanged because vitest supports the `node:test`-compatible `test`/`assert` usage they already use — Task 0 verifies this explicitly and converts them only if it does not.
- `src/game/dragHit.js` is a **leaf module**: it imports nothing. Keep it that way — it is the cheapest place to test geometry, and it must stay importable without a DOM.
- `index.css` sets `pointer-events: none` on every `img` globally. Do not use `document.elementFromPoint` for any new hit test — it skips sprites. Use rect geometry.
- Existing constants keep their exported names and values unless a task says otherwise: `HIT_MARGIN = 8`, `DRAG_THRESHOLD = 4`.
- Commit after every task, using the `fix:`/`refactor:`/`docs:` prefixes already in this branch's history.
- Do not change the desktop HTML5 drag path (`draggable`, `onDragStart`, `onDragEnd`). It works. Pointer Events migration is explicitly out of scope.

---

## Issue Register

Every issue this plan addresses, with severity and the task that fixes it. Severity is about player-visible impact, not code cleanliness.

| # | Issue | Severity | Where | Fixed by |
|---|-------|----------|-------|----------|
| 1 | Drag ghost renders at screen corner (0,0) for the first frames of every drag, because `ghostRef.current` is null when the hook writes the first transform | **High** — visible on every single drag; a regression introduced by the ref refactor | `src/lib/useBagTouchDrag.js:78-84` | Task 1 |
| 2 | Roster reorder has no `onTouchCancel` — an OS interruption leaves a slot stuck in the "dragging" visual state indefinitely | **High** — screen stuck in a wrong mode, matches "it got weird and stayed weird" | `src/components/Roster.jsx:262-275` | Task 4 |
| 3 | BattleCard reorder has no `onTouchCancel` — same stuck state during the battle prep phase | **High** — same class as #2 | `src/components/BattleCard.jsx:1337-1343` | Task 5 |
| 4 | Roster reorder starts a drag on `touchstart` with **zero** movement threshold, so a tap visibly picks a Pokémon up | **Medium** — every roster tap looks like a mis-grab; this is the "inconsistent" feel, now worse than before since the bag threshold dropped to 4px | `src/components/Roster.jsx:235-238` | Task 4 |
| 5 | BattleCard reorder also has zero threshold | **Medium** — same as #4 | `src/components/BattleCard.jsx:1337` | Task 5 |
| 6 | Roster reorder hit-tests with `document.elementFromPoint`, which the global `img { pointer-events: none }` rule defeats — the sprite is invisible to it | **Medium** — drops land on the slot only when the finger is over padding, not the Pokémon | `src/components/Roster.jsx:240-260` | Task 4 |
| 7 | BattleCard reorder hit-tests with `elementFromPoint` over `data-battle-slot` | **Medium** — same as #6 | `src/components/BattleCard.jsx:1325-1328` | Task 5 |
| 8 | Roster reorder reads `e.touches[0]` / `e.changedTouches[0]` unguarded — a second finger hijacks the drag | **Low** — rare, but produces unreproducible weirdness | `src/components/Roster.jsx:242,250` | Task 4 |
| 9 | BattleCard reorder reads `e.touches[0]` unguarded | **Low** — same as #8 | `src/components/BattleCard.jsx:1339-1341` | Task 5 |
| 10 | `hitTestRects` returns the first rect in DOM order, so a drop in the gutter between two slots always lands on the left one rather than the nearer one | **Low** — a real but small aiming bias; matters more once reorder drags use it too | `src/game/dragHit.js:39-49` | Task 2 |
| 11 | `useBagTouchDrag.onTouchMove` returns before `e.preventDefault()` while under threshold; safe today only because bag images set `touchAction: 'none'`, which the hook cannot guarantee for future consumers | **Low** — latent; becomes a real scroll bug the moment a consumer forgets `touchAction` | `src/lib/useBagTouchDrag.js:74-80` | Task 3 |
| 12 | `Roster.jsx` defines `slotIndexFromTouch(touch, containerRef)` which is never called, and whose `containerRef` parameter is never used | **Low** — dead code that invites someone to use the broken `elementFromPoint` approach | `src/components/Roster.jsx:226-233` | Task 4 |
| 13 | The mobile bag comment promises "tap to pick it up then tap a Pokémon", but tapping opens the info popup instead | **Low** — documentation lies about behavior; the actual recovery path (a missed drop keeps placing mode alive) now exists and is undocumented | `src/components/NodeMap.jsx:1361-1362` | Task 6 |

**Deliberately out of scope.** Building tap-to-pick-up as a real feature (the original review's Finding 4) is a behavior change, not a consistency fix — Task 6 corrects the comment to describe what the code actually does. Migrating to Pointer Events is a larger refactor that touches the working desktop path.

---

## File Structure

**Modified:**
- `src/game/dragHit.js` — pure geometry. Gains `nearestRectAt` (Task 2). Stays leaf, stays import-free.
- `src/game/dragHit.test.js` — unit tests for the above.
- `src/lib/useBagTouchDrag.js` — the shared gesture. Gains correct ghost positioning at drag start (Task 1), unconditional `preventDefault` (Task 3), and a `slotAttr` option so reorder drags can use it over `data-battle-slot` (Task 2).
- `src/components/Roster.jsx` — deletes its hand-rolled touch gesture, adopts the hook (Task 4).
- `src/components/BattleCard.jsx` — deletes its hand-rolled touch gesture, adopts the hook (Task 5).
- `src/components/NodeMap.jsx` — comment correction only (Task 6).

**Created:**
- `vitest.config.js` — test runner config, jsdom environment (Task 0).
- `src/test/setup.js` — global test setup: testing-library cleanup, and a `Touch`/`TouchEvent` polyfill, since jsdom does not implement them (Task 0).
- `src/test/touch.js` — helpers for firing synthetic touch sequences at a component (Task 0).
- `src/lib/useBagTouchDrag.test.jsx` — hook behavior tests (Tasks 1 and 3).

**Not touched:** `src/components/EliteFour.jsx` — it already consumes the hook correctly and inherits Tasks 1–3 for free.

---

### Task 0: Install a DOM test harness

Everything downstream depends on this. The repo currently has `node --test` and no way to test a React hook or a touch gesture, which is why the branch's existing drag work shipped with only geometry tests. Install vitest + jsdom + `@testing-library/react`, prove the existing tests still run, and provide touch-event helpers the later tasks use.

jsdom does not implement `Touch` or `TouchEvent`, so the helpers must construct plain objects that satisfy what the handlers actually read: `identifier`, `clientX`, `clientY`, plus `touches` / `changedTouches` arrays and a `preventDefault` spy.

**Files:**
- Modify: `package.json` (devDependencies, `test` script)
- Create: `vitest.config.js`, `src/test/setup.js`, `src/test/touch.js`
- Test: the existing `src/game/dragHit.test.js` is the proof the harness works

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `npm test` → runs vitest once (CI mode, not watch).
  - `makeTouch({ identifier = 0, clientX, clientY }) → object` — one synthetic touch point.
  - `touchEvent(touches, changedTouches = touches) → object` — a synthetic touch event with a `preventDefault` spy attached as `.preventDefault`, readable via `event.preventDefault.mock.calls.length`.

- [ ] **Step 1: Install the dependencies**

```bash
npm install --save-dev vitest@^3 jsdom @testing-library/react @testing-library/dom
```

`@testing-library/react` v16+ requires `@testing-library/dom` as an explicit peer, which is why both are listed.

- [ ] **Step 2: Create the vitest config**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate from vite.config.js on purpose: the app config loads the Tailwind
// plugin, which does real CSS work that tests neither need nor should pay for.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    // Only our own tests — node_modules ships plenty of *.test.js.
    include: ['src/**/*.test.{js,jsx}'],
  },
})
```

- [ ] **Step 3: Create the setup file**

Create `src/test/setup.js`:

```js
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount anything a test rendered, so a stuck component from one test cannot
// receive events in the next.
afterEach(cleanup)
```

- [ ] **Step 4: Create the touch helpers**

Create `src/test/touch.js`:

```js
import { vi } from 'vitest'

// jsdom implements neither Touch nor TouchEvent. The handlers under test only
// ever read identifier/clientX/clientY off a touch, and touches/changedTouches
// off an event, so plain objects with those fields are a faithful stand-in.

/** One synthetic touch point. */
export function makeTouch({ identifier = 0, clientX = 0, clientY = 0 } = {}) {
  return { identifier, clientX, clientY }
}

/**
 * A synthetic touch event. `preventDefault` is a spy, so a test can assert
 * scrolling was suppressed via `event.preventDefault.mock.calls.length`.
 *
 * `changedTouches` defaults to `touches`, which matches touchstart/touchmove;
 * a touchend passes the lifted points explicitly with `touches` empty.
 */
export function touchEvent(touches, changedTouches = touches) {
  return { touches, changedTouches, preventDefault: vi.fn() }
}
```

- [ ] **Step 5: Point `npm test` at vitest**

In `package.json`, change the `test` script:

```json
    "test": "vitest run",
```

`vitest run` executes once and exits — the default bare `vitest` is watch mode, which would hang a subagent or CI.

- [ ] **Step 6: Verify the existing tests still pass under the new runner**

Run: `npm test`
Expected: PASS, 9 tests from `src/game/dragHit.test.js`, plus whatever `src/game/shop.test.js` and `src/game/moveSounds.data.test.js` contain.

These files import from `node:test` and `node:assert/strict`. Vitest runs them as-is. **If any of them fail to collect** — an error mentioning `node:test` — convert only the failing file's header to vitest's API and leave its test bodies alone:

```js
import { test, expect } from 'vitest'
```

replacing `import test from 'node:test'` and `import assert from 'node:assert/strict'`, then change `assert.equal(a, b)` to `expect(a).toBe(b)` and `assert.notEqual(a, b)` to `expect(a).not.toBe(b)`. Do not restructure the tests.

- [ ] **Step 7: Prove the harness can actually render a hook**

This is the real acceptance check for the task — a config that runs the old node tests but cannot render React would pass Step 6 and still be useless.

Create `src/test/harness.test.jsx`:

```js
import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { makeTouch, touchEvent } from './touch.js'

function Probe() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>count {n}</button>
}

test('the harness renders a component and processes state updates', () => {
  render(<Probe />)
  expect(screen.getByText('count 0')).toBeTruthy()
})

test('touch helpers produce the shape the drag handlers read', () => {
  const t = makeTouch({ identifier: 3, clientX: 10, clientY: 20 })
  expect(t.identifier).toBe(3)
  const e = touchEvent([t])
  expect(e.touches[0].clientX).toBe(10)
  expect(e.changedTouches[0].clientY).toBe(20)
  e.preventDefault()
  expect(e.preventDefault.mock.calls.length).toBe(1)
})
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. The two new harness tests pass alongside the pre-existing geometry tests.

Run: `npm run lint`
Expected: no new errors. If eslint complains about test globals or the `.jsx` test file, add the vitest globals to the eslint config's `files`/`languageOptions` for `src/**/*.test.{js,jsx}` rather than disabling the rule inline.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/test/ eslint.config.js
git commit -m "test: add a jsdom harness so touch gestures can be tested"
```

---

### Task 1: Fix the ghost's first frame

The bug: in `useBagTouchDrag.onTouchMove`, the frame that promotes a press to a drag calls `setGhostItem(st.item)` and then, a few lines later, writes `ghostRef.current.style.transform`. React has not rendered yet, so `ghostRef.current` is still `null` and the write is skipped by the `if (ghostRef.current)` guard. The `<img>` then mounts with `left: 0, top: 0` and no transform — parked in the top-left corner of the screen until the *next* `touchmove` fires.

The fix: keep the latest finger position in a ref, and apply it from a `useLayoutEffect` that runs after the ghost mounts. `useLayoutEffect` rather than `useEffect` because it runs before the browser paints, so the corner position is never visible.

**Files:**
- Modify: `src/lib/useBagTouchDrag.js:1` (imports), `:36-39` (refs), `:68-85` (`onTouchMove`)
- Test: `src/lib/useBagTouchDrag.test.jsx` (new)

**Interfaces:**
- Consumes: `makeTouch`, `touchEvent` from `src/test/touch.js` (Task 0).
- Produces: no signature change. `useBagTouchDrag` still returns `{ bagTouchProps, ghostRef, ghostItem }`. Consumers need no edits.

- [ ] **Step 0: Write the failing test**

Create `src/lib/useBagTouchDrag.test.jsx`. This harness component mirrors how NodeMap consumes the hook — a draggable element plus a ghost that only exists while `ghostItem` is set.

```jsx
import { test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useBagTouchDrag } from './useBagTouchDrag.js'
import { makeTouch, touchEvent } from '../test/touch.js'

// Mirrors the real consumers: the ghost is mounted only while a drag is
// active, which is precisely what makes its first frame hard to position.
function Harness({ callbacks = {} }) {
  const { bagTouchProps, ghostRef, ghostItem } = useBagTouchDrag(callbacks)
  const props = bagTouchProps({ name: 'Potion' }, { kind: 'bag', index: 0 })
  return (
    <>
      <div data-testid="item" {...props}>item</div>
      {ghostItem && (
        <img
          data-testid="ghost"
          ref={ghostRef}
          alt=""
          style={{ position: 'fixed', left: 0, top: 0 }}
        />
      )}
    </>
  )
}

// Drives one press-then-move through the handlers the hook returned.
function pressAndMove(el, { from, to, identifier = 0 }) {
  const start = makeTouch({ identifier, clientX: from.x, clientY: from.y })
  act(() => { el.ontouchstart?.(touchEvent([start])) })
  const moved = makeTouch({ identifier, clientX: to.x, clientY: to.y })
  act(() => { el.ontouchmove?.(touchEvent([moved])) })
}

test('the ghost is positioned under the finger on the frame it appears', () => {
  render(<Harness />)
  const item = screen.getByTestId('item')

  // One move, well past the 4px threshold. This is the frame that both
  // promotes the drag AND mounts the ghost.
  pressAndMove(item, { from: { x: 100, y: 100 }, to: { x: 150, y: 200 } })

  const ghost = screen.getByTestId('ghost')
  // Before the fix this is '' — the ghost mounts at the screen's top-left
  // corner because ghostRef.current was still null when the hook wrote.
  expect(ghost.style.transform).toBe('translate(150px, 200px) translate(-50%, -50%)')
})

test('the ghost keeps following on subsequent moves', () => {
  render(<Harness />)
  const item = screen.getByTestId('item')
  pressAndMove(item, { from: { x: 100, y: 100 }, to: { x: 150, y: 200 } })

  const next = makeTouch({ identifier: 0, clientX: 175, clientY: 225 })
  act(() => { item.ontouchmove?.(touchEvent([next])) })

  expect(screen.getByTestId('ghost').style.transform)
    .toBe('translate(175px, 225px) translate(-50%, -50%)')
})

test('no ghost appears for movement under the drag threshold', () => {
  render(<Harness />)
  const item = screen.getByTestId('item')
  // 2px — under the 4px threshold, so this stays a tap.
  pressAndMove(item, { from: { x: 100, y: 100 }, to: { x: 102, y: 100 } })
  expect(screen.queryByTestId('ghost')).toBeNull()
})
```

Note: React attaches these as props, not DOM `on*` properties, so `el.ontouchstart` is `undefined` in jsdom. Use `fireEvent` instead if the direct-property approach does not dispatch — replace the `pressAndMove` body with `fireEvent.touchStart(el, { touches: [start] })` and `fireEvent.touchMove(el, { touches: [moved] })`, importing `fireEvent` from `@testing-library/react`. Prefer `fireEvent`; it exercises React's real event path. Whichever dispatches, use it consistently across all tests in this file.

- [ ] **Step 0b: Run the tests to verify they fail**

Run: `npm test src/lib/useBagTouchDrag.test.jsx`
Expected: FAIL on the first test — `expected '' to be 'translate(150px, 200px) translate(-50%, -50%)'`. That empty transform IS the bug. The second and third tests should already pass.

- [ ] **Step 1: Extract the transform string into a named helper**

This is the value written in two places after this task, so name it once. Add it above the `useBagTouchDrag` function in `src/lib/useBagTouchDrag.js`:

```js
// The ghost is positioned at left:0/top:0 and moved entirely by transform, so
// one style write repositions it with no React render and no layout pass.
function ghostTransform(x, y) {
  return `translate(${x}px, ${y}px) translate(-50%, -50%)`
}
```

- [ ] **Step 2: Import `useLayoutEffect` and add the position ref**

Change the import on line 1 of `src/lib/useBagTouchDrag.js`:

```js
import { useLayoutEffect, useRef, useState } from 'react'
```

Then, immediately after the existing `const ghostRef = useRef(null)` declaration, add:

```js
  // The last position the finger was at. The ghost <img> does not exist yet on
  // the frame that starts a drag — setGhostItem only SCHEDULES its render — so
  // that frame's position has to be parked here and applied once it mounts.
  const ghostPos = useRef({ x: 0, y: 0 })
```

- [ ] **Step 3: Apply the parked position when the ghost mounts**

Add this directly below the `ghostPos` declaration:

```js
  // Runs after the ghost mounts but BEFORE the browser paints, so the ghost's
  // first painted frame is already under the finger. With a plain useEffect,
  // or with no effect at all, it paints once at the screen's top-left corner.
  useLayoutEffect(() => {
    if (!ghostItem || !ghostRef.current) return
    const { x, y } = ghostPos.current
    ghostRef.current.style.transform = ghostTransform(x, y)
  }, [ghostItem])
```

- [ ] **Step 4: Record every position into the ref**

In `onTouchMove`, replace the final positioning block:

```js
    e.preventDefault() // stop the page scrolling mid-drag
    if (ghostRef.current) {
      ghostRef.current.style.transform =
        `translate(${t.clientX}px, ${t.clientY}px) translate(-50%, -50%)`
    }
```

with:

```js
    e.preventDefault() // stop the page scrolling mid-drag
    // Recorded unconditionally: on the promoting frame the ghost has not
    // mounted, and the useLayoutEffect above reads this to place it correctly.
    ghostPos.current = { x: t.clientX, y: t.clientY }
    if (ghostRef.current) {
      ghostRef.current.style.transform = ghostTransform(t.clientX, t.clientY)
    }
```

**Ordering matters here.** `setGhostItem` is called earlier in this same synchronous handler, but React does not render or run layout effects until the handler returns — so `ghostPos.current` is already up to date by the time the effect reads it.

Do **not** move this line above the `if (!st.dragging)` block: a below-threshold press would then record positions for a ghost that should not exist yet.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test src/lib/useBagTouchDrag.test.jsx`
Expected: PASS, 3 tests. The first one — the ghost's first frame — is the one that was failing.

Run: `npm test`
Expected: PASS, full suite green.

Run: `npm run lint`
Expected: no new errors. `useLayoutEffect` is now imported and used; `useRef` and `useState` are still used.

- [ ] **Step 6: Manual device verification**

The automated tests in Step 5 are the primary evidence; this is the on-device confirmation. Run `npm run dev`, open the app on a phone or in a browser with touch emulation on (Chrome DevTools → toggle device toolbar → set to a 360px-wide device).

Reach the map screen with at least one bag item and one Pokémon in the roster. Press a bag item and drag slowly.

Expected: the ghost icon appears **under your finger** the instant the drag starts.
Before this fix: the ghost appears for one or two frames at the top-left corner of the screen, then snaps to the finger.

If you cannot reproduce the corner flash before the fix, it may be too brief at your frame rate — temporarily add `console.log('mount', ghostRef.current?.style.transform)` inside the `useLayoutEffect` and confirm it logs a non-empty transform.

- [ ] **Step 7: Commit**

```bash
git add src/lib/useBagTouchDrag.js
git commit -m "fix(drag): place the ghost under the finger on its first frame"
```

---

### Task 2: Nearest-rect hit testing, and a configurable slot attribute

Two changes to the shared modules, both needed before the reorder drags can adopt the hook.

**Nearest, not first.** `hitTestRects` returns the first rect in DOM order that contains the point. With `HIT_MARGIN = 8` and a 6px gutter, the expanded rects of adjacent slots *overlap* — so a drop in the gutter always lands on the left slot, never the nearer one. Barely matters for a bag drop; matters a lot for reorder, where the player is aiming between two specific slots.

**A configurable attribute.** The hook hardcodes `[data-slot-index]`. BattleCard's rows are marked `data-battle-slot`. One option parameter lets both use the same hook.

**Files:**
- Modify: `src/game/dragHit.js:39-49`
- Modify: `src/lib/useBagTouchDrag.js:32` (signature), `:44-50` (`slotIndexAt`)
- Test: `src/game/dragHit.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `hitTestRects(x, y, rects, margin = HIT_MARGIN) → number | null` — **unchanged signature and unchanged behavior.** Kept as-is so nothing that already depends on first-match semantics shifts underneath it.
  - `nearestRectAt(x, y, rects, margin = HIT_MARGIN) → number | null` — new. Same argument shapes; among all rects whose margin-expanded box contains the point, returns the `index` of the one whose center is closest to `(x, y)`. `null` if none contain it.
  - `useBagTouchDrag({ onDrop, onMissedDrop, onDragStart, onDragEnd, slotAttr })` — `slotAttr` is a new optional string, defaulting to `'data-slot-index'`. Tasks 4 and 5 pass it.

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/game/dragHit.test.js`:

```js
test('nearestRectAt picks the closer slot when margins overlap', () => {
  // The 6px gutter between slots 0 and 1 is fully covered by both slots'
  // 8px margins. 60px is 2px past slot 0's right edge and 4px short of
  // slot 1's left edge, so slot 0 is nearer; 63px flips it to slot 1.
  assert.equal(nearestRectAt(60, 50, slots), 0)
  assert.equal(nearestRectAt(63, 50, slots), 1)
})

test('nearestRectAt agrees with hitTestRects well inside a slot', () => {
  assert.equal(nearestRectAt(30, 50, slots), 0)
  assert.equal(nearestRectAt(90, 50, slots), 1)
  assert.equal(nearestRectAt(150, 50, slots), 2)
})

test('nearestRectAt returns index 0, not a falsy miss', () => {
  assert.notEqual(nearestRectAt(30, 50, slots), null)
  assert.equal(nearestRectAt(30, 50, slots), 0)
})

test('nearestRectAt misses beyond every margin', () => {
  assert.equal(nearestRectAt(30, -20, slots), null)
  assert.equal(nearestRectAt(300, 50, slots), null)
  assert.equal(nearestRectAt(30, 50, []), null)
})

test('nearestRectAt honours a custom margin', () => {
  // Zero margin: the gutter is a genuine miss for both slots.
  assert.equal(nearestRectAt(60, 50, slots, 0), null)
})

test('nearestRectAt measures to rect centers, not edges', () => {
  // A tall slot and a short one, both containing the point. The short one's
  // center is nearer vertically even though the tall one is nearer in x.
  const mixed = [
    { index: 7, rect: { left: 0,  right: 40, top: 0,  bottom: 200 } },
    { index: 9, rect: { left: 30, right: 70, top: 90, bottom: 110 } },
  ]
  assert.equal(nearestRectAt(35, 100, mixed), 9)
})
```

Also update the import line at the top of the file:

```js
import { hitTestRects, nearestRectAt, passedThreshold, DRAG_THRESHOLD, HIT_MARGIN } from './dragHit.js'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. The failure is `TypeError: nearestRectAt is not a function` — the import resolves to `undefined` because the export does not exist yet.

- [ ] **Step 3: Implement `nearestRectAt`**

Add to `src/game/dragHit.js`, directly below `hitTestRects`:

```js
/**
 * Index of the rect whose CENTER is nearest to (x, y), among those whose
 * rect — expanded by `margin` — contains the point. Null if none contain it.
 *
 * Differs from hitTestRects only where margins overlap, which for adjacent
 * slots is the whole gutter between them: an 8px margin on each side of a 6px
 * gap means both slots claim every point in it. First-match resolves that by
 * DOM order and so always yields the left slot; this resolves it by distance
 * and yields the one the player was actually closer to.
 *
 * Like hitTestRects, returns the INDEX FIELD, not the array position.
 *
 * @param {number} x
 * @param {number} y
 * @param {Array<{index: number, rect: {left:number,right:number,top:number,bottom:number}}>} rects
 * @param {number} [margin]
 * @returns {number | null}
 */
export function nearestRectAt(x, y, rects, margin = HIT_MARGIN) {
  let best = null
  let bestDist = Infinity
  for (const { index, rect } of rects) {
    if (
      x < rect.left - margin || x > rect.right + margin ||
      y < rect.top - margin || y > rect.bottom + margin
    ) continue
    const cx = (rect.left + rect.right) / 2
    const cy = (rect.top + rect.bottom) / 2
    // Squared distance: same ordering as the real distance, no sqrt.
    const dist = (x - cx) ** 2 + (y - cy) ** 2
    if (dist < bestDist) { bestDist = dist; best = index }
  }
  return best
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The 6 new `nearestRectAt` tests pass alongside the 9 pre-existing geometry tests, and the full suite stays green.

- [ ] **Step 5: Point the hook at `nearestRectAt` and accept `slotAttr`**

In `src/lib/useBagTouchDrag.js`, change the import on line 2:

```js
import { nearestRectAt, passedThreshold } from '../game/dragHit.js'
```

Change the hook signature to accept the new option:

```js
export function useBagTouchDrag({ onDrop, onMissedDrop, onDragStart, onDragEnd, slotAttr = 'data-slot-index' }) {
```

And replace the body of `slotIndexAt`:

```js
  // Rect geometry rather than document.elementFromPoint: index.css sets
  // `pointer-events: none` on every img, so the sprite the player aims at is
  // invisible to elementFromPoint. See game/dragHit.js.
  //
  // `slotAttr` names the data attribute that marks a drop target, and the
  // camelCase dataset key is derived from it. The roster rail uses
  // data-slot-index; BattleCard's prep-phase rows use data-battle-slot.
  function slotIndexAt(x, y) {
    const key = slotAttr
      .replace(/^data-/, '')
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    const rects = Array.from(document.querySelectorAll(`[${slotAttr}]`)).map(el => ({
      index: parseInt(el.dataset[key], 10),
      rect: el.getBoundingClientRect(),
    }))
    return nearestRectAt(x, y, rects)
  }
```

- [ ] **Step 6: Verify nothing regressed**

Run: `npm test`
Expected: PASS, full suite green.

Run: `npm run lint`
Expected: no new errors. `hitTestRects` is no longer imported by the hook, but it remains exported and tested — that is intentional, not dead code.

- [ ] **Step 7: Manual device verification**

`npm run dev`, phone or touch emulation at 360px. Drag a bag item and release it in the visible gap *between* two Pokémon slots, closer to the right-hand one.

Expected: the item goes to the right-hand Pokémon.
Before this change: it went to the left-hand one regardless.

- [ ] **Step 8: Commit**

```bash
git add src/game/dragHit.js src/game/dragHit.test.js src/lib/useBagTouchDrag.js
git commit -m "feat(drag): resolve overlapping hit margins by nearest center"
```

---

### Task 3: Guarantee `preventDefault` regardless of consumer styling

In `onTouchMove`, the below-threshold early return happens *before* `e.preventDefault()`. Today that is harmless: bag `<img>` elements carry `touchAction: 'none'` inline, so the browser never scrolls from a touch that starts on one. But the hook is about to gain two more consumers, and nothing in its contract forces them to set `touchAction`. A consumer that forgets gets a page that scrolls for the first 4px of every drag.

Calling `preventDefault()` on every tracked `touchmove` makes the hook self-sufficient. The cost is that a press-and-slide on a bag item can no longer scroll the bag bar — which is already true via `touchAction: 'none'`, so nothing changes in practice.

**Files:**
- Modify: `src/lib/useBagTouchDrag.js:68-85` (`onTouchMove`)
- Test: `src/lib/useBagTouchDrag.test.jsx` (extend the file Task 1 created)

**Interfaces:**
- Consumes: `ghostTransform(x, y)` and `ghostPos` from Task 1; the `Harness` component and dispatch helper already in `src/lib/useBagTouchDrag.test.jsx`.
- Produces: no signature change.

- [ ] **Step 0: Write the failing test**

Append to `src/lib/useBagTouchDrag.test.jsx`, reusing the `Harness` and dispatch helper already in that file:

```jsx
test('scrolling is suppressed from the first tracked move, before the threshold', () => {
  render(<Harness />)
  const item = screen.getByTestId('item')

  const start = makeTouch({ identifier: 0, clientX: 100, clientY: 100 })
  act(() => { item.ontouchstart?.(touchEvent([start])) })

  // 2px — deliberately UNDER the 4px threshold, so no drag starts. The
  // browser must still be told not to turn this into a page scroll.
  const tiny = makeTouch({ identifier: 0, clientX: 102, clientY: 100 })
  const e = touchEvent([tiny])
  act(() => { item.ontouchmove?.(e) })

  expect(e.preventDefault.mock.calls.length).toBe(1)
})

test('an untracked finger does not suppress scrolling', () => {
  render(<Harness />)
  const item = screen.getByTestId('item')

  const start = makeTouch({ identifier: 0, clientX: 100, clientY: 100 })
  act(() => { item.ontouchstart?.(touchEvent([start])) })

  // A different finger entirely — the hook is not tracking it, so it must
  // not claim the gesture.
  const other = makeTouch({ identifier: 9, clientX: 300, clientY: 300 })
  const e = touchEvent([other])
  act(() => { item.ontouchmove?.(e) })

  expect(e.preventDefault.mock.calls.length).toBe(0)
})
```

If Task 1 settled on `fireEvent` rather than direct `on*` properties, use `fireEvent` here too — but note `fireEvent` does not let you inspect `preventDefault` directly. In that case assert via the event's `defaultPrevented`: build the event with `createEvent.touchMove(...)`, dispatch with `fireEvent(el, evt)`, then `expect(evt.defaultPrevented).toBe(true)`.

- [ ] **Step 0b: Run the tests to verify the first one fails**

Run: `npm test src/lib/useBagTouchDrag.test.jsx`
Expected: FAIL on "scrolling is suppressed from the first tracked move" — `expected 0 to be 1`, because the current code returns before `preventDefault()` when under threshold. The "untracked finger" test should already pass.

- [ ] **Step 1: Move `preventDefault` above the threshold check**

In `src/lib/useBagTouchDrag.js`, `onTouchMove` currently reads:

```js
    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true
      onDragStart?.(st.item, st.from)
      setGhostItem(st.item)
    }
    e.preventDefault() // stop the page scrolling mid-drag
```

Replace with:

```js
    // Unconditional, and BEFORE the threshold check: this hook must not depend
    // on its consumers remembering `touchAction: 'none'`. Once a touch is being
    // tracked, the browser does not get to turn it into a scroll — including
    // during the first few px, before it has promoted to a drag.
    e.preventDefault()

    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true
      onDragStart?.(st.item, st.from)
      setGhostItem(st.item)
    }
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test src/lib/useBagTouchDrag.test.jsx`
Expected: PASS, 5 tests (3 from Task 1, 2 from this task).

Run: `npm test`
Expected: PASS, full suite green.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual device verification**

`npm run dev`, phone or touch emulation. Two checks:

1. Press a bag item and move a few px without lifting, then lift. Expected: the item's info popup opens (a tap is still a tap — `preventDefault` on `touchmove` does not suppress the synthesized click, because the gesture never promoted and `onTouchEnd` returns early).
2. Press a bag item and drag onto a Pokémon. Expected: the page behind does not scroll at any point during the drag, including the first few px.

- [ ] **Step 4: Commit**

```bash
git add src/lib/useBagTouchDrag.js
git commit -m "fix(drag): stop scrolling from the first px, not just past threshold"
```

---

### Task 4: Roster reorder adopts the shared gesture

`Roster.jsx` hand-rolls the same gesture the hook already implements, worse in four ways: no threshold (a tap picks a Pokémon up), `elementFromPoint` hit testing (defeated by the global `img { pointer-events: none }`), unguarded `touches[0]` (a second finger hijacks it), and no `touchcancel` (an interruption leaves a slot stuck mid-drag). It also carries a dead `slotIndexFromTouch` function that nothing calls.

Reorder is a *slot-to-slot* gesture, not bag-to-slot, so `from` carries the source index. Everything else maps directly onto the hook.

Reorder does not need a ghost — the existing `isDragging` styling already communicates the drag — so `ghostRef`/`ghostItem` are simply not destructured.

**Files:**
- Modify: `src/components/Roster.jsx:1` (imports), `:205-206` (touch state), `:226-260` (delete four functions), `:262-275` (`slotProps`)
- Test: `src/lib/useBagTouchDrag.test.jsx` (extend) — the gesture guarantees this task depends on are tested at the hook, which is where they live. Roster's own wiring is confirmed by the manual steps.

**Interfaces:**
- Consumes: `useBagTouchDrag({ onDrop, onMissedDrop, onDragStart, onDragEnd, slotAttr })` from Task 2, with the Task 1 and Task 3 fixes in place.
- Produces: nothing consumed by later tasks. Task 5 mirrors this shape independently.

- [ ] **Step 0: Test the guarantees Roster is about to depend on**

Roster is adopting the hook specifically to get a movement threshold and `touchcancel` cleanup. Pin both at the hook before rewiring the component. Append to `src/lib/useBagTouchDrag.test.jsx`:

```jsx
test('touchcancel reports an unsettled ending so the caller can clean up', () => {
  const onDragEnd = vi.fn()
  const onDrop = vi.fn()
  render(<Harness callbacks={{ onDragEnd, onDrop }} />)
  const item = screen.getByTestId('item')

  pressAndMove(item, { from: { x: 100, y: 100 }, to: { x: 150, y: 200 } })
  act(() => { item.ontouchcancel?.(touchEvent([])) })

  expect(onDragEnd.mock.calls.length).toBe(1)
  expect(onDragEnd.mock.calls[0][0]).toBe(false) // unsettled
  expect(onDrop.mock.calls.length).toBe(0)
  expect(screen.queryByTestId('ghost')).toBeNull()
})

test('a tap under the threshold fires no drag callbacks at all', () => {
  const onDragStart = vi.fn()
  const onDragEnd = vi.fn()
  render(<Harness callbacks={{ onDragStart, onDragEnd }} />)
  const item = screen.getByTestId('item')

  pressAndMove(item, { from: { x: 100, y: 100 }, to: { x: 102, y: 101 } })
  act(() => { item.ontouchend?.(touchEvent([], [makeTouch({ identifier: 0, clientX: 102, clientY: 101 })])) })

  expect(onDragStart.mock.calls.length).toBe(0)
  expect(onDragEnd.mock.calls.length).toBe(0)
})

test('a touchcancel after a settled touchend does not fire a second ending', () => {
  const onDragEnd = vi.fn()
  render(<Harness callbacks={{ onDragEnd }} />)
  const item = screen.getByTestId('item')

  pressAndMove(item, { from: { x: 100, y: 100 }, to: { x: 150, y: 200 } })
  const lift = makeTouch({ identifier: 0, clientX: 150, clientY: 200 })
  act(() => { item.ontouchend?.(touchEvent([], [lift])) })
  // Some browsers fire touchcancel AFTER a normal touchend for the same touch.
  act(() => { item.ontouchcancel?.(touchEvent([])) })

  expect(onDragEnd.mock.calls.length).toBe(1)
  expect(onDragEnd.mock.calls[0][0]).toBe(true) // settled, not clobbered
})
```

- [ ] **Step 0b: Run them**

Run: `npm test src/lib/useBagTouchDrag.test.jsx`
Expected: PASS, 8 tests. These describe behavior the hook **already has** — they are regression pins, not a red-green cycle. If any fails, stop and report: the hook is not what Tasks 1–3 left behind.

- [ ] **Step 1: Import the hook**

At the top of `src/components/Roster.jsx`, alongside the existing imports, add:

```js
import { useBagTouchDrag } from '../lib/useBagTouchDrag.js'
```

- [ ] **Step 2: Replace the four hand-rolled touch functions with the hook**

Delete all of the following from `src/components/Roster.jsx`:

- the `const touchFrom = useRef(null)` declaration and its `// Touch drag state` comment (around `:205-206`)
- `function slotIndexFromTouch(touch, containerRef)` (around `:226-233`) — dead code, nothing calls it
- `function handleTouchStart(i)` (around `:235-238`)
- `function handleTouchMove(e)` (around `:240-247`)
- `function handleTouchEnd(e)` (around `:249-260`)

In their place, directly below the existing `handleDrop` function, add:

```js
  // Touch reorder. Shares its gesture with the bag drag — same movement
  // threshold, same rect hit testing, same interruption handling — so the two
  // drags a player can start on this screen behave identically. The hook owns
  // WHEN a drag happens; this component owns what a drop MEANS.
  //
  // No ghost here: the source slot's own isDragging styling already shows what
  // is being moved, so ghostRef/ghostItem go unused.
  const { bagTouchProps: reorderTouchProps } = useBagTouchDrag({
    onDragStart: (_pokemon, fromIndex) => setDragFrom(fromIndex),
    onDrop: (_pokemon, fromIndex, toIndex) => {
      if (fromIndex !== toIndex) onSwap?.(fromIndex, toIndex)
      setDragFrom(null)
      setDragOver(null)
    },
    // Released off every slot: a reorder has nowhere to degrade to, so just
    // put the slot back. Unlike a bag drop there is no notice — the player
    // dropped a Pokémon on empty space and nothing happening is the expected
    // outcome, not a failure worth interrupting them about.
    onMissedDrop: () => { setDragFrom(null); setDragOver(null) },
    // Fires on OS interruption (notification, system gesture, call), where no
    // touchend arrives at all. Without it the source slot stays visually
    // picked-up forever. `settled` endings already cleared state above.
    onDragEnd: (settled) => {
      if (!settled) { setDragFrom(null); setDragOver(null) }
    },
  })
```

Note what is gone along with the old code: `dragOver` is no longer updated *during* a touch move, so the live "hovering over this slot" highlight does not track the finger on touch. Step 3 restores it.

- [ ] **Step 3: Keep the live drop-target highlight during a touch drag**

The old `handleTouchMove` called `setDragOver(idx)` on every move, which is what highlighted the slot under the finger. The hook deliberately does not expose per-move position — routing it through React state is the re-render problem the ghost refactor solved.

For reorder the highlight is worth one state update per *slot change*, not per pixel. Add a `data-slot-index`-scoped move handler that only sets state when the target actually changes. Directly below the hook call, add:

```js
  // The hook does not surface per-move position on purpose — a setState per
  // touchmove is what used to re-render the whole map. But reorder needs the
  // "you are over this slot" highlight, so track it here and write state only
  // when the target actually changes, which is a handful of times per drag
  // rather than 60-120 times per second.
  function handleReorderMove(e) {
    if (dragFrom === null) return
    const t = e.touches[0]
    if (!t) return
    const rects = Array.from(document.querySelectorAll('[data-slot-index]')).map(el => ({
      index: parseInt(el.dataset.slotIndex, 10),
      rect: el.getBoundingClientRect(),
    }))
    const idx = nearestRectAt(t.clientX, t.clientY, rects)
    setDragOver(prev => (prev === idx ? prev : idx))
  }
```

And add `nearestRectAt` to the imports at the top of the file:

```js
import { nearestRectAt } from '../game/dragHit.js'
```

- [ ] **Step 4: Wire the new handlers into `slotProps`**

In `slotProps(i)`, replace these three lines:

```js
    onTouchStart: (onSwap && !itemTargeting) ? () => handleTouchStart(i) : undefined,
    onTouchMove: (onSwap && !itemTargeting) ? handleTouchMove : undefined,
    onTouchEnd: (onSwap && !itemTargeting) ? handleTouchEnd : undefined,
```

with:

```js
    // Spread the hook's handlers (start/move/end/cancel), then layer the
    // highlight-tracking move on top of the hook's own move handler — both
    // need to run, and the hook's must run first so it can preventDefault.
    ...((onSwap && !itemTargeting) ? (() => {
      const props = reorderTouchProps(roster[i], i)
      return {
        ...props,
        onTouchMove: (e) => { props.onTouchMove(e); handleReorderMove(e) },
      }
    })() : {}),
```

The hook's `bagTouchProps(item, from)` signature takes the dragged thing and its origin. For reorder those are the Pokémon and its slot index, which is why `onDragStart`/`onDrop` above receive `fromIndex` as their second argument.

- [ ] **Step 5: Verify the build**

Run: `npm run lint`
Expected: no new errors. `useRef` may now be unused in this file — if lint flags it, remove it from the React import. `slotIndexFromTouch` is gone, so its unused `containerRef` warning (if any) goes with it.

Run: `npm test`
Expected: PASS, full suite green. This task touches no pure logic; you are confirming you did not break the module graph.

- [ ] **Step 6: Manual device verification**

`npm run dev`, phone or touch emulation at 360px, on the map screen with 2+ Pokémon in the roster.

1. **Tap a Pokémon.** Expected: its info popup opens and the slot does **not** visibly lift or dim. Before this task, any tap started a drag.
2. **Drag one Pokémon onto another.** Expected: they swap. Confirm the drop lands when your finger is over the *sprite*, not just the slot's padding — that is the `elementFromPoint` fix.
3. **Drag a Pokémon and release it on empty space** away from the rail. Expected: no swap, and the source slot returns to normal (no stuck highlight).
4. **Start a drag, then pull down the notification shade** (real device) or fire a `touchcancel` from DevTools. Expected: on return, no slot is stuck in the dragging state.
5. **While an item is being placed** (drag a bag item, release it on empty space so placing mode stays active), confirm tapping a Pokémon still equips it — the `!itemTargeting` guard must still suppress reorder.

- [ ] **Step 7: Commit**

```bash
git add src/components/Roster.jsx
git commit -m "refactor(drag): roster reorder shares the bag drag gesture"
```

---

### Task 5: BattleCard reorder adopts the shared gesture

`BattleCard.jsx`'s `RosterColumn` is the third copy of the same gesture, with the same four defects as Roster's: zero threshold, `elementFromPoint` hit testing (over `data-battle-slot`), unguarded `touches[0]`, no `touchcancel`. It is only active during the battle prep phase, which is why it has been the least noticed.

Structurally identical to Task 4, with two differences: the slot attribute is `data-battle-slot`, and the handlers live in a `dragProps` object built inline rather than a `slotProps` function.

**Files:**
- Modify: `src/components/BattleCard.jsx:1` (imports), `:1320-1343` (`RosterColumn`'s drag state and `dragProps`)
- Test: `src/lib/useBagTouchDrag.test.jsx` (extend) — `slotAttr` routing is tested at the hook; BattleCard's own wiring is confirmed by the manual steps.

**Interfaces:**
- Consumes: `useBagTouchDrag({ ..., slotAttr })` from Task 2, with Task 1 and Task 3 fixes in place.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the hook and the geometry helper**

At the top of `src/components/BattleCard.jsx`, add:

```js
import { useBagTouchDrag } from '../lib/useBagTouchDrag.js'
import { nearestRectAt } from '../game/dragHit.js'
```

- [ ] **Step 2: Replace `slotFromPoint` and the touch handlers**

In `RosterColumn`, delete:

- `const touchFrom = useRef(null)` (around `:1323`)
- the `slotFromPoint` arrow function (around `:1325-1328`)
- the `onTouchStart`, `onTouchMove`, and `onTouchEnd` entries inside `dragProps` (around `:1337-1343`)

Then, directly above the `dragProps` declaration, add:

```js
  // Touch reorder, sharing its gesture with the bag drag and the map roster's
  // reorder: same 4px threshold, same rect hit testing over data-battle-slot,
  // same touchcancel cleanup. Three hand-rolled copies of this used to drift
  // independently; this is the one implementation.
  //
  // No ghost — the row's own isDragging styling shows what is being moved.
  const { bagTouchProps: reorderTouchProps } = useBagTouchDrag({
    slotAttr: 'data-battle-slot',
    onDragStart: (_pokemon, fromIndex) => setDragFrom(fromIndex),
    onDrop: (_pokemon, fromIndex, toIndex) => {
      if (fromIndex !== toIndex) onSwap(fromIndex, toIndex)
      setDragFrom(null)
      setDragOver(null)
    },
    onMissedDrop: () => { setDragFrom(null); setDragOver(null) },
    // OS interruption: no touchend ever arrives, so without this the row stays
    // visually picked up for the rest of the prep phase.
    onDragEnd: (settled) => {
      if (!settled) { setDragFrom(null); setDragOver(null) }
    },
  })

  // Highlight the row under the finger. State is written only when the target
  // changes, not per touchmove — see the same note in Roster.jsx.
  function handleReorderMove(e) {
    if (dragFrom === null) return
    const t = e.touches[0]
    if (!t) return
    const rects = Array.from(document.querySelectorAll('[data-battle-slot]')).map(el => ({
      index: parseInt(el.dataset.battleSlot, 10),
      rect: el.getBoundingClientRect(),
    }))
    const idx = nearestRectAt(t.clientX, t.clientY, rects)
    setDragOver(prev => (prev === idx ? prev : idx))
  }
```

- [ ] **Step 3: Wire the handlers into `dragProps`**

`dragProps` should now read in full:

```js
  const dragProps = i => {
    if (!reorderable) return {}
    const touch = reorderTouchProps(roster[i], i)
    return {
      'data-battle-slot': i,
      draggable: true,
      onDragStart: () => setDragFrom(i),
      onDragEnter: () => setDragOver(i),
      onDragOver: e => e.preventDefault(),
      onDrop: () => { if (dragFrom !== null && dragFrom !== i) onSwap(dragFrom, i); setDragFrom(null); setDragOver(null) },
      onDragEnd: () => { setDragFrom(null); setDragOver(null) },
      ...touch,
      // Both move handlers run: the hook's first, so it can preventDefault and
      // promote the drag, then the highlight tracker.
      onTouchMove: (e) => { touch.onTouchMove(e); handleReorderMove(e) },
    }
  }
```

Note this changes `dragProps` from a ternary expression to a block body. The desktop HTML5 drag entries are unchanged.

- [ ] **Step 4: Verify the build**

Run: `npm run lint`
Expected: no new errors. `useRef` may now be unused in `BattleCard.jsx` — check whether anything else in the file uses it before removing it from the import; this is a large file with other components in it.

Run: `npm test`
Expected: PASS, full suite green.

- [ ] **Step 5: Manual device verification**

`npm run dev`, phone or touch emulation. Start a battle and stay in the **prep phase** (reorder is disabled once the battle begins — `phase === 'prep'`).

1. **Tap a roster row.** Expected: no visible pick-up. Before this task, any tap started a drag.
2. **Drag one row onto another.** Expected: they swap, including when releasing over the sprite rather than the row's padding.
3. **Drag a row and release it off the rail.** Expected: no swap, no stuck highlight.
4. **Interrupt a drag** with a notification pull-down or a DevTools `touchcancel`. Expected: no row left in the dragging state.
5. **Advance past prep.** Expected: rows are no longer draggable at all — the `reorderable` guard still short-circuits `dragProps` to `{}`.

- [ ] **Step 6: Commit**

```bash
git add src/components/BattleCard.jsx
git commit -m "refactor(drag): battle roster reorder shares the bag drag gesture"
```

---

### Task 6: Correct the mobile bag comment

The comment above the mobile bag bar promises a two-tap path that does not exist:

> *drag an item onto a Pokémon to equip (as on desktop), or tap to pick it up then tap a Pokémon*

Tapping opens the info popup. What *does* exist, added on this branch, is that a **missed** drop keeps placing mode alive so the player can then tap a Pokémon — a real recovery path that no comment currently describes. Fix the comment to describe the code.

**Files:**
- Modify: `src/components/NodeMap.jsx:1361-1362`
- Test: none — comment only.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Replace the comment**

In `src/components/NodeMap.jsx`, replace:

```jsx
            {/* Bag — drag an item onto a Pokémon to equip (as on desktop), or tap
                to pick it up then tap a Pokémon. Drop here to stow back. */}
```

with:

```jsx
            {/* Bag — drag an item onto a Pokémon to equip (as on desktop), or tap
                it for the info popup, which has an Equip action. A drag released
                on no Pokémon KEEPS placing mode active, so the recovery is to tap
                a Pokémon; tapping the item itself does not pick it up. Drop
                here to stow back. */}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: no new errors.

Read the comment against the code beneath it: the `<img>`'s `onClick` calls `setInfoItem`, and the hook's `onMissedDrop` calls `setNotice` without clearing `movingItem`. The comment now matches both.

- [ ] **Step 3: Commit**

```bash
git add src/components/NodeMap.jsx
git commit -m "docs(drag): describe the recovery path the bag bar actually has"
```

---

## Verification: the whole system

After all six tasks, run this once end to end. It is the check that the three drags now feel like one interaction.

- [ ] Run `npm test` — expected PASS, entire suite green (geometry + hook + harness tests).
- [ ] Run `npm run lint` — expected no errors.
- [ ] On a phone or 360px touch emulation, confirm all three drags share the same behavior:

| Behavior | Bag → Pokémon | Roster reorder | Battle prep reorder |
|---|---|---|---|
| A tap does not start a drag | ☐ | ☐ | ☐ |
| ~4px of movement starts one | ☐ | ☐ | ☐ |
| Dropping over a sprite lands | ☐ | ☐ | ☐ |
| Dropping in a gutter picks the nearer target | ☐ | ☐ | ☐ |
| Releasing on nothing leaves no stuck state | ☐ | ☐ | ☐ |
| An OS interruption leaves no stuck state | ☐ | ☐ | ☐ |
| A second finger does not hijack the drag | ☐ | ☐ | ☐ |

- [ ] Confirm the desktop mouse paths still work: HTML5 drag of a bag item onto a Pokémon, HTML5 drag to reorder the roster, and the info-popup Equip action.

## Notes for whoever picks this up

- **Where the tests live.** Geometry is unit-tested in `src/game/dragHit.test.js` (no DOM needed). Gesture behavior — ghost mount timing, `preventDefault` scope, cancel semantics, identifier tracking — is tested against jsdom in `src/lib/useBagTouchDrag.test.jsx`. Roster and BattleCard are NOT tested directly: both need substantial prop scaffolding to render, and every guarantee this plan gives them lives in the hook, which is tested. Their wiring is confirmed on-device.
- **Task 0 is load-bearing.** Every later task's tests import `src/test/touch.js`. If Task 0's harness cannot render a hook, stop — do not proceed by falling back to manual-only verification.
- **Why `hitTestRects` survives.** Task 2 adds `nearestRectAt` rather than changing `hitTestRects` in place. Both stay exported and tested. `hitTestRects` has no callers after Task 2 — keep it anyway; it documents the first-match semantics that the nearest-center version deliberately departs from, and its tests pin the margin arithmetic that both functions share.
- **The `slotAttr` default matters.** It defaults to `'data-slot-index'` so NodeMap and EliteFour need no edit in Task 2. If you change the default, you must update both.
