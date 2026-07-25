import { BALANCE } from './balance.js'
import { rng } from './rng.js'

export const NODE_TYPES = {
  GRASS: 'grass',
  TRAINER: 'trainer',
  POKEBALL: 'pokeball',
  MASTER_BALL: 'master_ball',
  ITEM: 'item',
  POWER_UPGRADE: 'power_upgrade',
  POKECENTER: 'pokecenter',
  BOSS: 'boss',
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

function randomNode(id, trainerPool, mapIndex = 0) {
  let type = pickType()
  // A Pokéball node has a rare, map-ramped chance to become a Master Ball
  // (legendary) node instead — a variant of the Pokéball, so the overall
  // node distribution is barely affected.
  if (type === NODE_TYPES.POKEBALL && rng() < masterBallChance(mapIndex)) {
    type = NODE_TYPES.MASTER_BALL
  }
  return { id, type, ...(type === NODE_TYPES.TRAINER ? { trainer: pick(trainerPool) } : {}) }
}

// Row layout: 1→2→3→4→3→4→3→2(pokecenter)→1(boss)
export function buildRows(trainerPool, bossTrainer, mapIndex = 0) {
  const ROW_WIDTHS = BALANCE.map.rowWidths
  let id = 0
  const rows = ROW_WIDTHS.map(width =>
    Array.from({ length: width }, () => randomNode(id++, trainerPool, mapIndex))
  )

  // Row 1's left node (the first fork off the start) is always a Pokéball.
  rows[1][0] = { id: rows[1][0].id, type: NODE_TYPES.POKEBALL }

  // ...so the right node is never one, making the first fork a real choice.
  // Master Ball is excluded too — it's a Pokéball variant (see randomNode).
  const rightId = rows[1][1].id
  let right = rows[1][1]
  while (right.type === NODE_TYPES.POKEBALL || right.type === NODE_TYPES.MASTER_BALL) {
    right = randomNode(rightId, trainerPool, mapIndex)
  }
  rows[1][1] = right

  // Row 7 (2 nodes) — guaranteed pokecenter among 2
  const pcIndex = rng() < 0.5 ? 0 : 1
  rows.push(Array.from({ length: 2 }, (_, i) =>
    i === pcIndex
      ? { id: id++, type: NODE_TYPES.POKECENTER }
      : randomNode(id++, trainerPool, mapIndex)
  ))

  // Boss node always last
  rows.push([{ id: id, type: NODE_TYPES.BOSS, trainer: bossTrainer }])
  return rows
}
