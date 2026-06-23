export const NODE_TYPES = {
  GRASS: 'grass',
  TRAINER: 'trainer',
  POKEBALL: 'pokeball',
  ITEM: 'item',
  POWER_UPGRADE: 'power_upgrade',
  POKECENTER: 'pokecenter',
  BOSS: 'boss',
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

function randomNode(id, trainerPool) {
  const type = pickType()
  return { id, type, ...(type === NODE_TYPES.TRAINER ? { trainer: pick(trainerPool) } : {}) }
}

// Row layout: 1→2→3→4→3→4→3→2(pokecenter)→1(boss)
export function buildRows(trainerPool, bossTrainer) {
  const ROW_WIDTHS = [1, 2, 3, 4, 3, 4, 3]
  let id = 0
  const rows = ROW_WIDTHS.map(width =>
    Array.from({ length: width }, () => randomNode(id++, trainerPool))
  )

  // Row 7 (2 nodes) — guaranteed pokecenter among 2
  const pcIndex = Math.random() < 0.5 ? 0 : 1
  rows.push(Array.from({ length: 2 }, (_, i) =>
    i === pcIndex
      ? { id: id++, type: NODE_TYPES.POKECENTER }
      : randomNode(id++, trainerPool)
  ))

  // Boss node always last
  rows.push([{ id: id, type: NODE_TYPES.BOSS, trainer: bossTrainer }])
  return rows
}
