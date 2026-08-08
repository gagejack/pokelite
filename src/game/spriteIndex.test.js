import { test, expect } from 'vitest'
import { displayNameFromBasename, spritesForRegion, allSprites, SPRITE_REGIONS } from './spriteIndex.js'

// Pure name-derivation logic, PLUS the glob-backed exports: vitest.config.js
// registers @vitejs/plugin-react and runs tests through the Vite transform
// pipeline (not plain Node), so import.meta.glob resolves here the same way
// it does in the app build — these assertions are real, not skipped.
// `npm run build` is the second, independent proof (the task brief's
// fallback requirement) that the glob resolves for the production bundle
// too, not just under the test transform.

test('strips the Spr_HGSS_ prefix and turns underscores into spaces', () => {
  expect(displayNameFromBasename('Spr_HGSS_Bug_Catcher')).toBe('Bug Catcher')
  expect(displayNameFromBasename('Spr_HGSS_Ace_Trainer_F')).toBe('Ace Trainer F')
})

test('non-Johto basenames (no Spr_HGSS_ prefix) pass through with underscores converted', () => {
  expect(displayNameFromBasename('Lance 4')).toBe('Lance 4') // already space-separated
  expect(displayNameFromBasename('Aqua_Grunt_1')).toBe('Aqua Grunt 1')
})

test('a name with no underscores and no prefix is unchanged', () => {
  expect(displayNameFromBasename('Youngster')).toBe('Youngster')
})

// ── Glob-backed exports (see header comment: this runs for real here) ──────

test('per-region usable counts match the verified filename audit (100/100/100/74/54)', () => {
  expect(spritesForRegion('Kanto')).toHaveLength(100)
  expect(spritesForRegion('Hoenn')).toHaveLength(100)
  expect(spritesForRegion('Sinnoh')).toHaveLength(100)
  expect(spritesForRegion('Unova')).toHaveLength(74)
  expect(spritesForRegion('Johto')).toHaveLength(54)
})

test('an unrecognized region returns an empty array, not a crash', () => {
  expect(spritesForRegion('Kalos')).toEqual([])
})

test('every sprite has a stable "<Region>/<Display Name>" id, a region, a name, and a resolved url', () => {
  const kanto = spritesForRegion('Kanto')
  for (const sprite of kanto) {
    expect(sprite.id).toBe(`Kanto/${sprite.name}`)
    expect(sprite.region).toBe('Kanto')
    expect(typeof sprite.url).toBe('string')
    expect(sprite.url.length).toBeGreaterThan(0)
  }
})

test('junk-named files never appear in the index', () => {
  const kanto = spritesForRegion('Kanto')
  const junky = kanto.filter(s => /^[a-z0-9]+$/.test(s.name))
  expect(junky).toEqual([])
})

test('Johto excludes the sprite atlas and the 5 back sprites, keeping only Spr_HGSS_-prefixed poses', () => {
  const johto = spritesForRegion('Johto')
  const names = johto.map(s => s.name)
  expect(names).not.toContain('AllTrainerSprites')
  expect(names.some(n => /back/i.test(n))).toBe(false)
  // Spr_HGSS_ prefix is stripped, so a known real entry shows up bare.
  expect(names).toContain('Bug Catcher')
})

test('Johto display names have the Spr_HGSS_ prefix stripped', () => {
  const johto = spritesForRegion('Johto')
  const lance = johto.find(s => s.id === 'Johto/Lance')
  expect(lance).toBeDefined()
  expect(lance.name).toBe('Lance')
})

test('numbered variants stay separate entries with distinct ids', () => {
  const kanto = spritesForRegion('Kanto')
  const lanceVariants = kanto.filter(s => /^Lance \d+$/.test(s.name))
  expect(lanceVariants.length).toBeGreaterThanOrEqual(5)
  const ids = new Set(lanceVariants.map(s => s.id))
  expect(ids.size).toBe(lanceVariants.length) // every variant has a unique id
})

test('allSprites flattens every region in SPRITE_REGIONS order and matches the total usable count', () => {
  const all = allSprites()
  expect(all).toHaveLength(428)
  expect(SPRITE_REGIONS).toEqual(['Kanto', 'Hoenn', 'Sinnoh', 'Unova', 'Johto'])
})

test('every sprite id is unique across the whole index', () => {
  // ownedSprites is keyed by these ids and persists forever, so a collision
  // would put two different sprites behind one purchase key — buy one, and
  // which art you get depends on glob order. buildRegionSprites drops
  // duplicates with a console.warn rather than shipping that ambiguity; this
  // pins the invariant so a future asset drop can't reintroduce it silently.
  const all = allSprites()
  const ids = new Set(all.map(s => s.id))
  expect(ids.size).toBe(all.length)
})
