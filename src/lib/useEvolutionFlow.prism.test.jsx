import { test, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEvolutionFlow } from './useEvolutionFlow.jsx'
import {
  buildPokemonInstance,
  applyTypePrism,
  _seedChainCacheForTest,
  _clearChainCacheForTest,
} from '../game/pokemon.js'
import { clearActiveRunModifiers } from '../game/metaModifiers.js'

// A Pokémon whose typing was bought with a Type Prism LOSES that typing the
// moment it evolves — buildEvolvedInstance rebuilds from the evolved species'
// own base data. These tests cover the compensation: the hook that owns every
// evolution path credits the prism back to the bag, once per evolution.
//
// The hook is the right seam because all four paths (battle victory, Rare
// Candy, Evolve Stone, and the multi-branch choice popup) run through it, and
// each one still has the PRE-evolution instance in hand to inspect.

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

// Gastly -> Haunter at 25. Same shape pokemon.test.js/megas.test.js seed:
// chainCache holds the tree, and loadEvolutionLine walks it into the branch
// cache checkEvolution actually reads, so no network call is made for the line.
const GASTLY_LINE = {
  id: 92,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [{ id: 93, minLevel: 25, levelUp: true, evolvesTo: [] }],
}

// checkEvolution resolves the EVOLVED instance through fetchPokemonBase, which
// falls back to /data/pokedex.json when its in-memory cache is empty — so
// Haunter (the only species these tests actually complete a step into) needs an
// entry. Without it the lookup throws, checkEvolution's catch reports "no
// evolution", and every refund assertion would silently pass for the wrong
// reason.
const FAKE_POKEDEX = {
  pokemon: {
    93: {
      pokeId: 93, apiName: 'haunter', types: HAUNTER.types,
      baseStats: HAUNTER.baseStats,
      sprite: HAUNTER.sprite, spriteBack: HAUNTER.spriteBack,
      shinySprite: HAUNTER.shinySprite, shinySpriteBack: HAUNTER.shinySpriteBack,
    },
  },
}

function seedGastlyLine() {
  vi.stubGlobal('fetch', vi.fn(url => {
    if (url === '/data/pokedex.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FAKE_POKEDEX) })
    }
    // evolutions.json is deliberately left unmocked — the line is seeded
    // directly into chainCache below.
    return Promise.resolve({ ok: false })
  }))
  _seedChainCacheForTest(92, GASTLY_LINE)
  _seedChainCacheForTest(93, GASTLY_LINE)
}

function prismedGastly(level = 30) {
  const roster = [buildPokemonInstance(GASTLY, level, false)]
  return applyTypePrism(roster, 0).roster[0]
}

function setup(roster, onPrismRefund) {
  let current = roster
  const setRoster = next => { current = typeof next === 'function' ? next(current) : next }
  const hook = renderHook(() => useEvolutionFlow({
    config: { generation: 1 },
    roster: current,
    setRoster,
    onSpeciesOwned: () => {},
    onPrismRefund,
  }))
  return { hook, getRoster: () => current }
}

afterEach(() => {
  clearActiveRunModifiers()
  _clearChainCacheForTest()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('evolving a prismed Pokémon with a stone refunds the Type Prism', async () => {
  seedGastlyLine()
  const onPrismRefund = vi.fn()
  const { hook } = setup([prismedGastly()], onPrismRefund)
  await act(async () => { await hook.result.current.evolveWithStone(0) })
  expect(onPrismRefund).toHaveBeenCalledTimes(1)
})

test('evolving an UN-prismed Pokémon refunds nothing', async () => {
  seedGastlyLine()
  const onPrismRefund = vi.fn()
  const { hook } = setup([buildPokemonInstance(GASTLY, 30, false)], onPrismRefund)
  await act(async () => { await hook.result.current.evolveWithStone(0) })
  expect(onPrismRefund).not.toHaveBeenCalled()
})

test('a battle-win evolution refunds the prism too', async () => {
  seedGastlyLine()
  const onPrismRefund = vi.fn()
  const team = [prismedGastly(24)]
  const { hook } = setup(team, onPrismRefund)
  // Two levels takes it from 24 to 26, past Gastly's evolution level of 25.
  await act(async () => { await hook.result.current.applyVictory(team, { levelsGained: 2 }) })
  expect(onPrismRefund).toHaveBeenCalledTimes(1)
})

test('a Pokémon that does NOT evolve keeps its prism un-refunded', async () => {
  seedGastlyLine()
  const onPrismRefund = vi.fn()
  // Level 10 is far below Gastly's evolution level, so nothing evolves.
  const team = [prismedGastly(10)]
  const { hook } = setup(team, onPrismRefund)
  await act(async () => { await hook.result.current.applyVictory(team, { levelsGained: 1 }) })
  expect(onPrismRefund).not.toHaveBeenCalled()
})

test('two prismed Pokémon evolving off one win refund one prism each', async () => {
  seedGastlyLine()
  const onPrismRefund = vi.fn()
  const team = [prismedGastly(24), prismedGastly(24)]
  const { hook } = setup(team, onPrismRefund)
  await act(async () => { await hook.result.current.applyVictory(team, { levelsGained: 2 }) })
  expect(onPrismRefund).toHaveBeenCalledTimes(2)
})

test('a Rare Candy that triggers an evolution refunds the prism', async () => {
  seedGastlyLine()
  const onPrismRefund = vi.fn()
  const { hook } = setup([prismedGastly(24)], onPrismRefund)
  await act(async () => { await hook.result.current.useRareCandy(0) })
  expect(onPrismRefund).toHaveBeenCalledTimes(1)
})

test('SANITY: the seeded line really does evolve (guards the negative tests)', async () => {
  seedGastlyLine()
  const { hook, getRoster } = setup([prismedGastly()], vi.fn())
  await act(async () => { await hook.result.current.evolveWithStone(0) })
  expect(getRoster()[0].pokeId).toBe(93)
})
