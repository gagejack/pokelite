import { test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { makeTouch, touchEvent } from './touch.js'

function Probe() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>count {n}</button>
}

function LateMount() {
  const [shown, setShown] = useState(false)
  return (
    <>
      <button onClick={() => setShown(true)}>reveal</button>
      {shown && <img data-testid="late" alt="" />}
    </>
  )
}

test('the harness renders a component and processes state updates', () => {
  render(<Probe />)
  expect(screen.getByText('count 0')).toBeTruthy()
  fireEvent.click(screen.getByText('count 0'))
  expect(screen.getByText('count 1')).toBeTruthy()
})

test('a state update can mount a new element not previously in the DOM', () => {
  render(<LateMount />)
  expect(screen.queryByTestId('late')).toBeNull()
  fireEvent.click(screen.getByText('reveal'))
  expect(screen.queryByTestId('late')).not.toBeNull()
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
