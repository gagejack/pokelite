import { test, expect } from 'vitest'
import { MOVE_SOUND_FILES, soundFileFor } from './moveSounds.data.js'
import { TYPE_MOVES } from './typeMoves.js'
import { MOVE_ANIMATION_ALIASES } from './moveAliases.data.js'

// The guard that matters: adding a move to TYPE_MOVES without a sound fails here.
test('every move in TYPE_MOVES has a sound file', () => {
  const missing = []
  for (const [type, tiers] of Object.entries(TYPE_MOVES)) {
    tiers.forEach((entry, i) => {
      if (!soundFileFor(entry.name)) missing.push(`${type} T${i + 1} ${entry.name}`)
    })
  }
  expect(missing).toEqual([])
})

test('the table covers exactly the 72 authored move slots', () => {
  const authored = new Set(Object.values(TYPE_MOVES).flat().map(m => m.name))
  expect(authored.size).toBe(72)
  for (const name of authored) expect(MOVE_SOUND_FILES[name]).toBeTruthy()
})

test('a known move resolves to its own sound', () => {
  expect(soundFileFor('tackle')).toBe('Tackle')
  expect(soundFileFor('hydro-pump')).toBe('HydroPump')
})

test('a substituted move resolves to its stand-in', () => {
  expect(soundFileFor('crunch')).toBe('Bite')
  expect(soundFileFor('dragon-breath')).toBe('DragonRage')
})

test('unknown and empty input return undefined instead of throwing', () => {
  expect(soundFileFor('not-a-move')).toBe(undefined)
  // battle.js writes this literal when an attacker has no move.
  expect(soundFileFor('(no move)')).toBe(undefined)
  expect(soundFileFor(undefined)).toBe(undefined)
  expect(soundFileFor(null)).toBe(undefined)
  expect(soundFileFor('')).toBe(undefined)
})

// The 23 stems authored by ear for moves Gen 1 never had. These deliberately
// ignore the alias table, so the drift check below skips them.
const AUTHORED = new Set([
  'twister', 'dragon-breath', 'dragon-pulse', 'draco-meteor',
  'metal-claw', 'metal-sound', 'iron-head', 'flash-cannon',
  'fairy-wind', 'draining-kiss', 'dazzling-gleam', 'moonblast',
  'shadow-punch', 'shadow-ball', 'shadow-force',
  'powder-snow', 'ice-shard', 'hydro-cannon', 'brick-break',
  'air-slash', 'brave-bird', 'future-sight', 'megahorn',
])

// The 53 stems this game ships, slugged for name comparison. A move "has its
// own sound" when its own name matches one of them.
const slug = s => s.toLowerCase().replace(/[^a-z]/g, '')
const SHIPPED = new Set(Object.values(MOVE_SOUND_FILES).map(slug))

// An alias target may be a move in our table (`bite`) OR a move that is not one
// of our 72 but whose sound we ship anyway (`dig`, `toxic`, `thunder-punch`).
// Resolve either to a stem; without the first branch, 10 of the 18 checks would
// silently no-op.
const stemOf = name =>
  Object.values(MOVE_SOUND_FILES).find(f => slug(f) === slug(name)) ??
  MOVE_SOUND_FILES[name]

// MOVE_SOUND_FILES inlines the stems that alias-resolved moves land on, because
// the data module cannot import moveAnimations.js. This asserts those inlined
// copies still agree with the alias table: a move with no sound of its own and
// no authored substitution must use whatever sound its alias target uses. Edit
// an alias and this fails, instead of silently leaving a move sounding wrong.
test('alias-resolved moves match their alias target sound', () => {
  const drift = []
  let checked = 0
  for (const move of Object.keys(MOVE_SOUND_FILES)) {
    if (SHIPPED.has(slug(move))) continue   // has an exact sound of its own
    if (AUTHORED.has(move)) continue        // chosen by ear, alias not involved
    const target = MOVE_ANIMATION_ALIASES[move]
    if (!target) continue
    const expected = stemOf(target)
    if (!expected) continue
    checked++
    if (MOVE_SOUND_FILES[move] !== expected) {
      drift.push(`${move}: ${MOVE_SOUND_FILES[move]} != ${expected} (via ${target})`)
    }
  }
  // 18 moves resolve through the alias table today. The floor catches a future
  // refactor that accidentally makes this test a no-op.
  expect(checked).toBe(18)
  expect(drift).toEqual([])
})
