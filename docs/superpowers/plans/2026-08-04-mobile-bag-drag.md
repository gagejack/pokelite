# Mobile Bag Drag Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dragging a bag item onto a Pokémon on mobile land reliably, never fail silently, and never leave the screen stuck in targeting mode.

**Architecture:** Extract the drag's testable logic into a new import-free leaf module (`src/game/dragHit.js`) so `node --test` can cover it, then rewire the two screens that own bag drags (`NodeMap.jsx`, `EliteFour.jsx`) to use it. The DOM-facing parts — `touchcancel` cleanup, ref-based ghost positioning, touch-identifier tracking — are applied directly to both screens. A final task extracts the now-corrected handler set into a shared hook so the three copies stop drifting.

**Tech Stack:** React 19, Vite 8, plain `node --test` (no DOM test environment — see Global Constraints), no new dependencies.

**Source of findings:** `docs/MOBILE_BAG_DRAG_REVIEW.md` (revised 2026-08-04). Task numbers below map to that document's findings.

## Global Constraints

- **No new dependencies.** `package.json` must not gain entries. Everything here is plain React + DOM.
- **No DOM test environment exists.** `npm test` is bare `node --test`, and there is no jsdom, testing-library, vitest, or jest. Tests may therefore only cover **pure functions in import-free leaf modules**. Never write a test that mounts a component, touches `document`, or imports a `.jsx` file — `node --test` cannot import JSX and will error with `ERR_UNKNOWN_FILE_EXTENSION`.
- **Test files live beside their module** as `<name>.test.js` (see the existing `src/game/shop.test.js`, `src/game/moveSounds.data.test.js`). `node --test` discovers them automatically.
- **Leaf modules import nothing.** `src/game/dragHit.js` must have zero imports, matching the established pattern in `src/game/rng.js`, `src/game/dailyScore.js`, and `src/game/seed.js`. This is what makes it Node-testable.
- **Lint baseline is 58 problems (53 errors, 5 warnings).** These are pre-existing (ref-during-render in `AnimatedHpBar.jsx`, fast-refresh rules in `theme.jsx`/`settings.jsx`). `npm run lint` must report **exactly 58** after every task. A 59th means you introduced one.
- **Test baseline is 14 passing.** Task 1 raises it; after Task 1 the new baseline is whatever Task 1 establishes. Never let a task reduce the passing count.
- **Both screens must stay in parity.** Every behavioural change to `NodeMap.jsx`'s bag drag gets the identical change in `EliteFour.jsx`. These two files already carry near-verbatim copies of this code; a fix landing in only one is how they drifted before.
- **Do not add `onTouchEnd` to roster slots.** Touch events are implicitly captured to their `touchstart` target, so a roster slot can never receive the `touchend` of a drag that began on a bag item. See Appendix A of the review. This was a rejected approach; do not reintroduce it.
- **Commit after every task** using the message given in that task's final step.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/game/dragHit.js` | Pure geometry + gesture math for touch drags. Rect-based hit testing and the drag threshold. Import-free leaf so it is Node-testable. |
| `src/game/dragHit.test.js` | `node --test` coverage for the above. |
| `src/lib/useBagTouchDrag.js` | (Task 7 only) Shared React hook wrapping the corrected touch-drag handler set, consumed by both screens. |

**Modified:**

| File | What changes |
|---|---|
| `src/components/NodeMap.jsx:1106-1168` | Bag touch-drag handlers: rect hit test, silent-failure notice, `touchcancel`, ref-based ghost, touch identifier. |
| `src/components/NodeMap.jsx:1460-1472` | Drag ghost element gains a ref for direct transform updates. |
| `src/components/EliteFour.jsx:251-297` | Identical changes to its copy of the same handlers. |
| `src/components/EliteFour.jsx:473-485` | Identical ghost change. |

**Deliberately untouched:**

- `src/components/Roster.jsx` — the `itemTargeting` handler stripping at `:273-275` is correct and load-bearing. It stops a *new* touch landing on a slot from starting a reorder mid-placement. Leave it.
- `src/components/BattleCard.jsx:1325-1343` — a third copy of the pattern, but it is roster *reorder*, not bag drag, and is out of scope. Task 7 notes it for a follow-up.
- `src/index.css:50-54` — the global `img { pointer-events: none }` stays. Task 1's rect-based hit test makes it irrelevant to the drop rather than requiring its removal, which is safer: that rule is load-bearing elsewhere.

---

## Task 1: Rect-based hit testing and threshold math (leaf module)

Replaces `document.elementFromPoint` — which misses because the global `img { pointer-events: none }` rule hides the sprite the player aims at, and because a ~58px mobile slot is smaller than finger-centroid error. Geometry doesn't care what is painted where, and a margin makes the effective target *larger* than the visual slot.

**Files:**
- Create: `src/game/dragHit.js`
- Test: `src/game/dragHit.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `hitTestRects(x: number, y: number, rects: Array<{index: number, rect: {left,right,top,bottom}}>, margin?: number) => number | null` — index of the first rect containing the point (expanded by `margin`, default `8`), else `null`.
  - `passedThreshold(startX: number, startY: number, x: number, y: number, threshold?: number) => boolean` — true once movement exceeds `threshold` (default `4`).
  - `DRAG_THRESHOLD: number` — `4`.
  - `HIT_MARGIN: number` — `8`.

- [ ] **Step 1: Write the failing test**

Create `src/game/dragHit.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { hitTestRects, passedThreshold, DRAG_THRESHOLD, HIT_MARGIN } from './dragHit.js'

// Three 58px-wide slots in a row, 100px tall, like the mobile roster rail.
const slots = [
  { index: 0, rect: { left: 0,   right: 58,  top: 0, bottom: 100 } },
  { index: 1, rect: { left: 64,  right: 122, top: 0, bottom: 100 } },
  { index: 2, rect: { left: 128, right: 186, top: 0, bottom: 100 } },
]

test('a point inside a slot returns that slot index', () => {
  assert.equal(hitTestRects(30, 50, slots), 0)
  assert.equal(hitTestRects(90, 50, slots), 1)
  assert.equal(hitTestRects(150, 50, slots), 2)
})

test('slot 0 is index 0, not a falsy miss', () => {
  // Guards the `idx != null` vs `if (idx)` bug: slot 0 is a real target.
  assert.notEqual(hitTestRects(30, 50, slots), null)
  assert.equal(hitTestRects(30, 50, slots), 0)
})

test('the margin catches a near-miss just outside a slot', () => {
  // 62px is in the 6px gutter between slots 0 and 1 — a miss without margin.
  assert.equal(hitTestRects(62, 50, slots), 0)
  // 5px above the top edge, within the 8px margin.
  assert.equal(hitTestRects(30, -5, slots), 0)
})

test('a point beyond the margin misses', () => {
  assert.equal(hitTestRects(30, -20, slots), null)
  assert.equal(hitTestRects(300, 50, slots), null)
})

test('an empty rect list misses instead of throwing', () => {
  assert.equal(hitTestRects(30, 50, []), null)
})

test('margin is configurable and zero disables forgiveness', () => {
  assert.equal(hitTestRects(62, 50, slots, 0), null)
})

test('passedThreshold is false below and true above the default', () => {
  assert.equal(passedThreshold(100, 100, 102, 100), false)
  assert.equal(passedThreshold(100, 100, 110, 100), true)
})

test('passedThreshold measures diagonal distance, not per-axis', () => {
  // dx=3, dy=3 → 4.24px, past the 4px default.
  assert.equal(passedThreshold(100, 100, 103, 103), true)
  // dx=2, dy=2 → 2.83px, under it.
  assert.equal(passedThreshold(100, 100, 102, 102), false)
})

test('exported constants are the documented values', () => {
  assert.equal(DRAG_THRESHOLD, 4)
  assert.equal(HIT_MARGIN, 8)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test 2>&1 | tail -20`

Expected: FAIL — `Cannot find module '.../src/game/dragHit.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/game/dragHit.js`:

```js
// Pure geometry + gesture math for touch drags (mobile bag → Pokémon).
//
// A LEAF module: imports nothing, so `node --test` can cover it. The DOM work
// (reading rects, attaching handlers) stays in the components; everything here
// is arithmetic over plain numbers.
//
// WHY RECTS AND NOT document.elementFromPoint. The drop used to hit-test with
// elementFromPoint, which fails two ways on this UI: index.css sets
// `pointer-events: none` on every img, so the Pokémon sprite — the thing the
// player is actually aiming at — is invisible to the test and it returns
// whatever is painted behind; and a mobile roster slot is ~58px wide, smaller
// than the error between where a finger looks like it is pointing and the
// centroid the browser reports. Geometry has neither problem, and a margin
// makes the target BIGGER than the slot instead of smaller.

// Forgiveness in px around each slot's rect. Sized to cover the 6px gutter
// between adjacent mobile slots, so a drop in the gap lands on a neighbour
// rather than nowhere.
export const HIT_MARGIN = 8

// Movement in px before a press becomes a drag. Low, because the only thing
// this disambiguates is tap-vs-drag: bag items carry `touchAction: 'none'`, so
// a touch starting on an item can never scroll the bag bar, and a larger
// threshold only makes the gesture feel sticky.
export const DRAG_THRESHOLD = 4

/**
 * Index of the first rect containing (x, y), expanded by `margin`. Null if none.
 *
 * Returns the INDEX FIELD, not the array position, so callers can pass a
 * filtered or reordered subset without the answer shifting.
 *
 * @param {number} x
 * @param {number} y
 * @param {Array<{index: number, rect: {left:number,right:number,top:number,bottom:number}}>} rects
 * @param {number} [margin]
 * @returns {number | null}
 */
export function hitTestRects(x, y, rects, margin = HIT_MARGIN) {
  for (const { index, rect } of rects) {
    if (
      x >= rect.left - margin && x <= rect.right + margin &&
      y >= rect.top - margin && y <= rect.bottom + margin
    ) {
      return index
    }
  }
  return null
}

/**
 * Has the finger moved far enough from its start point to count as a drag?
 * Straight-line distance, so a diagonal drag promotes as readily as an axial one.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} x
 * @param {number} y
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function passedThreshold(startX, startY, x, y, threshold = DRAG_THRESHOLD) {
  return Math.hypot(x - startX, y - startY) >= threshold
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`

Expected: `fail 0`, and `pass` is 23 (the 14 existing plus 9 new).

- [ ] **Step 5: Verify lint is unchanged**

Run: `npm run lint 2>&1 | tail -2`

Expected: exactly `✖ 58 problems (53 errors, 5 warnings)`.

- [ ] **Step 6: Commit**

```bash
git add src/game/dragHit.js src/game/dragHit.test.js
git commit -m "feat(drag): add rect-based hit testing leaf module

elementFromPoint misses the drop: index.css sets pointer-events:none on
every img, so the sprite the player aims at is invisible to the test, and
a ~58px mobile slot is smaller than finger-centroid error. Rect geometry
has neither problem, and HIT_MARGIN makes the target larger than the slot.

Leaf module (zero imports) so node --test can cover it."
```

---

## Task 2: Wire the rect hit test into NodeMap, and never fail silently

The drop currently falls through with no feedback when the hit test misses (`NodeMap.jsx:1155`). An interaction that fails invisibly reads as broken; one that says so is merely imperfect. `setNotice` already exists on this screen for exactly this class of message (`:1113`, used for no-op consumables) and is rendered at `:1476`.

**Files:**
- Modify: `src/components/NodeMap.jsx:1106-1168`

**Interfaces:**
- Consumes: `hitTestRects`, `DRAG_THRESHOLD`, `passedThreshold` from `src/game/dragHit.js` (Task 1).
- Produces: a `slotIndexAt(x, y)` in `NodeMap` with an unchanged signature — `(number, number) => number | null` — so no call site changes.

- [ ] **Step 1: Add the import**

In `src/components/NodeMap.jsx`, find the import block near the top (around line 3, alongside `import { cash, muted, chipInk, accent } from '../lib/colors'`). Add:

```js
import { hitTestRects, passedThreshold, DRAG_THRESHOLD } from '../game/dragHit.js'
```

- [ ] **Step 2: Replace `slotIndexAt` with the rect-based version**

In `src/components/NodeMap.jsx`, find this block (around line 1121-1127):

```js
  const DRAG_THRESHOLD = 8

  function slotIndexAt(x, y) {
    const el = document.elementFromPoint(x, y)
    const slotEl = el?.closest('[data-slot-index]')
    return slotEl ? parseInt(slotEl.dataset.slotIndex, 10) : null
  }
```

Replace it with (note the local `const DRAG_THRESHOLD = 8` is deleted — it now comes from the import):

```js
  // Rect geometry, not elementFromPoint — see game/dragHit.js for why.
  // Reads the live rects at drop time so a scrolled or resized rail is correct.
  function slotIndexAt(x, y) {
    const rects = Array.from(document.querySelectorAll('[data-slot-index]')).map(el => ({
      index: parseInt(el.dataset.slotIndex, 10),
      rect: el.getBoundingClientRect(),
    }))
    return hitTestRects(x, y, rects)
  }
```

- [ ] **Step 3: Use the shared threshold helper in `bagTouchMove`**

Find (around line 1139-1141):

```js
    if (!st.dragging) {
      if (Math.hypot(t.clientX - st.startX, t.clientY - st.startY) < DRAG_THRESHOLD) return
      st.dragging = true // promote to a drag
```

Replace with:

```js
    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true // promote to a drag
```

- [ ] **Step 4: Make a missed drop say so**

Find (around line 1153-1162):

```js
    const t = e.changedTouches[0]
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) {
      // Consumables must be USED, not equipped — this path bypasses
      // resolveItemMove, so it has to make the same decision itself. Without
      // this, touch-dragging a Max Revive onto a Pokémon would silently equip
      // it as a dead held item and displace whatever it was holding.
      applyConsumableTo(st.item, st.from, idx)
    }
    setMovingItem(null) // clear placing mode whether or not it landed on a slot
```

Replace with:

```js
    const t = e.changedTouches[0]
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) {
      // Consumables must be USED, not equipped — this path bypasses
      // resolveItemMove, so it has to make the same decision itself. Without
      // this, touch-dragging a Max Revive onto a Pokémon would silently equip
      // it as a dead held item and displace whatever it was holding.
      applyConsumableTo(st.item, st.from, idx)
      setMovingItem(null)
      return
    }
    // Dropped on nothing. Previously this cleared placing mode with no message,
    // so a missed drop was indistinguishable from a broken one. Instead, STAY in
    // placing mode: the drag degrades into tap-to-place, and the banner already
    // on screen tells the player what to do next. `movingItem` is deliberately
    // left set.
    setNotice('Dropped nowhere — tap a Pokémon to give it')
```

- [ ] **Step 5: Verify the threshold constant is no longer declared twice**

Run: `grep -n "DRAG_THRESHOLD" src/components/NodeMap.jsx`

Expected: exactly one line — the import. If a `const DRAG_THRESHOLD = 8` remains, delete it; the imported value (4) is the one to use.

- [ ] **Step 6: Verify lint and tests**

Run: `npm run lint 2>&1 | tail -2 && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && npm run build 2>&1 | grep -E "✓ built|Error"`

Expected: `✖ 58 problems`, `fail 0`, `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/components/NodeMap.jsx
git commit -m "fix(drag): rect hit test + no silent failure on missed drop

The drop hung on elementFromPoint, which misses on this UI (see
game/dragHit.js). A miss then cleared placing mode with no feedback at
all, which is why an occasional failure read as the feature being broken.

Now: rect geometry with an 8px margin, and a missed drop keeps the item
in placing mode with a notice, so the gesture degrades to tap-to-place
instead of dying."
```

---

## Task 3: Same fix in EliteFour

`EliteFour.jsx:251-297` is a near-verbatim copy of the block Task 2 just fixed. Leaving it behind is how these two drifted before — `NodeMap` already carries a consumable fix that `EliteFour` had to have re-derived.

**Files:**
- Modify: `src/components/EliteFour.jsx:251-297`

**Interfaces:**
- Consumes: `hitTestRects`, `passedThreshold` from `src/game/dragHit.js` (Task 1).
- Produces: nothing new — brings `EliteFour` to parity with Task 2.

- [ ] **Step 1: Add the import**

In `src/components/EliteFour.jsx`, alongside the other `../game/` imports near the top:

```js
import { hitTestRects, passedThreshold } from '../game/dragHit.js'
```

- [ ] **Step 2: Replace `slotIndexAt` and delete the local threshold**

Find (around line 257-263):

```js
  const DRAG_THRESHOLD = 8

  function slotIndexAt(x, y) {
    const el = document.elementFromPoint(x, y)
    const slotEl = el?.closest('[data-slot-index]')
    return slotEl ? parseInt(slotEl.dataset.slotIndex, 10) : null
  }
```

Replace with:

```js
  // Rect geometry, not elementFromPoint — see game/dragHit.js for why.
  // Reads the live rects at drop time so a scrolled or resized rail is correct.
  function slotIndexAt(x, y) {
    const rects = Array.from(document.querySelectorAll('[data-slot-index]')).map(el => ({
      index: parseInt(el.dataset.slotIndex, 10),
      rect: el.getBoundingClientRect(),
    }))
    return hitTestRects(x, y, rects)
  }
```

- [ ] **Step 3: Use the shared threshold helper**

Find (around line 275-278):

```js
    if (!st.dragging) {
      if (Math.hypot(t.clientX - st.startX, t.clientY - st.startY) < DRAG_THRESHOLD) return
      st.dragging = true
      setMovingItem({ item: st.item, from: st.from })
```

Replace with:

```js
    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true
      setMovingItem({ item: st.item, from: st.from })
```

- [ ] **Step 4: Make a missed drop say so**

Find (around line 288-291):

```js
    const t = e.changedTouches[0]
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) applyConsumableTo(st.item, st.from, idx)
    setMovingItem(null)
```

Replace with:

```js
    const t = e.changedTouches[0]
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) {
      applyConsumableTo(st.item, st.from, idx)
      setMovingItem(null)
      return
    }
    // Dropped on nothing — stay in placing mode so the drag degrades into
    // tap-to-place rather than silently dying. Matches NodeMap.
    setNotice('Dropped nowhere — tap a Pokémon to give it')
```

`setNotice` already exists on this screen at `EliteFour.jsx:196` and its UI renders at `:489`, so no new state is needed.

- [ ] **Step 5: Verify both screens now match**

Run: `grep -c "Dropped nowhere" src/components/NodeMap.jsx src/components/EliteFour.jsx`

Expected: `1` for each file.

- [ ] **Step 6: Verify lint, tests, build**

Run: `npm run lint 2>&1 | tail -2 && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && npm run build 2>&1 | grep -E "✓ built|Error"`

Expected: `✖ 58 problems`, `fail 0`, `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/components/EliteFour.jsx
git commit -m "fix(drag): bring EliteFour bag drag to parity with NodeMap

Same rect hit test and missed-drop notice. EliteFour carries a
near-verbatim copy of this handler set; fixing only one is how the two
drifted last time."
```

---

## Task 4: `touchcancel` cleanup on both screens

There are currently **zero** `onTouchCancel` handlers in `src/`. When the OS interrupts a touch — notification pull-down, system edge gesture, incoming call — no `touchend` fires. That leaves `movingItem` set, the targeting banner up, every slot highlighted, and the ghost possibly rendered, **indefinitely**. This is a different failure from a missed drop: the screen gets stuck in a mode.

**Files:**
- Modify: `src/components/NodeMap.jsx:1148-1168`
- Modify: `src/components/EliteFour.jsx:283-297`

**Interfaces:**
- Consumes: nothing new.
- Produces: `bagTouchProps` on both screens now returns an `onTouchCancel` key in addition to `onTouchStart`/`onTouchMove`/`onTouchEnd`.

- [ ] **Step 1: Add the cancel handler in NodeMap**

In `src/components/NodeMap.jsx`, immediately after the `bagTouchEnd` function and before `const bagTouchProps`, insert:

```js
  // An OS interruption (notification pull-down, system gesture, incoming call)
  // fires touchcancel and NO touchend. Without this, an interrupted drag leaves
  // movingItem set, the targeting banner up, and the roster highlighted —
  // indefinitely, until the player stumbles into something that clears it.
  // Cancel is a drop that never happened: clean up, place nothing, say nothing.
  function bagTouchCancel() {
    bagTouch.current = null
    setDragGhost(null)
    setMovingItem(null)
  }
```

- [ ] **Step 2: Register it in `bagTouchProps` in NodeMap**

Find:

```js
  const bagTouchProps = (item, from) => ({
    onTouchStart: bagTouchStart(item, from),
    onTouchMove: bagTouchMove,
    onTouchEnd: bagTouchEnd,
  })
```

Replace with:

```js
  const bagTouchProps = (item, from) => ({
    onTouchStart: bagTouchStart(item, from),
    onTouchMove: bagTouchMove,
    onTouchEnd: bagTouchEnd,
    onTouchCancel: bagTouchCancel,
  })
```

- [ ] **Step 3: Add the same handler in EliteFour**

In `src/components/EliteFour.jsx`, after `bagTouchEnd` and before `const bagTouchProps`, insert:

```js
  // touchcancel fires on an OS interruption with no touchend — without this an
  // interrupted drag leaves the screen stuck in targeting mode. Matches NodeMap.
  function bagTouchCancel() {
    bagTouch.current = null
    setDragGhost(null)
    setMovingItem(null)
  }
```

- [ ] **Step 4: Register it in `bagTouchProps` in EliteFour**

Find:

```js
  const bagTouchProps = (item, from) => ({
    onTouchStart: bagTouchStart(item, from),
    onTouchMove: bagTouchMove,
    onTouchEnd: bagTouchEnd,
  })
```

Replace with:

```js
  const bagTouchProps = (item, from) => ({
    onTouchStart: bagTouchStart(item, from),
    onTouchMove: bagTouchMove,
    onTouchEnd: bagTouchEnd,
    onTouchCancel: bagTouchCancel,
  })
```

- [ ] **Step 5: Verify both are registered**

Run: `grep -c "onTouchCancel" src/components/NodeMap.jsx src/components/EliteFour.jsx`

Expected: `1` for each file.

- [ ] **Step 6: Verify lint, tests, build**

Run: `npm run lint 2>&1 | tail -2 && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && npm run build 2>&1 | grep -E "✓ built|Error"`

Expected: `✖ 58 problems`, `fail 0`, `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/components/NodeMap.jsx src/components/EliteFour.jsx
git commit -m "fix(drag): clean up on touchcancel so an interrupted drag can't stick

There were zero touchcancel handlers in src/. An OS interruption fires
touchcancel and no touchend, leaving movingItem set and the screen stuck
in targeting mode indefinitely."
```

---

## Task 5: Track the touch identifier

`e.touches[0]` is read unguarded in both screens. In a multi-touch sequence — the tracked finger lifts while another is down, or a second finger lands mid-drag — `touches[0]` can be a *different* finger than the one that started the drag. The ghost jumps to it and the drop lands wherever it is. Rare, but it is the mechanism behind "it did something weird once and I couldn't reproduce it."

**Files:**
- Modify: `src/components/NodeMap.jsx:1129-1163`
- Modify: `src/components/EliteFour.jsx:265-292`

**Interfaces:**
- Consumes: nothing new.
- Produces: `bagTouch.current` gains an `identifier: number` field on both screens.

- [ ] **Step 1: Record the identifier at touch start (NodeMap)**

Find:

```js
  function bagTouchStart(item, from) {
    return (e) => {
      const t = e.touches[0]
      bagTouch.current = { item, from, startX: t.clientX, startY: t.clientY, dragging: false }
    }
  }
```

Replace with:

```js
  function bagTouchStart(item, from) {
    return (e) => {
      const t = e.changedTouches[0]
      // Track WHICH finger. A later touches[0] can be a different finger — a
      // second one landing mid-drag, or this one lifting while another is held —
      // which would teleport the ghost and drop the item under the wrong finger.
      bagTouch.current = {
        item, from, identifier: t.identifier,
        startX: t.clientX, startY: t.clientY, dragging: false,
      }
    }
  }
```

- [ ] **Step 2: Resolve the tracked finger in `bagTouchMove` (NodeMap)**

Find:

```js
  function bagTouchMove(e) {
    const st = bagTouch.current
    if (!st) return
    const t = e.touches[0]
```

Replace with:

```js
  function bagTouchMove(e) {
    const st = bagTouch.current
    if (!st) return
    // Only the finger that started this drag moves it.
    const t = Array.from(e.touches).find(touch => touch.identifier === st.identifier)
    if (!t) return
```

- [ ] **Step 3: Resolve the tracked finger in `bagTouchEnd` (NodeMap)**

Find:

```js
    const t = e.changedTouches[0]
    const idx = slotIndexAt(t.clientX, t.clientY)
```

Replace with:

```js
    // The lifted finger must be the one that started the drag — another finger
    // lifting mid-drag must not drop the item.
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === st.identifier)
    if (!t) return
    const idx = slotIndexAt(t.clientX, t.clientY)
```

Note: `bagTouch.current` is already nulled above this point in `bagTouchEnd`, and `st` is captured before that, so this `return` is safe — the drag state is already cleared.

- [ ] **Step 4: Apply the identical three changes in EliteFour**

In `src/components/EliteFour.jsx`, make the same three edits:

`bagTouchStart` becomes:

```js
  function bagTouchStart(item, from) {
    return (e) => {
      const t = e.changedTouches[0]
      // Track WHICH finger — a later touches[0] can be a different one.
      bagTouch.current = {
        item, from, identifier: t.identifier,
        startX: t.clientX, startY: t.clientY, dragging: false,
      }
    }
  }
```

In `bagTouchMove`, replace `const t = e.touches[0]` with:

```js
    const t = Array.from(e.touches).find(touch => touch.identifier === st.identifier)
    if (!t) return
```

In `bagTouchEnd`, replace `const t = e.changedTouches[0]` with:

```js
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === st.identifier)
    if (!t) return
```

- [ ] **Step 5: Verify no unguarded reads remain in the bag handlers**

Run: `grep -n "touches\[0\]" src/components/NodeMap.jsx src/components/EliteFour.jsx`

Expected: only the two `e.changedTouches[0]` reads inside `bagTouchStart` (one per file). Those are correct — at touchstart there is exactly one new touch and no identifier to match against yet.

- [ ] **Step 6: Verify lint, tests, build**

Run: `npm run lint 2>&1 | tail -2 && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && npm run build 2>&1 | grep -E "✓ built|Error"`

Expected: `✖ 58 problems`, `fail 0`, `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/components/NodeMap.jsx src/components/EliteFour.jsx
git commit -m "fix(drag): follow the tracked finger, not touches[0]

A second finger landing mid-drag made touches[0] a different touch point,
teleporting the ghost and dropping the item under the wrong finger."
```

---

## Task 6: Ghost position via ref instead of state

`setDragGhost` is React state updated on **every** `touchmove` — 60-120 state updates per second. `NodeMap` is a ~1700-line component and `MapSvg` (`:74`) is an un-memoized function component rendering the whole SVG map, so every finger movement re-renders the map, the roster, and the bag bar. On the low-end phones this feature targets, that is where dropped frames make a drag feel sticky — some of the reported inconsistency may be frame rate rather than logic.

The fix keeps *visibility* in state (it changes twice per drag) and moves *position* to a ref written directly to the DOM node.

**Files:**
- Modify: `src/components/NodeMap.jsx:1111-1163`, `:1460-1472`
- Modify: `src/components/EliteFour.jsx:255-292`, `:473-485`

**Interfaces:**
- Consumes: nothing new.
- Produces: on both screens, `dragGhost` state narrows to `{ item } | null` (no `x`/`y`), and a new `ghostRef` holds the `<img>` element.

- [ ] **Step 1: Add the ref and narrow the state (NodeMap)**

Find:

```js
  const [dragGhost, setDragGhost] = useState(null) // { x, y, item } | null
```

Replace with:

```js
  // Ghost VISIBILITY is state — it changes twice per drag. Ghost POSITION is a
  // ref written straight to the node: it changes 60-120x/sec, and routing that
  // through React re-rendered the whole map SVG on every finger move.
  const [dragGhost, setDragGhost] = useState(null) // { item } | null
  const ghostRef = useRef(null)
```

- [ ] **Step 2: Write position directly in `bagTouchMove` (NodeMap)**

Find:

```js
    e.preventDefault() // stop the page scrolling while dragging
    setDragGhost({ x: t.clientX, y: t.clientY, item: st.item })
```

Replace with:

```js
    e.preventDefault() // stop the page scrolling while dragging
    // Position bypasses React entirely — see the ghostRef declaration above.
    if (ghostRef.current) {
      ghostRef.current.style.transform =
        `translate(${t.clientX}px, ${t.clientY}px) translate(-50%, -50%)`
    }
```

- [ ] **Step 3: Show the ghost when the drag is promoted (NodeMap)**

In `bagTouchMove`, find the promotion block:

```js
    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true // promote to a drag
      // Enter item-placing mode so the roster highlights as drop targets.
      setMovingItem({ item: st.item, from: st.from })
    }
```

Replace with:

```js
    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true // promote to a drag
      // Enter item-placing mode so the roster highlights as drop targets.
      setMovingItem({ item: st.item, from: st.from })
      // One state write per drag, to mount the ghost. Position follows below.
      setDragGhost({ item: st.item })
    }
```

- [ ] **Step 4: Attach the ref and drop the inline position (NodeMap)**

Find the ghost element (around line 1460-1472):

```js
      {dragGhost && (
        <img
          src={itemIconUrl(dragGhost.item)}
          alt=""
          style={{
            position: 'fixed', left: dragGhost.x, top: dragGhost.y,
            transform: 'translate(-50%, -50%)',
            width: '34px', height: '34px', imageRendering: 'pixelated',
            pointerEvents: 'none', zIndex: 300,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
          }}
        />
      )}
```

Replace with:

```js
      {dragGhost && (
        <img
          ref={ghostRef}
          src={itemIconUrl(dragGhost.item)}
          alt=""
          style={{
            // left/top stay at 0 and the transform does all the moving, so
            // bagTouchMove can update position with one style write and no
            // React render. See the ghostRef declaration.
            position: 'fixed', left: 0, top: 0,
            width: '34px', height: '34px', imageRendering: 'pixelated',
            pointerEvents: 'none', zIndex: 300,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
          }}
        />
      )}
```

- [ ] **Step 5: Apply the identical four changes in EliteFour**

Make the same edits in `src/components/EliteFour.jsx`: add `const ghostRef = useRef(null)` beside the narrowed `dragGhost` state, set `setDragGhost({ item: st.item })` in the promotion block, write `ghostRef.current.style.transform` in `bagTouchMove` instead of calling `setDragGhost` with coordinates, and attach `ref={ghostRef}` with `left: 0, top: 0` on the ghost `<img>` at `:473`.

Confirm `useRef` is already imported in `EliteFour.jsx` (it is — `bagTouch` uses it at `:255`).

- [ ] **Step 6: Verify no coordinate-carrying ghost state remains**

Run: `grep -n "setDragGhost({" src/components/NodeMap.jsx src/components/EliteFour.jsx`

Expected: one line per file, each `setDragGhost({ item: st.item })` with no `x` or `y`.

- [ ] **Step 7: Verify lint, tests, build**

Run: `npm run lint 2>&1 | tail -2 && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && npm run build 2>&1 | grep -E "✓ built|Error"`

Expected: `✖ 58 problems`, `fail 0`, `✓ built`.

- [ ] **Step 8: Commit**

```bash
git add src/components/NodeMap.jsx src/components/EliteFour.jsx
git commit -m "perf(drag): move ghost position from state to a ref

setDragGhost fired on every touchmove, re-rendering the whole ~1700-line
NodeMap including the un-memoized MapSvg, 60-120x/sec. Visibility stays
in state (twice per drag); position is now one style write per move."
```

---

## Task 7: Extract the shared hook

Tasks 2-6 each applied the same change twice. That duplication is the reason these files drifted in the first place. Now that the handler set is correct, extract it once.

**Files:**
- Create: `src/lib/useBagTouchDrag.js`
- Modify: `src/components/NodeMap.jsx:1106-1168`, `:1460-1472`
- Modify: `src/components/EliteFour.jsx:251-297`, `:473-485`

**Interfaces:**
- Consumes: `hitTestRects`, `passedThreshold` from `src/game/dragHit.js` (Task 1).
- Produces: `useBagTouchDrag({ onDrop, onMissedDrop, onDragStart, onDragEnd }) => { bagTouchProps, ghostRef, ghostItem }` where:
  - `onDrop(item, from, slotIndex)` — fired on a landed drop.
  - `onMissedDrop(item, from)` — fired when the hit test misses.
  - `onDragStart(item, from)` — fired once when a press is promoted to a drag.
  - `onDragEnd()` — fired on end or cancel, always.
  - `bagTouchProps(item, from)` — spread onto each bag item.
  - `ghostRef` — attach to the ghost `<img>`.
  - `ghostItem` — the item to render as a ghost, or `null`.

- [ ] **Step 1: Create the hook**

Create `src/lib/useBagTouchDrag.js`:

```js
import { useRef, useState } from 'react'
import { hitTestRects, passedThreshold } from '../game/dragHit.js'

// Touch drag-and-drop for bag items. HTML5 draggable never fires on touch, so
// mobile needs its own gesture: a tap falls through to the element's onClick
// (the info popup), while movement past a small threshold promotes to a drag
// that ends on whichever roster slot is under the finger.
//
// This lived twice — NodeMap and EliteFour carried near-verbatim copies — and
// they drifted: a consumable-handling fix landed in one and had to be
// re-derived for the other. One hook, two consumers.
//
// The caller owns what a drop MEANS (equip vs. use vs. refuse); this hook only
// decides that a drop happened and where.
//
// @param {object} cb
// @param {(item: any, from: any, slotIndex: number) => void} cb.onDrop
// @param {(item: any, from: any) => void} cb.onMissedDrop
// @param {(item: any, from: any) => void} cb.onDragStart
// @param {() => void} cb.onDragEnd
export function useBagTouchDrag({ onDrop, onMissedDrop, onDragStart, onDragEnd }) {
  // { item, from, identifier, startX, startY, dragging }
  const drag = useRef(null)
  // Ghost VISIBILITY is state (twice per drag). Ghost POSITION is a ref written
  // straight to the node — it changes 60-120x/sec, and routing that through
  // React re-rendered the entire map on every finger move.
  const [ghostItem, setGhostItem] = useState(null)
  const ghostRef = useRef(null)

  // Rect geometry rather than document.elementFromPoint: index.css sets
  // `pointer-events: none` on every img, so the sprite the player aims at is
  // invisible to elementFromPoint. See game/dragHit.js.
  function slotIndexAt(x, y) {
    const rects = Array.from(document.querySelectorAll('[data-slot-index]')).map(el => ({
      index: parseInt(el.dataset.slotIndex, 10),
      rect: el.getBoundingClientRect(),
    }))
    return hitTestRects(x, y, rects)
  }

  function reset() {
    drag.current = null
    setGhostItem(null)
  }

  function onTouchStart(item, from) {
    return (e) => {
      const t = e.changedTouches[0]
      // Track WHICH finger — a later touches[0] can be a different one.
      drag.current = {
        item, from, identifier: t.identifier,
        startX: t.clientX, startY: t.clientY, dragging: false,
      }
    }
  }

  function onTouchMove(e) {
    const st = drag.current
    if (!st) return
    const t = Array.from(e.touches).find(touch => touch.identifier === st.identifier)
    if (!t) return

    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true
      onDragStart?.(st.item, st.from)
      setGhostItem(st.item)
    }
    e.preventDefault() // stop the page scrolling mid-drag
    if (ghostRef.current) {
      ghostRef.current.style.transform =
        `translate(${t.clientX}px, ${t.clientY}px) translate(-50%, -50%)`
    }
  }

  function onTouchEnd(e) {
    const st = drag.current
    reset()
    if (!st?.dragging) return // a plain tap — the element's onClick handles it
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === st.identifier)
    if (!t) { onDragEnd?.(); return }
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) onDrop?.(st.item, st.from, idx)
    else onMissedDrop?.(st.item, st.from)
    onDragEnd?.()
  }

  // An OS interruption (notification, system gesture, call) fires touchcancel
  // and NO touchend. Without this the caller stays in placing mode forever.
  function onTouchCancel() {
    reset()
    onDragEnd?.()
  }

  const bagTouchProps = (item, from) => ({
    onTouchStart: onTouchStart(item, from),
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  })

  return { bagTouchProps, ghostRef, ghostItem }
}
```

- [ ] **Step 2: Consume the hook in NodeMap**

In `src/components/NodeMap.jsx`, delete the whole block from `const bagTouch = useRef(null)` through the closing `})` of `bagTouchProps` — but **keep** the `notice` state and its `useEffect` (they are used elsewhere on this screen, at `:1067` and `:1087`).

In its place:

```js
  const { bagTouchProps, ghostRef, ghostItem } = useBagTouchDrag({
    onDragStart: (item, from) => setMovingItem({ item, from }),
    // Consumables must be USED, not equipped — applyConsumableTo makes that
    // call, the same one resolveItemMove makes on the tap path.
    onDrop: (item, from, slotIndex) => {
      applyConsumableTo(item, from, slotIndex)
      setMovingItem(null)
    },
    // A missed drop STAYS in placing mode, so the drag degrades into
    // tap-to-place instead of silently dying.
    onMissedDrop: () => setNotice('Dropped nowhere — tap a Pokémon to give it'),
    onDragEnd: () => {},
  })
```

Add the import near the other `../lib/` imports:

```js
import { useBagTouchDrag } from '../lib/useBagTouchDrag.js'
```

Remove the now-unused `import { hitTestRects, passedThreshold, DRAG_THRESHOLD } from '../game/dragHit.js'` line added in Task 2.

Update the ghost element to use `ghostItem` instead of `dragGhost`:

```js
      {ghostItem && (
        <img
          ref={ghostRef}
          src={itemIconUrl(ghostItem)}
          alt=""
          style={{
            position: 'fixed', left: 0, top: 0,
            width: '34px', height: '34px', imageRendering: 'pixelated',
            pointerEvents: 'none', zIndex: 300,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
          }}
        />
      )}
```

- [ ] **Step 3: Consume the hook in EliteFour**

Make the equivalent replacement in `src/components/EliteFour.jsx`: delete its `bagTouch`/`dragGhost`/`slotIndexAt`/`bagTouch*`/`bagTouchProps` block, add the same import, and add:

```js
  const { bagTouchProps, ghostRef, ghostItem } = useBagTouchDrag({
    onDragStart: (item, from) => setMovingItem({ item, from }),
    onDrop: (item, from, slotIndex) => {
      applyConsumableTo(item, from, slotIndex)
      setMovingItem(null)
    },
    onMissedDrop: () => setNotice('Dropped nowhere — tap a Pokémon to give it'),
    onDragEnd: () => {},
  })
```

Update its ghost element at `:473` the same way, using `ghostItem` and `ghostRef`.

Remove the now-unused `import { hitTestRects, passedThreshold } from '../game/dragHit.js'` added in Task 3.

- [ ] **Step 4: Verify the duplication is gone**

Run: `grep -c "function bagTouchMove\|function slotIndexAt" src/components/NodeMap.jsx src/components/EliteFour.jsx`

Expected: `0` for both files — the logic now lives only in the hook.

- [ ] **Step 5: Verify lint, tests, build**

Run: `npm run lint 2>&1 | tail -2 && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && npm run build 2>&1 | grep -E "✓ built|Error"`

Expected: `✖ 58 problems`, `fail 0`, `✓ built`.

If lint reports a **new** `no-unused-vars` error, a leftover import or state variable was missed — remove it and re-run until the count is exactly 58.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useBagTouchDrag.js src/components/NodeMap.jsx src/components/EliteFour.jsx
git commit -m "refactor(drag): extract useBagTouchDrag, shared by both screens

NodeMap and EliteFour carried near-verbatim copies of this handler set,
which is how they drifted before. Extracted after the fixes landed so the
hook captures the corrected version.

BattleCard's RosterColumn is a third copy of the same shape but is roster
reorder rather than bag drag — left for a follow-up."
```

---

## Manual verification (after Task 7)

None of the above can be covered by `node --test` beyond Task 1's geometry — there is no DOM test environment. Verify on a real phone, or in Chrome DevTools device mode with touch emulation on:

1. **A normal drag lands.** Drag a Max Heal onto a damaged Pokémon. It heals; the item leaves the bag.
2. **A near-miss lands.** Drop in the ~6px gutter between two slots. It lands on one of them rather than nothing — this is the `HIT_MARGIN` at work.
3. **A real miss says so.** Drag an item to the middle of the map and release. The notice reads "Dropped nowhere — tap a Pokémon to give it", the banner stays up, and **tapping a Pokémon then completes the equip.**
4. **Slot 0 works.** Drag onto the leftmost Pokémon specifically. It must equip — this is the `idx != null` vs `if (idx)` trap, covered by a Task 1 test but worth confirming end-to-end.
5. **A tap still opens the popup.** Tap a bag item without moving. The info popup opens; no drag starts.
6. **The drag feels immediate.** Movement should promote to a drag almost at once (4px, down from 8px).
7. **An interrupted drag recovers.** Start a drag, then pull down the notification shade mid-drag. On return, the screen is **not** stuck in targeting mode — no banner, no highlighted slots, no ghost.
8. **Repeat 1, 3, and 7 on the Elite Four screen.** Both screens run the same hook, but confirm the wiring.
9. **Desktop is unaffected.** With a mouse, HTML5 drag-and-drop must still equip. None of this touches that path.

---

## Self-Review

**Spec coverage** — every finding in `docs/MOBILE_BAG_DRAG_REVIEW.md`:

| Review finding | Task |
|---|---|
| F1a/F1b — `elementFromPoint` misses (pointer-events, slot size) | 1, 2, 3 |
| F1c — silent failure on a missed drop | 2, 3 |
| F2 — no `touchcancel` handling | 4 |
| F3 — ghost re-renders the map per `touchmove` | 6 |
| F4 — tap-to-pick-up documented but unwired | **Not covered** — see below |
| F5 — mismatched drag thresholds | 1 (bag → 4px), **roster side not covered** |
| F6 — unguarded `e.touches[0]` | 5 |
| F7 — three copies of the pattern | 7 (two of three; BattleCard noted) |

**Deliberate scope exclusions**, each with a reason:

- **F4 (tap-to-pick-up)** is a *behaviour change*, not a reliability fix: it requires moving the info popup to long-press, which changes an interaction players already know. Task 2's missed-drop handling delivers most of its value — a failed drag now degrades into tap-to-place — so the remaining work should be re-evaluated after this plan ships rather than bundled in. **The stale comment at `NodeMap.jsx:1388-1389` will still be wrong after this plan.** Update it as part of the F4 follow-up.
- **F5, roster half.** Task 1 lowers the bag threshold to 4px. Giving `Roster.jsx`'s reorder a matching threshold means touching reorder for all users including desktop, which is a wider blast radius than this plan's remit. Follow-up.
- **F7, third copy.** `BattleCard.jsx:1325-1343` is roster reorder over `data-battle-slot`, not a bag drag. It shares the shape but not the callbacks; folding it into `useBagTouchDrag` would need the hook generalized over the attribute name and drop semantics. Follow-up.
- **Pointer Events** (the review's "optional" section) is explicitly out of scope. It would replace the working desktop HTML5 path and is a much larger change.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step carries the literal code. Every `Run:` step names the exact command and the expected output.

**Type consistency:** `hitTestRects(x, y, rects, margin)` and `passedThreshold(startX, startY, x, y, threshold)` are defined in Task 1 and used with those exact signatures in Tasks 2, 3, and 7. `slotIndexAt(x, y) => number | null` keeps its original signature throughout, so call sites never change. `bagTouchProps(item, from)` keeps its signature across Tasks 4 and 7, so bag item call sites never change. The `{ index, rect }` shape passed to `hitTestRects` is identical in Tasks 2, 3, and 7. `dragGhost` state carries `{ x, y, item }` before Task 6, `{ item }` after Task 6, and is renamed to `ghostItem` (a bare item, not an object) in Task 7 — each transition is spelled out in the task that makes it.

**One ordering note:** Tasks 2-6 each modify both screens, then Task 7 deletes most of that work in favour of the hook. That is deliberate. Extracting first would mean designing the hook's interface around code that is still wrong, and each fix would land untested in a shared abstraction. Fixing in place first means every change is verified against a working screen before it is generalized, and Task 7 becomes a pure refactor with no behaviour change to reason about.
