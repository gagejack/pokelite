// Node harness for src/game/evolutionChain.js's downgrade helpers
// (levelUpPathTo, downgradeTarget) — the pure leaf logic behind
// resolveEvolutionLine's under-leveled-pool-entry self-correction.
//
// pokemon.js itself can't be driven from plain node the way this script needs
// (it fetches its local data over HTTP, which has no server to answer here),
// so the downgrade decision was extracted into evolutionChain.js — a
// dependency-free module already designed to be imported directly by both the
// runtime and node scripts (see its header comment). This script exercises
// that module against the real bundled public/data/evolutions.json so the
// specific species called out in the finding are covered against real data,
// not a hand-rolled fixture that could drift from what the game ships.
import { readFileSync } from 'fs'
import { levelUpPathTo, downgradeTarget } from '../src/game/evolutionChain.js'

let failed = 0
const check = (name, cond) => { if (!cond) { console.error('FAIL:', name); failed++ } else console.log('ok:', name) }

const { chains, speciesToRoot } = JSON.parse(
  readFileSync(new URL('../public/data/evolutions.json', import.meta.url), 'utf8')
)
const rootFor = id => chains[speciesToRoot[id]]

// Resolve the id rollStageForLevel/resolveEvolutionLine would actually start
// from for (id, level) — mirrors the logic added to resolveEvolutionLine.
function effectiveStart(id, level) {
  const root = rootFor(id)
  const path = levelUpPathTo(root, id)
  if (!path) return id // not reachable by level — deliberate floor, untouched
  return downgradeTarget(path, level)
}

// --- Palpitoad (536): evolves from Tympole (535) at L25, into Seismitoad
// (537) at L36. A Hiker pool entry naming Palpitoad on an early map (level
// band 3-10) must downgrade to Tympole. ---
check('Palpitoad@6 downgrades to Tympole (535)', effectiveStart(536, 6) === 535)
check('Palpitoad@24 (just under L25) still downgrades to Tympole', effectiveStart(536, 24) === 535)
check('Palpitoad@25 (exactly its own min level) stays Palpitoad', effectiveStart(536, 25) === 536)
check('Palpitoad@31 stays Palpitoad (unchanged from today)', effectiveStart(536, 31) === 536)
check('Palpitoad@73 stays Palpitoad (start id; roll picks stage separately)', effectiveStart(536, 73) === 536)

// --- Escavalier (589): evolves from Karrablast (588) by TRADE, not level-up.
// levelUpPathTo must fail to reach it at ANY level, so effectiveStart leaves
// it alone — the existing Pikachu/Pichu deliberate-floor rationale. ---
check('Escavalier@6 stays Escavalier (trade evo, no level-up path)', effectiveStart(589, 6) === 589)
check('Escavalier@73 stays Escavalier (trade evo, no level-up path)', effectiveStart(589, 73) === 589)
check('Escavalier has no level-up path from its root', levelUpPathTo(rootFor(589), 589) === null)

// --- Excadrill (530): evolves from Drilbur (529) at L31. ---
check('Excadrill@50 stays Excadrill (already legal at that level)', effectiveStart(530, 50) === 530)
check('Excadrill@30 (just under L31) downgrades to Drilbur (529)', effectiveStart(530, 30) === 529)
check('Excadrill@31 (exactly its own min level) stays Excadrill', effectiveStart(530, 31) === 530)

// --- Regression guard: species with no evolution at all (Roughneck's
// Scraggy line has one; pick something base-form / already-legal) must be
// unaffected regardless of level. Basculin (550) has no evolutions. ---
check('no-evolution species (Basculin, 550) unaffected at low level', effectiveStart(550, 1) === 550)
check('no-evolution species (Basculin, 550) unaffected at high level', effectiveStart(550, 73) === 550)

// --- levelUpPathTo shape sanity: Tympole line path to Palpitoad is
// root-first and cumulative. ---
const palpitoadPath = levelUpPathTo(rootFor(536), 536)
check('Palpitoad path starts at Tympole (535) with minLevel 1',
  palpitoadPath[0].id === 535 && palpitoadPath[0].minLevel === 1)
check('Palpitoad path ends at Palpitoad (536) with minLevel 25',
  palpitoadPath[palpitoadPath.length - 1].id === 536 && palpitoadPath[palpitoadPath.length - 1].minLevel === 25)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
