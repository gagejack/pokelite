import { test, expect } from 'vitest'
import { META_CATALOG, METACASH_ITEMS, KEY_ITEMS, metaIconUrl } from './metaCatalog.js'

// ── Shop item icons ───────────────────────────────────────────────────────
//
// These resolve to remote PokeAPI sprite files, so a typo'd name doesn't fail
// the build — it ships a broken image into the shop. The suite can't reach the
// network, so it can't prove a name EXISTS upstream (all 23 were verified 200
// by hand when added). What it can do is pin the invariants that would let a
// bad one slip in unnoticed: every item carries an icon, the names look like
// real sprite slugs, and nothing silently falls back to a 404-shaped URL.

test('every catalog item has an icon', () => {
  const missing = META_CATALOG.filter(item => !item.icon).map(item => item.id)
  expect(missing).toEqual([])
})

test('icon names are lowercase-hyphen sprite slugs', () => {
  // PokeAPI's item sprites are all `lowercase-with-hyphens`. An icon written
  // as 'Amulet Coin' or 'amulet_coin' resolves to a 404, which renders as a
  // broken image rather than throwing anywhere.
  for (const item of META_CATALOG) {
    expect(item.icon, `${item.id} has a malformed icon name`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  }
})

test('the six vitamins use their real Pokémon item sprites', () => {
  // These six ARE real items, so the mapping is exact rather than chosen —
  // an unrelated sprite here would misinform the player about what they're
  // buying, not merely look odd.
  const expected = {
    hp_up: 'hp-up',
    protein: 'protein',
    iron: 'iron',
    calcium: 'calcium',
    zinc: 'zinc',
    carbos: 'carbos',
  }
  for (const [id, icon] of Object.entries(expected)) {
    expect(META_CATALOG.find(item => item.id === id)?.icon).toBe(icon)
  }
})

test('metaIconUrl builds a PokeAPI sprite URL', () => {
  const protein = META_CATALOG.find(item => item.id === 'protein')
  expect(metaIconUrl(protein)).toBe(
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/protein.png'
  )
})

test('metaIconUrl returns null rather than a 404-shaped URL', () => {
  // A new item added without an icon should render nothing, not request
  // ".../undefined.png" and show a broken image.
  expect(metaIconUrl({ id: 'no_icon_yet' })).toBeNull()
  expect(metaIconUrl(null)).toBeNull()
  expect(metaIconUrl(undefined)).toBeNull()
})

test('no two items share an icon', () => {
  // Not a correctness requirement, but a duplicate almost always means a
  // copy-paste slip rather than a deliberate reuse — 23 distinct items should
  // read as 23 distinct things on the shelf.
  const icons = META_CATALOG.map(item => item.icon)
  expect(new Set(icons).size).toBe(icons.length)
})

test('the catalog is the 20 metacash items plus the 3 key items', () => {
  expect(METACASH_ITEMS).toHaveLength(20)
  expect(KEY_ITEMS).toHaveLength(3)
  expect(META_CATALOG).toHaveLength(23)
})
