import { test, expect, describe } from 'vitest'
import { toBagItem, ensureBagUids } from './bagItem.js'

// Mirrors the bag half of App.jsx moveItem, post-fix (App.jsx:1053-1061)
const bagMove = ({ item, from, to, displaced }) => prev => {
  let next = from.kind === 'bag' ? prev.filter(x => x.uid !== item.uid) : [...prev]
  if (to.kind === 'bag') next = [...next, item.uid ? item : toBagItem(item)]
  if (displaced) next = [...next, toBagItem(displaced)]
  return next
}

const keepInBag = item => prev => [...prev, toBagItem(item)]

// Shared inventory object, exactly like PokemartNode's entry.item
const MAX_HEAL = { id: 'max_heal', name: 'Max Heal' }

describe('bag uid addressing', () => {
  test('buying 5 Max Heals yields 5 DISTINCT entries with unique uids', () => {
    let bag = []
    for (let i = 0; i < 5; i++) bag = keepInBag(MAX_HEAL)(bag)
    expect(bag).toHaveLength(5)
    expect(new Set(bag.map(x => x.uid)).size).toBe(5)
    // no shared references back to the inventory object
    expect(bag.every(x => x !== MAX_HEAL)).toBe(true)
  })

  test('purchases do not mutate the shared shop inventory object', () => {
    keepInBag(MAX_HEAL)([])
    expect(MAX_HEAL.uid).toBeUndefined()
  })

  test('REGRESSION: stale index no longer removes the wrong entry', () => {
    let bag = []
    for (let i = 0; i < 3; i++) bag = keepInBag(MAX_HEAL)(bag)
    const potion = toBagItem({ id: 'potion', name: 'Potion' })
    bag = [...bag, potion]

    // UI captured the Potion while it sat at index 3. A Max Heal leaves first.
    const first = bag[0]
    const afterFirst = bagMove({ item: first, from: { kind: 'bag', uid: first.uid }, to: { kind: 'pokemon' } })(bag)
    expect(afterFirst).toHaveLength(3)

    // Drop fires with the capture taken BEFORE that removal (now stale index 3).
    const afterSecond = bagMove({ item: potion, from: { kind: 'bag', uid: potion.uid }, to: { kind: 'pokemon' } })(afterFirst)
    expect(afterSecond.some(x => x.id === 'potion')).toBe(false)
    expect(afterSecond).toHaveLength(2)
  })

  test('removing one of N identical items removes exactly one', () => {
    let bag = []
    for (let i = 0; i < 5; i++) bag = keepInBag(MAX_HEAL)(bag)
    const target = bag[2]
    const after = bagMove({ item: target, from: { kind: 'bag', uid: target.uid }, to: { kind: 'pokemon' } })(bag)
    expect(after).toHaveLength(4)
    expect(after.some(x => x.uid === target.uid)).toBe(false)
  })

  test('old saves without uids are backfilled on load', () => {
    const legacy = [{ id: 'max_heal', name: 'Max Heal' }, { id: 'max_heal', name: 'Max Heal' }]
    const restored = ensureBagUids(legacy)
    expect(new Set(restored.map(x => x.uid)).size).toBe(2)
    expect(ensureBagUids(undefined)).toEqual([])
  })

  test('ensureBagUids preserves existing uids', () => {
    const withUid = toBagItem(MAX_HEAL)
    expect(ensureBagUids([withUid])[0].uid).toBe(withUid.uid)
  })
})
