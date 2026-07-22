// Seeded-run RNG core (Experimental Feature 2.3, Phase 1).
//
// A LEAF module: imports nothing, so plain Node scripts and future sim tooling
// can import it with no bundler. Holds one swappable module-level generator.
// Default is Math.random (byte-identical to pre-seed behavior); seedRng swaps
// in a deterministic mulberry32 so the same seed reproduces a whole run.
//
// IMPORTANT: game-logic modules must call rng() everywhere they previously
// called Math.random(), in the SAME ORDER — the reproducibility contract.

// mulberry32: tiny, fast 32-bit seeded PRNG. Its entire state is one uint32
// accumulator, so a run snapshot can save/restore it in a single number.
let _state = 0
function mulberry32() {
  _state = (_state + 0x6d2b79f5) >>> 0
  let t = _state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

let _rng = Math.random // active generator

export function rng() { return _rng() }

export function seedRng(seed) {
  _state = seed >>> 0
  _rng = mulberry32
}

export function clearRng() {
  _rng = Math.random
}

export function isSeeded() { return _rng !== Math.random }

// null when unseeded so a snapshot of a normal run stores no rng state.
export function getRngState() { return _rng === mulberry32 ? _state : null }

export function setRngState(state) {
  _state = state >>> 0
  _rng = mulberry32
}

// Derive a stable sub-seed from a base seed and an integer salt (e.g. mapIndex).
// Lets one run seed produce independent, reproducible sub-streams — a map
// generated from deriveSeed(runSeed, mapIndex) is the SAME every time,
// regardless of how many shared-stream rng() calls (shiny/battle/catch rolls)
// happened before it. xmur3-style mix so adjacent salts don't correlate.
export function deriveSeed(seed, salt) {
  let h = (seed >>> 0) ^ Math.imul((salt >>> 0) ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

// Run `fn` with the global generator temporarily replaced by a fresh mulberry32
// seeded from `seed`, then restore the previous generator AND its state exactly.
// Used to generate a map from its own derived seed without disturbing the
// shared run stream (whose position must stay put for catches/battles/shiny).
export function withRng(seed, fn) {
  const prevRng = _rng
  const prevState = _state
  _state = seed >>> 0
  _rng = mulberry32
  try {
    return fn()
  } finally {
    _rng = prevRng
    _state = prevState
  }
}
