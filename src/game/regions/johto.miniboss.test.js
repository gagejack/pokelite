// Johto's Team Rocket mini bosses — placement and reward shape.
//
// Cross-region structural checks (species in generation, both sprite halves
// present) live in regionConfig.test.js and already cover miniBossTeams. These
// tests pin the things specific to THIS placement: which map, which row, which
// end of the row, and the deliberate choice that a mini boss is NOT a rival.

import { test, expect, describe } from 'vitest'
import { johtoConfig } from './johto.js'
import { NODE_TYPES } from '../nodeMap.js'
import { BALANCE } from '../balance.js'

// Mahogany Town — the Rocket HQ map. 0-indexed, so map 7 is index 6.
const MAHOGANY = 6
// Row 4 is the 3-node row in buildRows' widths [1,2,3,4,3,4,3].
const CENTRE_ROW = 4

const starter = { id: 155 } // Cyndaquil; the Rockets' teams don't branch on it

const genMap = i => johtoConfig.maps[i].generate(starter)

describe('Rocket mini bosses on Mahogany', () => {
  test('Archer takes the centre row\'s leftmost node, Proton the rightmost', () => {
    const { rows } = genMap(MAHOGANY)
    const row = rows[CENTRE_ROW]

    expect(row[0]).toMatchObject({ type: NODE_TYPES.MINIBOSS, trainer: 'Archer' })
    expect(row[row.length - 1]).toMatchObject({ type: NODE_TYPES.MINIBOSS, trainer: 'Proton' })
  })

  test('the centre row keeps its middle node generated, so the row stays a choice', () => {
    // The whole point of taking only the two ends: a player who does not want a
    // Rocket fight must have a way through. On a 3-wide row that leaves exactly
    // one middle node — overwrite it and the "fight or walk past" fork is gone.
    const { rows } = genMap(MAHOGANY)
    const row = rows[CENTRE_ROW]
    const inner = row.slice(1, -1)

    expect(row.length).toBe(3)
    expect(inner.length).toBe(1)
    inner.forEach(node => expect(node.type).not.toBe(NODE_TYPES.MINIBOSS))
  })

  test('node ids are preserved when the row is overwritten', () => {
    // Ids encode row position (rowIndexForNodeId walks cumulative widths) and
    // the edge table is authored against them, so replacing a node must reuse
    // its id or the map's edges point at the wrong nodes.
    const { rows } = genMap(MAHOGANY)
    const row = rows[CENTRE_ROW]
    const ids = rows.flat().map(n => n.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(row[0].id).toBeLessThan(row[row.length - 1].id)
  })

  test('no other Johto map places a mini boss', () => {
    johtoConfig.maps.forEach((_, i) => {
      if (i === MAHOGANY) return
      const found = genMap(i).rows.flat().filter(n => n.type === NODE_TYPES.MINIBOSS)
      expect(found, `map index ${i}`).toEqual([])
    })
  })

  test('both executives have an authored team whose ace is last', () => {
    ;['Archer', 'Proton'].forEach(name => {
      const team = johtoConfig.miniBossTeams[name]
      expect(team?.length, name).toBeGreaterThan(0)

      const levels = team.map(m => m.level)
      expect(Math.max(...levels), `${name} ace is last`).toBe(levels[levels.length - 1])
    })
  })

  test('teams sit inside Mahogany\'s band and under Pryce\'s gym', () => {
    // The gym has to stay the map's wall: a mini boss the player meets BEFORE
    // Pryce must not out-level him, or the ordering of the map inverts.
    const [, bandTop] = johtoConfig.mapLevelRanges[MAHOGANY]
    const pryceAce = Math.max(...johtoConfig.bossTeams['Pryce'].map(m => m.level))

    Object.entries(johtoConfig.miniBossTeams).forEach(([name, team]) => {
      team.forEach(({ level }) => {
        expect(level, `${name} within band`).toBeLessThanOrEqual(bandTop)
      })
      expect(Math.max(...team.map(m => m.level)), `${name} under Pryce`).toBeLessThan(pryceAce)
    })
  })

  test('a mini boss is not a rival: no heal, no +4 levels, own payout', () => {
    // Two mini bosses share one row. Rival rewards here would mean +8 levels
    // and two full heals before the gym — this is why MINIBOSS exists at all
    // rather than reusing RIVAL.
    expect(NODE_TYPES.MINIBOSS).not.toBe(NODE_TYPES.RIVAL)

    const pay = BALANCE.economy.payouts
    expect(pay.miniBoss).toBeGreaterThan(pay.trainer)
    expect(pay.miniBoss).toBeLessThan(pay.boss)

    // No mini boss variant declares a starter counter — unlike a rival, the
    // team must not branch on the player's pick.
    Object.keys(johtoConfig.miniBossTeams).forEach(name => {
      expect(johtoConfig.rivalStarterCounters?.[name]).toBeUndefined()
    })
  })
})
