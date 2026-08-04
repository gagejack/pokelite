# Mobile bag drag — verification of MOBILE_BAG_DRAG_REVIEW.md + new findings

Second-pass review, 2026-08-03. Verified every claim in the original doc against
the source (NodeMap.jsx, Roster.jsx, EliteFour.jsx, BattleCard.jsx, index.css).
No code changed.

**Short version:** Findings 2, 4, 5, and 6 are confirmed as written. Finding 1's
mechanism is wrong and its proposed fix is a no-op. Finding 3's conclusion is
fine but its rationale is wrong. Four additional issues found that the original
missed, one of which (no `touchcancel` handling) is a stuck-UI bug, and one of
which (per-touchmove full-screen re-render) is a mobile perf problem.

---

## Corrections to the original review

### C1 — Finding 1 is misdiagnosed; its fix would do nothing

The original claims the "highest impact" issue is Roster stripping touch
handlers while `itemTargeting`, and proposes:

> don't strip touch handlers on `itemTargeting` — add an `onTouchEnd` that
> calls `onPickTarget?.(i)` when targeting. Then the slot itself catches the
> drop.

This cannot work. Per the Touch Events spec, **a touch is implicitly captured
to its `touchstart` target** — every subsequent `touchmove`/`touchend` for that
finger dispatches to the element the finger first pressed, no matter where the
finger moves. A bag drag starts on the bag `<img>`, so the `touchend` fires on
the bag `<img>`. The roster slot's `onTouchEnd` would *never* fire during a
bag drag, handlers stripped or not. The proposed fix is a no-op for Path C.

The doc itself concedes the mechanism is fine ("Step 3 still works… only
because `bagTouchEnd` reads the slot via `document.elementFromPoint`") — which
contradicts its own "highest impact" label. Additional confirmation that the
stripping is harmless to the drop: `data-slot-index` is set unconditionally
(`Roster.jsx:263`), so the hit test is unaffected by handler stripping.

The stripping *is* still correct and necessary — it stops a `touchstart` that
begins on a slot (a new touch) from starting a reorder while an item is being
placed. Keep it.

**Net effect:** Finding 1 describes no actual failure. The real top reliability
issue is Finding 2 (hit-test miss + silent failure), and the correct fix
direction is N3 below — not slot-level handlers.

### C2 — Finding 3's rationale is wrong (conclusion survives)

The original justifies the bag's 8px threshold this way:

> the bag bar is `overflowX: 'auto'` and needs horizontal scrolling… so the
> bag *can't* preventDefault until the threshold passes.

But the bag item images already carry `touchAction: 'none'`
(`NodeMap.jsx:1425`). A touch that starts on an item **can never scroll the
bag**, regardless of the threshold or `preventDefault` timing — the browser is
told up front not to gesture-scroll from that element. Bag scrolling only
works from touches that land on the bar's background/gaps. So the threshold
exists purely for tap-vs-drag disambiguation, and lowering it to ~4px (or
matching it with a roster threshold) costs nothing in scroll behavior.

One corollary worth noting: because items are 22px in a ~34px bar with 6px
gaps, most of the bar's surface is non-scrollable. If the bag ever grows past
the viewport this becomes its own usability issue (separate from drag feel).

---

## Confirmed as written

- **Finding 2** — `elementFromPoint` fragility + silent failure on miss
  (`NodeMap.jsx:1155-1162`, `index.css:50-54`). Confirmed, including the
  unused-`notice` detail.
- **Finding 4** — `e.touches[0]` / `e.changedTouches[0]` unguarded
  (`NodeMap.jsx:1138,1153`; `EliteFour.jsx:274,288`). Confirmed.
- **Finding 5** — tap-to-pick-up documented (`NodeMap.jsx:1388-1389`) but tap
  opens the info popup (`:1418`). Confirmed.
- **Finding 6** — `EliteFour.jsx:251-297` is a near-verbatim copy. Confirmed —
  and it's actually worse than stated: see N4.

---

## New findings

### N1 — No `onTouchCancel` anywhere: an interrupted gesture leaves stuck UI

Grep confirms zero `touchcancel`/`onTouchCancel` handlers in `src/`. If the OS
interrupts the touch (notification pull-down, system gesture, incoming call),
no `touchend` fires. In NodeMap/EliteFour that leaves `movingItem` set, the
targeting banner up, the roster highlighted as drop targets, and `dragGhost`
potentially rendered — indefinitely, until the player happens to complete
another interaction. The same bug exists in Roster reorder (`touchFrom` /
`dragFrom` stuck, `Roster.jsx:235-260`) and BattleCard reorder
(`BattleCard.jsx:1337-1343`).

This is a plausible cause of a *different* class of "it got weird once"
reports: not the drop failing, but the screen getting stuck in targeting mode.

**Fix:** attach `onTouchCancel` with the same cleanup as `bagTouchEnd`
(clear ref, ghost, `movingItem` — no drop). One line per handler set.

### N2 — The drag ghost re-renders the entire map screen every touchmove

`setDragGhost` is React state in NodeMap (`:1112`), updated on **every**
`touchmove` during a drag (`:1146`) — 60–120 state updates per second. NodeMap
is a ~1700-line component; `MapSvg` (`:74`) is a plain un-memoized function
component rendering the whole SVG node map. So every finger move re-renders
the map SVG, the roster, and the bag bar. On the low-end phones this feature
targets, that's exactly where dropped frames make a drag feel "sticky" — some
of the perceived inconsistency may be perf, not logic.

**Fix (any one of):**
- Keep the ghost position in a ref and set `el.style.transform` directly on
  the ghost node (render the ghost once when the drag starts). Zero
  re-renders during the move.
- Or throttle `setDragGhost` with rAF (one update per frame max).
- Or extract the ghost into its own memoized component so the re-render is
  one `<img>`.

The first is simplest and cheapest. Same fix applies to EliteFour.

### N3 — Rect-based hit testing is simpler *and* fixes Finding 2 properly

With C1 ruling out slot-level handlers, the hit test is the only drop
mechanism — so make it robust instead of layering fallbacks on
`elementFromPoint`. There are exactly 6 roster slots:

```js
function slotIndexAt(x, y) {
  const MARGIN = 8 // px of forgiveness around each slot
  for (const el of document.querySelectorAll('[data-slot-index]')) {
    const r = el.getBoundingClientRect()
    if (x >= r.left - MARGIN && x <= r.right + MARGIN &&
        y >= r.top - MARGIN && y <= r.bottom + MARGIN) {
      return parseInt(el.dataset.slotIndex, 10)
    }
  }
  return null
}
```

Advantages over `elementFromPoint`:
- Immune to `pointer-events: none` on sprites (2a) — geometry doesn't care
  what's painted where.
- The `MARGIN` directly addresses the finger-centroid error (2b): the
  effective target becomes *bigger* than the visual slot instead of smaller.
- No dependency on DOM nesting, z-index, or overlays.
- Six `getBoundingClientRect` calls per drop is negligible.

This one function replaces the mechanism the original review treats as
unfixable-but-patchable. Use it in the shared hook (N4) so all copies get it.

### N4 — The duplication is three copies, not two

Finding 6 counts NodeMap and EliteFour. `BattleCard.jsx:1325-1343`
(`RosterColumn`) is a third instance of the same pattern — own
`slotFromPoint` over `data-battle-slot`, own `touches[0]` read, own missing
`touchcancel`. It's roster-reorder rather than bag-drag, but the shared
extraction should cover it: a `slotIndexAtPoint(x, y, attr)` util plus a
`useBagTouchDrag`-style hook for the two bag screens. Fix-once applies to
all three.

### N5 — Optional bigger simplification: Pointer Events unify mouse + touch

The bag `<img>` currently carries *two* parallel drag systems: HTML5 DnD
(`draggable`, `onDragStart`, `onDragEnd` — desktop mouse) and the touch trio.
Pointer Events (`pointerdown/move/up` + `setPointerCapture`) handle mouse and
touch identically, so one code path could replace both, turning the current
four equip paths (HTML5 drag, touch drag, popup-equip, bag-drop) into two.
That is a larger refactor (Roster's `onDrop` targets, the bag's drop handler)
and touches the working desktop path, so it's listed as an option rather than
a recommendation — but if the screen ever gets a third input modality or the
hook extraction (N4) happens anyway, it's the natural end state.

---

## Revised priority list

| # | Fix | Effort | Notes |
|---|-----|--------|-------|
| 1 | Never fail silently — notice or stay in placing mode on missed drop | S | Original Finding 2c. Biggest perceived-reliability win. |
| 2 | Rect-based hit test with margin (N3) | S | Replaces `elementFromPoint`; fixes 2a+2b structurally. |
| 3 | `onTouchCancel` cleanup in all four handler sets (N1) | S | Kills stuck-targeting-mode bug. |
| 4 | Ghost position via ref + direct transform (N2) | S | Mobile perf; likely part of the "sticky" feel. |
| 5 | Track `touch.identifier` (original Finding 4) | S | Rare unreproducible weirdness. |
| 6 | Align drag thresholds to ~4px (original Finding 3, rationale per C2) | XS | No scroll risk — `touchAction: none` already handles it. |
| 7 | Wire tap-to-pick-up or fix the comment (original Finding 5) | S/M | Gives drag a recovery path. |
| 8 | Extract shared util/hook covering all three copies (N4) | M | Do after 1–6 so the fix lands once. |

**Dropped from the original list:** Fix 1 (slot `onTouchEnd` during
targeting) — no-op per C1. Do not spend time on it.

1–4 are all small and together address every confirmed reliability/perf
mechanism.

---

## Caveats

Same as the original: static read, no device testing. C1 (touch capture) is
spec-guaranteed behavior, not an inference. N2's severity (how much the
re-render actually costs) needs a real device to quantify — but the re-render
itself is certain from the code. The original doc's diagnostic logging
suggestion in `bagTouchEnd` remains the right first step for any specific
reproduced failure.
