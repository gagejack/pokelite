import { BALANCE } from './balance.js'
import { rng } from './rng.js'
import { bakeSafariSpecies } from './safariBake.js'

export const NODE_TYPES = {
  GRASS: 'grass',
  TRAINER: 'trainer',
  POKEBALL: 'pokeball',
  MASTER_BALL: 'master_ball',
  MEGA_STONE: 'mega_stone',
  ITEM: 'item',
  POWER_UPGRADE: 'power_upgrade',
  POKECENTER: 'pokecenter',
  // Shop node. Always row 7's sibling to the Pokécenter, so the row is a fork:
  // heal OR shop, never both. See buildRows below.
  POKEMART: 'pokemart',
  BOSS: 'boss',
  // Mini boss — an authored-team villain fight (Johto's Rocket executives).
  // Renders boss-sized and pays a boss-tier purse, but deliberately does NOT
  // heal or grant the rival's +4 levels: two of these sit on one row, so
  // rival-style rewards would hand out +8 levels and two full heals before the
  // map's gym. Placed manually, never randomly rolled. A placed node is:
  //   { id, type: NODE_TYPES.MINIBOSS, trainer: 'Archer' }
  // where `trainer` keys both config.trainerSprites and config.miniBossTeams.
  MINIBOSS: 'miniboss',
  MYSTERY: 'mystery',
  // Rival — a special trainer that heals + gives +4 levels to the whole roster
  // on defeat. Placed manually (never randomly rolled). A placed rival node is:
  //   { id, type: NODE_TYPES.RIVAL, trainer: 'Blue', rivalTeam: 'blueEarlyGame' }
  // where `trainer` drives sprite/icon/name and `rivalTeam` keys config.rivalTeams.
  RIVAL: 'rival',
}

// The concrete node types a Mystery ("?") node can resolve into, each equally
// likely. Excludes gym leaders / Elite Four (boss), Pokémon Centers, and TM
// upgrades — only the "encounter/reward" nodes the design calls for.
const MYSTERY_OUTCOMES = [
  NODE_TYPES.GRASS,
  NODE_TYPES.TRAINER,
  NODE_TYPES.POKEBALL,
  NODE_TYPES.ITEM,
  NODE_TYPES.MASTER_BALL,
]

// Number of times a Mystery-node item/catch offer can be rerolled. The reroll
// button IS the mystery bonus (replacing the old "extra choice + boosted
// odds" bonus) — the offer itself is drawn at normal odds like any other node.
export const MYSTERY_REROLLS = BALANCE.map.mysteryRerolls

// Resolve a Mystery node into one of its outcome types. The four non-legendary
// outcomes are equally likely; MASTER_BALL is down-weighted to
// BALANCE.map.mysteryLegendaryWeight (12% of the roll) so legendaries stay a
// treat rather than a fifth of every "?" node. On maps with no legendary pool a
// Master Ball outcome would produce an empty battle (the node would silently do
// nothing), so pass allowLegendary=false there to drop it entirely.
export function resolveMysteryType({ allowLegendary = true } = {}) {
  const outcomes = allowLegendary
    ? MYSTERY_OUTCOMES
    : MYSTERY_OUTCOMES.filter(t => t !== NODE_TYPES.MASTER_BALL)
  const weightOf = t => t === NODE_TYPES.MASTER_BALL ? BALANCE.map.mysteryLegendaryWeight : 1
  const total = outcomes.reduce((sum, t) => sum + weightOf(t), 0)
  let roll = rng() * total
  for (const t of outcomes) {
    roll -= weightOf(t)
    if (roll <= 0) return t
  }
  return outcomes[outcomes.length - 1]
}

// Chance (0..1) that a Pokéball node is upgraded to a rare Master Ball
// (legendary) node. Ramps by map: 0 before map 4, then 0.5% on map 4
// (index 3) rising linearly to ~10% on map 8 (index 7). The ramp must not
// start before the first map with a legendary pool, or the upgraded node has
// nothing to fight and silently does nothing (see NodeMap's empty-pool guard).
export function masterBallChance(mapIndex) {
  const { startIndex, endIndex, start, end } = BALANCE.map.masterBall
  if (mapIndex < startIndex) return 0
  if (mapIndex >= endIndex) return end
  const t = (mapIndex - startIndex) / (endIndex - startIndex)
  return start + t * (end - start)
}

// Chance (0..1) that a normal node roll is stolen for a Mega Stone node
// instead — same override mechanic as masterBallChance above, not a slice
// of NODE_TYPE_CHANCES (which sums to 100 and has no map-index gating). 0%
// before map index 2 (map 3), flat BALANCE.map.megaStone.chance from there.
export function megaStoneChance(mapIndex) {
  const { startIndex, chance } = BALANCE.map.megaStone
  return mapIndex >= startIndex ? chance : 0
}

// % chance for each node type (must sum to 100). Values come from BALANCE
// (game/balance.js); balance.js uses string literals to stay import-free, so
// we assert here that each maps to a real NODE_TYPES value — a typo there
// would otherwise silently drop a node type from generation.
// Exported so the admin balance dashboard can display the live distribution.
const NODE_TYPE_VALUES = new Set(Object.values(NODE_TYPES))
export const NODE_TYPE_CHANCES = BALANCE.map.nodeTypeChances.map(({ type, chance }) => {
  if (!NODE_TYPE_VALUES.has(type)) {
    throw new Error(`BALANCE.map.nodeTypeChances: "${type}" is not a NODE_TYPES value`)
  }
  return { type, chance }
})

export function pick(pool) {
  return pool[Math.floor(rng() * pool.length)]
}

export function pickType() {
  const roll = rng() * 100
  let count = 0
  for (const { type, chance } of NODE_TYPE_CHANCES) {
    count += chance
    if (roll < count) return type
  }
  return NODE_TYPE_CHANCES[NODE_TYPE_CHANCES.length - 1].type
}

function randomNode(id, trainerPool, mapIndex = 0, megaStoneAvailable = true) {
  let type = pickType()
  // A Pokéball node has a rare, map-ramped chance to become a Master Ball
  // (legendary) node instead — a variant of the Pokéball, so the overall
  // node distribution is barely affected.
  if (type === NODE_TYPES.POKEBALL && rng() < masterBallChance(mapIndex)) {
    type = NODE_TYPES.MASTER_BALL
  }
  // Mega Stone: a separate, rarer override on top of whatever type was just
  // picked (any type, not just Pokéball) — capped to one spawn per run by
  // the caller via megaStoneAvailable (App.jsx tracks this at the run
  // level, not per-map). Guarded against a node that was JUST promoted to
  // Master Ball above: Master Ball is the legendary tier, so it must never
  // be silently clobbered by a lower-tier Mega Stone roll landing right
  // after it.
  if (megaStoneAvailable && type !== NODE_TYPES.MASTER_BALL && rng() < megaStoneChance(mapIndex)) {
    type = NODE_TYPES.MEGA_STONE
  }
  return { id, type, ...(type === NODE_TYPES.TRAINER ? { trainer: pick(trainerPool) } : {}) }
}

// Row layout: 1→2→3→4→3→4→3→2(pokecenter)→1(boss)
// `options` carries Safari Mode's needs: the mode itself, the region config
// (the bake reads catch/legendary pools and level bands from it), and the
// generation ceiling. Classic callers omit it entirely and are unaffected.
export function buildRows(trainerPool, bossTrainer, mapIndex = 0, options = {}) {
  const ROW_WIDTHS = BALANCE.map.rowWidths
  const { megaStoneAvailable = true } = options
  let id = 0

  // Within-map dedup: megaStoneAvailable (above) only gates whether Mega
  // Stone is offered to THIS buildRows call at all — it's a run-level flag
  // (App.jsx/NodeMap.jsx) that caps spawns to one PER RUN by staying false
  // on every later map once one has spawned. It says nothing about how many
  // of the ~20+ node slots generated BELOW can independently win their own
  // megaStoneChance(mapIndex) roll (each randomNode call rolls it fresh —
  // see randomNode). Left unchecked, a single map can roll under that
  // chance on two or more node positions and produce 2+ Mega Stone nodes on
  // one map, which defeats the "at most one per run" intent before the
  // run-level flag ever gets a say. `megaStoneUsedThisMap` tracks whether a
  // MEGA_STONE node has already been generated anywhere in THIS call; it
  // starts pre-used (true) when megaStoneAvailable is false, so the eligibility
  // check passed into every randomNode call below stays a simple AND. The
  // moment any generated node lands as MEGA_STONE, the flag flips and every
  // subsequent randomNode call in this map is offered availability=false.
  let megaStoneUsedThisMap = !megaStoneAvailable
  const rollMegaStoneNode = (nodeId) => {
    const node = randomNode(nodeId, trainerPool, mapIndex, megaStoneAvailable && !megaStoneUsedThisMap)
    if (node.type === NODE_TYPES.MEGA_STONE) megaStoneUsedThisMap = true
    return node
  }

  const rows = ROW_WIDTHS.map(width =>
    Array.from({ length: width }, () => rollMegaStoneNode(id++))
  )

  // Row 1's left node (the first fork off the start) is always a Pokéball.
  rows[1][0] = { id: rows[1][0].id, type: NODE_TYPES.POKEBALL }

  // ...so the right node is never one, making the first fork a real choice.
  // Master Ball is excluded too — it's a Pokéball variant (see randomNode).
  const rightId = rows[1][1].id
  let right = rows[1][1]
  while (right.type === NODE_TYPES.POKEBALL || right.type === NODE_TYPES.MASTER_BALL) {
    right = rollMegaStoneNode(rightId)
  }
  rows[1][1] = right

  // Row 7 (2 nodes) — a guaranteed Pokécenter at a random index, with the
  // Pokémart as its sibling. Because the player walks exactly one node per
  // row, this row is a fork: arrive at the boss HEALED, or arrive STOCKED.
  // The coin flip only decides which side each lands on. Note this row can no
  // longer roll grass/trainer/item — an accepted loss of ~1 random node per
  // map in exchange for a guaranteed shop.
  const pcIndex = rng() < 0.5 ? 0 : 1
  rows.push(Array.from({ length: 2 }, (_, i) =>
    i === pcIndex
      ? { id: id++, type: NODE_TYPES.POKECENTER }
      : { id: id++, type: NODE_TYPES.POKEMART }
  ))

  // Boss node always last
  rows.push([{ id: id, type: NODE_TYPES.BOSS, trainer: bossTrainer }])

  // Safari: attach each bakeable node's species now that the rows are final.
  // This must stay AFTER every structural fixup above — see safariBake.js.
  // Region post-processing (e.g. Kanto's rival) happens in the region's
  // generate(), which calls bakeSafariSpecies itself after its own fixups.
  const { mode = 'classic', config = null, maxSpeciesId = Infinity } = options
  if (mode === 'safari' && config) {
    bakeSafariSpecies(rows, { config, mapIndex, maxSpeciesId })
  }
  return rows
}

// Row index containing a node id, for the layout buildRows produces:
// BALANCE.map.rowWidths, then the appended Pokécenter/Pokémart fork (2 nodes)
// and the boss (1 node). Call sites downstream of generation hold only
// `node.id` but need the row to look up its admin-tuned level offset, and ids
// are assigned in row order by buildRows, so the row is recoverable by walking
// cumulative widths. Out-of-range ids clamp to the last row rather than
// returning -1: a lookup miss must degrade to a real offset, never undefined.
export function rowIndexForNodeId(nodeId) {
  const widths = [...BALANCE.map.rowWidths, 2, 1] // + pokecenter row + boss row
  if (nodeId < 0) return 0
  let seen = 0
  for (let row = 0; row < widths.length; row++) {
    seen += widths[row]
    if (nodeId < seen) return row
  }
  return widths.length - 1
}
