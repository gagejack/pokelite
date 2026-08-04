# Mobile bag → Pokémon drag: why it feels inconsistent

Static review of the touch equip path on mobile. First pass 2026-08-03; **revised 2026-08-04** after a second-pass verification (`MOBILE_BAG_DRAG_REVIEW_FOLLOWUP.md`) corrected one finding and added four more. No code changed.

**Short version:** the feature isn't one interaction, it's two built by different code that independently decide what a drop means, plus a third layered on top. The drop itself hangs on a single `elementFromPoint` hit test that can miss — and when it misses, **nothing happens and nothing is said**. Two further problems are invisible in the source but felt on a device: an interrupted gesture leaves the UI stuck in targeting mode forever, and the drag ghost re-renders the entire map on every finger move.

> **Revision note.** The first version of this doc led with a "highest impact" finding about roster slots stripping their touch handlers. **That was wrong** — see [Appendix A](#appendix-a--the-correction). It is preserved there because the reasoning error is instructive, and because anyone who read v1 needs to know not to act on it.

---

## The three paths that all equip an item

| # | How the player does it | Code that runs | Where it ends up |
|---|---|---|---|
| A | Tap bag item → info popup → "Equip" → tap a Pokémon | `setInfoItem` → `setMovingItem` → `onPickTarget` → `resolveItemMove` | `applyConsumableTo` |
| B | Tap bag item → tap a Pokémon | **not wired** — see Finding 4 | — |
| C | Press and drag a bag item onto a Pokémon | `bagTouchStart/Move/End` → `slotIndexAt` | `applyConsumableTo` |

A and C reach the same destination through entirely separate code. `resolveItemMove` (`NodeMap.jsx:1093`) and `bagTouchEnd` (`NodeMap.jsx:1148`) each independently decide what a drop means. The comment at `NodeMap.jsx:1155` records that they already drifted once — touch-dragging a Max Revive used to equip it as a dead held item because `bagTouchEnd` didn't know consumables were special. That was patched; the structure that allowed it wasn't.

---

## Finding 1 — The drop can miss, and a miss is completely silent *(highest impact)*

`slotIndexAt` (`NodeMap.jsx:1123`) is the **only** mechanism that lands a bag drag on a Pokémon:

```js
const el = document.elementFromPoint(x, y)
const slotEl = el?.closest('[data-slot-index]')
```

Because of implicit touch capture (Appendix A), the roster slot cannot catch its own drop — this hit test is not one option among several, it is the whole mechanism. Three ways it misses:

**1a. `index.css:50-54` sets `pointer-events: none` on *every* `img` globally.** The slot's largest visual element is the Pokémon sprite, so `elementFromPoint` skips straight past the thing the player is aiming at and returns whatever is behind it. Usually that's the slot div and `.closest()` still resolves — but the reliably-hittable area is the slot's padding and background, not the sprite.

**1b. Mobile slots are ~1/6 of viewport width** — about **58px** on a 360px screen. The contact point in `changedTouches[0]` is the finger centroid, which sits lower than where a player perceives they're pointing. Combined with 1a, the effective target is smaller than the slot looks.

**1c. A missed hit test fails silently.** `bagTouchEnd:1155` falls through to `setMovingItem(null)` and the item returns to the bag with **no feedback of any kind**. The `notice` state exists for exactly this class of "nothing happened" case (`:1113`, used for no-op consumables) and isn't used here.

1c is the worst of the three. An unreliable interaction that *says* it failed is a minor annoyance; one that fails invisibly reads as broken.

**Fix.** Two parts, both small:

1. Replace `elementFromPoint` with a **rect-based hit test with margin**. There are only ever six slots:

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

Geometry doesn't care what's painted where, so this is immune to 1a; `MARGIN` makes the effective target *larger* than the visual slot, which directly answers 1b; and it has no dependency on DOM nesting, z-index, or overlays. Six `getBoundingClientRect` calls per drop is nothing.

2. On a null result, either keep `movingItem` active so the drag degrades into tap-to-place, or `setNotice('Dropped nowhere — tap a Pokémon to give it')`.

---

## Finding 2 — No `touchcancel` handling: an interrupted gesture leaves the UI stuck

There are **zero** `onTouchCancel` handlers in `src/` (verified by grep). When the OS interrupts a touch — notification pull-down, system edge gesture, incoming call — no `touchend` fires.

In `NodeMap`/`EliteFour` that leaves `movingItem` set, the targeting banner up, every roster slot highlighted as a drop target, and `dragGhost` potentially still rendered — **indefinitely**, until the player stumbles into another interaction that clears it. The same gap exists in Roster reorder (`Roster.jsx:235-260`, leaves `touchFrom`/`dragFrom` stuck) and BattleCard reorder (`BattleCard.jsx:1337-1343`).

This is a different failure class from Finding 1: not a drop that doesn't land, but a screen stuck in a mode. It's a strong candidate for any "it got weird and stayed weird" report.

**Fix:** attach `onTouchCancel` running the same cleanup as `bagTouchEnd` minus the drop — clear the ref, the ghost, and `movingItem`. One line per handler set, four sets.

---

## Finding 3 — The drag ghost re-renders the whole map on every finger move

`dragGhost` is React state (`NodeMap.jsx:1112`), updated on **every** `touchmove` (`:1146`) — 60–120 state updates per second during a drag.

`NodeMap` is a ~1700-line component and `MapSvg` (`:74`) is a plain, un-memoized function component that renders the entire SVG node map. So every millimetre of finger movement re-renders the map SVG, the roster, and the bag bar. On the low-end phones this feature exists for, that is precisely where dropped frames make a drag feel sticky and unresponsive.

**Some of the inconsistency you're feeling may be frame rate, not logic** — and that would explain why it seems worse at some moments than others despite identical code.

**Fix (cheapest first):** render the ghost once at drag start and update `el.style.transform` directly through a ref — zero re-renders during the move. Alternatives: throttle `setDragGhost` to one update per frame with rAF, or extract the ghost into its own memoized component. Same fix applies to `EliteFour`.

---

## Finding 4 — Tap-to-pick-up is documented but not wired, so there's no recovery path

The bag bar's own comment (`NodeMap.jsx:1388-1389`) says:

> *"drag an item onto a Pokémon to equip (as on desktop), or **tap to pick it up then tap a Pokémon**"*

Tapping doesn't pick the item up — it opens the info popup (`:1418`). The documented two-tap path (Path B) does not exist.

So when a drag fails via Finding 1, the player's natural recovery — tap the item, tap the Pokémon — does nothing useful, and they're forced back to the gesture that just failed them. **This is what converts an occasional miss into a frustrating one.**

**Fix:** implement tap-to-pick-up as documented and move the info popup to long-press; or fix the comment. The former is much better — it gives the drag a fallback, and a forgiving interaction is what "feels consistent" actually means.

---

## Finding 5 — Drag thresholds don't match between the two gestures

- **Bag drag** (`NodeMap.jsx:1121`): `DRAG_THRESHOLD = 8` — 8px of movement before it counts
- **Roster reorder** (`Roster.jsx:235`): sets `dragFrom` **immediately**, no threshold

Two drag gestures on the same screen, ~40px apart, with different activation rules. The bag one feels sticky by comparison — you move and, for the first 8px, nothing happens.

**Note on the rationale:** v1 of this doc justified the 8px threshold as necessary to preserve horizontal scrolling of the bag bar. That was wrong. Bag item images already carry `touchAction: 'none'` (`NodeMap.jsx:1425`), so a touch starting on an item can *never* gesture-scroll the bar regardless of threshold or `preventDefault` timing. The threshold exists purely to disambiguate tap from drag, and lowering it costs nothing.

**Fix:** drop the bag threshold to ~4px and give the roster reorder a matching one. Both then read as the same class of gesture.

*Corollary:* since items are 22px in a ~34px bar with 6px gaps, most of the bar's surface is non-scrollable. If the bag ever grows past the viewport, that becomes its own usability problem — separate from drag feel.

---

## Finding 6 — `e.touches[0]` is read unguarded

`NodeMap.jsx:1138` and `:1153`; also `EliteFour.jsx:274,288` and `BattleCard.jsx:1332`:

```js
const t = e.touches[0]
```

In a multi-touch sequence — the tracked finger lifts while another remains, or a second finger lands mid-drag — `e.touches[0]` can be a *different* finger than the one that started the drag. The ghost jumps to it and the drop lands wherever that finger is.

Low frequency, but it produces exactly the "it did something weird once and I couldn't reproduce it" report.

**Fix:** store `identifier` from the initial touch in `bagTouch.current`, then resolve it explicitly:

```js
const t = Array.from(e.touches).find(t => t.identifier === st.identifier)
if (!t) return
```

---

## Finding 7 — This code exists in three copies, not two

- `NodeMap.jsx:1106-1168` — bag drag
- `EliteFour.jsx:251-297` — near-verbatim copy of the same bag drag
- `BattleCard.jsx:1325-1343` — `RosterColumn`, its own `slotFromPoint` over `data-battle-slot`, its own `touches[0]` read, its own missing `touchcancel`

Three places to apply every fix above, and they will drift — `NodeMap`'s copy already carries the consumable fix (`:1156`) that had to be found the hard way, and the other two would need the same reasoning re-derived.

**Fix:** extract a `slotIndexAtPoint(x, y, attr)` util plus a `useBagTouchDrag` hook covering `movingItem` + `dragGhost` + the handler set. Do this *after* the individual fixes land, so the extraction captures the corrected version rather than needing a second pass.

---

## Optional: Pointer Events would collapse all of this

Each bag `<img>` currently carries **two parallel drag systems** — HTML5 drag-and-drop (`draggable`, `onDragStart`, `onDragEnd`) for desktop mouse, and the touch trio for mobile. Pointer Events (`pointerdown/move/up` plus `setPointerCapture`) handle mouse and touch through one path, which would turn today's four equip routes (HTML5 drag, touch drag, popup-equip, bag-drop) into two.

Notably, `setPointerCapture` is *opt-in* capture — unlike touch's implicit capture, you can release it and let the element under the pointer receive events, which makes the drop target able to catch its own drop. That would make Finding 1's hit test unnecessary rather than merely more robust.

Listed as an option, not a recommendation: it's a larger refactor that touches the currently-working desktop path. But if Finding 7's extraction is happening anyway, this is the natural end state.

---

## What I'd fix, in order

| # | Fix | Effort | Why here |
|---|---|---|---|
| 1 | Never fail silently on a missed drop (1c) | S | Biggest perceived-reliability win. An error you can see is not a bug you can't. |
| 2 | Rect-based hit test with margin (1a, 1b) | S | Fixes the drop mechanism structurally rather than patching around it. |
| 3 | `onTouchCancel` cleanup, all four handler sets (F2) | S | Kills the stuck-in-targeting-mode bug outright. |
| 4 | Ghost via ref + direct transform (F3) | S | Likely a real part of the "sticky" feel; cheap to prove either way. |
| 5 | Track `touch.identifier` (F6) | S | Removes the rare unreproducible weirdness. |
| 6 | Align thresholds to ~4px (F5) | XS | No scroll risk — `touchAction: 'none'` already handles it. |
| 7 | Wire tap-to-pick-up, or fix the comment (F4) | S/M | Gives the drag a recovery path. |
| 8 | Extract the shared hook across all three copies (F7) | M | After 1–7, so the fix lands once and correctly. |

**1–4 are all small and together address every confirmed reliability and performance mechanism.** That's the batch I'd do first.

---

## Appendix A — The correction

v1 of this doc led with a finding labelled *"highest impact"*: that `Roster.jsx:273-275` strips slot touch handlers while `itemTargeting` is true, and that the fix was to keep `onTouchEnd` and have it call `onPickTarget?.(i)`.

**That fix would do nothing.** Per the Touch Events spec, for both `touchmove` and `touchend`:

> "The target of this event must be the same Element on which the touch point started when it was first placed on the surface, even if the touch point has since moved outside the interactive area of the target element."

A bag drag begins on the bag `<img>`, so every subsequent event for that finger — including `touchend` — dispatches to the bag `<img>`. **A roster slot's `onTouchEnd` can never fire during a bag drag**, whether its handlers are stripped or not. This is implicit capture, and it is spec-mandated behaviour rather than an implementation detail.

Two further points confirm the handler stripping is harmless here:

- `data-slot-index` is set **unconditionally** (`Roster.jsx:263`), so the hit test is entirely unaffected by whether handlers are attached.
- The stripping is doing real work: it prevents a *new* `touchstart` that begins on a slot from starting a reorder while an item is being placed. **Keep it.**

v1 also contradicted itself — it conceded "Step 3 still works… only because `bagTouchEnd` reads the slot via `document.elementFromPoint`" while labelling the finding the top reliability issue. A finding that describes no failure cannot be the highest-impact one.

**Where the error came from:** I reasoned from the React code alone — handlers stripped, therefore drops can't be caught — without checking the DOM event model that governs whether those handlers could ever have fired. The lesson generalizes: when a finding is about *which element receives an event*, the platform's dispatch rules decide it, not the component tree.

The genuine top issue is the hit test plus silent failure, now Finding 1.

---

## Caveats

Static review of source; **no device or touch-emulator testing.** Confidence varies by finding:

- **Spec-guaranteed:** the touch-capture behaviour in Appendix A. Verified against the W3C Touch Events specification, not inferred.
- **Certain from the code:** Findings 2 (zero `touchcancel` handlers), 3 (state update per `touchmove`, `MapSvg` un-memoized), 4 (comment vs. implementation), 5 (threshold mismatch), 6 (unguarded `touches[0]`), 7 (three copies). All verified by direct inspection.
- **Mechanism certain, frequency unknown:** Finding 1's sub-cases. `pointer-events: none` on images and the ~58px slot size are facts; how often each actually causes a miss on real hardware needs a device.
- **Severity unquantified:** Finding 3's real cost in dropped frames. The re-render is certain; how much it hurts is not.

For any specific reproduced failure, the fastest diagnostic is logging at the drop:

```js
console.log('drop', { dragging: st?.dragging, x: t.clientX, y: t.clientY, idx,
                      hit: document.elementFromPoint(t.clientX, t.clientY)?.className })
```

`idx: null` on a drop that looked on-target confirms Finding 1. `dragging: false` on a deliberate drag confirms Finding 5.
