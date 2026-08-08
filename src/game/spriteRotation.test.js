import { test, expect } from 'vitest'
import { dailyOffers } from './spriteRotation.js'

// Small synthetic sprite list — spriteRotation.js takes the list as a plain
// argument, so tests never need spriteIndex.js (and never trigger
// import.meta.glob, which only resolves under Vite's build/test transform).
function makeSprites(region, names) {
  return names.map(name => ({ id: `${region}/${name}`, region, name, url: `/fake/${region}/${name}.webp` }))
}

const KANTO = makeSprites('Kanto', ['Red', 'Blue', 'Lance 1', 'Lance 2', 'Youngster', 'Bird Keeper', 'Lass', 'Hiker'])
const HOENN = makeSprites('Hoenn', ['Brendan', 'May', 'Roxanne', 'Maxie'])

test('same date + region + owned set produces the same 2 offers every call', () => {
  const a = dailyOffers('2026-08-07', 'Kanto', KANTO, [])
  const b = dailyOffers('2026-08-07', 'Kanto', KANTO, [])
  expect(a).toEqual(b)
  expect(a).toHaveLength(2)
})

test('a different date produces a different roll (not guaranteed different, but checked across several dates)', () => {
  const today = dailyOffers('2026-08-07', 'Kanto', KANTO, [])
  const dates = ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12']
  const differsAtLeastOnce = dates.some(d => {
    const offer = dailyOffers(d, 'Kanto', KANTO, [])
    return offer.map(s => s.id).join(',') !== today.map(s => s.id).join(',')
  })
  expect(differsAtLeastOnce).toBe(true)
})

test('a different region on the same date produces a different roll (not guaranteed, checked structurally)', () => {
  const kanto = dailyOffers('2026-08-07', 'Kanto', KANTO, [])
  const kantoAsHoennList = dailyOffers('2026-08-07', 'Hoenn', KANTO, [])
  // Same date, same underlying list, different region salt -> different seed.
  expect(kanto.map(s => s.id)).not.toEqual(kantoAsHoennList.map(s => s.id))
})

test('owned sprites never appear in the offers', () => {
  const ownedIds = KANTO.map(s => s.id).slice(0, 6) // own all but the last 2
  const offers = dailyOffers('2026-08-07', 'Kanto', KANTO, ownedIds)
  for (const offer of offers) {
    expect(ownedIds).not.toContain(offer.id)
  }
})

test('owned sprites excluded across many dates, not just one', () => {
  const owned = new Set([KANTO[0].id, KANTO[1].id])
  for (const date of ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']) {
    const offers = dailyOffers(date, 'Kanto', KANTO, owned)
    for (const offer of offers) {
      expect(owned.has(offer.id)).toBe(false)
    }
  }
})

test('fewer than 2 unowned sprites remain: returns just what is left, not a crash', () => {
  const ownedIds = KANTO.map(s => s.id).filter(id => id !== KANTO[3].id) // own all but 1
  const offers = dailyOffers('2026-08-07', 'Kanto', KANTO, ownedIds)
  expect(offers).toHaveLength(1)
  expect(offers[0].id).toBe(KANTO[3].id)
})

test('zero unowned (every sprite owned) returns an empty array, not a crash', () => {
  const ownedIds = KANTO.map(s => s.id)
  const offers = dailyOffers('2026-08-07', 'Kanto', KANTO, ownedIds)
  expect(offers).toEqual([])
})

test('a region with no sprites at all returns an empty array', () => {
  expect(dailyOffers('2026-08-07', 'Johto', [], [])).toEqual([])
  expect(dailyOffers('2026-08-07', 'Johto', undefined, [])).toEqual([])
})

test('accepts ownedIds as a plain array or a Set interchangeably', () => {
  const asArray = dailyOffers('2026-08-07', 'Hoenn', HOENN, [HOENN[0].id])
  const asSet = dailyOffers('2026-08-07', 'Hoenn', HOENN, new Set([HOENN[0].id]))
  expect(asArray).toEqual(asSet)
})

test('missing/undefined ownedIds is treated as "owns nothing"', () => {
  const offers = dailyOffers('2026-08-07', 'Hoenn', HOENN, undefined)
  expect(offers).toHaveLength(2)
})

test('10 offers/day across 5 regions: 2 per region when each has >=2 unowned', () => {
  const regions = {
    Kanto: KANTO,
    Hoenn: HOENN,
    Sinnoh: makeSprites('Sinnoh', ['Cynthia', 'Barry', 'Bug Catcher', 'Aaron']),
    Unova: makeSprites('Unova', ['Youngster', 'Roughneck', 'Ace Trainer 1', 'Hiker']),
    Johto: makeSprites('Johto', ['Lance', 'Whitney', 'Bug Catcher', 'Youngster']),
  }
  let total = 0
  for (const [region, list] of Object.entries(regions)) {
    total += dailyOffers('2026-08-07', region, list, []).length
  }
  expect(total).toBe(10)
})
