import { test, expect } from 'vitest'
import { characterForProfile } from './playerCharacter.js'
import { allSprites, spritesForRegion } from './spriteIndex.js'

// The equipped Cosmetics-shop skin is what NodeMap (current-node icon),
// BattleCard (player column), and EliteFour draw as the player, on every
// region. These cover the derivation itself; App.jsx's `activeCharacter` is
// what feeds it into those three as the `character` prop.

const FALLBACK = { id: 'Hilbert', name: 'Hilbert', sprite: '/default.webp' }

test('no profile falls back to the default protagonist', () => {
  expect(characterForProfile(null, FALLBACK)).toBe(FALLBACK)
  expect(characterForProfile(undefined, FALLBACK)).toBe(FALLBACK)
})

test('a profile with nothing equipped falls back to the default protagonist', () => {
  expect(characterForProfile({ equippedSprite: null }, FALLBACK)).toBe(FALLBACK)
})

test('an equipped sprite becomes the character, in the {id,name,sprite} shape the map reads', () => {
  const sprite = allSprites()[0]
  const character = characterForProfile({ equippedSprite: sprite.id }, FALLBACK)
  expect(character).toEqual({ id: sprite.id, name: sprite.name, sprite: sprite.url })
})

// A renamed or deleted asset leaves a stale id in a real saved profile. That
// must render the default trainer, not a broken image.
test('a stale equipped id that no longer resolves falls back rather than yielding a broken sprite', () => {
  const character = characterForProfile({ equippedSprite: 'Kanto/Not A Real Sprite' }, FALLBACK)
  expect(character).toBe(FALLBACK)
})

// The skins are one global pool, not per-region: equipping a Kanto sprite must
// resolve to the same art no matter which region's map is on screen, which is
// exactly what "the derivation ignores the current region" means here.
test('a sprite tagged to one region still resolves for use on every region', () => {
  const kantoSprite = spritesForRegion('Kanto')[0]
  const johtoSprite = spritesForRegion('Johto')[0]
  expect(characterForProfile({ equippedSprite: kantoSprite.id }, FALLBACK).sprite).toBe(kantoSprite.url)
  expect(characterForProfile({ equippedSprite: johtoSprite.id }, FALLBACK).sprite).toBe(johtoSprite.url)
})
