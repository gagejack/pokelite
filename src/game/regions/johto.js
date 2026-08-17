// Johto region config — assets, pools, and the assembled `johtoConfig` the
// generic game loop reads through regionRegistry. Battle DATA (trainer species
// pools, boss/E4 teams, level bands) lives in johto.teams.js; this file stays
// focused on assets and per-map pools. Mirrors kanto.js.

import { buildRows, NODE_TYPES } from '../nodeMap.js'
import { pickCatchOffer, CATCH_TIER_BUDGET } from '../catch.js'
import { TRAINER_SPECIES_POOLS, BOSS_TEAMS, ELITE_FOUR_TEAMS, RIVAL_TEAMS, RIVAL_STARTER_COUNTERS, MAP_LEVEL_RANGES, CATCH_LEVEL_RANGES, LANCE_STARTER_COUNTER } from './johto.teams.js'
import { bakeSafariSpecies } from '../safariBake.js'
import { GEN_MAX_ID } from '../pokemon.js'

// --- Map backgrounds (one per gym city, thematic to that gym's type) ---
import bgFlying from '../../assets/regions/Johto/Maps/Flying.png'
import bgBug from '../../assets/regions/Johto/Maps/Bug.png'
import bgNormal from '../../assets/regions/Johto/Maps/Normal.png'
import bgGhost from '../../assets/regions/Johto/Maps/Ghost.png'
import bgFighting from '../../assets/regions/Johto/Maps/Fighting.png'
import bgSteel from '../../assets/regions/Johto/Maps/Steel.png'
import bgIce from '../../assets/regions/Johto/Maps/Ice.png'
import bgDragon from '../../assets/regions/Johto/Maps/Dragon.png'
import grassIcon from '../../assets/regions/Johto/johtoGrass.png'

// --- Badges (map order) ---
import badgeZephyr from '../../assets/regions/Johto/Badges/Zephyrbadge.webp'
import badgeHive from '../../assets/regions/Johto/Badges/Hivebadge.webp'
import badgePlain from '../../assets/regions/Johto/Badges/Plainbadge.webp'
import badgeFog from '../../assets/regions/Johto/Badges/Fogbadge.webp'
import badgeStorm from '../../assets/regions/Johto/Badges/Stormbadge.webp'
import badgeMineral from '../../assets/regions/Johto/Badges/Mineralbadge.webp'
import badgeGlacier from '../../assets/regions/Johto/Badges/Glacierbadge.webp'
import badgeRising from '../../assets/regions/Johto/Badges/Risingbadge.webp'

// --- Overworld sprites (node icons) ---
import owBugCatcher from '../../assets/regions/Johto/Overworlds/ow_Bug_Catcher.webp'
import owLass from '../../assets/regions/Johto/Overworlds/ow_Lass.webp'
import owYoungster from '../../assets/regions/Johto/Overworlds/ow_Youngster.webp'
import owSchoolkid from '../../assets/regions/Johto/Overworlds/ow_Schoolkid.webp'
import owBirdKeeper from '../../assets/regions/Johto/Overworlds/ow_Bird_Keeper.webp'
import owSage from '../../assets/regions/Johto/Overworlds/ow_Sage.webp'
import owSuperNerd from '../../assets/regions/Johto/Overworlds/ow_Super_Nerd.webp'
import owTwins from '../../assets/regions/Johto/Overworlds/ow_Twins.webp'
import owBeauty from '../../assets/regions/Johto/Overworlds/ow_Beauty.webp'
import owTeacher from '../../assets/regions/Johto/Overworlds/ow_Teacher.webp'
import owMedium from '../../assets/regions/Johto/Overworlds/ow_Medium.webp'
import owKimonoGirl from '../../assets/regions/Johto/Overworlds/ow_Kimono_Girl.webp'
import owFirebreather from '../../assets/regions/Johto/Overworlds/ow_Firebreather.webp'
import owSwimmer1 from '../../assets/regions/Johto/Overworlds/ow_Swimmer_1.webp'
import owSwimmer2 from '../../assets/regions/Johto/Overworlds/ow_Swimmer_2.webp'
import owBlackBelt from '../../assets/regions/Johto/Overworlds/ow_Black_Belt.webp'
import owBiker from '../../assets/regions/Johto/Overworlds/ow_Biker.webp'
import owScientist from '../../assets/regions/Johto/Overworlds/ow_Scientist.webp'
import owBurglar from '../../assets/regions/Johto/Overworlds/ow_Burglar.webp'
import owJuggler from '../../assets/regions/Johto/Overworlds/ow_Juggler.webp'
import owPokeManiac from '../../assets/regions/Johto/Overworlds/ow_Poke_Maniac.webp'
import owBoarder from '../../assets/regions/Johto/Overworlds/ow_Boarder.webp'
import owSkier from '../../assets/regions/Johto/Overworlds/ow_Skier.webp'
import owGentleman1 from '../../assets/regions/Johto/Overworlds/ow_Gentleman_1.webp'
import owGentleman2 from '../../assets/regions/Johto/Overworlds/ow_Gentleman_2.webp'
import owYoungCouple from '../../assets/regions/Johto/Overworlds/ow_Young_Couple.webp'
import owAceTrainer1 from '../../assets/regions/Johto/Overworlds/ow_Ace_Trainer_1.webp'
import owAceTrainer2 from '../../assets/regions/Johto/Overworlds/ow_Ace_Trainer_2.webp'
// Gym leaders, Elite Four, rival
import owFalkner from '../../assets/regions/Johto/Overworlds/ow_Falkner.webp'
import owBugsy from '../../assets/regions/Johto/Overworlds/ow_Bugsy.webp'
import owWhitney from '../../assets/regions/Johto/Overworlds/ow_Whitney.webp'
import owMorty from '../../assets/regions/Johto/Overworlds/ow_Morty_1.webp'
import owChuck from '../../assets/regions/Johto/Overworlds/ow_Chuck.webp'
import owJasmine from '../../assets/regions/Johto/Overworlds/ow_Jasmine_1.webp'
import owPryce from '../../assets/regions/Johto/Overworlds/ow_Pryce.webp'
import owClair from '../../assets/regions/Johto/Overworlds/ow_Clair.webp'
import owWill from '../../assets/regions/Johto/Overworlds/ow_Will.webp'
import owKoga from '../../assets/regions/Johto/Overworlds/ow_Koga.webp'
import owBruno from '../../assets/regions/Johto/Overworlds/ow_Bruno.webp'
import owKaren from '../../assets/regions/Johto/Overworlds/ow_Karen.webp'
import owLance from '../../assets/regions/Johto/Overworlds/ow_Lance.webp'
import owSilver from '../../assets/regions/Johto/Overworlds/ow_Silver_1.webp'
// Player-character portraits (CharacterSelect)
import owEthan1 from '../../assets/regions/Johto/Overworlds/ow_Ethan_1.webp'
import owLyra1 from '../../assets/regions/Johto/Overworlds/ow_Lyra_1.webp'
import owKris from '../../assets/regions/Johto/Overworlds/ow_Kris.webp'

// --- Full battle sprites (BattleCard) ---
// Johto's route-class sheet is gendered (Ace_Trainer_M/F, Swimmer_M/F) where
// the overworld sheet is numbered (Ace_Trainer_1/2, Swimmer_1/2), so the two
// halves of a class pair up by position rather than by matching filenames.
import fullBugCatcher from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Bug_Catcher.png'
import fullLass from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Lass.png'
import fullYoungster from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Youngster.png'
import fullSchoolkid from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_School_Kid.png'
import fullBirdKeeper from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Bird_Keeper.png'
import fullSage from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Sage.png'
import fullSuperNerd from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Super_Nerd.png'
import fullTwins from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Twins.png'
import fullBeauty from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Beauty.png'
import fullTeacher from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Teacher.png'
import fullMedium from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Medium.png'
import fullKimonoGirl from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Kimono_Girl.png'
import fullFirebreather from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Firebreather.png'
import fullSwimmerM from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Swimmer_M.png'
import fullSwimmerF from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Swimmer_F.png'
import fullBlackBelt from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Black_Belt.png'
import fullBiker from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Biker.png'
import fullScientist from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Scientist.png'
import fullBurglar from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Burglar.png'
import fullJuggler from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Juggler.png'
import fullPokeManiac from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Poké_Maniac.png'
import fullBoarder from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Boarder.png'
import fullSkier from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Skier.png'
import fullGentleman from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Gentleman.png'
import fullYoungCouple from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Young_Couple.png'
import fullAceTrainerM from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Ace_Trainer_M.png'
import fullAceTrainerF from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Ace_Trainer_F.png'
// Gym leaders, Elite Four, rival
import fullFalkner from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Falkner.png'
import fullBugsy from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Bugsy.png'
import fullWhitney from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Whitney.png'
import fullMorty from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Morty.png'
import fullChuck from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Chuck.png'
import fullJasmine from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Jasmine.png'
import fullPryce from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Pryce.png'
import fullClair from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Clair.png'
import fullWill from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Will.png'
import fullKoga from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Koga.png'
import fullBruno from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Bruno.png'
import fullKaren from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Karen.png'
import fullLance from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Lance.png'
import fullSilver from '../../assets/regions/Johto/Trainer Sprites/Spr_HGSS_Silver.png'

// --- Playable characters (CharacterSelect portraits) ---
const CHARACTERS = [
  { id: 'ethan', name: 'Ethan', sprite: owEthan1 },
  { id: 'lyra',  name: 'Lyra',  sprite: owLyra1 },
  { id: 'kris',  name: 'Kris',  sprite: owKris },
]

// --- Trainer overworld sprites (node icons) ---
const TRAINER_SPRITES = {
  // Route trainers
  'Bug Catcher':   owBugCatcher,
  'Lass':          owLass,
  'Youngster':     owYoungster,
  'Schoolkid':     owSchoolkid,
  'Bird Keeper':   owBirdKeeper,
  'Sage':          owSage,
  'Super Nerd':    owSuperNerd,
  'Twins':         owTwins,
  'Beauty':        owBeauty,
  'Teacher':       owTeacher,
  'Medium':        owMedium,
  'Kimono Girl':   owKimonoGirl,
  'Firebreather':  owFirebreather,
  'Swimmer 1':     owSwimmer1,
  'Swimmer 2':     owSwimmer2,
  'Black Belt':    owBlackBelt,
  'Biker':         owBiker,
  'Scientist':     owScientist,
  'Burglar':       owBurglar,
  'Juggler':       owJuggler,
  'Poke Maniac':   owPokeManiac,
  'Boarder':       owBoarder,
  'Skier':         owSkier,
  'Gentleman 1':   owGentleman1,
  'Gentleman 2':   owGentleman2,
  'Young Couple':  owYoungCouple,
  'Ace Trainer 1': owAceTrainer1,
  'Ace Trainer 2': owAceTrainer2,
  // Gym leaders + Elite Four (keyed by the clean name used in BOSS_TEAMS/eliteFour)
  'Falkner':       owFalkner,
  'Bugsy':         owBugsy,
  'Whitney':       owWhitney,
  'Morty':         owMorty,
  'Chuck':         owChuck,
  'Jasmine':       owJasmine,
  'Pryce':         owPryce,
  'Clair':         owClair,
  'Will':          owWill,
  'Koga':          owKoga,
  'Bruno':         owBruno,
  'Karen':         owKaren,
  'Lance':         owLance,
  'Silver':        owSilver,
}

// --- Trainer full battle sprites (BattleCard) — same keys as TRAINER_SPRITES ---
const TRAINER_FULL_SPRITES = {
  // Route trainers
  'Bug Catcher':   fullBugCatcher,
  'Lass':          fullLass,
  'Youngster':     fullYoungster,
  'Schoolkid':     fullSchoolkid,
  'Bird Keeper':   fullBirdKeeper,
  'Sage':          fullSage,
  'Super Nerd':    fullSuperNerd,
  'Twins':         fullTwins,
  'Beauty':        fullBeauty,
  'Teacher':       fullTeacher,
  'Medium':        fullMedium,
  'Kimono Girl':   fullKimonoGirl,
  'Firebreather':  fullFirebreather,
  'Swimmer 1':     fullSwimmerM,
  'Swimmer 2':     fullSwimmerF,
  'Black Belt':    fullBlackBelt,
  'Biker':         fullBiker,
  'Scientist':     fullScientist,
  'Burglar':       fullBurglar,
  'Juggler':       fullJuggler,
  'Poke Maniac':   fullPokeManiac,
  'Boarder':       fullBoarder,
  'Skier':         fullSkier,
  'Gentleman 1':   fullGentleman,
  'Gentleman 2':   fullGentleman,
  'Young Couple':  fullYoungCouple,
  'Ace Trainer 1': fullAceTrainerM,
  'Ace Trainer 2': fullAceTrainerF,
  // Gym leaders + Elite Four
  'Falkner':       fullFalkner,
  'Bugsy':         fullBugsy,
  'Whitney':       fullWhitney,
  'Morty':         fullMorty,
  'Chuck':         fullChuck,
  'Jasmine':       fullJasmine,
  'Pryce':         fullPryce,
  'Clair':         fullClair,
  'Will':          fullWill,
  'Koga':          fullKoga,
  'Bruno':         fullBruno,
  'Karen':         fullKaren,
  'Lance':         fullLance,
  'Silver':        fullSilver,
}

// All three Johto starters map to Falkner (Violet Gym) — Johto has no
// starter-branched first gym like Unova's Striaton brothers.
// Chikorita(152), Cyndaquil(155), Totodile(158) → Falkner.
const STARTER_BOSS = { 152: 'Falkner', 155: 'Falkner', 158: 'Falkner' }

// --- Themed trainer pools (per class) ---
// Keys match the trainer names in TRAINER_POOLS. Each is BASE FORMS only — the
// engine rolls the evolution stage by the mon's level (early maps → base, late
// maps → evolved). Classes not listed fall back to the map's route pool
// (TRAINER_SPECIES_POOLS): Ace Trainer 1/2 stay "anything goes".
//
// Johto's HGSS sprite sheet has no Fisherman or Hiker (Kanto's two staples), so
// the water and rock niches are carried by Swimmer and Boarder/Skier instead.
const TRAINER_TYPE_POOLS = {
  'Bug Catcher':   [10, 13, 165, 167, 193],          // Caterpie, Weedle, Ledyba, Spinarak, Yanma
  'Lass':          [161, 16, 19, 187, 191],          // Sentret, Pidgey, Rattata, Hoppip, Sunkern
  'Youngster':     [19, 21, 161, 179, 27],           // Rattata, Spearow, Sentret, Mareep, Sandshrew
  'Schoolkid':     [172, 175, 190, 63, 74],          // Pichu, Togepi, Aipom, Abra, Geodude
  'Bird Keeper':   [16, 21, 163, 177, 41, 198],      // Pidgey, Spearow, Hoothoot, Natu, Zubat, Murkrow
  'Sage':          [92, 200, 96, 63],                // Gastly, Misdreavus, Drowzee, Abra
  'Super Nerd':    [81, 100, 88, 109, 239],          // Magnemite, Voltorb, Grimer, Koffing, Elekid
  'Twins':         [35, 39, 173, 174, 183],          // Clefairy, Jigglypuff, Cleffa, Igglybuff, Marill
  'Beauty':        [35, 39, 175, 187, 191],          // Clefairy, Jigglypuff, Togepi, Hoppip, Sunkern
  'Teacher':       [161, 163, 175, 179],             // Sentret, Hoothoot, Togepi, Mareep
  'Medium':        [92, 200, 96, 238],               // Gastly, Misdreavus, Drowzee, Smoochum
  'Kimono Girl':   [133, 58, 37, 234],               // Eevee, Growlithe, Vulpix, Stantler
  'Firebreather':  [58, 37, 218, 126, 240],          // Growlithe, Vulpix, Slugma, Magmar, Magby
  'Swimmer 1':     [129, 118, 60, 116, 194, 183],    // Magikarp, Goldeen, Poliwag, Horsea, Wooper, Marill
  'Swimmer 2':     [129, 118, 60, 90, 98, 226],      // Magikarp, Goldeen, Poliwag, Shellder, Krabby, Mantine
  'Black Belt':    [66, 56, 236, 106, 107],          // Machop, Mankey, Tyrogue, Hitmonlee, Hitmonchan
  'Biker':         [88, 109, 84, 228],               // Grimer, Koffing, Doduo, Houndour
  'Scientist':     [81, 100, 137, 233],              // Magnemite, Voltorb, Porygon, Porygon2
  'Burglar':       [58, 37, 228, 215],               // Growlithe, Vulpix, Houndour, Sneasel
  'Juggler':       [96, 63, 100, 122],               // Drowzee, Abra, Voltorb, Mr. Mime
  'Poke Maniac':   [104, 111, 231, 220, 246],        // Cubone, Rhyhorn, Phanpy, Swinub, Larvitar
  'Boarder':       [220, 215, 225, 86],              // Swinub, Sneasel, Delibird, Seel
  'Skier':         [220, 215, 225, 124],             // Swinub, Sneasel, Delibird, Jynx
  'Gentleman 1':   [52, 35, 58, 37, 234],            // Meowth, Clefairy, Growlithe, Vulpix, Stantler
  'Gentleman 2':   [52, 35, 58, 37, 234],
  'Young Couple':  [35, 39, 183, 175],               // Clefairy, Jigglypuff, Marill, Togepi
}

// --- Catch pools per map ---
// Each entry is { id, rarity }. Pokéball nodes draw 3 by rarity weight. Pools
// are evolution-gated by band (base forms early, evolved forms possible late —
// the catch-node evolution roll picks a stage the map's level can reach). Each
// species appears on only one map; rarity mirrors the item system (60/25/10/5).
// The single 'legendary'-rarity entry per map is that map's chase mon.
const CATCH_POOLS = [
  // Map 1 — Violet / Routes 29–31, Sprout Tower, Dark Cave. Base forms.
  // Togepi (175) is the hatched-egg gift in canon — the epic slot here.
  // Chikorita's line is the player's, so the chase is Mareep (179), Route 32's
  // signature catch just past the gym.
  [{ id: 161, rarity: 'common' }, { id: 163, rarity: 'common' }, { id: 16, rarity: 'common' }, { id: 19, rarity: 'common' }, { id: 10, rarity: 'common' }, { id: 13, rarity: 'common' }, { id: 41, rarity: 'common' }, { id: 165, rarity: 'common' }, { id: 167, rarity: 'common' }, { id: 187, rarity: 'common' }, { id: 191, rarity: 'common' }, { id: 21, rarity: 'rare' }, { id: 172, rarity: 'rare' }, { id: 175, rarity: 'epic' }, { id: 179, rarity: 'legendary' }],
  // Map 2 — Azalea / Route 33, Union Cave, Slowpoke Well. Ilex Forest's own
  // catches: Paras (46), Metapod line. Wooper (194) and Slowpoke (79) are the
  // Well; Onix (95) the cave. Heracross (214) headbutts out of Ilex — the chase.
  [{ id: 46, rarity: 'common' }, { id: 74, rarity: 'common' }, { id: 95, rarity: 'common' }, { id: 194, rarity: 'common' }, { id: 79, rarity: 'common' }, { id: 27, rarity: 'common' }, { id: 118, rarity: 'common' }, { id: 129, rarity: 'common' }, { id: 183, rarity: 'rare' }, { id: 60, rarity: 'rare' }, { id: 216, rarity: 'rare' }, { id: 204, rarity: 'epic' }, { id: 214, rarity: 'legendary' }],
  // Map 3 — Goldenrod / Routes 34–35, National Park. The Park's bug-catching
  // contest roster: Venonat (48), Pinsir (127), Scyther (123). Abra (63) is the
  // Game Corner prize mon; Eevee (133) the Goldenrod gift — the chase.
  [{ id: 17, rarity: 'common' }, { id: 20, rarity: 'common' }, { id: 39, rarity: 'common' }, { id: 35, rarity: 'common' }, { id: 43, rarity: 'common' }, { id: 69, rarity: 'common' }, { id: 48, rarity: 'common' }, { id: 190, rarity: 'common' }, { id: 177, rarity: 'common' }, { id: 63, rarity: 'rare' }, { id: 123, rarity: 'rare' }, { id: 127, rarity: 'rare' }, { id: 113, rarity: 'epic' }, { id: 133, rarity: 'legendary' }],
  // Map 4 — Ecruteak / Routes 36–38, Burned Tower. Ghosts and fire: Gastly (92)
  // and Misdreavus (200) haunt the tower; Growlithe (58) and Vulpix (37) are
  // Route 36–37. Stantler (234) roams Route 37 — the chase.
  [{ id: 92, rarity: 'common' }, { id: 58, rarity: 'common' }, { id: 37, rarity: 'common' }, { id: 77, rarity: 'common' }, { id: 96, rarity: 'common' }, { id: 52, rarity: 'common' }, { id: 218, rarity: 'common' }, { id: 228, rarity: 'rare' }, { id: 200, rarity: 'rare' }, { id: 126, rarity: 'rare' }, { id: 93, rarity: 'epic' }, { id: 234, rarity: 'legendary' }],
  // Map 5 — Cianwood / Routes 40–41, Whirl Islands. Water and fighting:
  // Tentacool (72), Krabby (98), Shellder (90), Chinchou (170). Tyrogue (236)
  // is the Cianwood gift; Mantine (226) the Route 41 rarity — the chase.
  [{ id: 72, rarity: 'common' }, { id: 98, rarity: 'common' }, { id: 90, rarity: 'common' }, { id: 170, rarity: 'common' }, { id: 66, rarity: 'common' }, { id: 116, rarity: 'common' }, { id: 120, rarity: 'common' }, { id: 236, rarity: 'rare' }, { id: 211, rarity: 'rare' }, { id: 222, rarity: 'rare' }, { id: 223, rarity: 'rare' }, { id: 91, rarity: 'epic' }, { id: 226, rarity: 'legendary' }],
  // Map 6 — Olivine / Route 39, Lighthouse. Steel and normal: Magnemite (81)
  // and Pineco (204) in the tower, Miltank (241) and Tauros (128) on the farm
  // route. Girafarig (203) is Route 43; Porygon (137) the chase.
  [{ id: 81, rarity: 'common' }, { id: 100, rarity: 'common' }, { id: 205, rarity: 'common' }, { id: 55, rarity: 'common' }, { id: 128, rarity: 'common' }, { id: 241, rarity: 'common' }, { id: 203, rarity: 'rare' }, { id: 26, rarity: 'rare' }, { id: 82, rarity: 'rare' }, { id: 208, rarity: 'epic' }, { id: 137, rarity: 'legendary' }],
  // Map 7 — Mahogany / Routes 42–44, Ice Path, Lake of Rage. Ice and poison:
  // Swinub (220), Sneasel (215), Delibird (225) in the Path. Remoraid (223) and
  // Qwilfish (211) are Route 44's fishing; the red Gyarados (130) is the Lake
  // of Rage's set-piece — the chase.
  [{ id: 220, rarity: 'common' }, { id: 215, rarity: 'common' }, { id: 225, rarity: 'common' }, { id: 86, rarity: 'common' }, { id: 168, rarity: 'common' }, { id: 178, rarity: 'common' }, { id: 87, rarity: 'rare' }, { id: 124, rarity: 'rare' }, { id: 221, rarity: 'rare' }, { id: 89, rarity: 'rare' }, { id: 229, rarity: 'epic' }, { id: 130, rarity: 'legendary' }],
  // Map 8 — Blackthorn / Route 45, Dragon's Den, Victory Road (finale).
  // Dratini (147) is the Den's own line — Dragonair (148) also here, Dragonite
  // is Lance's. Larvitar (246) climbs Mt. Silver; Pupitar (247) the epic.
  // Tyranitar stays out of reach, earned by raising one.
  [{ id: 147, rarity: 'common' }, { id: 231, rarity: 'common' }, { id: 111, rarity: 'common' }, { id: 104, rarity: 'common' }, { id: 227, rarity: 'common' }, { id: 232, rarity: 'rare' }, { id: 217, rarity: 'rare' }, { id: 212, rarity: 'rare' }, { id: 148, rarity: 'rare' }, { id: 210, rarity: 'rare' }, { id: 247, rarity: 'epic' }, { id: 246, rarity: 'legendary' }],
]

// --- Legendary pools per map (Master Ball nodes) ---
// Tiered weakest→strongest so a Lv70 Ho-Oh can't appear while the player's
// team is still low level.
// The roaming beasts scale with the map they appear on: each is set to that
// map's gym leader's ace level, rounded down to a multiple of 5 (Morty 37 → 35,
// Chuck 46 → 45, Jasmine 55 → 55). So a beast is always a match for the boss
// guarding the same map rather than a flat Lv45 that is overlevelled on map 4
// and underlevelled on map 6.
const legBeasts = level => [
  { id: 243, level }, // Raikou
  { id: 244, level }, // Entei
  { id: 245, level }, // Suicune
]
const LEG_TOWER = [
  { id: 251, level: 60 }, // Celebi
  { id: 249, level: 70 }, // Lugia
  { id: 250, level: 70 }, // Ho-Oh
]
const LEGENDARY_POOLS = [
  [], [], [],        // Maps 1–3 — none
  legBeasts(35),     // Map 4 — Morty's ace is 37
  legBeasts(45),     // Map 5 — Chuck's ace is 46
  legBeasts(55),     // Map 6 — Jasmine's ace is 55
  LEG_TOWER,         // Map 7 — tower trio; the beasts are map 4–6 chases
  LEG_TOWER,         // Map 8
]

// --- Trainer node pools per map (which route-trainer icons can appear) ---
const TRAINER_POOLS = [
  ['Bug Catcher', 'Lass', 'Youngster', 'Sage'],
  ['Bug Catcher', 'Youngster', 'Twins', 'Firebreather', 'Bird Keeper'],
  ['Schoolkid', 'Beauty', 'Teacher', 'Young Couple', 'Super Nerd'],
  ['Medium', 'Kimono Girl', 'Sage', 'Firebreather'],
  ['Swimmer 1', 'Swimmer 2', 'Black Belt', 'Poke Maniac'],
  ['Scientist', 'Gentleman 1', 'Gentleman 2', 'Biker'],
  ['Boarder', 'Skier', 'Burglar', 'Juggler'],
  ['Ace Trainer 1', 'Ace Trainer 2', 'Black Belt', 'Poke Maniac', 'Biker'],
]

// Fixed boss per map (Map 1 is starter-assigned → handled in generate()).
const MAP_BOSSES = [null, 'Bugsy', 'Whitney', 'Morty', 'Chuck', 'Jasmine', 'Pryce', 'Clair']

// Shared edge layout (same node structure for all maps) — mirrors Kanto/Unova.
const MAP_EDGES = [
  [0, 1], [0, 2],
  [1, 3], [1, 4], [2, 4], [2, 5],
  [3, 6], [3, 7], [4, 7], [4, 8], [5, 8], [5, 9],
  [6, 10], [7, 10], [7, 11], [8, 11], [8, 12], [9, 12],
  [10, 13], [10, 14], [11, 14], [11, 15], [12, 15], [12, 16],
  [13, 17], [14, 17], [14, 18], [15, 18], [15, 19], [16, 19],
  [17, 20], [18, 20], [18, 21], [19, 21],
  [20, 22], [21, 22],
]

// The 8 maps are Johto's gym cities, in order (display-only labels).
const MAP_NAMES = [
  'Violet City', 'Azalea Town', 'Goldenrod City', 'Ecruteak City',
  'Cianwood City', 'Olivine City', 'Mahogany Town', 'Blackthorn City',
]

// One map image per city (thematic match to each gym's type).
const MAP_BACKGROUNDS = [bgFlying, bgBug, bgNormal, bgGhost, bgFighting, bgSteel, bgIce, bgDragon]

// Gym badges in map order (index i earned by beating map i's gym leader).
const BADGES = [
  { name: 'Zephyr Badge',  icon: badgeZephyr },
  { name: 'Hive Badge',    icon: badgeHive },
  { name: 'Plain Badge',   icon: badgePlain },
  { name: 'Fog Badge',     icon: badgeFog },
  { name: 'Storm Badge',   icon: badgeStorm },
  { name: 'Mineral Badge', icon: badgeMineral },
  { name: 'Glacier Badge', icon: badgeGlacier },
  { name: 'Rising Badge',  icon: badgeRising },
]

// --- Region config ---
export const johtoConfig = {
  name: 'Johto',
  generation: 2,
  damageMultiplier: 2,
  trainerSprites: TRAINER_SPRITES,
  trainerFullSprites: TRAINER_FULL_SPRITES,
  characters: CHARACTERS,
  catchPools: CATCH_POOLS,
  legendaryPools: LEGENDARY_POOLS,
  legendaryIds: [...new Set(LEGENDARY_POOLS.flat().map(l => l.id))],
  // Pokémart shelves — see game/shop.js and
  // docs/superpowers/specs/2026-07-31-map-shop-curation-design.md.
  //
  // `shopGeneric` is offered at EVERY map's shop; `shopPools[i]` is map i's
  // curated list. Only the heal is universal: a run that cannot buy a heal is
  // decided by map layout rather than by play. Everything else is curated, so
  // each shop reads as THAT TOWN's shop.
  shopGeneric: ['max_heal'],

  // One type-boost plate per map, matched to that map's GYM TYPE. Thematic, NOT
  // counter-typed: the plate sold on a map is the one that helps least against
  // that map's gym, which makes the shop where you invest in the NEXT map.
  //
  // The other two items per shelf come from what the TOWN is. Each shelf keeps
  // the price ladder — roughly $150 heal / $200-300 mid / $400+ ceiling — so a
  // player who does not know Johto still has a legible spread.
  shopPools: [
    // Map 1 — Violet: Sprout Tower, the sages' training ground. Eviolite and
    // Light Clay are the patient, defensive purchases the tower teaches.
    ['plate_flying', 'light_clay', 'eviolite'],
    // Map 2 — Azalea: Kurt's workshop, where apricorns become Poké Balls by
    // hand. Shell Bell is the crafted-item slot; Sitrus is Ilex Forest's berry.
    ['plate_bug', 'sitrus_berry', 'shell_bell'],
    // Map 3 — Goldenrod: THE DEPARTMENT STORE and the Game Corner. The only
    // Mega Revive vendor in the run, and the only shop that restocks the heal
    // to three. Placed at map 3 rather than Kanto's map 4 because Goldenrod is
    // Johto's own midpoint landmark — "save for Goldenrod" is the same strategy
    // one map earlier.
    ['plate_normal', 'mega_revive', { id: 'max_heal', stock: 3 }],
    // Map 4 — Ecruteak: Burned Tower and the Bell Tower, a town of ghosts.
    // Scope Lens is the medium's sight; Razor Claw the Sneasel line's own item.
    ['plate_ghost', 'scope_lens', 'razor_claw'],
    // Map 5 — Cianwood: the pharmacy town, reachable only by surf. Muscle Band
    // is Chuck's dojo; Expert Belt the reward for hitting the right type.
    ['plate_fighting', 'muscle_band', 'expert_belt'],
    // Map 6 — Olivine: the Lighthouse and the port. Jasmine's Steelix is the
    // wall — Rocky Helmet and Assault Vest are how you buy the same idea.
    ['plate_steel', 'rocky_helmet', 'assault_vest'],
    // Map 7 — Mahogany: the souvenir shop that is a Rocket front, and the Lake
    // of Rage above it. Type Prism is the only item that permanently rewrites
    // what a Pokémon is — sold by the town built on a disguise.
    ['plate_ice', 'life_orb', 'type_prism'],
    // Map 8 — Blackthorn: the dragon clan's town, last shop before the League.
    // You buy your second life here or you do not get one.
    ['plate_dragon', 'kings_rock', 'focus_sash'],
  ],
  badges: BADGES,
  // Battle data (see johto.teams.js) — read by the generic loop via config.
  trainerSpeciesPools: TRAINER_SPECIES_POOLS,
  trainerTypePools: TRAINER_TYPE_POOLS,
  bossTeams: BOSS_TEAMS,
  eliteFourTeams: ELITE_FOUR_TEAMS,
  // Lance's ace is the fully-evolved Johto starter that counters the player's pick.
  blueStarterCounter: LANCE_STARTER_COUNTER,
  rivalTeams: RIVAL_TEAMS,
  // Silver's map-3 ace: the mid-stage starter countering the player's pick,
  // appended at the roster's top level by game/rivals.js.
  rivalStarterCounters: RIVAL_STARTER_COUNTERS,
  mapLevelRanges: MAP_LEVEL_RANGES,
  // Catch offers use their own bands, not the trainer/grass ones.
  catchLevelRanges: CATCH_LEVEL_RANGES,
  // Catch tuning + generic draw algorithm (game/catch.js).
  catchTierBudget: CATCH_TIER_BUDGET,
  pickCatchOffer,
  // Map-1 boss depends on the chosen starter (all → Falkner); fallback is Falkner.
  starterBoss: STARTER_BOSS,
  // Species used when a map's catch/grass pool is empty (region-safe default).
  fallbackSpeciesId: 161,
  // Elite Four stage — a linear gauntlet after the 8th gym; beating the
  // champion wins the run. Teams live in ELITE_FOUR_TEAMS (johto.teams.js).
  eliteFour: [
    { name: 'Will',  type: 'psychic',  sprite: owWill,  fullSprite: fullWill },
    { name: 'Koga',  type: 'poison',   sprite: owKoga,  fullSprite: fullKoga },
    { name: 'Bruno', type: 'fighting', sprite: owBruno, fullSprite: fullBruno },
    { name: 'Karen', type: 'dark',     sprite: owKaren, fullSprite: fullKaren },
    { name: 'Lance', type: 'champion', sprite: owLance, fullSprite: fullLance, champion: true },
  ],
  maps: MAP_BACKGROUNDS.map((background, i) => ({
    name: MAP_NAMES[i],
    generate: (starter, { mode = 'classic', megaStoneAvailable = true } = {}) => {
      const boss = i === 0 ? (STARTER_BOSS[starter?.id] ?? 'Falkner') : MAP_BOSSES[i]
      // NOTE: buildRows is deliberately NOT given the safari options here.
      // Johto overwrites a node below, and baking before that fixup would
      // waste rng() draws on a node that is discarded. The bake runs after.
      const rows = buildRows(TRAINER_POOLS[i], boss, i, { megaStoneAvailable })
      if (i === 2) {
        rows[4][1] = { id: rows[4][1].id, type: NODE_TYPES.RIVAL, trainer: 'Silver', rivalTeam: 'silverEarlyGame' }
      }
      if (mode === 'safari') {
        bakeSafariSpecies(rows, {
          config: johtoConfig,
          mapIndex: i,
          maxSpeciesId: GEN_MAX_ID[2],
        })
      }
      return { region: 'Johto', mapIndex: i, rows }
    },
    edges: MAP_EDGES,
    background,
    grassIcon,
  })),
}
