// Kanto battle DATA — trainer species pools, boss teams, Elite Four teams, and
// per-map level bands. Region-specific; attached to kantoConfig and read by the
// generic loop through the region config, never imported directly by components.
// (Split out of kanto.js to keep that file focused on assets. Mirrors
// unova.teams.js.)

// Trainer Pokémon species per MAP (not per trainer type). Every trainer on a
// map draws from that map's pool, so the species match the route. Evolution-
// gated by band: early maps hold base forms, late maps hold evolved forms.
export const TRAINER_SPECIES_POOLS = [
  // Map 1 — Pewter / Routes 1–3 (base forms)
  [16, 19, 10, 13, 21, 29, 32],
  // Map 2 — Cerulean / Route 4, 24–25
  [17, 43, 69, 54, 60, 120, 118, 63],
  // Map 3 — Vermilion / Routes 5–6, 11
  [20, 25, 81, 100, 50, 66, 27],
  // Map 4 — Celadon / Routes 7–8
  [44, 70, 45, 58, 37, 96, 52, 102],
  // Map 5 — Fuchsia / Routes 12–15
  [48, 49, 88, 109, 110, 24, 33, 30, 42],
  // Map 6 — Saffron
  [64, 97, 122, 124, 80, 62, 99, 105],
  // Map 7 — Cinnabar (fire)
  [59, 38, 78, 126, 112, 101, 89, 91],
  // Map 8 — Viridian / Victory Road
  [34, 31, 51, 76, 28, 130, 148, 65, 68, 94],
]

// Fixed boss teams — indexed by boss trainer name. Last mon +2 levels (ace).
export const BOSS_TEAMS = {
  // Map 1 — Pewter City Gym (Rock) — starter-assigned (all → Brock)
  'Brock':     [{ id: 74, level: 8 }, { id: 95, level: 10 }],                       // Geodude, Onix

  // Map 2 — Cerulean City Gym (Water)
  'Misty':     [{ id: 120, level: 17 }, { id: 121, level: 19 }],                    // Staryu, Starmie

  // Map 3 — Vermilion City Gym (Electric)
  'Lt. Surge': [{ id: 100, level: 26 }, { id: 25, level: 26 }, { id: 26, level: 28 }], // Voltorb, Pikachu, Raichu

  // Map 4 — Celadon City Gym (Grass)
  'Erika':     [{ id: 71, level: 35 }, { id: 114, level: 35 }, { id: 45, level: 37 }], // Victreebel, Tangela, Vileplume

  // Map 5 — Fuchsia City Gym (Poison)
  'Koga':      [{ id: 109, level: 44 }, { id: 89, level: 44 }, { id: 110, level: 46 }], // Koffing, Muk, Weezing

  // Map 6 — Saffron City Gym (Psychic)
  'Sabrina':   [{ id: 64, level: 53 }, { id: 122, level: 53 }, { id: 65, level: 55 }], // Kadabra, Mr. Mime, Alakazam

  // Map 7 — Cinnabar Island Gym (Fire)
  'Blaine':    [{ id: 58, level: 62 }, { id: 78, level: 62 }, { id: 59, level: 64 }], // Growlithe, Rapidash, Arcanine

  // Map 8 — Viridian City Gym (Ground)
  'Giovanni':  [{ id: 111, level: 71 }, { id: 51, level: 71 }, { id: 112, level: 73 }], // Rhyhorn, Dugtrio, Rhydon
}

// Elite Four + Champion — fought in order after the 8th gym, authored above
// Giovanni's 71–73 band (player gains +2 levels per battle along the way).
export const ELITE_FOUR_TEAMS = {
  'Lorelei': [{ id: 87, level: 74 }, { id: 91, level: 73 }, { id: 80, level: 74 }, { id: 124, level: 74 }, { id: 131, level: 76 }], // Dewgong, Cloyster, Slowbro, Jynx, Lapras (ace)
  'Bruno':   [{ id: 95, level: 73 }, { id: 107, level: 75 }, { id: 106, level: 75 }, { id: 95, level: 76 }, { id: 68, level: 78 }], // Onix, Hitmonchan, Hitmonlee, Onix, Machamp (ace)
  'Agatha':  [{ id: 94, level: 76 }, { id: 42, level: 76 }, { id: 93, level: 75 }, { id: 24, level: 78 }, { id: 94, level: 80 }],  // Gengar, Golbat, Haunter, Arbok, Gengar (ace)
  'Lance':   [{ id: 130, level: 76 }, { id: 148, level: 74 }, { id: 148, level: 74 }, { id: 142, level: 78 }, { id: 149, level: 80 }], // Gyarados, Dragonair, Dragonair, Aerodactyl, Dragonite (ace)
  // Blue's 6th mon (the ace) is a starter-counter picked at battle time from
  // BLUE_STARTER_COUNTER below — the fully-evolved starter that beats the
  // player's pick (FR/LG behaviour). EliteFour splices it in as the ace.
  'Blue':    [{ id: 18, level: 73 }, { id: 65, level: 77 }, { id: 112, level: 75 }, { id: 103, level: 75 }, { id: 130, level: 76 }], // Pidgeot, Alakazam, Rhydon, Exeggutor, Gyarados
}

// Blue's ace, chosen to counter the player's starter (id → { id, level }).
// Bulbasaur(1)→Charizard, Charmander(4)→Blastoise, Squirtle(7)→Venusaur.
// The 6th slot; falls back to Charizard if the starter is unknown.
export const BLUE_STARTER_COUNTER = {
  1: { id: 6,  level: 78 }, // vs Bulbasaur → Charizard
  4: { id: 9,  level: 78 }, // vs Charmander → Blastoise
  7: { id: 3,  level: 78 }, // vs Squirtle → Venusaur
}

// Blue's early-game starter, same counter rule as BLUE_STARTER_COUNTER but at
// the middle evolution stage — a fully-evolved starter would be absurd in a
// L24 map-3 fight. Bulbasaur(1)→Charmeleon, Charmander(4)→Wartortle,
// Squirtle(7)→Ivysaur. Level is filled in at battle time from the roster's
// highest (see rivalTeamSpecs) so it always lands as the ace.
export const BLUE_EARLY_STARTER_COUNTER = {
  1: { id: 5 }, // vs Bulbasaur → Charmeleon
  4: { id: 8 }, // vs Charmander → Wartortle
  7: { id: 2 }, // vs Squirtle → Ivysaur
}

// Rival (Blue) teams for RIVAL nodes, keyed by variant so the same rival can be
// placed at different game stages with a stage-appropriate roster. Flat
// { id, level } specs, same format as BOSS_TEAMS; ace last.
// `starterCounter` names a counter map whose entry is appended as the true ace
// at the team's highest level — resolved by rivalTeamSpecs (game/rivals.js).
export const RIVAL_TEAMS = {
  // Map 3 (Vermilion, band [18,28]) — canonical early-game Blue, just under the
  // Lt. Surge gym (L26-28). His starter is spliced in last at L24.
  blueEarlyGame: [
    { id: 17,  level: 22 }, // Pidgeotto
    { id: 20,  level: 22 }, // Raticate
    { id: 64,  level: 23 }, // Kadabra
    { id: 102, level: 24 }, // Exeggcute
  ],
}

// Which counter map each rival variant draws its starter ace from.
export const RIVAL_STARTER_COUNTERS = {
  blueEarlyGame: BLUE_EARLY_STARTER_COUNTER,
}

// Per-map level ranges (indexed by mapIndex). Same pacing as Unova.
export const MAP_LEVEL_RANGES = [
  [3, 10], [10, 19], [18, 28], [26, 37], [34, 46], [42, 55], [50, 64], [58, 73],
]
