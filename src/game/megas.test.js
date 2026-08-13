import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { _seedChainCacheForTest, _clearChainCacheForTest } from './pokemon.js'

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

// Real Charmander → Charmeleon → Charizard line, shape matching slimChain()'s
// output (see pokemon.test.js's TWO_STAGE_LINE/THREE_STAGE_LINE for the same
// pattern). Charizard (6) is the terminal stage — evolvesTo: [] — so it is
// fully evolved; Charmander (4) and Charmeleon (5) are not.
const CHARMANDER_LINE = {
  id: 4,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [{
    id: 5,
    minLevel: 16,
    levelUp: true,
    evolvesTo: [{ id: 6, minLevel: 36, levelUp: true, evolvesTo: [] }],
  }],
}

// A fully-evolved, non-mega species with its own trivial (single-stage) line,
// so isMegaEligible(true fully evolved, false mega) has a real fixture that
// isn't Charizard. Pidgey's line stops at Pidgeot (18) in the real games, but
// for this fixture we only need SOME species with no further evolution and
// no mega forms — id 999998 is a fake id chosen to avoid colliding with any
// real species used elsewhere in this file or in pokemon.test.js.
const NO_MEGA_TERMINAL = {
  id: 999998,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [],
}

// Minimal pokedex fetch — checkEvolution (called by isFullyEvolved) resolves
// the evolved instance via fetchPokemonBase, which falls back to fetching
// /data/pokedex.json when its in-memory cache is empty. Only species that
// actually complete an evolution step in these tests (Charmeleon, 5) need an
// entry; Charizard/Charmander/the terminal fixture never reach this path
// since they have zero eligible evolution branches.
const FAKE_POKEDEX = {
  pokemon: {
    5: {
      pokeId: 5, apiName: 'charmeleon', types: ['fire'],
      baseStats: { hp: 58, attack: 64, defense: 58, spAtk: 80, spDef: 65, speed: 80 },
      sprite: 'charmeleon.png', spriteBack: 'charmeleon-back.png',
      shinySprite: 'charmeleon-shiny.png', shinySpriteBack: 'charmeleon-shiny-back.png',
    },
  },
}

function makeInstance(pokeId, level) {
  return {
    pokeId, level,
    name: 'Test', types: ['fire'],
    stats: { maxHp: 10, hp: 10, attack: 1, defense: 1, spAtk: 1, spDef: 1, speed: 1 },
    move: null, shiny: false, fainted: false,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url) => {
    if (url === '/data/megas.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FAKE_MEGAS) })
    }
    if (url === '/data/pokedex.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FAKE_POKEDEX) })
    }
    // evolutions.json is intentionally left unmocked (ok: false) — every
    // evolution fixture in this file is seeded directly into chainCache via
    // _seedChainCacheForTest, matching pokemon.test.js's existing pattern, so
    // checkEvolution never needs the bundled evolutions.json to resolve them.
    return Promise.resolve({ ok: false })
  }))
  _seedChainCacheForTest(4, CHARMANDER_LINE)
  _seedChainCacheForTest(5, CHARMANDER_LINE)
  _seedChainCacheForTest(6, CHARMANDER_LINE)
  _seedChainCacheForTest(999998, NO_MEGA_TERMINAL)
})

afterEach(() => {
  _clearChainCacheForTest()
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

// ── isFullyEvolved: level-independent, chain-position-dependent ───────────

test('isFullyEvolved is false for a low-level Charmander (partway through its evolution chain)', async () => {
  const { isFullyEvolved } = await import('./megas.js')
  const charmander = makeInstance(4, 5)
  await expect(isFullyEvolved(charmander)).resolves.toBe(false)
})

test('isFullyEvolved is true for a max-level Charizard (no further evolution)', async () => {
  const { isFullyEvolved } = await import('./megas.js')
  const charizard = makeInstance(6, 100)
  await expect(isFullyEvolved(charizard)).resolves.toBe(true)
})

// ── isMegaEligible: requires BOTH a mega form AND being fully evolved ─────

test('isMegaEligible is false for a low-level Charmander even though its line has mega forms', async () => {
  const { isMegaEligible } = await import('./megas.js')
  const charmander = makeInstance(4, 5)
  await expect(isMegaEligible(charmander)).resolves.toBe(false)
})

test('isMegaEligible is true for a fully-evolved Charizard with mega forms', async () => {
  const { isMegaEligible } = await import('./megas.js')
  const charizard = makeInstance(6, 100)
  await expect(isMegaEligible(charizard)).resolves.toBe(true)
})

test('isMegaEligible is false for a fully-evolved species with no mega forms at all', async () => {
  const { isMegaEligible } = await import('./megas.js')
  const noMegaTerminal = makeInstance(999998, 100)
  await expect(isMegaEligible(noMegaTerminal)).resolves.toBe(false)
})
