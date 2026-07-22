// Proves a map generated from a per-map derived seed is identical regardless of
// how many shared-stream rng() calls happened before it (the Play Again bug).
import { seedRng, rng, withRng, deriveSeed } from '/Users/gagejack/Desktop/Speedmon/src/game/rng.js'
import { buildRows } from '/Users/gagejack/Desktop/Speedmon/src/game/nodeMap.js'

let failed = 0
const check = (n, c) => { if (!c) { console.error('FAIL:', n); failed++ } else console.log('ok:', n) }

const genMap = mapIndex => JSON.stringify(
  withRng(deriveSeed(12345, mapIndex), () => buildRows([1,4,7,25], 6, mapIndex).map(r => r.map(n => n.type)))
)

// Fresh run: seed, generate map 0.
seedRng(12345)
const firstRun = genMap(0)

// "Play Again": seed, but a bunch of shared-stream rolls happen first
// (shiny roll, prior battle rolls), THEN generate map 0.
seedRng(12345)
for (let i = 0; i < 37; i++) rng()   // arbitrary prior consumption
const replayRun = genMap(0)

check('map 0 identical despite prior rng consumption', firstRun === replayRun)

// Different map index → different map.
check('map 0 != map 1', genMap(0) !== genMap(1))

// Fully deterministic across totally fresh module state ordering.
seedRng(999); const a = genMap(2)
rng(); rng(); rng(); const b = genMap(2)
check('map 2 stable regardless of stream position', a === b)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
