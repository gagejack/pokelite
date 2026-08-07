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
