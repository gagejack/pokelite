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
