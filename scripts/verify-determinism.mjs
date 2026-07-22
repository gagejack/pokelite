import { seedRng, clearRng } from '../src/game/rng.js'
import { buildRows } from '../src/game/nodeMap.js'
import { pickTrainerCount, buildTrainerTeamSpec } from '../src/game/battleTeams.js'

// A deterministic scenario touching several sim files.
function scenario() {
  const rows = buildRows([1, 4, 7, 25], 6, 3)          // nodeMap: pickType/pick/masterball/pokecenter
  const count = pickTrainerCount(3)                     // battleTeams: chained rolls
  const team = buildTrainerTeamSpec([1, 4, 7, 25], [10, 20], 3, 0.5) // pickLevel + pick
  // Flatten to a comparable string.
  return JSON.stringify({ rows: rows.map(r => r.map(n => n.type)), count, team })
}

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

seedRng(2024); const s1 = scenario()
seedRng(2024); const s2 = scenario()
check('same seed → identical scenario', s1 === s2)

seedRng(9999); const s3 = scenario()
check('different seed → different scenario', s1 !== s3)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
