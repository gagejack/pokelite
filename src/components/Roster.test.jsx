import { test, expect, beforeAll } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { ThemeProvider } from '../lib/theme'
import Roster from './Roster.jsx'
import { makeTouch } from '../test/touch.js'

// ThemeProvider reads and writes localStorage on mount, which this jsdom
// environment doesn't supply. A map-backed stub is enough — no test here
// depends on the stored value, only on the provider mounting. Mirrors
// RunEndScreen.test.jsx's setup.
beforeAll(() => {
  if (typeof localStorage !== 'undefined') return
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  }
})

// Minimal roster fixture: PokemonSlot reads name/sprite/level/types/heldItem/
// fainted/stats off each entry.
function makeRoster() {
  return [
    { name: 'Bulbasaur', sprite: '', level: 5, types: ['grass'], heldItem: null, fainted: false, stats: { hp: 20, maxHp: 20 } },
    { name: 'Charmander', sprite: '', level: 5, types: ['fire'], heldItem: null, fainted: false, stats: { hp: 19, maxHp: 19 } },
  ]
}

// Slot 0's opacity is the outward signal of `isDragging`: 0.35 while picked
// up, 1 once the drag state clears. Reading it end-to-end (through Roster's
// real touch handlers, not the hook in isolation) is what actually pins the
// PokemonSlot prop-forwarding contract that broke.
function opacityOf(slot) {
  return slot.style.opacity
}

test('an OS touchcancel during roster reorder drops the picked-up slot back down', () => {
  render(
    <ThemeProvider>
      <Roster roster={makeRoster()} onSwap={() => {}} />
    </ThemeProvider>,
  )
  const slot = document.querySelector('[data-slot-index="0"]')

  const start = makeTouch({ identifier: 0, clientX: 10, clientY: 10 })
  act(() => { fireEvent.touchStart(slot, { touches: [start], changedTouches: [start] }) })

  // Past the 4px threshold: promotes to a drag, which dims the source slot.
  const moved = makeTouch({ identifier: 0, clientX: 30, clientY: 30 })
  act(() => { fireEvent.touchMove(slot, { touches: [moved], changedTouches: [moved] }) })
  expect(opacityOf(slot)).toBe('0.35')

  // OS interruption: touchcancel fires, no touchend ever arrives. Without
  // onTouchCancel wired through PokemonSlot, dragFrom is never cleared and
  // the slot stays dimmed forever.
  act(() => { fireEvent.touchCancel(slot, { touches: [], changedTouches: [moved] }) })

  expect(opacityOf(slot)).toBe('1')
})

// ── Desktop rail fit ─────────────────────────────────────────────────────────
// The rail gives every slot a FIXED height (the map's height divided by
// partySize) and clips it with overflow:hidden. So the slot's own children have
// to fit that height by construction — nothing downstream will reflow them.
// These tests assert exactly that, because the failure mode is silent: content
// simply disappears off the bottom of the slot.

// jsdom reports 0 for every layout box, so measuring the rendered slot is not
// an option. What IS assertable is the arithmetic the component authored into
// its inline styles: the slot's own height against the heights it assigned to
// its children. That is precisely where the budget bug lived.
function slotFit(slot) {
  const height = parseFloat(slot.style.height)
  const padTop = parseFloat(slot.style.paddingTop) || 0
  const gap = parseFloat(slot.style.gap) || 0
  const sprite = parseFloat(slot.querySelector('img')?.style.height) || 0
  // The two Pokemon Classic labels sit at a 10px floor and measure 12px and
  // 15px line boxes at that size — the same constants the component reserves.
  const NAME_LINE = 12
  const LVL_LINE = 15
  // Held-item badge: icon + 1px padding + 2px border, both edges. Only counts
  // against the column when it is actually IN the column — on a short rail it
  // lifts out into an absolutely positioned overlay on the sprite and costs the
  // stack no height at all.
  const badgeImg = slot.querySelector('[title] img')
  const stacked = badgeImg && badgeImg.parentElement.style.position !== 'absolute'
  const badge = stacked ? parseFloat(badgeImg.style.height) + 6 : 0
  // HP foot rule and the paddingTop of its wrapper.
  const hpWrap = slot.querySelector('[style*="margin-top: auto"]')
  const hpPad = hpWrap ? parseFloat(hpWrap.style.paddingTop) || 0 : 0
  const hpBar = hpWrap ? parseFloat(hpWrap.querySelector('div')?.style.height) || 0 : 0
  // One gap per gutter between rendered children.
  const children = 4 + (badge ? 1 : 0)
  const content = padTop + sprite + NAME_LINE + LVL_LINE + badge + hpPad + hpBar
    + gap * (children - 1)
  return { height, content }
}

function renderRail(roster, { mapHeight = 560 } = {}) {
  window.innerWidth = 1440
  const r = render(
    <ThemeProvider>
      <Roster roster={roster} mapHeight={mapHeight} onSwap={() => {}} />
    </ThemeProvider>,
  )
  return r
}

test('a slot holding an item still fits its fixed height', () => {
  // The regression: the held-item badge is a fifth child in the slot's flex
  // column, but the height budget only ever reserved four. A slot with an item
  // overflowed by roughly the badge's height, and since everything above it is
  // flexShrink:0 the clip landed on the badge and the HP bar beneath it.
  const roster = makeRoster()
  roster[0].heldItem = { name: 'Leftovers', id: 'leftovers' }
  renderRail(roster)

  const { height, content } = slotFit(document.querySelector('[data-slot-index="0"]'))
  expect(height).toBeGreaterThan(0)
  expect(content).toBeLessThanOrEqual(height)
})

test('slots fit at every rail height a browser window can produce', () => {
  // The sprite absorbs the slack, so the fit has to hold as the map shrinks —
  // including past the point where the sprite hits its 20px preferred floor,
  // which is where the old code started overflowing instead of shrinking.
  const roster = makeRoster()
  roster[0].heldItem = { name: 'Leftovers', id: 'leftovers' }

  for (const mapHeight of [900, 720, 560, 420, 320, 260, 200]) {
    const { unmount } = renderRail(roster, { mapHeight })
    for (const i of [0, 1]) {
      const { height, content } = slotFit(document.querySelector(`[data-slot-index="${i}"]`))
      expect(
        content,
        `slot ${i} overflows its box at mapHeight=${mapHeight}: ${content} > ${height}`,
      ).toBeLessThanOrEqual(height)
    }
    unmount()
  }
})
