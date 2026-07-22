// Shareable seed codes for seeded runs (Experimental Feature 2.3, Phase 1).
//
// Format: "REGION-XXXX" e.g. "KANTO-7Q2P". The region is embedded so a pasted
// code knows which region to load; the suffix is the uint32 seed in Crockford
// base32 (the four confusable letters I L O U removed) so codes are easy to
// read aloud and retype. Leaf module: imports nothing in Phase 1.

// Crockford base32: 32 chars with I, L, O, U removed (they read ambiguously),
// giving a clean radix-32 with no confusable characters.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function encodeSeed(region, seed) {
  let n = seed >>> 0
  if (n === 0) return `${region.toUpperCase()}-0`
  let out = ''
  while (n > 0) {
    out = B32[n % 32] + out
    n = Math.floor(n / 32)
  }
  return `${region.toUpperCase()}-${out}`
}

export function decodeSeed(code) {
  if (typeof code !== 'string') return null
  const trimmed = code.trim().toUpperCase()
  const dash = trimmed.indexOf('-')
  if (dash <= 0 || dash === trimmed.length - 1) return null
  const region = trimmed.slice(0, dash)
  const body = trimmed.slice(dash + 1)
  // Regex is the single character gate: only Crockford chars (excludes I L O U).
  if (!/^[0-9A-HJKMNP-TV-Z]+$/.test(body)) return null
  let n = 0
  for (const ch of body) n = n * 32 + B32.indexOf(ch)
  // Reject values that overflow uint32 — otherwise `>>> 0` would silently
  // truncate an out-of-range code (e.g. "ZZZZZZZ") onto a valid-but-different
  // seed, so two distinct codes would load the same run.
  if (n > 0xffffffff) return null
  const seed = n >>> 0
  // Return the normalized canonical code too, so callers store it without
  // re-encoding (encode once, at the point of truth).
  return { region, seed, code: encodeSeed(region, seed) }
}
