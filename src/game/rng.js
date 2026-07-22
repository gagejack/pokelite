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
