import { test, expect } from 'vitest'
import { tierForDisplayName, stripVariantNumber, priceForDisplayName, SPRITE_TIERS } from './spriteTiers.js'

const PRICES = { common: 200, uncommon: 500, elite: 1200, champion: 3000 }

test('Common tier: generic trainer classes (spec examples)', () => {
  expect(tierForDisplayName('Bird Keeper')).toBe('common')
  expect(tierForDisplayName('Roughneck')).toBe('common')
  expect(tierForDisplayName('Youngster')).toBe('common')
  expect(tierForDisplayName('Bug Catcher')).toBe('common')
})

test('Uncommon tier: serious-trainer classes (spec examples)', () => {
  expect(tierForDisplayName('Ace Trainer')).toBe('uncommon')
  expect(tierForDisplayName('Hiker')).toBe('uncommon')
  expect(tierForDisplayName('Veteran')).toBe('uncommon')
})

test('Elite tier: gym leaders and Elite Four (spec examples: Koga, Bruno, Lance)', () => {
  expect(tierForDisplayName('Koga')).toBe('elite')
  expect(tierForDisplayName('Bruno')).toBe('elite')
  expect(tierForDisplayName('Lance')).toBe('elite')
})

test('Champion tier: region champions and Giovanni (spec examples)', () => {
  expect(tierForDisplayName('Red')).toBe('champion')
  expect(tierForDisplayName('Blue')).toBe('champion')
  expect(tierForDisplayName('Cynthia')).toBe('champion')
  expect(tierForDisplayName('Giovanni')).toBe('champion')
})

test('unmatched/unknown names default to Common', () => {
  expect(tierForDisplayName('Some Unknown Trainer')).toBe('common')
  expect(tierForDisplayName('')).toBe('common')
})

test('numbered variants strip the trailing number for matching, but tier the same as the base class', () => {
  expect(tierForDisplayName('Lance 1')).toBe('elite')
  expect(tierForDisplayName('Lance 2')).toBe('elite')
  expect(tierForDisplayName('Lance 3')).toBe('elite')
  expect(tierForDisplayName('Lance 4')).toBe('elite')
  expect(tierForDisplayName('Lance 5')).toBe('elite')
  expect(tierForDisplayName('Red 8')).toBe('champion')
  expect(tierForDisplayName('Ace Trainer 2')).toBe('uncommon')
})

test('stripVariantNumber only strips a trailing space+number, not internal digits or names', () => {
  expect(stripVariantNumber('Lance 4')).toBe('Lance')
  expect(stripVariantNumber('Ace Trainer 1')).toBe('Ace Trainer')
  expect(stripVariantNumber('Lt. Surge 3')).toBe('Lt. Surge')
  expect(stripVariantNumber('Bird Keeper')).toBe('Bird Keeper') // no trailing number: unchanged
})

test('numbered variants remain distinguishable identities even though they share a tier', () => {
  // The tier match collapses "Lance 1".."Lance 5" to the same price tier,
  // but this module never merges their display names/ids — that stays
  // spriteIndex.js's job (id = "<Region>/<display name>", numbers intact).
  expect(tierForDisplayName('Lance 1')).toBe(tierForDisplayName('Lance 5'))
  expect('Lance 1').not.toBe('Lance 5')
})

test('Spr_HGSS_ prefix is expected to already be stripped by spriteIndex.js before this module sees the name', () => {
  // spriteIndex.displayNameFromBasename strips Spr_HGSS_ before tier
  // matching ever runs; this module operates purely on the resulting display
  // name, e.g. "Bug Catcher" (from Spr_HGSS_Bug_Catcher), which is Common.
  expect(tierForDisplayName('Bug Catcher')).toBe('common')
  expect(tierForDisplayName('Karen')).toBe('elite')
})

test('priceForDisplayName reads prices from the tierPrices argument, not a hardcoded value', () => {
  expect(priceForDisplayName('Youngster', PRICES)).toBe(200)
  expect(priceForDisplayName('Hiker', PRICES)).toBe(500)
  expect(priceForDisplayName('Lance 4', PRICES)).toBe(1200)
  expect(priceForDisplayName('Cynthia', PRICES)).toBe(3000)
})

test('SPRITE_TIERS lists exactly the four tiers', () => {
  expect(SPRITE_TIERS).toEqual(['common', 'uncommon', 'elite', 'champion'])
})
