// Daily cosmetics rotation for the Cosmetics shop tab (spec §5).
//
// LEAF module: imports only dailyDerive.js and rng.js (both leaves
// themselves), so this stays DOM-free and Node-testable with plain data —
// no import.meta.glob, no region assets. spriteIndex.js builds the sprite
// LIST; this module only picks 2 of them per region per day, given that list
// as a plain argument.
//
// Determinism contract: same date + same region + same spriteList + same
// ownedIds -> same 2 offers, on every device, with zero server state. Spec:
// `deriveSeed(hashDateToSeed(utcDate), 'shop:' + region)`.

import { hashDateToSeed } from './dailyDerive.js'
import { deriveSeed } from './rng.js'

// deriveSeed(seed, salt) takes a numeric salt (xmur3-style mix, `salt >>> 0`
// internally) — the spec's `'shop:' + region` salt is a STRING, so it's
// hashed to a uint32 with the same hashDateToSeed used for the date itself
// (it's a generic string hasher despite the name: same date/salt string in,
// same uint32 out, on every device). This is the one deviation from the
// spec's literal call shown — deriveSeed can't take a string salt directly —
// while keeping the exact same reuse (dailyDerive.js + rng.js, no new RNG).
function regionSeed(dateStr, region) {
  return deriveSeed(hashDateToSeed(dateStr), hashDateToSeed('shop:' + region))
}

// Deterministic in-place-free shuffle of `items` (Fisher-Yates) driven by a
// local seeded stream derived from `seed`. Local rather than touching the
// shared rng.js module-level generator (src/game/rng.js's `rng()`/`seedRng`)
// — the shop roll must not disturb — or be disturbed by — a live run's RNG
// stream, and must produce the same order given the same seed regardless of
// what else is happening in the app that tick.
function seededShuffle(items, seed) {
  const arr = items.slice()
  let s = seed >>> 0
  const next = () => {
    // Same mulberry32 step as rng.js, kept local so this module has no
    // shared mutable state and no ordering dependency on other rng() calls.
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// The day's 2 cosmetic offers for one region.
//
// dateStr:     "YYYY-MM-DD" (UTC), same format dailyDerive.js/daily.js use.
// region:      region name, e.g. "Kanto".
// spriteList:  that region's full sprite array (spriteIndex.spritesForRegion
//              output) — { id, region, name, url }[]. Passed in rather than
//              imported so this module never touches import.meta.glob.
// ownedIds:    iterable of sprite ids the profile already owns (excluded
//              from the roll — spec: "the day's 2 offers are always buyable").
//
// Returns up to 2 sprite objects (same shape as spriteList entries).
// Edge cases (spec-required):
//   - fewer than 2 unowned remain: returns however many are left (0 or 1).
//   - zero unowned (all owned): returns [].
//   - empty/missing spriteList: returns [] (no crash).
export function dailyOffers(dateStr, region, spriteList, ownedIds) {
  if (!Array.isArray(spriteList) || spriteList.length === 0) return []

  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds ?? [])
  const unowned = spriteList.filter(sprite => !owned.has(sprite.id))
  if (unowned.length === 0) return []

  const seed = regionSeed(dateStr, region)
  const shuffled = seededShuffle(unowned, seed)
  return shuffled.slice(0, 2)
}
