// Node harness for Unova's trainer data. Parses unova.js as source text —
// the module imports .webp assets, which plain node cannot resolve.
import { readFileSync } from 'fs'
import { filterPoolByMap } from '../src/game/trainerPools.js'
import { levelUpPathTo } from '../src/game/evolutionChain.js'

const src = readFileSync(new URL('../src/game/regions/unova.js', import.meta.url), 'utf8')
const teamsSrc = readFileSync(new URL('../src/game/regions/unova.teams.js', import.meta.url), 'utf8')
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
// least one species GENUINELY unlocked (SPECIES_MIN_MAP <= mapNumber) — not
// just "the gate would have produced something". filterPoolByMap is the
// production function and deliberately fails OPEN (returns the unfiltered
// pool when gating would empty it), so calling it here would let this check
// pass no matter how badly SPECIES_MIN_MAP is tuned: an empty-after-gating
// pool comes back as the full ungated pool, which always has entries. Compute
// availability directly from the parsed data instead, so a genuinely starved
// class actually fails this check.
let starved = []
mapRows.forEach((row, mapIndex) => {
  const mapNumber = mapIndex + 1
  row.forEach(cls => {
    const unlocked = (pools[cls] ?? []).filter(id => (minMap[id] ?? 1) <= mapNumber)
    if (unlocked.length === 0) starved.push(`${cls}@map${mapNumber}`)
  })
})
check(`no class starved on a map it appears on ${starved.join(', ')}`, starved.length === 0)

// Sanity check on the check itself: filterPoolByMap's fail-open behavior
// really would have masked a starved class, confirming the direct computation
// above is not redundant with it.
check('filterPoolByMap fails open (sanity check that direct computation above is necessary)',
  filterPoolByMap([999], { 999: 8 }, 0).length > 0)

// Variety: no map row should be a single class repeated.
check('every map has >= 4 distinct classes',
  mapRows.every(r => new Set(r).size >= 4))

// --- Evolution-level reachability, on each class's EARLIEST map ---
// This is the data-side counterpart to Finding 1's engine fix: even though
// rollStageForLevel now self-corrects an under-leveled pool entry at runtime,
// an entry that NEEDS correcting on the map it first appears is still a sign
// the pool was authored wrong (the correction masks it, it doesn't excuse
// it). A species counts as reachable at a level if its cumulative level-up
// requirement is <= that level, OR it has no level-up path at all from its
// line's root (the deliberate-floor case — e.g. a trade evolution named
// directly, which is never "wrong" at any level).
const rangesMatch = /export const MAP_LEVEL_RANGES = \[([\s\S]*?)\n\]/.exec(teamsSrc)
if (!rangesMatch) throw new Error('MAP_LEVEL_RANGES not found in unova.teams.js')
const mapLevelRanges = [...rangesMatch[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)]
  .map(m => [Number(m[1]), Number(m[2])])
check('8 map level ranges', mapLevelRanges.length === 8)

const { chains, speciesToRoot } = JSON.parse(
  readFileSync(new URL('../public/data/evolutions.json', import.meta.url), 'utf8')
)
const cumulativeMinLevel = id => {
  const root = chains[speciesToRoot[id]]
  if (!root) return null // species not covered by the bundled line data
  const path = levelUpPathTo(root, id)
  if (!path) return null // no level-up path from root — deliberate floor, always reachable
  return path[path.length - 1].minLevel
}

let unreachable = []
Object.keys(pools).forEach(cls => {
  // Earliest map (1-based) this class is placed on.
  const earliestMapIndex = mapRows.findIndex(row => row.includes(cls))
  if (earliestMapIndex === -1) return // class not placed on any map (shouldn't happen; other checks cover it)
  const [minLevel] = mapLevelRanges[earliestMapIndex]
  pools[cls].forEach(id => {
    const need = cumulativeMinLevel(id)
    if (need != null && need > minLevel) {
      unreachable.push(`${cls}: species ${id} needs L${need}, map ${earliestMapIndex + 1} floor is L${minLevel}`)
    }
  })
})
check(`every class's pool is reachable by level on its earliest map ${unreachable.join('; ')}`,
  unreachable.length === 0)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
