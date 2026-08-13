import { test, expect } from 'vitest'
import { megaStoneChance, buildRows, NODE_TYPES } from './nodeMap.js'

test('megaStoneChance is 0 before map index 2 (map 3)', () => {
  expect(megaStoneChance(0)).toBe(0)
  expect(megaStoneChance(1)).toBe(0)
})

test('megaStoneChance is flat 3% from map index 2 on', () => {
  expect(megaStoneChance(2)).toBeCloseTo(0.03)
  expect(megaStoneChance(5)).toBeCloseTo(0.03)
  expect(megaStoneChance(7)).toBeCloseTo(0.03)
})

test('buildRows never produces a MEGA_STONE node when megaStoneAvailable is false, regardless of map index', () => {
  for (let mapIndex = 2; mapIndex <= 7; mapIndex++) {
    const rows = buildRows([1, 4, 7], 'Brock', mapIndex, { megaStoneAvailable: false })
    const hasMega = rows.some(row => row.some(n => n.type === NODE_TYPES.MEGA_STONE))
    expect(hasMega).toBe(false)
  }
})

test('buildRows never produces a MEGA_STONE node before map index 2 even when available', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0, { megaStoneAvailable: true })
  const hasMega = rows.some(row => row.some(n => n.type === NODE_TYPES.MEGA_STONE))
  expect(hasMega).toBe(false)
})
