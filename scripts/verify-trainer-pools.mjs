// Node harness for src/game/trainerPools.js — map-gated pool filtering.
import { filterPoolByMap } from '../src/game/trainerPools.js'

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

const POOL = [515, 535, 550, 592]
const MIN = { 515: 1, 535: 1, 550: 3, 592: 6 }

// mapIndex 0 == map 1: only the two unlocked at map 1.
check('map 1 gates to unlocked only', eq(filterPoolByMap(POOL, MIN, 0), [515, 535]))
// mapIndex 2 == map 3: Basculin joins.
check('map 3 admits basculin', eq(filterPoolByMap(POOL, MIN, 2), [515, 535, 550]))
// mapIndex 5 == map 6: everything.
check('map 6 admits all', eq(filterPoolByMap(POOL, MIN, 5), [515, 535, 550, 592]))
// No table (Kanto) → unchanged.
check('no minMap returns pool as-is', eq(filterPoolByMap(POOL, undefined, 0), POOL))
check('null minMap returns pool as-is', eq(filterPoolByMap(POOL, null, 0), POOL))
// Species absent from the table are treated as always available.
check('unlisted species always allowed', eq(filterPoolByMap([999], MIN, 0), [999]))
// Fail-open: everything gated out returns the full pool rather than nothing.
check('fail-open when all gated', eq(filterPoolByMap([592], { 592: 8 }, 0), [592]))
// Empty pool stays empty.
check('empty pool stays empty', eq(filterPoolByMap([], MIN, 0), []))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
