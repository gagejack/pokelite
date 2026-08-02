import test from 'node:test'
import assert from 'node:assert/strict'
import { MOVE_SOUND_FILES, soundFileFor } from './moveSounds.data.js'
import { TYPE_MOVES } from './typeMoves.js'

// The guard that matters: adding a move to TYPE_MOVES without a sound fails here.
test('every move in TYPE_MOVES has a sound file', () => {
  const missing = []
  for (const [type, tiers] of Object.entries(TYPE_MOVES)) {
    tiers.forEach((entry, i) => {
      if (!soundFileFor(entry.name)) missing.push(`${type} T${i + 1} ${entry.name}`)
    })
  }
  assert.deepEqual(missing, [], `moves with no sound: ${missing.join(', ')}`)
})

test('the table covers exactly the 72 authored move slots', () => {
  const authored = new Set(Object.values(TYPE_MOVES).flat().map(m => m.name))
  assert.equal(authored.size, 72)
  for (const name of authored) assert.ok(MOVE_SOUND_FILES[name], `${name} unmapped`)
})

test('a known move resolves to its own sound', () => {
  assert.equal(soundFileFor('tackle'), 'Tackle')
  assert.equal(soundFileFor('hydro-pump'), 'HydroPump')
})

test('a substituted move resolves to its stand-in', () => {
  assert.equal(soundFileFor('crunch'), 'Bite')
  assert.equal(soundFileFor('dragon-breath'), 'DragonRage')
})

test('unknown and empty input return undefined instead of throwing', () => {
  assert.equal(soundFileFor('not-a-move'), undefined)
  // battle.js writes this literal when an attacker has no move.
  assert.equal(soundFileFor('(no move)'), undefined)
  assert.equal(soundFileFor(undefined), undefined)
  assert.equal(soundFileFor(null), undefined)
  assert.equal(soundFileFor(''), undefined)
})
