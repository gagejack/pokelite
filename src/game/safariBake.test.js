import { test, expect } from 'vitest'
import { bakeSafariSpecies } from './safariBake.js'
import { NODE_TYPES } from './nodeMap.js'
import { pickCatchOffer } from './catch.js'

// Minimal region config — only the fields the bake reads.
const CONFIG = {
  catchPools: [[
    { id: 1, rarity: 'common' },
    { id: 4, rarity: 'common' },
    { id: 7, rarity: 'rare' },
  ]],
  legendaryPools: [[{ id: 144, level: 50 }]],
  mapLevelRanges: [[10, 20]],
  catchLevelRanges: [[12, 18]],
  catchTierBudget: { common: 70, rare: 25, epic: 5, legendary: 0 },
  pickCatchOffer,
  fallbackSpeciesId: 504,
}

const rowsWith = (...types) => [types.map((type, i) => ({ id: i, type }))]

test('bakes species onto grass nodes', () => {
  const rows = rowsWith(NODE_TYPES.GRASS)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  const { species } = rows[0][0]
  expect(species).toBeTruthy()
  expect([1, 4, 7]).toContain(species.id)
  expect(species.level).toBeGreaterThan(0)
})

test('bakes id, rarity and level onto pokeball nodes', () => {
  const rows = rowsWith(NODE_TYPES.POKEBALL)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  const { species } = rows[0][0]
  expect(species).toBeTruthy()
  expect(species.rarity).toBeTruthy()
  expect(species.level).toBeGreaterThan(0)
})

test('bakes the legendary onto a master ball node', () => {
  const rows = rowsWith(NODE_TYPES.MASTER_BALL)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species).toEqual({ id: 144, level: 50 })
})

test('leaves every other node type untouched', () => {
  const rows = rowsWith(
    NODE_TYPES.TRAINER, NODE_TYPES.ITEM, NODE_TYPES.POWER_UPGRADE,
    NODE_TYPES.POKECENTER, NODE_TYPES.POKEMART, NODE_TYPES.BOSS,
    NODE_TYPES.MYSTERY, NODE_TYPES.RIVAL,
  )
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  rows[0].forEach(node => expect(node.species).toBeUndefined())
})

test('de-duplicates species within a row when the pool allows it', () => {
  // Three bakeable nodes against a three-species pool — all distinct. De-dup
  // is a filtered draw (availableIn removes used species before drawing), not
  // draw-and-retry, so this holds every run rather than most runs.
  const rows = rowsWith(NODE_TYPES.GRASS, NODE_TYPES.GRASS, NODE_TYPES.GRASS)
  bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  const ids = rows[0].map(n => n.species.id)
  expect(new Set(ids).size).toBe(3)
})

test('grass de-dup holds across many generations, not just on a lucky seed', () => {
  // Guards the property the previous test asserts once. A draw-and-retry
  // de-dup passes that test most runs and fails a few percent of the time;
  // this loop makes such an implementation fail reliably.
  for (let i = 0; i < 200; i++) {
    const rows = rowsWith(NODE_TYPES.GRASS, NODE_TYPES.GRASS, NODE_TYPES.GRASS)
    bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
    const ids = rows[0].map(n => n.species.id)
    expect(new Set(ids).size).toBe(3)
  }
})

test('allows duplicates when a row has more nodes than the pool has species', () => {
  // Five nodes, three species — repeats are unavoidable and must not throw.
  const rows = rowsWith(...Array(5).fill(NODE_TYPES.GRASS))
  expect(() =>
    bakeSafariSpecies(rows, { config: CONFIG, mapIndex: 0, maxSpeciesId: 151 })
  ).not.toThrow()
  expect(rows[0].every(n => n.species?.id)).toBe(true)
})

test('de-dup is scoped per row, so a species may repeat across rows', () => {
  // A single-species pool: two rows must both bake it, proving the used-set
  // resets per row rather than persisting across the map.
  const onePool = { ...CONFIG, catchPools: [[{ id: 25, rarity: 'common' }]] }
  const rows = [
    [{ id: 0, type: NODE_TYPES.GRASS }],
    [{ id: 1, type: NODE_TYPES.GRASS }],
  ]
  bakeSafariSpecies(rows, { config: onePool, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species.id).toBe(25)
  expect(rows[1][0].species.id).toBe(25)
})

test('falls back to fallbackSpeciesId when the catch pool is empty', () => {
  const emptyPool = { ...CONFIG, catchPools: [[]] }
  const rows = rowsWith(NODE_TYPES.GRASS)
  bakeSafariSpecies(rows, { config: emptyPool, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species.id).toBe(504)
})

test('bakes nothing on a master ball node when the legendary pool is empty', () => {
  const noLegendaries = { ...CONFIG, legendaryPools: [[]] }
  const rows = rowsWith(NODE_TYPES.MASTER_BALL)
  bakeSafariSpecies(rows, { config: noLegendaries, mapIndex: 0, maxSpeciesId: 151 })
  // No species to bake — the node keeps the Classic icon and the existing
  // empty-team guard clears it on click.
  expect(rows[0][0].species).toBeUndefined()
})

test('bakes nothing on a pokeball node when the catch pool is empty', () => {
  const emptyPool = { ...CONFIG, catchPools: [[]] }
  const rows = rowsWith(NODE_TYPES.POKEBALL)
  bakeSafariSpecies(rows, { config: emptyPool, mapIndex: 0, maxSpeciesId: 151 })
  expect(rows[0][0].species).toBeUndefined()
})

import { buildRows } from './nodeMap.js'

const anyNode = rows => rows.flat()

test('buildRows in classic mode bakes nothing', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0)
  expect(anyNode(rows).every(n => n.species === undefined)).toBe(true)
})

test('buildRows in safari mode bakes every bakeable node', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0, {
    mode: 'safari', config: CONFIG, maxSpeciesId: 151,
  })
  const bakeable = anyNode(rows).filter(n =>
    n.type === NODE_TYPES.GRASS || n.type === NODE_TYPES.POKEBALL || n.type === NODE_TYPES.MASTER_BALL
  )
  // The pools in CONFIG are non-empty, so every bakeable node gets a species.
  expect(bakeable.length).toBeGreaterThan(0)
  expect(bakeable.every(n => n.species?.id)).toBe(true)
})

test('buildRows in safari mode leaves non-bakeable nodes clean', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0, {
    mode: 'safari', config: CONFIG, maxSpeciesId: 151,
  })
  const others = anyNode(rows).filter(n =>
    n.type !== NODE_TYPES.GRASS && n.type !== NODE_TYPES.POKEBALL && n.type !== NODE_TYPES.MASTER_BALL
  )
  expect(others.every(n => n.species === undefined)).toBe(true)
})

test('buildRows in safari mode bakes nothing without a config', () => {
  // Defensive: a caller that forgets to pass config must produce a playable
  // Classic-looking map rather than crashing on config.catchPools.
  const rows = buildRows([1, 4, 7], 'Brock', 0, { mode: 'safari' })
  expect(anyNode(rows).every(n => n.species === undefined)).toBe(true)
})
