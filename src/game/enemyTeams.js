import { pick } from './nodeMap.js'

// Static type + name lookup for all Pokémon used in trainer/boss pools
export const POKEMON_TYPES = {
  504:'normal',506:'normal',507:'normal',509:'dark',511:'grass',513:'fire',515:'water',
  519:'normal',520:'normal',522:'electric',527:'psychic',529:'ground',530:'ground',
  531:'normal',540:'bug',543:'bug',544:'bug',551:'ground',552:'ground',559:'dark',
  561:'psychic',568:'poison',574:'psychic',580:'water',581:'water',582:'ice',583:'ice',
  587:'electric',595:'bug',602:'electric',603:'electric',604:'electric',610:'dragon',
  611:'dragon',612:'dragon',613:'ice',614:'ice',615:'ice',621:'dragon',633:'dragon',
  634:'dragon',635:'dragon',
}

export const POKEMON_NAMES = {
  504:'patrat',506:'lillipup',507:'herdier',509:'purrloin',511:'pansage',513:'pansear',
  515:'panpour',519:'pidove',520:'tranquill',522:'blitzle',527:'woobat',529:'drilbur',
  530:'excadrill',531:'audino',540:'sewaddle',543:'venipede',544:'whirlipede',551:'sandile',
  552:'krokorok',559:'scraggy',561:'sigilyph',568:'trubbish',574:'gothita',580:'ducklett',
  581:'swanna',582:'vanillite',583:'vanillish',587:'emolga',595:'joltik',602:'tynamo',
  603:'eelektrik',604:'eelektross',610:'axew',611:'fraxure',612:'haxorus',613:'cubchoo',
  614:'beartic',615:'cryogonal',621:'druddigon',633:'deino',634:'zweilous',635:'hydreigon',
}

// Pokémon pools per trainer type.
// Each entry: { id: pokeApiId, levelRange: [min, max] }
// levelRange is the base range; positionWeight scales within it.
export const TRAINER_POKEMON_POOLS = {
  // --- Map 1 (Routes 1–2, lv 1–5) ---
  'Youngster':      [{ id: 504, levelRange: [6, 9] }, { id: 506, levelRange: [6, 9] }, { id: 509, levelRange: [6, 9] }],
  'Lass':           [{ id: 509, levelRange: [6, 9] }, { id: 506, levelRange: [6, 9] }, { id: 519, levelRange: [6, 9] }],
  'Preschooler M':  [{ id: 504, levelRange: [6, 9] }, { id: 506, levelRange: [6, 9] }],
  'Preschooler F':  [{ id: 504, levelRange: [6, 9] }, { id: 506, levelRange: [6, 9] }],
  'Schoolkid M':    [{ id: 504, levelRange: [6, 9] }, { id: 519, levelRange: [6, 9] }, { id: 522, levelRange: [6, 9] }],
  'Schoolkid F':    [{ id: 504, levelRange: [6, 9] }, { id: 519, levelRange: [6, 9] }, { id: 522, levelRange: [6, 9] }],
  'Backpacker M':   [{ id: 506, levelRange: [6, 9] }, { id: 504, levelRange: [6, 9] }, { id: 509, levelRange: [6, 9] }],
  'Backpacker F':   [{ id: 506, levelRange: [6, 9] }, { id: 504, levelRange: [6, 9] }, { id: 509, levelRange: [6, 9] }],
  'Janitor':        [{ id: 506, levelRange: [6, 9] }, { id: 504, levelRange: [6, 9] }],

  // --- Map 2 (Route 3, lv 10–15) ---
  'Nursery Aide':   [{ id: 531, levelRange: [13, 16] }, { id: 506, levelRange: [13, 16] }, { id: 519, levelRange: [13, 16] }],
  'Twins':          [{ id: 519, levelRange: [13, 16] }, { id: 522, levelRange: [13, 16] }],

  // --- Map 3 (Route 4, lv 20–25) ---
  'Hiker':          [{ id: 551, levelRange: [20, 24] }, { id: 529, levelRange: [20, 24] }, { id: 559, levelRange: [20, 24] }],
  'Worker M':       [{ id: 529, levelRange: [20, 24] }, { id: 551, levelRange: [20, 24] }],
  'Worker F':       [{ id: 529, levelRange: [20, 24] }, { id: 559, levelRange: [20, 24] }],
  'Roughneck':      [{ id: 559, levelRange: [20, 24] }, { id: 551, levelRange: [20, 24] }, { id: 568, levelRange: [20, 24] }],

  // --- Map 4 (Route 6, lv 30–35) ---
  'Cyclist M':      [{ id: 587, levelRange: [26, 31] }, { id: 522, levelRange: [26, 31] }, { id: 595, levelRange: [26, 31] }],
  'Cyclist F':      [{ id: 587, levelRange: [26, 31] }, { id: 595, levelRange: [26, 31] }, { id: 522, levelRange: [26, 31] }],
  'Biker':          [{ id: 522, levelRange: [26, 31] }, { id: 602, levelRange: [26, 31] }, { id: 587, levelRange: [26, 31] }],
  'Depot Agent':    [{ id: 602, levelRange: [26, 31] }, { id: 595, levelRange: [26, 31] }],

  // --- Map 5 (Route 7, lv 35–40) ---
  'Pokemon Ranger M': [{ id: 529, levelRange: [32, 39] }, { id: 551, levelRange: [32, 39] }, { id: 574, levelRange: [32, 39] }],
  'Pokemon Ranger F': [{ id: 574, levelRange: [32, 39] }, { id: 582, levelRange: [32, 39] }, { id: 529, levelRange: [32, 39] }],

  // --- Map 6 (Route 8, lv 40–45) ---
  'Pilot':          [{ id: 519, levelRange: [39, 47] }, { id: 580, levelRange: [39, 47] }, { id: 561, levelRange: [39, 47] }],
  'Ace Trainer M':  [{ id: 561, levelRange: [39, 47] }, { id: 580, levelRange: [39, 47] }, { id: 527, levelRange: [39, 47] }],
  'Ace Trainer F':  [{ id: 527, levelRange: [39, 47] }, { id: 561, levelRange: [39, 47] }, { id: 580, levelRange: [39, 47] }],

  // --- Map 7 (Route 9, lv 45–50) ---
  'Black Belt':     [{ id: 613, levelRange: [45, 54] }, { id: 614, levelRange: [45, 54] }, { id: 559, levelRange: [45, 54] }],
  'Battle Girl':    [{ id: 615, levelRange: [45, 54] }, { id: 613, levelRange: [45, 54] }, { id: 582, levelRange: [45, 54] }],

  // --- Map 8 (Route 16, lv 50–60) ---
  'Veteran M':      [{ id: 633, levelRange: [51, 62] }, { id: 610, levelRange: [51, 62] }, { id: 621, levelRange: [51, 62] }],
  'Veteran F':      [{ id: 634, levelRange: [51, 62] }, { id: 610, levelRange: [51, 62] }, { id: 621, levelRange: [51, 62] }],
}

// Fixed boss teams — indexed by boss trainer name
export const BOSS_TEAMS = {
  // Map 1 — Striaton City Gym (starter-assigned)
  'Chili':   [{ id: 506, level: 8 }, { id: 513, level: 10 }], // Lillipup, Pansear
  'Cress':   [{ id: 506, level: 8 }, { id: 515, level: 10 }], // Lillipup, Panpour
  'Cilan':   [{ id: 506, level: 8 }, { id: 511, level: 10 }], // Lillipup, Pansage

  // Map 2 — Nacrene City Gym (Normal)
  'Lenora':  [{ id: 507, level: 17 }, { id: 531, level: 19 }], // Herdier, Audino

  // Map 3 — Castelia City Gym (Bug)
  'Burgh':   [{ id: 540, level: 26 }, { id: 543, level: 26 }, { id: 544, level: 28 }], // Sewaddle, Venipede, Whirlipede

  // Map 4 — Nimbasa City Gym (Electric)
  'Elesa':   [{ id: 587, level: 35 }, { id: 603, level: 35 }, { id: 604, level: 37 }], // Emolga, Eelektrik, Eelektross... use 522/587/603

  // Map 5 — Driftveil City Gym (Ground)
  'Clay':    [{ id: 530, level: 44 }, { id: 530, level: 44 }, { id: 552, level: 46 }], // Excadrill, Krokorok

  // Map 6 — Mistralton City Gym (Flying)
  'Skyla':   [{ id: 561, level: 53 }, { id: 581, level: 53 }, { id: 520, level: 55 }], // Sigilyph, Swanna, Tranquill

  // Map 7 — Icirrus City Gym (Ice)
  'Brycen':  [{ id: 614, level: 62 }, { id: 615, level: 62 }, { id: 583, level: 64 }], // Beartic, Cryogonal, Vanillish

  // Map 8 — Opelucid City Gym (Dragon)
  'Drayden': [{ id: 611, level: 71 }, { id: 612, level: 71 }, { id: 635, level: 73 }], // Fraxure, Haxorus, Hydreigon
}

// Per-map level ranges (indexed by mapIndex). Mirrors the trainer pools above.
export const MAP_LEVEL_RANGES = [
  [6, 9], [13, 16], [20, 24], [26, 31], [32, 39], [39, 47], [45, 54], [51, 62],
]

// Level range for a map, clamped to the last entry for out-of-bounds indices.
export function mapLevelRange(mapIndex = 0) {
  return MAP_LEVEL_RANGES[Math.min(mapIndex, MAP_LEVEL_RANGES.length - 1)]
}

// Pick a weighted level from a range — later in the map weights toward higher levels
// positionWeight 0.0 = early node, 1.0 = late node
export function pickLevel([min, max], positionWeight = 0.5) {
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
