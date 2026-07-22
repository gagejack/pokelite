// Node harness for src/game/dailyDerive.js — pure daily derivation.
import { dayNumber, hashDateToSeed, pickDailyRegion, msUntilNextUtcDay } from '../src/game/dailyDerive.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

// dayNumber is stable and increments by 1 per calendar day.
check('epoch day 0', dayNumber('1970-01-01') === 0)
check('one day later', dayNumber('1970-01-02') === 1)
check('consecutive diff is 1', dayNumber('2026-07-23') - dayNumber('2026-07-22') === 1)

// hashDateToSeed: deterministic, uint32, different dates differ.
check('hash deterministic', hashDateToSeed('2026-07-22') === hashDateToSeed('2026-07-22'))
check('hash is uint32', (() => { const h = hashDateToSeed('2026-07-22'); return h >= 0 && h <= 0xffffffff && Number.isInteger(h) })())
check('different dates differ', hashDateToSeed('2026-07-22') !== hashDateToSeed('2026-07-23'))

// pickDailyRegion rotates across consecutive days.
const regions = ['Kanto', 'Hoenn', 'Sinnoh', 'Unova']
const d0 = pickDailyRegion('2026-07-22', regions)
const d1 = pickDailyRegion('2026-07-23', regions)
check('picks from the list', regions.includes(d0))
check('rotates day to day', d0 !== d1) // adjacent days step by one index (list len 4 > 1)
check('wraps by modulo', pickDailyRegion('1970-01-01', regions) === regions[0])
check('single-region list ok', pickDailyRegion('2026-07-22', ['Kanto']) === 'Kanto')

// msUntilNextUtcDay: within (0, 24h], and correct at a known instant.
const noonUtc = Date.UTC(2026, 6, 22, 12, 0, 0)  // 2026-07-22T12:00:00Z
check('12h left at noon', msUntilNextUtcDay(noonUtc) === 12 * 3600 * 1000)
const almost = Date.UTC(2026, 6, 22, 23, 59, 59)
check('1s left before midnight', msUntilNextUtcDay(almost) === 1000)
check('in range', (() => { const m = msUntilNextUtcDay(Date.now()); return m > 0 && m <= 24 * 3600 * 1000 })())

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
