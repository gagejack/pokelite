// Pure daily-challenge derivation (Experimental Feature 2.3, Phase 2).
//
// LEAF module: imports nothing, so it's Node-testable and can never pull in
// region image assets (regionRegistry can't be imported here). The region
// LIST is passed in by the caller (src/lib/daily.js supplies it from
// regionNames). Everything here is a pure function of the UTC date string.

const MS_PER_DAY = 24 * 3600 * 1000

// Whole UTC days since 1970-01-01 for a "YYYY-MM-DD" string.
export function dayNumber(dateStr) {
  return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / MS_PER_DAY)
}

// Deterministic uint32 hash of the date string (xmur3-style mix). Same date →
// same seed on every machine, so everyone gets the same daily run.
export function hashDateToSeed(dateStr) {
  let h = 1779033703 ^ dateStr.length
  for (let i = 0; i < dateStr.length; i++) {
    h = Math.imul(h ^ dateStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

// Region for the day: rotate through the playable list by day index.
export function pickDailyRegion(dateStr, regionList) {
  return regionList[((dayNumber(dateStr) % regionList.length) + regionList.length) % regionList.length]
}

// Milliseconds from `now` until the next 00:00 UTC.
export function msUntilNextUtcDay(now = Date.now()) {
  return MS_PER_DAY - (((now % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY)
}
