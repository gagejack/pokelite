// Johto battle DATA — trainer species pools, boss teams, Elite Four teams, and
// per-map level bands. Region-specific; attached to johtoConfig and read by the
// generic loop through the region config, never imported directly by components.
// (Split out of johto.js to keep that file focused on assets. Mirrors
// kanto.teams.js.)

// Trainer Pokémon species per MAP (not per trainer type). Every trainer on a
// map draws from that map's pool, so the species match the route. Evolution-
// gated by band: early maps hold base forms, late maps hold evolved forms.
//
// Gen 1 species appear alongside gen 2 on purpose — Johto's routes are shared
// with Kanto's dex, and a pool of gen-2-only species would be thin enough on
// the early maps that the same three Pokémon would repeat across a row.
// johtoConfig's `generation: 2` still caps evolution branches at id 251, so a
// gen-1 line that evolves into a gen-2 form (Golbat→Crobat, Onix→Steelix) works
// and a line that would need gen 3+ simply stops.
export const TRAINER_SPECIES_POOLS = [
  // Map 1 — Violet / Routes 29–31, Sprout Tower (base forms)
  [16, 19, 10, 13, 161, 163, 165, 167, 187, 41],
  // Map 2 — Azalea / Route 33, Union Cave, Slowpoke Well (bug + rock)
  [165, 167, 46, 74, 41, 179, 194, 79, 27, 118],
  // Map 3 — Goldenrod / Routes 34–35, National Park (normal + grass)
  [17, 20, 39, 35, 175, 191, 43, 69, 187, 188, 177, 63],
  // Map 4 — Ecruteak / Routes 36–38, Burned Tower (ghost + fire)
  [92, 93, 58, 77, 126, 200, 218, 234, 235, 96],
  // Map 5 — Cianwood / Routes 40–41, Whirl Islands (fighting + water)
  [66, 67, 106, 107, 236, 237, 116, 120, 90, 98, 211, 226],
  // Map 6 — Olivine / Route 39, Lighthouse (steel + normal)
  [81, 82, 208, 227, 205, 241, 128, 100, 26, 55],
  // Map 7 — Mahogany / Routes 42–44, Ice Path (ice + poison)
  [220, 221, 215, 225, 87, 91, 124, 89, 168, 178],
  // Map 8 — Blackthorn / Route 45, Dragon's Den, Victory Road (dragon + late)
  [147, 148, 230, 130, 217, 232, 248, 214, 212, 149, 210, 143],
]

// Fixed boss teams — indexed by boss trainer name. Last mon +2 levels (ace).
export const BOSS_TEAMS = {
  // Map 1 — Violet City Gym (Flying) — starter-assigned (all → Falkner)
  'Falkner':  [{ id: 16, level: 6 }, { id: 17, level: 8 }],                         // Pidgey, Pidgeotto

  // Map 2 — Azalea Town Gym (Bug)
  'Bugsy':    [{ id: 11, level: 15 }, { id: 14, level: 15 }, { id: 123, level: 17 }], // Metapod, Kakuna, Scyther

  // Map 3 — Goldenrod City Gym (Normal)
  'Whitney':  [{ id: 35, level: 26 }, { id: 39, level: 26 }, { id: 241, level: 28 }], // Clefairy, Jigglypuff, Miltank

  // Map 4 — Ecruteak City Gym (Ghost)
  'Morty':    [{ id: 92, level: 35 }, { id: 93, level: 35 }, { id: 94, level: 37 }],  // Gastly, Haunter, Gengar

  // Map 5 — Cianwood City Gym (Fighting)
  'Chuck':    [{ id: 57, level: 44 }, { id: 62, level: 44 }, { id: 68, level: 46 }],  // Primeape, Poliwrath, Machamp

  // Map 6 — Olivine City Gym (Steel)
  'Jasmine':  [{ id: 81, level: 53 }, { id: 82, level: 53 }, { id: 208, level: 55 }], // Magnemite, Magneton, Steelix

  // Map 7 — Mahogany Town Gym (Ice)
  'Pryce':    [{ id: 86, level: 62 }, { id: 221, level: 62 }, { id: 87, level: 64 }], // Seel, Piloswine, Dewgong

  // Map 8 — Blackthorn City Gym (Dragon)
  'Clair':    [{ id: 148, level: 71 }, { id: 148, level: 71 }, { id: 230, level: 73 }], // Dragonair, Dragonair, Kingdra
}

// Elite Four + Champion — fought in order after the 8th gym, authored above
// Clair's 71–73 band (player gains +2 levels per battle along the way).
//
// Johto's E4 reuses three of Kanto's members (Koga promoted from gym leader,
// Bruno returning) at higher levels than their Kanto appearances — that's canon,
// not a copy/paste slip.
export const ELITE_FOUR_TEAMS = {
  'Will':  [{ id: 178, level: 70 }, { id: 103, level: 69 }, { id: 124, level: 70 }, { id: 178, level: 70 }, { id: 199, level: 72 }], // Xatu, Exeggutor, Jynx, Xatu, Slowking (ace)
  'Koga':  [{ id: 168, level: 69 }, { id: 49, level: 71 }, { id: 205, level: 71 }, { id: 89, level: 72 }, { id: 169, level: 74 }],  // Ariados, Venomoth, Forretress, Muk, Crobat (ace)
  'Bruno': [{ id: 237, level: 72 }, { id: 106, level: 71 }, { id: 107, level: 71 }, { id: 95, level: 72 }, { id: 68, level: 76 }],  // Hitmontop, Hitmonlee, Hitmonchan, Onix, Machamp (ace)
  'Karen': [{ id: 198, level: 70 }, { id: 45, level: 70 }, { id: 94, level: 72 }, { id: 197, level: 74 }, { id: 229, level: 76 }], // Murkrow, Vileplume, Gengar, Umbreon, Houndoom (ace)
  // Lance's 6th mon (the ace) is a starter-counter picked at battle time from
  // LANCE_STARTER_COUNTER below — the fully-evolved Johto starter that beats
  // the player's pick. EliteFour splices it in as the ace.
  //
  // Canonically Lance's ace is Dragonite, and he carries three of them. Here the
  // 6th slot is the starter-counter (mirroring Kanto's Blue), so the extra
  // Dragonites stay in slots 1–5 and the counter lands last.
  'Lance': [{ id: 130, level: 69 }, { id: 149, level: 73 }, { id: 149, level: 71 }, { id: 142, level: 71 }, { id: 6, level: 72 }],  // Gyarados, Dragonite, Dragonite, Aerodactyl, Charizard
}

// Lance's ace, chosen to counter the player's starter (id → { id, level }).
// Silver-style type advantage: the fully-evolved Johto starter that BEATS the
// player's pick. Chikorita(152)→Typhlosion, Cyndaquil(155)→Feraligatr,
// Totodile(158)→Meganium. The 6th slot; falls back to Typhlosion if the
// starter is unknown.
export const LANCE_STARTER_COUNTER = {
  152: { id: 157, level: 74 }, // vs Chikorita → Typhlosion
  155: { id: 160, level: 74 }, // vs Cyndaquil → Feraligatr
  158: { id: 154, level: 74 }, // vs Totodile  → Meganium
}

// Silver's early-game starter, same counter rule as LANCE_STARTER_COUNTER but
// at the middle evolution stage — a fully-evolved starter would be absurd in a
// L24 map-3 fight. Chikorita(152)→Quilava, Cyndaquil(155)→Croconaw,
// Totodile(158)→Bayleef. Level is filled in at battle time from the roster's
// highest (see rivalTeamSpecs) so it always lands as the ace.
//
// This IS Silver's canon rule: he steals the starter with type advantage over
// the player's, unlike Blue, whose FR/LG counter is the same relationship
// arrived at by a different story.
export const SILVER_EARLY_STARTER_COUNTER = {
  152: { id: 156 }, // vs Chikorita → Quilava
  155: { id: 159 }, // vs Cyndaquil → Croconaw
  158: { id: 153 }, // vs Totodile  → Bayleef
}

// Rival (Silver) teams for RIVAL nodes, keyed by variant so the same rival can
// be placed at different game stages with a stage-appropriate roster. Flat
// { id, level } specs, same format as BOSS_TEAMS; ace last.
// `starterCounter` names a counter map whose entry is appended as the true ace
// at the team's highest level — resolved by rivalTeamSpecs (game/rivals.js).
export const RIVAL_TEAMS = {
  // Map 3 (Goldenrod, band [18,28]) — canonical early-game Silver, just under
  // the Whitney gym (L26-28). His starter is spliced in last at L24.
  silverEarlyGame: [
    { id: 41,  level: 22 }, // Zubat
    { id: 228, level: 22 }, // Houndour
    { id: 64,  level: 23 }, // Kadabra
    { id: 215, level: 24 }, // Sneasel
  ],
}

// Which counter map each rival variant draws its starter ace from.
export const RIVAL_STARTER_COUNTERS = {
  silverEarlyGame: SILVER_EARLY_STARTER_COUNTER,
}

// Per-map level ranges (indexed by mapIndex) for TRAINER and GRASS encounters.
// Identical to Kanto's bands: Johto sits in the same slot of the run (a fresh
// starter, eight gyms, an Elite Four) and the two regions should not disagree
// about what "map 5" means for a player deciding which region to run.
export const MAP_LEVEL_RANGES = [
  [1, 8], [8, 17], [18, 28], [26, 37], [34, 46], [42, 55], [50, 64], [58, 73],
]

// Per-map level ranges for CATCH offers (Pokéball nodes), kept separate from
// MAP_LEVEL_RANGES on purpose: nerfing the maps' trainers should not shrink
// what the player can catch there. These hold the original pre-nerf pacing,
// so maps 1–2 still offer Lv3–10 / Lv10–19 catches.
//
// Catch level also gates which evolution stage a node may offer (NodeMap's
// rollStageForLevel keeps only stages whose minLevel ≤ level), so lowering
// this table quietly biases early maps toward base forms.
export const CATCH_LEVEL_RANGES = [
  [3, 10], [10, 19], [18, 28], [26, 37], [34, 46], [42, 55], [50, 64], [58, 73],
]
