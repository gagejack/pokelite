import { test, expect, afterEach } from 'vitest'
import {
  buildPokemonInstance,
  buildEvolvedInstance,
  applyTypePrism,
  _clearChainCacheForTest,
} from './pokemon.js'
import { clearActiveRunModifiers } from './metaModifiers.js'

// The Type Prism collapses a DUAL-type Pokémon onto its alternate type and is
// consumed doing so. Evolution then rebuilds the instance from the evolved
// species' own base data, which throws that retyping away — so the item the
// player spent is silently undone. These tests cover the flag that records
// "this Pokémon was prismed" and survives evolution, which is what lets the
// caller credit the prism back to the bag.
//
// Fake base data, same convention as pokemon.test.js: buildPokemonInstance and
// buildEvolvedInstance never fetch anything themselves, so a plain object in
// fetchPokemonBase's shape is enough — no network, no mocking.
//
// Gastly's line is used because every stage is DUAL-type, which the prism
// requires (alternateTypeFor returns null for a single-type Pokémon, and
// applyTypePrism then reports used:false and keeps the item).
const GASTLY = {
  pokeId: 92,
  name: 'Gastly',
  types: ['ghost', 'poison'],
  baseStats: { hp: 30, attack: 35, defense: 30, spAtk: 100, spDef: 35, speed: 80 },
  sprite: 'gastly.png',
  spriteBack: 'gastly-back.png',
  shinySprite: 'gastly-shiny.png',
  shinySpriteBack: 'gastly-shiny-back.png',
}

const HAUNTER = {
  pokeId: 93,
  name: 'Haunter',
  types: ['ghost', 'poison'],
  baseStats: { hp: 45, attack: 50, defense: 45, spAtk: 115, spDef: 55, speed: 95 },
  sprite: 'haunter.png',
  spriteBack: 'haunter-back.png',
  shinySprite: 'haunter-shiny.png',
  shinySpriteBack: 'haunter-shiny-back.png',
}

const GENGAR = {
  pokeId: 94,
  name: 'Gengar',
  types: ['ghost', 'poison'],
  baseStats: { hp: 60, attack: 65, defense: 60, spAtk: 130, spDef: 75, speed: 110 },
  sprite: 'gengar.png',
  spriteBack: 'gengar-back.png',
  shinySprite: 'gengar-shiny.png',
  shinySpriteBack: 'gengar-shiny-back.png',
}

// A single-type species, to prove the flag is never set when the prism no-ops.
const CHARMANDER = {
  pokeId: 4,
  name: 'Charmander',
  types: ['fire'],
  baseStats: { hp: 39, attack: 52, defense: 43, spAtk: 60, spDef: 50, speed: 65 },
  sprite: 'charmander.png',
  spriteBack: 'charmander-back.png',
  shinySprite: 'charmander-shiny.png',
  shinySpriteBack: 'charmander-shiny-back.png',
}

const CHARMELEON = {
  pokeId: 5,
  name: 'Charmeleon',
  types: ['fire'],
  baseStats: { hp: 58, attack: 64, defense: 58, spAtk: 80, spDef: 65, speed: 80 },
  sprite: 'charmeleon.png',
  spriteBack: 'charmeleon-back.png',
  shinySprite: 'charmeleon-shiny.png',
  shinySpriteBack: 'charmeleon-shiny-back.png',
}

afterEach(() => {
  clearActiveRunModifiers()
  _clearChainCacheForTest()
})

// ── The flag itself ─────────────────────────────────────────────────────────

test('applyTypePrism marks the Pokémon it retypes with _prismed', () => {
  const roster = [buildPokemonInstance(GASTLY, 20, false)]
  const { roster: next, used } = applyTypePrism(roster, 0)
  expect(used).toBe(true)
  expect(next[0]._prismed).toBe(true)
})

test('applyTypePrism leaves other roster members untouched', () => {
  const roster = [
    buildPokemonInstance(GASTLY, 20, false),
    buildPokemonInstance(GASTLY, 20, false),
  ]
  const { roster: next } = applyTypePrism(roster, 0)
  expect(next[1]._prismed).toBeUndefined()
})

test('a prism that no-ops on a single-type Pokémon sets no flag', () => {
  // Charmander is pure Fire, so it has no alternate type: the prism is KEPT
  // rather than consumed, and nothing about the instance should change.
  const roster = [buildPokemonInstance(CHARMANDER, 20, false)]
  const { roster: next, used } = applyTypePrism(roster, 0)
  expect(used).toBe(false)
  expect(next[0]._prismed).toBeUndefined()
})

// ── Carrying the flag through evolution ─────────────────────────────────────

test('_prismed survives evolution, so the evolved form is still owed a refund', () => {
  const roster = [buildPokemonInstance(GASTLY, 25, false)]
  const prismed = applyTypePrism(roster, 0).roster[0]
  const evolved = buildEvolvedInstance(prismed, HAUNTER, 25)
  expect(evolved._prismed).toBe(true)
})

test('an un-prismed Pokémon never gains the flag by evolving', () => {
  const gastly = buildPokemonInstance(GASTLY, 25, false)
  const evolved = buildEvolvedInstance(gastly, HAUNTER, 25)
  expect(evolved._prismed).toBeUndefined()
})

test('_prismed persists across a SECOND evolution, so each stage pays out', () => {
  // The refund is per-evolution by design: a prismed Gastly that reaches
  // Gengar credits the prism back twice, once at each stage.
  const roster = [buildPokemonInstance(GASTLY, 25, false)]
  const prismed = applyTypePrism(roster, 0).roster[0]
  const haunter = buildEvolvedInstance(prismed, HAUNTER, 25)
  const gengar = buildEvolvedInstance(haunter, GENGAR, 40)
  expect(gengar._prismed).toBe(true)
})

test('evolution still discards the prismed TYPING (the refund is what compensates)', () => {
  // This is the loss the refund exists to pay for: the evolved form comes back
  // with its species' natural dual typing, not the single type the prism left.
  const roster = [buildPokemonInstance(GASTLY, 25, false)]
  const prismed = applyTypePrism(roster, 0).roster[0]
  expect(prismed.types).toHaveLength(1)
  const evolved = buildEvolvedInstance(prismed, HAUNTER, 25)
  expect(evolved.types).toEqual(HAUNTER.types)
})

test('the flag does not leak onto an evolving non-prismed starter', () => {
  const charmander = buildPokemonInstance(CHARMANDER, 16, true)
  const evolved = buildEvolvedInstance(charmander, CHARMELEON, 16)
  expect(evolved._prismed).toBeUndefined()
})
