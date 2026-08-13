import { test, expect } from 'vitest'
import { attackTypeFor } from './attackTypes.js'

test('mega Charizard X (fire/dragon) attacks as fire, not the table fallback', () => {
  expect(attackTypeFor(10034, ['fire', 'dragon'])).toBe('fire')
})

test('mega Gyarados (water/dark) attacks as water', () => {
  expect(attackTypeFor(10041, ['water', 'dark'])).toBe('water')
})

test('mega Mewtwo X (psychic/fighting) attacks as psychic', () => {
  expect(attackTypeFor(10043, ['psychic', 'fighting'])).toBe('psychic')
})

test('mega Ampharos (electric/dragon) attacks as electric', () => {
  expect(attackTypeFor(10045, ['electric', 'dragon'])).toBe('electric')
})

test('mega Sceptile (grass/dragon) attacks as grass', () => {
  expect(attackTypeFor(10065, ['grass', 'dragon'])).toBe('grass')
})

test('mega Altaria (dragon/fairy) attacks as dragon', () => {
  expect(attackTypeFor(10067, ['dragon', 'fairy'])).toBe('dragon')
})

test('mega Pinsir (bug/flying) attacks as bug', () => {
  expect(attackTypeFor(10040, ['bug', 'flying'])).toBe('bug')
})

test('mega Lopunny (normal/fighting) attacks as fighting (normal is offensively dead weight)', () => {
  expect(attackTypeFor(10088, ['normal', 'fighting'])).toBe('fighting')
})

test('mega Audino (normal/fairy) attacks as fairy', () => {
  expect(attackTypeFor(10069, ['normal', 'fairy'])).toBe('fairy')
})

test('mega Aggron (steel only, single-typed) falls back to types[0] with no table row needed', () => {
  expect(attackTypeFor(10053, ['steel'])).toBe('steel')
})
