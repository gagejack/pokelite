import { describe, it, expect } from 'vitest'
import { fmtRunTime, fmtWinDate } from './formatRunTime.js'

describe('fmtRunTime', () => {
  it('formats sub-hour runs as minutes and seconds', () => {
    expect(fmtRunTime(842000)).toBe('14m 02s')
    // Seconds are zero-padded so the column does not jitter between rows.
    expect(fmtRunTime(65000)).toBe('1m 05s')
  })

  it('drops seconds once a run passes the hour', () => {
    expect(fmtRunTime(3900000)).toBe('1h 05m')
  })

  it('returns null for a run recorded before elapsed_ms existed', () => {
    // The caller renders the depth alone rather than a fabricated time.
    expect(fmtRunTime(null)).toBeNull()
    expect(fmtRunTime(undefined)).toBeNull()
    expect(fmtRunTime(-1)).toBeNull()
    expect(fmtRunTime(Number.NaN)).toBeNull()
  })
})

describe('fmtWinDate', () => {
  it('writes the month rather than numbering it', () => {
    // 08/12 is two different days depending on where you read it; "12 Aug" is
    // one day everywhere.
    expect(fmtWinDate('2026-08-12T18:04:00.000Z')).toMatch(/^\d{1,2} Aug 2026$/)
  })

  it('returns null for a win with no recorded date', () => {
    // Wins saved before created_at carried a value show no date at all, not
    // "Invalid Date".
    expect(fmtWinDate(null)).toBeNull()
    expect(fmtWinDate(undefined)).toBeNull()
    expect(fmtWinDate('')).toBeNull()
    expect(fmtWinDate('not-a-date')).toBeNull()
  })
})

// The Hall of Fame ordering itself. The sort lives inline in Stats.jsx's
// loader; this pins the RULE it implements, which is the part that would break
// silently — a null created_at landing first would put an undated win above
// every dated one.
describe('hall of fame ordering', () => {
  const byNewest = (a, b) => {
    if (a.wonAt === b.wonAt) return 0
    if (a.wonAt == null) return 1
    if (b.wonAt == null) return -1
    return new Date(b.wonAt) - new Date(a.wonAt)
  }

  it('puts the most recent win first', () => {
    const wins = [
      { wonAt: '2026-01-05T00:00:00Z', tag: 'old' },
      { wonAt: '2026-08-12T00:00:00Z', tag: 'newest' },
      { wonAt: '2026-04-01T00:00:00Z', tag: 'middle' },
    ]
    expect([...wins].sort(byNewest).map(w => w.tag)).toEqual(['newest', 'middle', 'old'])
  })

  it('sorts undated wins last, not first', () => {
    // An undated win predates the column, so it is the oldest thing in the
    // case — it must never outrank a dated one.
    const wins = [
      { wonAt: null, tag: 'undated' },
      { wonAt: '2026-08-12T00:00:00Z', tag: 'newest' },
      { wonAt: '2026-01-05T00:00:00Z', tag: 'old' },
    ]
    expect([...wins].sort(byNewest).map(w => w.tag)).toEqual(['newest', 'old', 'undated'])
  })

  it('numbers wins so the oldest stays #1 however many are added', () => {
    // The list runs newest-first, so the label counts down. Win #1 must remain
    // the first Champion ever beaten rather than being reassigned each time.
    const sorted = [{ tag: 'newest' }, { tag: 'middle' }, { tag: 'oldest' }]
    const labels = sorted.map((_, i) => `Win #${sorted.length - i}`)
    expect(labels).toEqual(['Win #3', 'Win #2', 'Win #1'])
  })
})
