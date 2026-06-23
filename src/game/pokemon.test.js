import { describe, it, expect } from 'vitest'
import { calcHP, calcStat, buildPokemonInstance, levelUp } from './pokemon.js'

describe('stat formulas', () => {
  it('calculates Squirtle HP at level 5 correctly', () => {
    // Squirtle base HP: 44
    // formula: floor(((2*44 + 31) * 5) / 100) + 5 + 10 = floor(595/100) + 15 = 5 + 15 = 20
    expect(calcHP(44, 5)).toBe(20)
  })

  it('calculates Squirtle Speed at level 5 correctly', () => {
    // Squirtle base Speed: 43
    // formula: floor(((2*43 + 31) * 5) / 100) + 5 = floor(585/100) + 5 = 5 + 5 = 10
    expect(calcStat(43, 5)).toBe(10)
  })

  it('HP scales higher at level 20 than level 5', () => {
    expect(calcHP(44, 20)).toBeGreaterThan(calcHP(44, 5))
  })
})

describe('buildPokemonInstance', () => {
  const mockBase = {
    pokeId: 7,
    name: 'squirtle',
    types: ['water'],
    baseStats: { hp: 44, attack: 48, defense: 65, spAtk: 50, spDef: 64, speed: 43 },
    learnset: [
      {
        move: { name: 'water-gun' },
        version_group_details: [{ move_learn_method: { name: 'level-up' }, level_learned_at: 13 }],
      },
      {
        move: { name: 'tackle',   },
        version_group_details: [{ move_learn_method: { name: 'level-up' }, level_learned_at: 1 }],
      },
    ],
    sprite: null,
    spriteBack: null,
  }

  const mockMoveCache = {
    'water-gun': { name: 'water-gun', type: 'water', power: 40, accuracy: 100, damageClass: 'special' },
    'tackle':    { name: 'tackle',    type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' },
  }

  it('builds instance with correct level and HP', () => {
    const p = buildPokemonInstance(mockBase, 5, mockMoveCache)
    expect(p.level).toBe(5)
    expect(p.stats.hp).toBe(calcHP(44, 5))
    expect(p.stats.maxHp).toBe(p.stats.hp)
    expect(p.fainted).toBe(false)
  })

  it('assigns water-gun even before level 13 (starter always has a move)', () => {
    const p = buildPokemonInstance(mockBase, 5, mockMoveCache)
    expect(p.move?.name).toBe('water-gun')
  })

  it('assigns water-gun at level 13', () => {
    const p = buildPokemonInstance(mockBase, 13, mockMoveCache)
    expect(p.move?.name).toBe('water-gun')
  })

  it('levelUp increases level and recalculates stats', () => {
    const p = buildPokemonInstance(mockBase, 5, mockMoveCache)
    const p2 = levelUp(p, mockBase, 8, mockMoveCache)
    expect(p2.level).toBe(13)
    expect(p2.stats.maxHp).toBe(calcHP(44, 13))
    expect(p2.move?.name).toBe('water-gun')
  })
})
