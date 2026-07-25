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

// --- Evolution-level resolution legality, on every map each class appears on ---
// The human partner deliberately chose an ENGINE-level fix (rollStageForLevel
// self-corrects an under-leveled pool entry by walking DOWN to the
// most-evolved ancestor stage the level can legitimately reach) precisely so
// pool authoring can be forgiving: naming an evolved form on an early map
// (Hiker's 536 Palpitoad) is expected and handled, not a defect. So this
// check does NOT assert a downgrade never fires — it asserts the downgrade
// always RESOLVES to something legal: for every (class, map, species) at that
// map's MINIMUM level, walking the level-up path from the line's root and
// keeping stages whose cumulative minLevel <= the floor must yield at least
// one qualifying stage. A species with no level-up path from its root at all
// (the trade/stone/friendship floor case, e.g. Escavalier 589 from Karrablast)
// passes automatically — it's a deliberate authored floor, legal at any level.
const rangesMatch = /export const MAP_LEVEL_RANGES = \[([\s\S]*?)\n\]/.exec(teamsSrc)
if (!rangesMatch) throw new Error('MAP_LEVEL_RANGES not found in unova.teams.js')
const mapLevelRanges = [...rangesMatch[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)]
  .map(m => [Number(m[1]), Number(m[2])])
check('8 map level ranges', mapLevelRanges.length === 8)

const { chains, speciesToRoot } = JSON.parse(
  readFileSync(new URL('../public/data/evolutions.json', import.meta.url), 'utf8')
)
// Resolve (species, floor level) to the stage rollStageForLevel would settle
// on: the deepest level-up-path stage whose cumulative minLevel <= floor.
// Returns { id, minLevel } or null if the species has a level-up path but
// somehow no stage qualifies (would mean even the root's minLevel — always 1
// — exceeds floor, which can't happen for any real floor >= 1; kept as a
// belt-and-suspenders case so the check fails loudly instead of throwing).
const resolveAtFloor = (id, floor) => {
  const root = chains[speciesToRoot[id]]
  if (!root) return { id, minLevel: 1, noData: true } // not covered by bundled line data — nothing to check
  const path = levelUpPathTo(root, id)
  if (!path) return { id, minLevel: 1, deliberateFloor: true } // trade/stone/friendship — always legal
  const eligible = path.filter(s => s.minLevel <= floor)
  return eligible.length > 0 ? eligible[eligible.length - 1] : null
}

let illegal = []
mapRows.forEach((row, mapIndex) => {
  const mapNumber = mapIndex + 1
  const [floor] = mapLevelRanges[mapIndex]
  row.forEach(cls => {
    (pools[cls] ?? []).forEach(id => {
      const resolved = resolveAtFloor(id, floor)
      if (!resolved) {
        illegal.push(`${cls}@map${mapNumber} (floor L${floor}): species ${id} resolved to nothing`)
      } else if (!resolved.noData && !resolved.deliberateFloor && resolved.minLevel > floor) {
        illegal.push(`${cls}@map${mapNumber} (floor L${floor}): species ${id} resolved to ${resolved.id} which needs L${resolved.minLevel}`)
      }
    })
  })
})
check(`every pool species resolves to a level-legal stage on every map its class appears on ${illegal.join('; ')}`,
  illegal.length === 0)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
