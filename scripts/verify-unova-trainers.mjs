// Node harness for Unova's trainer data. Parses unova.js as source text —
// the module imports .webp assets, which plain node cannot resolve.
import { readFileSync } from 'fs'
import { filterPoolByMap } from '../src/game/trainerPools.js'

const src = readFileSync(new URL('../src/game/regions/unova.js', import.meta.url), 'utf8')
let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

const block = (name) => {
  const m = new RegExp(`const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src)
  if (!m) throw new Error(`${name} not found`)
  return m[1]
}

// --- Parse TRAINER_TYPE_POOLS ---
const poolsBlock = block('TRAINER_TYPE_POOLS')
const pools = {}
for (const m of poolsBlock.matchAll(/'([^']+)':\s*\[([0-9,\s]*)\]/g)) {
  pools[m[1]] = m[2].split(',').map(s => s.trim()).filter(Boolean).map(Number)
}

// --- Parse SPECIES_MIN_MAP ---
const minBlock = block('SPECIES_MIN_MAP')
const minMap = {}
for (const m of minBlock.matchAll(/(\d+):\s*(\d+)/g)) minMap[Number(m[1])] = Number(m[2])

// --- Parse TRAINER_POOLS (per-map class placement) ---
const tpMatch = /const TRAINER_POOLS = \[([\s\S]*?)\n\]/.exec(src)
const mapRows = tpMatch[1].trim().split('\n')
  .map(r => [...r.matchAll(/'([^']+)'/g)].map(m => m[1]))
  .filter(r => r.length > 0)

const EXPECTED_CLASSES = [
  'Fisher', 'Bug Catcher', 'Baker', 'Youngster', 'Nursery Aide', 'Hiker',
  'Black Belt', 'Cyclist M', 'Cyclist F', 'Depot Agent', 'Pilot',
  'Pokemon Ranger M', 'Pokemon Ranger F', 'Janitor', 'Roughneck',
]
const REMOVED = [
  'Backpacker M', 'Backpacker F', 'Lass', 'Twins', 'Preschooler M',
  'Preschooler F', 'Schoolkid M', 'Schoolkid F', 'Ace Trainer M',
  'Ace Trainer F', 'Veteran M', 'Veteran F', 'Battle Girl', 'Biker',
  'Worker M', 'Worker F',
]

check('all 15 classes have a themed pool',
  EXPECTED_CLASSES.every(c => Array.isArray(pools[c]) && pools[c].length > 0))
check('no extra classes in TRAINER_TYPE_POOLS',
  Object.keys(pools).every(c => EXPECTED_CLASSES.includes(c)))
check('removed classes absent from pools',
  REMOVED.every(c => !(c in pools)))
check('removed classes absent from every map row',
  REMOVED.every(c => !mapRows.some(r => r.includes(c))))
check('8 map rows', mapRows.length === 8)
check('every placed class has a themed pool',
  mapRows.every(r => r.every(c => c in pools)))

// Species id sanity: Unova dex only, no starters, no legendaries.
const allIds = [...new Set(Object.values(pools).flat())]
check('all species in Unova dex range 494-649',
  allIds.every(id => id >= 494 && id <= 649))
check('no starters (495-503)', allIds.every(id => id < 495 || id > 503))
check('no legendaries (638-649)', allIds.every(id => id < 638 || id > 649))

// Every pooled species has an unlock entry.
check('every species has a SPECIES_MIN_MAP entry',
  allIds.every(id => typeof minMap[id] === 'number'))
check('unlock maps are 1..8',
  Object.values(minMap).every(v => v >= 1 && v <= 8))

// Roaming classes appear on every map; fixed classes do not.
const ROAMING = ['Fisher', 'Bug Catcher', 'Baker']
check('roaming classes on all 8 maps',
  ROAMING.every(c => mapRows.every(r => r.includes(c))))

// The real payoff: every class, on every map it is placed, must have at
// least one species available after gating.
let starved = []
mapRows.forEach((row, mapIndex) => {
  row.forEach(cls => {
    const got = filterPoolByMap(pools[cls], minMap, mapIndex)
    if (got.length === 0) starved.push(`${cls}@map${mapIndex + 1}`)
  })
})
check(`no class starved on a map it appears on ${starved.join(', ')}`, starved.length === 0)

// Variety: no map row should be a single class repeated.
check('every map has >= 4 distinct classes',
  mapRows.every(r => new Set(r).size >= 4))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
