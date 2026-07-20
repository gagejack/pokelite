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
export const MYSTERY_REROLLS = 2

// Resolve a Mystery node into one of its outcome types, equally weighted among
// the AVAILABLE outcomes. On maps with no legendary pool a Master Ball outcome
// would produce an empty battle (the node would silently do nothing), so pass
// allowLegendary=false there to drop it from the roll.
export function resolveMysteryType({ allowLegendary = true } = {}) {
  const outcomes = allowLegendary
    ? MYSTERY_OUTCOMES
    : MYSTERY_OUTCOMES.filter(t => t !== NODE_TYPES.MASTER_BALL)
  return pick(outcomes)
}

// Chance (0..1) that a Pokéball node is upgraded to a rare Master Ball
// (legendary) node. Ramps by map: 0 before map 3, then 0.5% on map 3
// (index 2) rising linearly to ~10% on map 8 (index 7).
export function masterBallChance(mapIndex) {
  const START_INDEX = 2   // map 3
  const END_INDEX = 7     // map 8
  const START = 0.005     // 0.5%
  const END = 0.10        // 10%
  if (mapIndex < START_INDEX) return 0
  if (mapIndex >= END_INDEX) return END
  const t = (mapIndex - START_INDEX) / (END_INDEX - START_INDEX)
  return START + t * (END - START)
}

// % chance for each node type (must sum to 100)
// Exported so the admin balance dashboard can display the live distribution
// instead of a hand-copied table that could drift.
export const NODE_TYPE_CHANCES = [
  { type: NODE_TYPES.GRASS,         chance: 28 },
  { type: NODE_TYPES.TRAINER,       chance: 28 },
  { type: NODE_TYPES.POKEBALL,      chance: 19 },
  { type: NODE_TYPES.ITEM,          chance: 14 },
  { type: NODE_TYPES.POWER_UPGRADE, chance: 5  },
  { type: NODE_TYPES.MYSTERY,       chance: 6  },
]

export function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)]
}

export function pickType() {
  const roll = Math.random() * 100
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
  if (type === NODE_TYPES.POKEBALL && Math.random() < masterBallChance(mapIndex)) {
    type = NODE_TYPES.MASTER_BALL
  }
  return { id, type, ...(type === NODE_TYPES.TRAINER ? { trainer: pick(trainerPool) } : {}) }
}

// Row layout: 1→2→3→4→3→4→3→2(pokecenter)→1(boss)
export function buildRows(trainerPool, bossTrainer, mapIndex = 0) {
  const ROW_WIDTHS = [1, 2, 3, 4, 3, 4, 3]
  let id = 0
  const rows = ROW_WIDTHS.map(width =>
    Array.from({ length: width }, () => randomNode(id++, trainerPool, mapIndex))
  )

  // Row 1's left node (the first fork off the start) is always a Pokéball.
  rows[1][0] = { id: rows[1][0].id, type: NODE_TYPES.POKEBALL }

  // Row 7 (2 nodes) — guaranteed pokecenter among 2
  const pcIndex = Math.random() < 0.5 ? 0 : 1
  rows.push(Array.from({ length: 2 }, (_, i) =>
    i === pcIndex
      ? { id: id++, type: NODE_TYPES.POKECENTER }
      : randomNode(id++, trainerPool, mapIndex)
  ))

  // Boss node always last
  rows.push([{ id: id, type: NODE_TYPES.BOSS, trainer: bossTrainer }])
  return rows
}
