// Node harness for src/game/rng.js — determinism + state save/restore.
import { rng, seedRng, clearRng, isSeeded, getRngState, setRngState } from '../src/game/rng.js'

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

// Same seed → identical sequence.
seedRng(12345)
const a = [rng(), rng(), rng(), rng(), rng()]
seedRng(12345)
const b = [rng(), rng(), rng(), rng(), rng()]
check('same seed reproduces sequence', a.every((v, i) => v === b[i]))

// Different seed → different sequence (overwhelmingly likely).
seedRng(999)
const c = [rng(), rng(), rng()]
check('different seed differs', !a.slice(0, 3).every((v, i) => v === c[i]))

// Range.
check('in [0,1)', a.every(v => v >= 0 && v < 1))

// isSeeded / clearRng.
seedRng(1); check('isSeeded true when seeded', isSeeded() === true)
clearRng(); check('isSeeded false after clear', isSeeded() === false)
check('getRngState null when unseeded', getRngState() === null)

// State save/restore: consume, snapshot, consume more, restore, replay must match.
seedRng(777)
rng(); rng(); rng()
const state = getRngState()
const after = [rng(), rng(), rng()]
setRngState(state)
const replay = [rng(), rng(), rng()]
check('setRngState replays identical tail', after.every((v, i) => v === replay[i]))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
