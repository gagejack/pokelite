import { test, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useBagTouchDrag } from './useBagTouchDrag.js'
import { makeTouch } from '../test/touch.js'

// Mirrors the real consumers: the ghost is mounted only while a drag is
// active, which is precisely what makes its first frame hard to position.
function Harness({ callbacks = {}, onTouchMoveBubble } = {}) {
  const { bagTouchProps, ghostRef, ghostItem } = useBagTouchDrag(callbacks)
  const props = bagTouchProps({ name: 'Potion' }, { kind: 'bag', index: 0 })
  const wrappedOnTouchMove = (e) => {
    props.onTouchMove(e)
    onTouchMoveBubble?.(e)
  }
  return (
    <>
      <div data-testid="item" {...props} onTouchMove={wrappedOnTouchMove}>item</div>
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
  fireEvent.touchStart(el, { touches: [start], changedTouches: [start] })
  const moved = makeTouch({ identifier, clientX: to.x, clientY: to.y })
  fireEvent.touchMove(el, { touches: [moved], changedTouches: [moved] })
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
  fireEvent.touchMove(item, { touches: [next], changedTouches: [next] })

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

test('scrolling is suppressed from the first tracked move, before the threshold', () => {
  let capturedEvent = null
  const onBubble = (e) => { capturedEvent = e }
  render(<Harness onTouchMoveBubble={onBubble} />)
  const item = screen.getByTestId('item')

  const start = makeTouch({ identifier: 0, clientX: 100, clientY: 100 })
  act(() => { fireEvent.touchStart(item, { touches: [start], changedTouches: [start] }) })

  // 2px — deliberately UNDER the 4px threshold, so no drag starts. The
  // browser must still be told not to turn this into a page scroll.
  const tiny = makeTouch({ identifier: 0, clientX: 102, clientY: 100 })
  act(() => { fireEvent.touchMove(item, { touches: [tiny], changedTouches: [tiny] }) })

  expect(capturedEvent?.defaultPrevented).toBe(true)
})

test('an untracked finger does not suppress scrolling', () => {
  let capturedEvent = null
  const onBubble = (e) => { capturedEvent = e }
  render(<Harness onTouchMoveBubble={onBubble} />)
  const item = screen.getByTestId('item')

  const start = makeTouch({ identifier: 0, clientX: 100, clientY: 100 })
  act(() => { fireEvent.touchStart(item, { touches: [start], changedTouches: [start] }) })

  // A different finger entirely — the hook is not tracking it, so it must
  // not claim the gesture.
  const other = makeTouch({ identifier: 9, clientX: 300, clientY: 300 })
  act(() => { fireEvent.touchMove(item, { touches: [other], changedTouches: [other] }) })

  expect(capturedEvent?.defaultPrevented).toBe(false)
})
