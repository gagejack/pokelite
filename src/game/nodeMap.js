export const NODE_TYPES = {
  GRASS: 'grass',
  TRAINER: 'trainer',
  POKEBALL: 'pokeball',
  MASTER_BALL: 'master_ball',
  ITEM: 'item',
  POWER_UPGRADE: 'power_upgrade',
  POKECENTER: 'pokecenter',
  BOSS: 'boss',
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
const NODE_TYPE_CHANCES = [
  { type: NODE_TYPES.GRASS,         chance: 30 },
  { type: NODE_TYPES.TRAINER,       chance: 30 },
  { type: NODE_TYPES.POKEBALL,      chance: 20 },
  { type: NODE_TYPES.ITEM,          chance: 15 },
  { type: NODE_TYPES.POWER_UPGRADE, chance: 5  },
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
