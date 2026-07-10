// Unova battle DATA — trainer species pools, boss teams, Elite Four teams, and
// per-map level bands. This is region-specific and is attached to unovaConfig;
// the generic loop reads it through the region config, never by importing this
// file directly. (Split out of unova.js to keep that file focused on assets.)

// Trainer Pokémon species per MAP (not per trainer type).
//
// Every trainer on a map draws from that map's species pool. This is keyed by
// map — not trainer type — because the same trainer type (e.g. Backpacker)
// appears on many maps, and its Pokémon must match the ROUTE it's on. Pools are
// evolution-gated by band, mirroring the catch pools: a species only appears on
// a map whose band can reach its evolution level, so early maps hold base forms
// and late maps hold evolved forms (no Lv40 Patrat).
export const TRAINER_SPECIES_POOLS = [
  // Map 1 — Routes 1–2 (base normals/basics)
  [504, 506, 509, 519, 522, 543, 540],
  // Map 2 — Route 3 / Wellspring Cave
  [504, 506, 509, 519, 522, 531, 535, 532, 524, 527, 511, 513, 515],
  // Map 3 — Route 4 (desert)
  [551, 559, 554, 557, 568, 562, 556, 529, 543, 544],
  // Map 4 — Route 6 (electric / Nimbasa)
  [523, 522, 587, 595, 602, 585, 588, 574, 577, 530, 552, 533, 536],
  // Map 5 — Route 7 / Celestial Tower
  [586, 572, 575, 578, 542, 545, 563, 558, 569, 590, 547, 549, 571, 559, 560],
  // Map 6 — Route 8 / Moor of Icirrus / Mistralton
  [581, 561, 528, 536, 537, 592, 593, 594, 603, 575, 525, 526, 520, 521, 550],
  // Map 7 — Route 9 / Twist Mountain (ice)
  [613, 614, 583, 584, 615, 622, 623, 619, 620, 605, 606, 533, 534, 525, 538, 539, 599, 600],
  // Map 8 — Route 16 / Victory Road (dragon)
  [633, 634, 610, 611, 612, 621, 620, 624, 625, 623, 600, 601, 614, 584, 627, 628, 629, 630, 632, 631, 597, 598, 589, 617, 635],
]

// Fixed boss teams — indexed by boss trainer name.
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
  'Elesa':   [{ id: 587, level: 35 }, { id: 603, level: 35 }, { id: 604, level: 37 }], // Emolga, Eelektrik, Eelektross

  // Map 5 — Driftveil City Gym (Ground)
  'Clay':    [{ id: 530, level: 44 }, { id: 530, level: 44 }, { id: 552, level: 46 }], // Excadrill, Krokorok

  // Map 6 — Mistralton City Gym (Flying)
  'Skyla':   [{ id: 561, level: 53 }, { id: 581, level: 53 }, { id: 520, level: 55 }], // Sigilyph, Swanna, Tranquill

  // Map 7 — Icirrus City Gym (Ice)
  'Brycen':  [{ id: 614, level: 62 }, { id: 615, level: 62 }, { id: 583, level: 64 }], // Beartic, Cryogonal, Vanillish

  // Map 8 — Opelucid City Gym (Dragon)
  'Drayden': [{ id: 611, level: 71 }, { id: 612, level: 71 }, { id: 635, level: 73 }], // Fraxure, Haxorus, Hydreigon
}

// Elite Four + Champion — fought in order after the 8th gym, authored above
// Drayden's 71–73 band (the player gains +2 levels per battle along the way).
export const ELITE_FOUR_TEAMS = {
  'Shauntal': [{ id: 563, level: 74 }, { id: 623, level: 74 }, { id: 609, level: 76 }], // Cofagrigus, Golurk, Chandelure
  'Grimsley': [{ id: 560, level: 74 }, { id: 553, level: 74 }, { id: 625, level: 76 }], // Scrafty, Krookodile, Bisharp
  'Caitlin':  [{ id: 561, level: 74 }, { id: 576, level: 74 }, { id: 579, level: 76 }], // Sigilyph, Gothitelle, Reuniclus
  'Marshal':  [{ id: 538, level: 74 }, { id: 620, level: 74 }, { id: 534, level: 76 }], // Throh, Mienshao, Conkeldurr
  'Alder':    [{ id: 617, level: 77 }, { id: 626, level: 77 }, { id: 621, level: 78 }, { id: 584, level: 78 }, { id: 637, level: 80 }], // Accelgor, Bouffalant, Druddigon, Vanilluxe, Volcarona (ace)
}

// Per-map level ranges (indexed by mapIndex). Mirrors the trainer pools above.
export const MAP_LEVEL_RANGES = [
  [3, 10], [10, 19], [18, 28], [26, 37], [34, 46], [42, 55], [50, 64], [58, 73],
]
