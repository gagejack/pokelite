import { test, expect } from 'vitest'
import { REGION_STARTERS, dejaVuOfferedIds } from './starters.js'

const KANTO = REGION_STARTERS.Kanto // [1, 4, 7]

test('Déjà Vu not owned: region ids pass through unchanged, no déjà vu ids regardless of history', () => {
  const result = dejaVuOfferedIds(KANTO, [495, 152], false)
  expect(result).toEqual({ regionIds: KANTO, dejaVuIds: [] })
})

test('Déjà Vu owned, no run history yet: déjà vu list is empty, not a hole', () => {
  const result = dejaVuOfferedIds(KANTO, [], true)
  expect(result).toEqual({ regionIds: KANTO, dejaVuIds: [] })
})

test('Déjà Vu owned, undefined usedStarters: treated as no history, does not throw', () => {
  const result = dejaVuOfferedIds(KANTO, undefined, true)
  expect(result).toEqual({ regionIds: KANTO, dejaVuIds: [] })
})

test('Déjà Vu owned: used starters from OTHER regions are offered', () => {
  const result = dejaVuOfferedIds(KANTO, [495, 152], true)
  expect(result.regionIds).toEqual(KANTO)
  expect(result.dejaVuIds).toEqual([495, 152])
})

test('a used starter that is ALSO one of the region\'s three is not duplicated', () => {
  // 4 (Charmander) is in Kanto's own three.
  const result = dejaVuOfferedIds(KANTO, [4, 495], true)
  expect(result.regionIds).toEqual(KANTO)
  expect(result.dejaVuIds).toEqual([495])
})

test('usedStarters recorded more than once is deduped in the déjà vu list', () => {
  const result = dejaVuOfferedIds(KANTO, [495, 495, 152, 495], true)
  expect(result.dejaVuIds).toEqual([495, 152])
})

test('all used starters overlapping the region leaves an empty déjà vu list', () => {
  const result = dejaVuOfferedIds(KANTO, [1, 4, 7], true)
  expect(result.dejaVuIds).toEqual([])
})

test('order of dejaVuIds follows usedStarters order, first-seen wins on dupes', () => {
  const result = dejaVuOfferedIds(KANTO, [501, 495, 501, 152], true)
  expect(result.dejaVuIds).toEqual([501, 495, 152])
})
