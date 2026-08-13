import { test, expect, vi, beforeEach } from 'vitest'

// Fake megas.json fetch — same pattern pokemon.test.js uses for local data.
const FAKE_MEGAS = {
  generatedAt: '2026-01-01', source: 'pokeapi.co',
  megas: {
    '6': [
      { formId: 10034, formName: 'charizard-mega-x', label: 'Mega Charizard X',
        types: ['fire', 'dragon'],
        baseStats: { hp: 78, attack: 130, defense: 111, spAtk: 130, spDef: 85, speed: 100 },
        sprite: 'x-sprite', spriteBack: 'x-back', shinySprite: 'x-shiny', shinySpriteBack: 'x-shiny-back' },
      { formId: 10035, formName: 'charizard-mega-y', label: 'Mega Charizard Y',
        types: ['fire', 'flying'],
        baseStats: { hp: 78, attack: 145, defense: 100, spAtk: 130, spDef: 90, speed: 100 },
        sprite: 'y-sprite', spriteBack: 'y-back', shinySprite: 'y-shiny', shinySpriteBack: 'y-shiny-back' },
    ],
  },
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url) => {
    if (url === '/data/megas.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FAKE_MEGAS) })
    }
    return Promise.resolve({ ok: false })
  }))
})

test('megaFormsFor returns both forms for a dual-mega species (Charizard)', async () => {
  const { megaFormsFor } = await import('./megas.js')
  const forms = await megaFormsFor(6)
  expect(forms).toHaveLength(2)
  expect(forms[0].formName).toBe('charizard-mega-x')
  expect(forms[1].formName).toBe('charizard-mega-y')
})

test('megaFormsFor returns empty array for a species with no mega form', async () => {
  const { megaFormsFor } = await import('./megas.js')
  const forms = await megaFormsFor(999999)
  expect(forms).toEqual([])
})
