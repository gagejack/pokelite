import { describe, it, expect } from 'vitest'
import {
  pct, toEngagement, toDifficulty, toDepth, toStarters, toEconomy, RANGES, sinceFor,
} from './playerStats.js'

// Every fixture uses STRINGS for bigint columns, because that is what
// PostgREST actually sends. Fixtures with real numbers would hide the exact
// class of bug these transforms exist to prevent.

describe('pct', () => {
  it('returns a whole-number percentage', () => {
    expect(pct(5, 20)).toBe(25)
  })

  it('returns 0 rather than NaN when the denominator is zero', () => {
    // A region with no runs must report 0%, never NaN% or Infinity.
    expect(pct(0, 0)).toBe(0)
    expect(pct(5, 0)).toBe(0)
    expect(Number.isNaN(pct(1, 0))).toBe(false)
  })

  it('coerces bigint strings', () => {
    expect(pct('5', '20')).toBe(25)
  })

  it('rounds rather than truncating', () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(2, 3)).toBe(67)
  })
})

describe('toEngagement', () => {
  const row = {
    total_runs: '1284', active_players: '212',
    new_players: '44', returning_players: '144',
  }

  it('coerces every count to a number', () => {
    const e = toEngagement(row)
    expect(e.totalRuns).toBe(1284)
    expect(e.activePlayers).toBe(212)
    expect(e.newPlayers).toBe(44)
    expect(typeof e.totalRuns).toBe('number')
  })

  it('derives runs per player to one decimal', () => {
    expect(toEngagement(row).runsPerPlayer).toBe(6.1)
  })

  it('derives the returning rate as a share of active players', () => {
    expect(toEngagement(row).returningRate).toBe(68)
  })

  it('reports zeros for a region with no runs', () => {
    const e = toEngagement({
      total_runs: '0', active_players: '0', new_players: '0', returning_players: '0',
    })
    expect(e.runsPerPlayer).toBe(0)
    expect(e.returningRate).toBe(0)
    expect(Number.isNaN(e.runsPerPlayer)).toBe(false)
  })

  it('returns null for a missing row', () => {
    expect(toEngagement(null)).toBeNull()
    expect(toEngagement(undefined)).toBeNull()
  })
})

describe('toDifficulty', () => {
  it('derives win rate and coerces numerics', () => {
    const d = toDifficulty({
      total_runs: '100', wins: '9', avg_maps: '3.40', avg_elapsed_ms: '760000',
    })
    expect(d.winRate).toBe(9)
    expect(d.avgMaps).toBe(3.4)
    expect(d.avgElapsedMs).toBe(760000)
  })

  it('reports 0% win rate for zero runs rather than NaN', () => {
    const d = toDifficulty({ total_runs: '0', wins: '0', avg_maps: null, avg_elapsed_ms: null })
    expect(d.winRate).toBe(0)
    expect(d.avgMaps).toBe(0)
    // NOT 0 — a null avg_elapsed_ms means no run in this window has elapsed_ms
    // recorded (legacy data), which is a missing-data state, not a real
    // "runs finish instantly" reading. See toDifficulty for why this is the
    // one field that does not coerce null to 0.
    expect(d.avgElapsedMs).toBeNull()
  })

  it('preserves a null avg_elapsed_ms rather than coercing it to 0', () => {
    // Distinct from the zero-runs case above: total_runs is healthy here, so
    // this pins the legacy-data scenario specifically — a window with real
    // runs but no elapsed_ms recorded on any of them.
    const d = toDifficulty({ total_runs: '50', wins: '5', avg_maps: '2', avg_elapsed_ms: null })
    expect(d.avgElapsedMs).toBeNull()
  })

  it('returns null for a missing row', () => {
    expect(toDifficulty(null)).toBeNull()
  })
})

describe('toDepth', () => {
  // The SQL already derives deepest_map as maps_cleared + (result <> 'win').
  // These fixtures are what that function returns, and pin the CONSEQUENCE:
  // a loss that cleared 3 arrives here as bin 4, a win that cleared 3 as bin 3.
  it('preserves the bin the SQL assigned', () => {
    const rows = [
      { deepest_map: 3, runs: '10' },   // wins that cleared 3
      { deepest_map: 4, runs: '30' },   // losses that cleared 3
    ]
    expect(toDepth(rows).map(d => d.deepestMap)).toEqual([3, 4])
  })

  it('gives each bin its share of the total', () => {
    const d = toDepth([
      { deepest_map: 1, runs: '41' },
      { deepest_map: 2, runs: '26' },
      { deepest_map: 3, runs: '33' },
    ])
    expect(d.map(x => x.pct)).toEqual([41, 26, 33])
  })

  it('coerces run counts', () => {
    expect(toDepth([{ deepest_map: 1, runs: '5' }])[0].runs).toBe(5)
  })

  it('returns an empty array for no rows, not a crash', () => {
    expect(toDepth([])).toEqual([])
    expect(toDepth(null)).toEqual([])
    expect(toDepth(undefined)).toEqual([])
  })
})

describe('toStarters', () => {
  const rows = [
    { starter_id: 4, picks: '44', wins: '5' },
    { starter_id: 7, picks: '31', wins: '2' },
    { starter_id: 1, picks: '25', wins: '3' },
  ]

  it('derives pick share against the total picks', () => {
    expect(toStarters(rows).map(s => s.pickPct)).toEqual([44, 31, 25])
  })

  it('derives win rate per starter against that starter own picks', () => {
    // Not against total picks — "how often does THIS starter win" is the
    // question, so the denominator is its own pick count.
    const s = toStarters(rows)
    expect(s[0].winRate).toBe(11)   // 5/44
    expect(s[1].winRate).toBe(6)    // 2/31
  })

  it('handles a single starter as 100% of picks', () => {
    const s = toStarters([{ starter_id: 4, picks: '10', wins: '1' }])
    expect(s[0].pickPct).toBe(100)
  })

  it('reports 0% rather than NaN for a starter with no picks', () => {
    const s = toStarters([{ starter_id: 4, picks: '0', wins: '0' }])
    expect(s[0].pickPct).toBe(0)
    expect(s[0].winRate).toBe(0)
  })

  it('returns an empty array for no rows', () => {
    expect(toStarters([])).toEqual([])
    expect(toStarters(null)).toEqual([])
  })
})

describe('toEconomy', () => {
  it('derives per-run rates and coerces numerics', () => {
    const e = toEconomy({
      total_runs: '1000', avg_cash: '612', avg_catches: '6.80',
      runs_with_shiny: '32', runs_with_legendary: '12',
    })
    expect(e.avgCash).toBe(612)
    expect(e.avgCatches).toBe(6.8)
    // Per-RUN rates: the share of runs that saw one, not an encounter rate.
    expect(e.shinyRate).toBe(3)
    expect(e.legendaryRate).toBe(1)
  })

  it('reports zeros for a region with no runs', () => {
    const e = toEconomy({
      total_runs: '0', avg_cash: null, avg_catches: null,
      runs_with_shiny: '0', runs_with_legendary: '0',
    })
    expect(e.avgCash).toBe(0)
    expect(e.shinyRate).toBe(0)
    expect(Number.isNaN(e.shinyRate)).toBe(false)
  })

  it('returns null for a missing row', () => {
    expect(toEconomy(null)).toBeNull()
  })
})

describe('RANGES', () => {
  it('offers all time plus three windows, all-time first', () => {
    expect(RANGES[0].days).toBeNull()
    expect(RANGES.map(r => r.days)).toEqual([null, 7, 30, 90])
  })

  it('gives every range a stable key and a label', () => {
    RANGES.forEach(r => {
      expect(typeof r.key).toBe('string')
      expect(r.label.length).toBeGreaterThan(0)
    })
  })
})

describe('sinceFor', () => {
  it('returns null for all time', () => {
    expect(sinceFor('all')).toBeNull()
  })

  it('returns null for an unrecognized range key', () => {
    expect(sinceFor('nonsense')).toBeNull()
  })

  it('goes 30 days back, not 30 hours', () => {
    // A generous few-second tolerance keeps this from flaking on slow CI,
    // while still being tight enough to catch a days/hours unit mix-up.
    const expected = Date.now() - 30 * 86400000
    const actual = new Date(sinceFor('30d')).getTime()
    expect(Math.abs(actual - expected)).toBeLessThan(5000)
  })
})
