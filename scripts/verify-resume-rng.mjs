// Simulate snapshot/restore of rng state mid-sequence (mirrors resumeRun).
import { seedRng, rng, getRngState, setRngState, clearRng } from '../src/game/rng.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

seedRng(555)
const pre = [rng(), rng()]            // consumed before "save"
const snap = getRngState()            // buildRunSnapshot writes this
const uninterrupted = [rng(), rng(), rng()]

// "Resume": fresh module state, restore, continue.
clearRng()
setRngState(snap)                     // resumeRun does this
const resumed = [rng(), rng(), rng()]
check('resumed tail matches uninterrupted', uninterrupted.every((v, i) => v === resumed[i]))
check('pre-save rolls were real', pre.length === 2)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
