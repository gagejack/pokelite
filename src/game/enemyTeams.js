import { pick } from './nodeMap.js'

// Pokémon pools per trainer type.
// Each entry: { id: pokeApiId, levelRange: [min, max] }
// levelRange is the base range; positionWeight scales within it.
export const TRAINER_POKEMON_POOLS = {
  // --- Map 1 (Routes 1–2, lv 1–5) ---
  'Youngster':      [{ id: 504, levelRange: [1, 5] }, { id: 506, levelRange: [1, 5] }, { id: 509, levelRange: [1, 5] }],
  'Lass':           [{ id: 509, levelRange: [1, 5] }, { id: 506, levelRange: [1, 5] }, { id: 519, levelRange: [1, 5] }],
  'Preschooler M':  [{ id: 504, levelRange: [1, 5] }, { id: 506, levelRange: [1, 5] }],
  'Preschooler F':  [{ id: 504, levelRange: [1, 5] }, { id: 506, levelRange: [1, 5] }],
  'Schoolkid M':    [{ id: 504, levelRange: [1, 5] }, { id: 519, levelRange: [1, 5] }, { id: 522, levelRange: [1, 5] }],
  'Schoolkid F':    [{ id: 504, levelRange: [1, 5] }, { id: 519, levelRange: [1, 5] }, { id: 522, levelRange: [1, 5] }],
  'Backpacker M':   [{ id: 506, levelRange: [1, 5] }, { id: 504, levelRange: [1, 5] }, { id: 509, levelRange: [1, 5] }],
  'Backpacker F':   [{ id: 506, levelRange: [1, 5] }, { id: 504, levelRange: [1, 5] }, { id: 509, levelRange: [1, 5] }],
  'Janitor':        [{ id: 506, levelRange: [1, 5] }, { id: 504, levelRange: [1, 5] }],

  // --- Map 2 (Route 3, lv 10–15) ---
  'Nursery Aide':   [{ id: 531, levelRange: [10, 15] }, { id: 506, levelRange: [10, 15] }, { id: 519, levelRange: [10, 15] }],
  'Twins':          [{ id: 519, levelRange: [10, 14] }, { id: 522, levelRange: [10, 14] }],

  // --- Map 3 (Route 4, lv 20–25) ---
  'Hiker':          [{ id: 551, levelRange: [20, 25] }, { id: 529, levelRange: [20, 25] }, { id: 559, levelRange: [20, 25] }],
  'Worker M':       [{ id: 529, levelRange: [20, 25] }, { id: 551, levelRange: [20, 25] }],
  'Worker F':       [{ id: 529, levelRange: [20, 25] }, { id: 559, levelRange: [20, 25] }],
  'Roughneck':      [{ id: 559, levelRange: [20, 25] }, { id: 551, levelRange: [20, 25] }, { id: 568, levelRange: [20, 25] }],

  // --- Map 4 (Route 6, lv 30–35) ---
  'Cyclist M':      [{ id: 587, levelRange: [30, 35] }, { id: 522, levelRange: [30, 35] }, { id: 595, levelRange: [30, 35] }],
  'Cyclist F':      [{ id: 587, levelRange: [30, 35] }, { id: 595, levelRange: [30, 35] }, { id: 522, levelRange: [30, 35] }],
  'Biker':          [{ id: 522, levelRange: [30, 35] }, { id: 602, levelRange: [30, 35] }, { id: 587, levelRange: [30, 35] }],
  'Depot Agent':    [{ id: 602, levelRange: [30, 35] }, { id: 595, levelRange: [30, 35] }],

  // --- Map 5 (Route 7, lv 35–40) ---
  'Pokemon Ranger M': [{ id: 529, levelRange: [35, 40] }, { id: 551, levelRange: [35, 40] }, { id: 574, levelRange: [35, 40] }],
  'Pokemon Ranger F': [{ id: 574, levelRange: [35, 40] }, { id: 582, levelRange: [35, 40] }, { id: 529, levelRange: [35, 40] }],

  // --- Map 6 (Route 8, lv 40–45) ---
  'Pilot':          [{ id: 519, levelRange: [40, 45] }, { id: 580, levelRange: [40, 45] }, { id: 561, levelRange: [40, 45] }],
  'Ace Trainer M':  [{ id: 561, levelRange: [40, 45] }, { id: 580, levelRange: [40, 45] }, { id: 527, levelRange: [40, 45] }],
  'Ace Trainer F':  [{ id: 527, levelRange: [40, 45] }, { id: 561, levelRange: [40, 45] }, { id: 580, levelRange: [40, 45] }],

  // --- Map 7 (Route 9, lv 45–50) ---
  'Black Belt':     [{ id: 613, levelRange: [45, 50] }, { id: 614, levelRange: [45, 50] }, { id: 559, levelRange: [45, 50] }],
  'Battle Girl':    [{ id: 615, levelRange: [45, 50] }, { id: 613, levelRange: [45, 50] }, { id: 582, levelRange: [45, 50] }],

  // --- Map 8 (Route 16, lv 50–60) ---
  'Veteran M':      [{ id: 633, levelRange: [50, 60] }, { id: 610, levelRange: [50, 60] }, { id: 621, levelRange: [50, 60] }],
  'Veteran F':      [{ id: 634, levelRange: [50, 60] }, { id: 610, levelRange: [50, 60] }, { id: 621, levelRange: [50, 60] }],
}

// Fixed boss teams — indexed by boss trainer name
export const BOSS_TEAMS = {
  // Map 1 — Striaton City Gym (starter-assigned)
  'Chili':   [{ id: 506, level: 12 }, { id: 513, level: 14 }], // Lillipup, Pansear
  'Cress':   [{ id: 506, level: 12 }, { id: 515, level: 14 }], // Lillipup, Panpour
  'Cilan':   [{ id: 506, level: 12 }, { id: 511, level: 14 }], // Lillipup, Pansage

  // Map 2 — Nacrene City Gym (Normal)
  'Lenora':  [{ id: 507, level: 18 }, { id: 531, level: 20 }], // Herdier, Audino

  // Map 3 — Castelia City Gym (Bug)
  'Burgh':   [{ id: 540, level: 23 }, { id: 543, level: 23 }, { id: 544, level: 25 }], // Sewaddle, Venipede, Whirlipede

  // Map 4 — Nimbasa City Gym (Electric)
  'Elesa':   [{ id: 587, level: 32 }, { id: 603, level: 32 }, { id: 604, level: 34 }], // Emolga, Eelektrik, Eelektross... use 522/587/603

  // Map 5 — Driftveil City Gym (Ground)
  'Clay':    [{ id: 530, level: 38 }, { id: 530, level: 38 }, { id: 552, level: 40 }], // Excadrill, Krokorok

  // Map 6 — Mistralton City Gym (Flying)
  'Skyla':   [{ id: 561, level: 43 }, { id: 581, level: 43 }, { id: 520, level: 45 }], // Sigilyph, Swanna, Tranquill

  // Map 7 — Icirrus City Gym (Ice)
  'Brycen':  [{ id: 614, level: 48 }, { id: 615, level: 48 }, { id: 583, level: 50 }], // Beartic, Cryogonal, Vanillish

  // Map 8 — Opelucid City Gym (Dragon)
  'Drayden': [{ id: 611, level: 56 }, { id: 612, level: 56 }, { id: 635, level: 58 }], // Fraxure, Haxorus, Hydreigon
}

// Pick a weighted level from a range — later in the map weights toward higher levels
// positionWeight 0.0 = early node, 1.0 = late node
function pickLevel([min, max], positionWeight = 0.5) {
  const weighted = min + Math.floor((max - min) * (positionWeight + Math.random() * (1 - positionWeight)))
  return Math.min(max, Math.max(min, weighted))
}

// Build raw team spec (id + level) for a trainer node
export function buildTrainerTeamSpec(trainerName, count, positionWeight = 0.5) {
  const pool = TRAINER_POKEMON_POOLS[trainerName] ?? TRAINER_POKEMON_POOLS['Youngster']
  const specs = []
  const usedIds = new Set()
  for (let i = 0; i < count; i++) {
    const available = pool.filter(p => !usedIds.has(p.id))
    const entry = available.length > 0 ? pick(available) : pick(pool)
    usedIds.add(entry.id)
    specs.push({ id: entry.id, level: pickLevel(entry.levelRange, positionWeight) })
  }
  return specs
}

// How many Pokémon a trainer has (1-2 for early maps, 1-3 for later)
export function pickTrainerCount(mapIndex = 0) {
  if (mapIndex <= 1) return Math.random() < 0.5 ? 1 : 2
  if (mapIndex <= 4) return Math.random() < 0.4 ? 1 : Math.random() < 0.7 ? 2 : 3
  return Math.random() < 0.2 ? 2 : 3
}
