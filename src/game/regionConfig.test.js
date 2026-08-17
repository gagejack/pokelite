// Region config integrity — runs against EVERY registered region, so adding a
// region is what makes these assertions cover it. Catches the class of mistake
// that a region file's size makes easy: an 8-entry table with 7 rows, a boss
// name with no sprite, a species id from the wrong generation.
//
// These are structural checks, not balance ones. They assert that the loop CAN
// read the config without hitting undefined — not that the numbers are good.

import { test, expect, describe } from 'vitest'
import { getRegionConfig, regionNames } from './regionRegistry.js'
import { GEN_MAX_ID } from './pokemon.js'
import { REGION_STARTERS } from './starters.js'

const MAPS_PER_REGION = 8

// Only regions with authored maps: a registered-but-mapless region legitimately
// has empty tables, and asserting 8 entries on it would fail for the wrong
// reason. This is the same filter the daily rotation and the admin dashboards
// use to decide what is playable.
const playable = regionNames({ playableOnly: true })

test('at least one region is playable (guards the filter itself)', () => {
  expect(playable.length).toBeGreaterThan(0)
})

describe.each(playable)('%s', regionName => {
  const config = getRegionConfig(regionName)

  test('is registered and names itself consistently', () => {
    expect(config).toBeTruthy()
    // A mismatch here means the registry key and the config disagree — the
    // loop keys off both in different places, so they must be the same string.
    expect(config.name).toBe(regionName)
  })

  test('declares a generation with a known species cap', () => {
    expect(GEN_MAX_ID[config.generation]).toBeDefined()
  })

  test.each([
    'maps',
    'catchPools',
    'legendaryPools',
    'trainerSpeciesPools',
    'mapLevelRanges',
    'shopPools',
    'badges',
  ])('%s has exactly one entry per map', key => {
    expect(config[key]).toHaveLength(MAPS_PER_REGION)
  })

  test('catchLevelRanges, when present, is also per-map', () => {
    // Optional by design (falls back to mapLevelRanges), but a partial table
    // would silently band the late maps off the front of the array.
    if (config.catchLevelRanges) {
      expect(config.catchLevelRanges).toHaveLength(MAPS_PER_REGION)
    }
  })

  test('every map is renderable', () => {
    config.maps.forEach((map, i) => {
      expect(map.name, `map ${i} name`).toBeTruthy()
      expect(map.background, `map ${i} background`).toBeTruthy()
      expect(map.grassIcon, `map ${i} grassIcon`).toBeTruthy()
      expect(map.edges?.length, `map ${i} edges`).toBeGreaterThan(0)
      expect(typeof map.generate, `map ${i} generate`).toBe('function')
    })
  })

  test('level bands are ordered and ascending across maps', () => {
    let previousMin = 0
    config.mapLevelRanges.forEach(([min, max], i) => {
      expect(max, `map ${i} band [${min}, ${max}]`).toBeGreaterThanOrEqual(min)
      // Bands may overlap, but the run must not walk backwards.
      expect(min, `map ${i} min`).toBeGreaterThanOrEqual(previousMin)
      previousMin = min
    })
  })

  test('every species id is inside the region generation', () => {
    const cap = GEN_MAX_ID[config.generation]
    const offenders = []
    const check = (id, where) => {
      if (!Number.isInteger(id) || id < 1 || id > cap) offenders.push(`${where}: ${id}`)
    }

    config.catchPools.forEach((pool, i) => pool.forEach(e => check(e.id, `catchPools[${i}]`)))
    config.legendaryPools.forEach((pool, i) => pool.forEach(e => check(e.id, `legendaryPools[${i}]`)))
    config.trainerSpeciesPools.forEach((pool, i) => pool.forEach(id => check(id, `trainerSpeciesPools[${i}]`)))
    Object.entries(config.trainerTypePools ?? {}).forEach(([cls, pool]) =>
      pool.forEach(id => check(id, `trainerTypePools[${cls}]`)))
    Object.entries(config.bossTeams ?? {}).forEach(([name, team]) =>
      team.forEach(m => check(m.id, `bossTeams[${name}]`)))
    Object.entries(config.eliteFourTeams ?? {}).forEach(([name, team]) =>
      team.forEach(m => check(m.id, `eliteFourTeams[${name}]`)))
    Object.entries(config.rivalTeams ?? {}).forEach(([variant, team]) =>
      team.forEach(m => check(m.id, `rivalTeams[${variant}]`)))

    expect(offenders).toEqual([])
  })

  test('fallbackSpeciesId is inside the region generation', () => {
    // The empty-pool escape hatch. An out-of-gen fallback only surfaces on the
    // rare path that needs it, which is exactly when it must not be wrong.
    expect(config.fallbackSpeciesId).toBeGreaterThanOrEqual(1)
    expect(config.fallbackSpeciesId).toBeLessThanOrEqual(GEN_MAX_ID[config.generation])
  })

  test('every gym boss and rival has both sprites', () => {
    // Elite Four members are checked separately below: they may carry their
    // sprites on the eliteFour entry instead of in the trainerSprites maps
    // (Unova does), and EliteFour reads those refs directly.
    const e4Names = new Set((config.eliteFour ?? []).map(m => m.name))
    const missing = []

    Object.keys(config.bossTeams ?? {})
      .filter(name => !e4Names.has(name))
      .forEach(name => {
        if (!config.trainerSprites?.[name]) missing.push(`overworld: ${name}`)
        if (!config.trainerFullSprites?.[name]) missing.push(`full: ${name}`)
      })

    expect(missing).toEqual([])
  })

  test('every Elite Four member resolves both sprites from somewhere', () => {
    // Either source is fine — the entry's own refs, or the shared sprite maps.
    // What must never happen is neither, which renders an empty portrait.
    const missing = []
    config.eliteFour?.forEach(({ name, sprite, fullSprite }) => {
      if (!(sprite || config.trainerSprites?.[name])) missing.push(`overworld: ${name}`)
      if (!(fullSprite || config.trainerFullSprites?.[name])) missing.push(`full: ${name}`)
    })
    expect(missing).toEqual([])
  })

  test('every Elite Four member has a team, and exactly one is champion', () => {
    const roster = config.eliteFour ?? []
    expect(roster.length).toBeGreaterThan(0)
    roster.forEach(member => {
      expect(config.eliteFourTeams?.[member.name], `${member.name} team`).toBeTruthy()
    })
    expect(roster.filter(m => m.champion)).toHaveLength(1)
    // The champion is fought last — a champion in the middle would end the run
    // before the remaining members are reached.
    expect(roster[roster.length - 1].champion).toBe(true)
  })

  test('starterBoss covers exactly this region\'s starters, and those bosses have teams', () => {
    const starters = REGION_STARTERS[regionName]
    expect(starters, `${regionName} is missing from REGION_STARTERS`).toBeTruthy()

    starters.forEach(id => {
      const boss = config.starterBoss?.[id]
      expect(boss, `starterBoss[${id}]`).toBeTruthy()
      expect(config.bossTeams?.[boss], `bossTeams[${boss}]`).toBeTruthy()
    })
  })

  test('every rival team names a starter-counter map covering this region\'s starters', () => {
    Object.keys(config.rivalTeams ?? {}).forEach(variant => {
      const counters = config.rivalStarterCounters?.[variant]
      expect(counters, `rivalStarterCounters[${variant}]`).toBeTruthy()
      REGION_STARTERS[regionName].forEach(id => {
        expect(counters[id], `rivalStarterCounters[${variant}][${id}]`).toBeTruthy()
      })
    })
  })

  test('no species appears twice within a single map\'s catch pool', () => {
    // Within one pool a duplicate is always a mistake: it silently doubles that
    // species' draw weight against every sibling on the same map.
    //
    // ACROSS maps a repeat is allowed and deliberate — Kanto puts Growlithe on
    // both Cerulean and Cinnabar, the way a species really does occupy more
    // than one route. Johto happens to author each species to exactly one map,
    // but that is a regional style, not a rule the loop depends on.
    const dupes = []
    config.catchPools.forEach((pool, i) => {
      const seen = new Set()
      pool.forEach(({ id }) => {
        if (seen.has(id)) dupes.push(`catchPools[${i}] repeats ${id}`)
        seen.add(id)
      })
    })
    expect(dupes).toEqual([])
  })

  test('every catch pool entry has a known rarity', () => {
    const RARITIES = new Set(['common', 'rare', 'epic', 'legendary'])
    const bad = []
    config.catchPools.forEach((pool, i) => {
      pool.forEach(({ id, rarity }) => {
        if (!RARITIES.has(rarity)) bad.push(`catchPools[${i}] id ${id}: ${rarity}`)
      })
    })
    expect(bad).toEqual([])
  })

  test('legendary pool entries carry an explicit level', () => {
    // Master Ball nodes build a battle straight from these — a missing level
    // would produce a level-undefined opponent.
    config.legendaryPools.forEach((pool, i) => {
      pool.forEach(({ id, level }) => {
        expect(Number.isInteger(level), `legendaryPools[${i}] id ${id}`).toBe(true)
      })
    })
  })

  test('legendaryIds matches what the legendary pools actually contain', () => {
    const fromPools = [...new Set(config.legendaryPools.flat().map(l => l.id))].sort((a, b) => a - b)
    expect([...(config.legendaryIds ?? [])].sort((a, b) => a - b)).toEqual(fromPools)
  })
})
