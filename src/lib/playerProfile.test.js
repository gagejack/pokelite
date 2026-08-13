import { describe, it, expect } from 'vitest'
import { toProfileStats, toCollections, TOP_CAUGHT_LIMIT } from './playerProfile.js'

// A representative RPC row. bigint columns arrive as STRINGS over PostgREST,
// so the fixture uses strings where Postgres would send them — that is the
// whole reason this function coerces rather than trusts.
const row = {
  username: 'ash',
  xp: '12740',
  total_runs: '20',
  wins: '5',
  losses: '15',
  total_badges: '48',
  total_catches: '133',
  best_maps: 9,
  best_elapsed_ms: '842000',
}

describe('toProfileStats', () => {
  it('returns null when the player has no row', () => {
    // No row is the normal case for a username with no recorded runs, not an
    // error — GuestProfile renders it as an empty-profile message.
    expect(toProfileStats(null)).toBeNull()
    expect(toProfileStats(undefined)).toBeNull()
  })

  it('coerces bigint strings to numbers', () => {
    const s = toProfileStats(row)
    // The defect this guards: a string total would make `$${x.toLocaleString()}`
    // print "12740" instead of "12,740", and arithmetic concatenate.
    expect(s.totalRuns).toBe(20)
    expect(s.wins).toBe(5)
    expect(s.losses).toBe(15)
    expect(s.totalBadges).toBe(48)
    expect(s.totalCatches).toBe(133)
    expect(s.totalCashEarned).toBe(12740)
    expect(typeof s.totalCashEarned).toBe('number')
  })

  it('computes win rate the same way the own-profile query does', () => {
    expect(toProfileStats(row).winRate).toBe(25)
    // Rounds rather than truncates: 1/3 is 33%, not 33.33 and not 34.
    expect(toProfileStats({ ...row, total_runs: '3', wins: '1' }).winRate).toBe(33)
  })

  it('reports 0% rather than dividing by zero for a player with no runs', () => {
    const s = toProfileStats({ ...row, total_runs: '0', wins: '0', losses: '0' })
    expect(s.winRate).toBe(0)
    expect(Number.isNaN(s.winRate)).toBe(false)
  })

  it('derives level from xp through level.js', () => {
    // Level is never returned by the RPC — level.js owns the curve so the two
    // profile surfaces cannot disagree about the same XP.
    const s = toProfileStats(row)
    expect(s.levelInfo.level).toBeGreaterThan(1)
    expect(s.levelInfo.progress).toBeGreaterThanOrEqual(0)
    expect(s.levelInfo.progress).toBeLessThanOrEqual(1)
    expect(toProfileStats({ ...row, xp: '0' }).levelInfo.level).toBe(1)
  })

  it('carries the best run, with its elapsed time as a number', () => {
    const s = toProfileStats(row)
    expect(s.bestRun).toEqual({ maps: 9, elapsedMs: 842000 })
  })

  it('reports no best run when the player has none', () => {
    expect(toProfileStats({ ...row, best_maps: null }).bestRun).toBeNull()
  })

  it('keeps a best run whose elapsed_ms predates the column', () => {
    // Runs recorded before elapsed_ms existed still have a depth worth showing;
    // the panel just omits the time.
    expect(toProfileStats({ ...row, best_elapsed_ms: null }).bestRun)
      .toEqual({ maps: 9, elapsedMs: null })
  })

  it('never exposes a user id or email', () => {
    // The RPC does not select them, and this shape must not grow a passthrough
    // that would carry them into the client if it ever did.
    const s = toProfileStats({ ...row, id: 'uuid-here', email: 'a@b.c' })
    expect(s).not.toHaveProperty('id')
    expect(s).not.toHaveProperty('email')
    expect(JSON.stringify(s)).not.toContain('a@b.c')
  })

  it('carries no collection fields — those come from the collection RPCs', () => {
    // toCollections() supplies them; this function is only the figures.
    const s = toProfileStats(row)
    expect(s.topCaught).toBeUndefined()
    expect(s.favouriteStarter).toBeUndefined()
  })
})

describe('toCollections', () => {
  const caught = [
    { kind: 'caught', species_id: 25, name: 'pikachu', count: '12' },
    { kind: 'caught', species_id: 133, name: 'eevee', count: '9' },
  ]
  const rares = [
    { kind: 'legendary', species_id: 150, name: 'mewtwo', count: '2' },
    { kind: 'legendary', species_id: 144, name: 'articuno', count: '1' },
    { kind: 'shiny', species_id: 129, name: 'magikarp', count: '3' },
  ]

  it('splits the interleaved rare rows into legendaries and shinies', () => {
    // Both kinds arrive in ONE result tagged by `kind`; mixing them up would
    // put a shiny magikarp in the legendary popup.
    const c = toCollections(caught, rares, { starter_id: 4, count: '8' })
    expect(c.legendaries.map(m => m.name)).toEqual(['mewtwo', 'articuno'])
    expect(c.shinies.map(m => m.name)).toEqual(['magikarp'])
  })

  it('renames species_id to id and coerces counts', () => {
    // The panel reads `id`; the RPC returns `species_id`. bigint counts arrive
    // as strings, and "×12" must not become "×"+"12" by accident elsewhere.
    const c = toCollections(caught, rares, null)
    expect(c.topCaught[0]).toEqual({ id: 25, name: 'pikachu', count: 12 })
    expect(typeof c.topCaught[0].count).toBe('number')
  })

  it('slices the grid from the full list rather than a second query', () => {
    // The RPC is called uncapped and the grid takes its ten from the result, so
    // the popup and the grid cannot disagree about order or counts.
    const many = Array.from({ length: 14 }, (_, i) => ({
      species_id: i + 1, name: `mon${i + 1}`, count: String(20 - i),
    }))
    const c = toCollections(many, [], null)
    expect(c.allCaught).toHaveLength(14)
    expect(c.topCaught).toHaveLength(TOP_CAUGHT_LIMIT)
    // The grid is a prefix of the full list — same data, same order.
    expect(c.topCaught).toEqual(c.allCaught.slice(0, TOP_CAUGHT_LIMIT))
  })

  it('leaves allCaught and topCaught equal when under the cap', () => {
    const c = toCollections(caught, rares, null)
    expect(c.allCaught).toEqual(c.topCaught)
  })

  it('preserves the order SQL returned rather than re-sorting', () => {
    // Both surfaces must agree on ties, so the client never re-sorts.
    const c = toCollections(caught, rares, null)
    expect(c.topCaught.map(m => m.id)).toEqual([25, 133])
  })

  it('reports no favourite starter when no run carries one', () => {
    expect(toCollections(caught, rares, null).favouriteStarter).toBeNull()
  })

  it('coerces the favourite starter id and count', () => {
    const c = toCollections(caught, rares, { starter_id: 4, count: '8' })
    expect(c.favouriteStarter).toEqual({ id: 4, count: 8 })
  })

  it('survives a failed collection query with empty lists, not a crash', () => {
    // GuestProfile passes undefined when a collection RPC errors — the profile
    // must still render, with empty sections.
    const c = toCollections(undefined, undefined, null)
    expect(c.topCaught).toEqual([])
    expect(c.allCaught).toEqual([])
    expect(c.legendaries).toEqual([])
    expect(c.shinies).toEqual([])
    expect(c.favouriteStarter).toBeNull()
  })
})
