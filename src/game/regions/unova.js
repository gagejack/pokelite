import { buildRows } from '../nodeMap.js'
import { pickCatchOffer, CATCH_TIER_BUDGET } from '../catch.js'
import { TRAINER_SPECIES_POOLS, BOSS_TEAMS, ELITE_FOUR_TEAMS, MAP_LEVEL_RANGES, CATCH_LEVEL_RANGES } from './unova.teams.js'
import { GEN_MAX_ID } from '../pokemon.js'

// --- Assets ---
import bgStriaton from '../../assets/regions/Unova/MapAssets/Striaton.png'
import bgNacrene from '../../assets/regions/Unova/MapAssets/Nacrene.png'
import bgCastelia from '../../assets/regions/Unova/MapAssets/Castelia.png'
import bgNimbasa from '../../assets/regions/Unova/MapAssets/Nimbasa.png'
import bgDriftveil from '../../assets/regions/Unova/MapAssets/Driftveil.png'
// Maps 6–8 have no authored Unova art yet, so they borrow Johto's type-themed
// backgrounds — same gym-leader type as the Unova map they stand in for
// (Mistralton/Skyla → flying, Icirrus/Brycen → ice, Opelucid/Drayden →
// dragon). Swap these for Unova-native art when it exists.
import bgFlying from '../../assets/regions/Unova/MapAssets/Flying.png'
import bgIce from '../../assets/regions/Unova/MapAssets/Ice.png'
import bgDragon from '../../assets/regions/Unova/MapAssets/Dragon.png'
import grassIcon from '../../assets/regions/Unova/MapAssets/BW_Dark_Grass_Sp.png'

// Gym badges — one per map (index 0–7), earned by beating that map's gym leader.
import badgeTrio from '../../assets/regions/Unova/Badges/Triobadge.webp'
import badgeBasic from '../../assets/regions/Unova/Badges/Basicbadge.webp'
import badgeInsect from '../../assets/regions/Unova/Badges/Insectbadge.webp'
import badgeBolt from '../../assets/regions/Unova/Badges/Boltbadge.webp'
import badgeQuake from '../../assets/regions/Unova/Badges/Quakebadge.webp'
import badgeJet from '../../assets/regions/Unova/Badges/Jetbadge.webp'
import badgeFreeze from '../../assets/regions/Unova/Badges/Freezebadge.webp'
import badgeLegend from '../../assets/regions/Unova/Badges/Legendbadge.webp'

// Trainer overworld sprites
import trainerYoungster from '../../assets/regions/Unova/Trainers Overworlds/Youngster.webp'
import trainerJanitor from '../../assets/regions/Unova/Trainers Overworlds/Janitor.webp'
import trainerNurseryAide from '../../assets/regions/Unova/Trainers Overworlds/Nursery Aide.webp'
import trainerHiker from '../../assets/regions/Unova/Trainers Overworlds/Hiker.webp'
import trainerRoughneck from '../../assets/regions/Unova/Trainers Overworlds/Roughneck.webp'
import trainerCyclistM from '../../assets/regions/Unova/Trainers Overworlds/Cyclist M.webp'
import trainerCyclistF from '../../assets/regions/Unova/Trainers Overworlds/Cyclist F.webp'
import trainerDepotAgent from '../../assets/regions/Unova/Trainers Overworlds/Depot Agent.webp'
import trainerRangerM from '../../assets/regions/Unova/Trainers Overworlds/Pokemon Ranger M.webp'
import trainerRangerF from '../../assets/regions/Unova/Trainers Overworlds/Pokemon Ranger F.webp'
import trainerPilot from '../../assets/regions/Unova/Trainers Overworlds/Pilot.webp'
import trainerBlackBelt from '../../assets/regions/Unova/Trainers Overworlds/Black Belt.webp'
import trainerFisher from '../../assets/regions/Unova/Trainers Overworlds/Fisher.webp'
import trainerBugCatcher from '../../assets/regions/Unova/Trainers Overworlds/Bug Catcher.webp'
import trainerBaker from '../../assets/regions/Unova/Trainers Overworlds/Baker.webp'
// Gym leader overworlds
import trainerChili from '../../assets/regions/Unova/Characters Overworlds/Chili.webp'
import trainerCilan from '../../assets/regions/Unova/Characters Overworlds/Cilan.webp'
import trainerCress from '../../assets/regions/Unova/Characters Overworlds/Cress.webp'
import trainerLenora from '../../assets/regions/Unova/Characters Overworlds/Lenora 1.webp'
import trainerBurgh from '../../assets/regions/Unova/Characters Overworlds/Burgh 1.webp'
import trainerElesa from '../../assets/regions/Unova/Characters Overworlds/Elesa 1.webp'
import trainerClay from '../../assets/regions/Unova/Characters Overworlds/Clay.webp'
import trainerSkyla from '../../assets/regions/Unova/Characters Overworlds/Skyla 1.webp'
import trainerBrycen from '../../assets/regions/Unova/Characters Overworlds/Brycen.webp'
import trainerDrayden from '../../assets/regions/Unova/Characters Overworlds/Drayden.webp'
// Elite Four + Champion overworlds
import owShauntal from '../../assets/regions/Unova/Characters Overworlds/Shauntal 1.webp'
import owGrimsley from '../../assets/regions/Unova/Characters Overworlds/Grimsley 1.webp'
import owCaitlin from '../../assets/regions/Unova/Characters Overworlds/Caitlin 1.webp'
import owMarshal from '../../assets/regions/Unova/Characters Overworlds/Marshal.webp'
import owAlder from '../../assets/regions/Unova/Characters Overworlds/Alder.webp'

// Trainer full battle sprites
import fullArtist from '../../assets/regions/Unova/Trainer Full Sprites/Artist.webp'
import fullBackers1 from '../../assets/regions/Unova/Trainer Full Sprites/Backers 1.webp'
import fullBackers2 from '../../assets/regions/Unova/Trainer Full Sprites/Backers 2.webp'
import fullBaker from '../../assets/regions/Unova/Trainer Full Sprites/Baker.webp'
import fullBeauty from '../../assets/regions/Unova/Trainer Full Sprites/Beauty.webp'
import fullBlackBelt from '../../assets/regions/Unova/Trainer Full Sprites/Black Belt.webp'
import fullBugCatcher from '../../assets/regions/Unova/Trainer Full Sprites/Bug Catcher.webp'
import fullCyclist1 from '../../assets/regions/Unova/Trainer Full Sprites/Cyclist 1.webp'
import fullCyclist2 from '../../assets/regions/Unova/Trainer Full Sprites/Cyclist 2.webp'
import fullDancer from '../../assets/regions/Unova/Trainer Full Sprites/Dancer.webp'
import fullDepotAgent from '../../assets/regions/Unova/Trainer Full Sprites/Depot Agent.webp'
import fullDoctor from '../../assets/regions/Unova/Trainer Full Sprites/Doctor.webp'
import fullFisher from '../../assets/regions/Unova/Trainer Full Sprites/Fisher.webp'
import fullGentleman from '../../assets/regions/Unova/Trainer Full Sprites/Gentleman.webp'
import fullHarlequin from '../../assets/regions/Unova/Trainer Full Sprites/Harlequin.webp'
import fullHiker from '../../assets/regions/Unova/Trainer Full Sprites/Hiker.webp'
import fullHoopster from '../../assets/regions/Unova/Trainer Full Sprites/Hoopster.webp'
import fullInfielder from '../../assets/regions/Unova/Trainer Full Sprites/Infielder.webp'
import fullJanitor from '../../assets/regions/Unova/Trainer Full Sprites/Janitor.webp'
import fullLady from '../../assets/regions/Unova/Trainer Full Sprites/Lady.webp'
import fullLinebacker from '../../assets/regions/Unova/Trainer Full Sprites/Linebacker.webp'
import fullSocialite from '../../assets/regions/Unova/Trainer Full Sprites/Socialite.webp'
import fullMaid from '../../assets/regions/Unova/Trainer Full Sprites/Maid.webp'
import fullMusician from '../../assets/regions/Unova/Trainer Full Sprites/Musician.webp'
import fullGuitarist from '../../assets/regions/Unova/Trainer Full Sprites/Guitarist.webp'
import fullNeoPlasmaGrunt1 from '../../assets/regions/Unova/Trainer Full Sprites/Neo Plasma Grunt 1.webp'
import fullNeoPlasmaGrunt2 from '../../assets/regions/Unova/Trainer Full Sprites/Neo Plasma Grunt 2.webp'
import fullNurse from '../../assets/regions/Unova/Trainer Full Sprites/Nurse.webp'
import fullNurseryAide from '../../assets/regions/Unova/Trainer Full Sprites/Nursery Aide.webp'
import fullClerk1 from '../../assets/regions/Unova/Trainer Full Sprites/Clerk 1.webp'
import fullClerk2 from '../../assets/regions/Unova/Trainer Full Sprites/Clerk 2.webp'
import fullClerk3 from '../../assets/regions/Unova/Trainer Full Sprites/Clerk 3.webp'
import fullPoliceman from '../../assets/regions/Unova/Trainer Full Sprites/Policeman.webp'
import fullParasolLady from '../../assets/regions/Unova/Trainer Full Sprites/Parasol Lady.webp'
import fullPilot from '../../assets/regions/Unova/Trainer Full Sprites/Pilot.webp'
import fullPlasmaGrunt1 from '../../assets/regions/Unova/Trainer Full Sprites/Plasma Grunt 1.webp'
import fullPlasmaGrunt2 from '../../assets/regions/Unova/Trainer Full Sprites/Plasma Grunt 2.webp'
import fullPokeFan1 from '../../assets/regions/Unova/Trainer Full Sprites/Poke Fan 1.webp'
import fullPokeFan2 from '../../assets/regions/Unova/Trainer Full Sprites/Poke Fan 2.webp'
import fullPokemonBreeder1 from '../../assets/regions/Unova/Trainer Full Sprites/Pokemon Breeder 1.webp'
import fullPokemonBreeder2 from '../../assets/regions/Unova/Trainer Full Sprites/Pokemon Breeder 2.webp'
import fullPokemonRanger1 from '../../assets/regions/Unova/Trainer Full Sprites/Pokemon Ranger 1.webp'
import fullPokemonRanger2 from '../../assets/regions/Unova/Trainer Full Sprites/Pokemon Ranger 2.webp'
import fullPsychic1 from '../../assets/regions/Unova/Trainer Full Sprites/Psychic 1.webp'
import fullPsychic2 from '../../assets/regions/Unova/Trainer Full Sprites/Psychic 2.webp'
import fullRichBoy from '../../assets/regions/Unova/Trainer Full Sprites/Rich Boy.webp'
import fullRoughneck from '../../assets/regions/Unova/Trainer Full Sprites/Roughneck.webp'
import fullScientist1 from '../../assets/regions/Unova/Trainer Full Sprites/Scientist 1.webp'
import fullScientist2 from '../../assets/regions/Unova/Trainer Full Sprites/Scientist 2.webp'
import fullShadowTriad from '../../assets/regions/Unova/Trainer Full Sprites/Shadow Triad.webp'
import fullSmasher from '../../assets/regions/Unova/Trainer Full Sprites/Smasher.webp'
import fullStriker from '../../assets/regions/Unova/Trainer Full Sprites/Striker.webp'
import fullSuitActor from '../../assets/regions/Unova/Trainer Full Sprites/Suit Actor.webp'
import fullSwimmer1 from '../../assets/regions/Unova/Trainer Full Sprites/Swimmer 1.webp'
import fullSwimmer2 from '../../assets/regions/Unova/Trainer Full Sprites/Swimmer 2.webp'
import fullWaiter from '../../assets/regions/Unova/Trainer Full Sprites/Waiter.webp'
import fullWaitress from '../../assets/regions/Unova/Trainer Full Sprites/Waitress.webp'
import fullYoungster from '../../assets/regions/Unova/Trainer Full Sprites/Youngster.webp'

// Boss full sprites (from character full sprites folder)
import fullChili from '../../assets/regions/Unova/Character Full Sprites/Chili.webp'
import fullCilan from '../../assets/regions/Unova/Character Full Sprites/Cilan.webp'
import fullCress from '../../assets/regions/Unova/Character Full Sprites/Cress.webp'
import fullLenora from '../../assets/regions/Unova/Character Full Sprites/Lenora 1.webp'
import fullBurgh from '../../assets/regions/Unova/Character Full Sprites/Burgh 1.webp'
import fullElesa from '../../assets/regions/Unova/Character Full Sprites/Elesa 1.webp'
import fullClay from '../../assets/regions/Unova/Character Full Sprites/Clay.webp'
import fullSkyla from '../../assets/regions/Unova/Character Full Sprites/Skyla 1.webp'
import fullBrycen from '../../assets/regions/Unova/Character Full Sprites/Brycen.webp'
import fullDrayden from '../../assets/regions/Unova/Character Full Sprites/Drayden.webp'

// Character full sprites
import Alder from '../../assets/regions/Unova/Character Full Sprites/Alder.webp'
import Anthea1 from '../../assets/regions/Unova/Character Full Sprites/Anthea 1.webp'
import Anthea2 from '../../assets/regions/Unova/Character Full Sprites/Anthea 2.webp'
import AureaJuniper from '../../assets/regions/Unova/Character Full Sprites/Aurea Juniper.webp'
import Benga from '../../assets/regions/Unova/Character Full Sprites/Benga.webp'
import Bianca1 from '../../assets/regions/Unova/Character Full Sprites/Bianca 1.webp'
import Bianca2 from '../../assets/regions/Unova/Character Full Sprites/Bianca 2.webp'
import Bianca3 from '../../assets/regions/Unova/Character Full Sprites/Bianca 3.webp'
import Brycen from '../../assets/regions/Unova/Character Full Sprites/Brycen.webp'
import Burgh1 from '../../assets/regions/Unova/Character Full Sprites/Burgh 1.webp'
import Burgh2 from '../../assets/regions/Unova/Character Full Sprites/Burgh 2.webp'
import Caitlin1 from '../../assets/regions/Unova/Character Full Sprites/Caitlin 1.webp'
import Caitlin2 from '../../assets/regions/Unova/Character Full Sprites/Caitlin 2.webp'
import CedricJuniper from '../../assets/regions/Unova/Character Full Sprites/Cedric Juniper.webp'
import Cheren1 from '../../assets/regions/Unova/Character Full Sprites/Cheren 1.webp'
import Cheren2 from '../../assets/regions/Unova/Character Full Sprites/Cheren 2.webp'
import Cheren3 from '../../assets/regions/Unova/Character Full Sprites/Cheren 3.webp'
import Chili from '../../assets/regions/Unova/Character Full Sprites/Chili.webp'
import Christoph from '../../assets/regions/Unova/Character Full Sprites/Christoph.webp'
import Cilan from '../../assets/regions/Unova/Character Full Sprites/Cilan.webp'
import Clay from '../../assets/regions/Unova/Character Full Sprites/Clay.webp'
import Colress from '../../assets/regions/Unova/Character Full Sprites/Colress.webp'
import Concordia1 from '../../assets/regions/Unova/Character Full Sprites/Concordia 1.webp'
import Concordia2 from '../../assets/regions/Unova/Character Full Sprites/Concordia 2.webp'
import Cress from '../../assets/regions/Unova/Character Full Sprites/Cress.webp'
import Curtis from '../../assets/regions/Unova/Character Full Sprites/Curtis.webp'
import Drayden from '../../assets/regions/Unova/Character Full Sprites/Drayden.webp'
import Elesa1 from '../../assets/regions/Unova/Character Full Sprites/Elesa 1.webp'
import Elesa2 from '../../assets/regions/Unova/Character Full Sprites/Elesa 2.webp'
import Elesa3 from '../../assets/regions/Unova/Character Full Sprites/Elesa 3.webp'
import Elesa4 from '../../assets/regions/Unova/Character Full Sprites/Elesa 4.webp'
import Elesa5 from '../../assets/regions/Unova/Character Full Sprites/Elesa 5.webp'
import Elesa6 from '../../assets/regions/Unova/Character Full Sprites/Elesa 6.webp'
import Emmet1 from '../../assets/regions/Unova/Character Full Sprites/Emmet 1.webp'
import Emmet2 from '../../assets/regions/Unova/Character Full Sprites/Emmet 2.webp'
import Fennel from '../../assets/regions/Unova/Character Full Sprites/Fennel.webp'
import Ghetsis1 from '../../assets/regions/Unova/Character Full Sprites/Ghetsis 1.webp'
import Ghetsis2 from '../../assets/regions/Unova/Character Full Sprites/Ghetsis 2.webp'
import Grimsley1 from '../../assets/regions/Unova/Character Full Sprites/Grimsley 1.webp'
import Grimsley2 from '../../assets/regions/Unova/Character Full Sprites/Grimsley 2.webp'
import Hilbert1 from '../../assets/regions/Unova/Character Full Sprites/Hilbert 1.webp'
import Hilbert2 from '../../assets/regions/Unova/Character Full Sprites/Hilbert 2.webp'
import Hilbert3 from '../../assets/regions/Unova/Character Full Sprites/Hilbert 3.webp'
import Hilbert4 from '../../assets/regions/Unova/Character Full Sprites/Hilbert 4.webp'
import Hilda1 from '../../assets/regions/Unova/Character Full Sprites/Hilda 1.webp'
import Hilda2 from '../../assets/regions/Unova/Character Full Sprites/Hilda 2.webp'
import Hilda3 from '../../assets/regions/Unova/Character Full Sprites/Hilda 3.webp'
import Hilda4 from '../../assets/regions/Unova/Character Full Sprites/Hilda 4.webp'
import Hilda5 from '../../assets/regions/Unova/Character Full Sprites/Hilda 5.webp'
import Hugh1 from '../../assets/regions/Unova/Character Full Sprites/Hugh 1.webp'
import Hugh2 from '../../assets/regions/Unova/Character Full Sprites/Hugh 2.webp'
import Ingo1 from '../../assets/regions/Unova/Character Full Sprites/Ingo 1.webp'
import Ingo2 from '../../assets/regions/Unova/Character Full Sprites/Ingo 2.webp'
import Iris1 from '../../assets/regions/Unova/Character Full Sprites/Iris 1.webp'
import Iris2 from '../../assets/regions/Unova/Character Full Sprites/Iris 2.webp'
import Iris3 from '../../assets/regions/Unova/Character Full Sprites/Iris 3.webp'
import Iris4 from '../../assets/regions/Unova/Character Full Sprites/Iris 4.webp'
import Lenora1 from '../../assets/regions/Unova/Character Full Sprites/Lenora 1.webp'
import Lenora2 from '../../assets/regions/Unova/Character Full Sprites/Lenora 2.webp'
import Marlon from '../../assets/regions/Unova/Character Full Sprites/Marlon.webp'
import Marshal from '../../assets/regions/Unova/Character Full Sprites/Marshal.webp'
import Mom1 from '../../assets/regions/Unova/Character Full Sprites/Mom 1.webp'
import Mom2 from '../../assets/regions/Unova/Character Full Sprites/Mom 2.webp'
import N1 from '../../assets/regions/Unova/Character Full Sprites/N 1.webp'
import N2 from '../../assets/regions/Unova/Character Full Sprites/N 2.webp'
import N3 from '../../assets/regions/Unova/Character Full Sprites/N 3.webp'
import N4 from '../../assets/regions/Unova/Character Full Sprites/N 4.webp'
import N5 from '../../assets/regions/Unova/Character Full Sprites/N 5.webp'
import Nancy from '../../assets/regions/Unova/Character Full Sprites/Nancy.webp'
import Nate1 from '../../assets/regions/Unova/Character Full Sprites/Nate 1.webp'
import Nate2 from '../../assets/regions/Unova/Character Full Sprites/Nate 2.webp'
import Nate3 from '../../assets/regions/Unova/Character Full Sprites/Nate 3.webp'
import RioluGirl from '../../assets/regions/Unova/Character Full Sprites/Riolu Girl.webp'
import RioluKid from '../../assets/regions/Unova/Character Full Sprites/Riolu Kid.webp'
import Rood from '../../assets/regions/Unova/Character Full Sprites/Rood.webp'
import Rosa1 from '../../assets/regions/Unova/Character Full Sprites/Rosa 1.webp'
import Rosa2 from '../../assets/regions/Unova/Character Full Sprites/Rosa 2.webp'
import Rosa3 from '../../assets/regions/Unova/Character Full Sprites/Rosa 3.webp'
import Rosa4 from '../../assets/regions/Unova/Character Full Sprites/Rosa 4.webp'
import Rosa5 from '../../assets/regions/Unova/Character Full Sprites/Rosa 5.webp'
import Rosa6 from '../../assets/regions/Unova/Character Full Sprites/Rosa 6.webp'
import Roxie1 from '../../assets/regions/Unova/Character Full Sprites/Roxie 1.webp'
import Roxie2 from '../../assets/regions/Unova/Character Full Sprites/Roxie 2.webp'
import Shauntal1 from '../../assets/regions/Unova/Character Full Sprites/Shauntal 1.webp'
import Shauntal2 from '../../assets/regions/Unova/Character Full Sprites/Shauntal 2.webp'
import Skyla1 from '../../assets/regions/Unova/Character Full Sprites/Skyla 1.webp'
import Skyla2 from '../../assets/regions/Unova/Character Full Sprites/Skyla 2.webp'
import Skyla3 from '../../assets/regions/Unova/Character Full Sprites/Skyla 3.webp'
import Skyla4 from '../../assets/regions/Unova/Character Full Sprites/Skyla 4.webp'
import Yancy from '../../assets/regions/Unova/Character Full Sprites/Yancy.webp'
import Zinzolin from '../../assets/regions/Unova/Character Full Sprites/Zinzolin.webp'

// --- Catch pool (Map 1 — early Unova routes) ---
// IDs for Pokémon catchable on early Unova routes (Route 1-3 equivalent)
export const CATCH_POOL_MAP_1 = [
  504, // Patrat
  506, // Lillipup
  509, // Purrloin
  519, // Pidove
  522, // Blitzle
  540, // Sewaddle
  543, // Venipede
  551, // Sandile
  554, // Darumaka
  556, // Maractus
  559, // Scraggy
  562, // Yamask
  566, // Archen
  568, // Trubbish
  577, // Solosis
  580, // Ducklett
]

// --- Characters ---
const CHARACTERS = [
  { id: 'Alder',          name: 'Alder',         sprite: Alder },
  { id: 'Anthea 1',       name: 'Anthea',        sprite: Anthea1 },
  { id: 'Anthea 2',       name: 'Anthea',        sprite: Anthea2 },
  { id: 'Aurea Juniper',  name: 'Aurea Juniper', sprite: AureaJuniper },
  { id: 'Benga',          name: 'Benga',         sprite: Benga },
  { id: 'Bianca 1',       name: 'Bianca',        sprite: Bianca1 },
  { id: 'Bianca 2',       name: 'Bianca',        sprite: Bianca2 },
  { id: 'Bianca 3',       name: 'Bianca',        sprite: Bianca3 },
  { id: 'Brycen',         name: 'Brycen',        sprite: Brycen },
  { id: 'Burgh 1',        name: 'Burgh',         sprite: Burgh1 },
  { id: 'Burgh 2',        name: 'Burgh',         sprite: Burgh2 },
  { id: 'Caitlin 1',      name: 'Caitlin',       sprite: Caitlin1 },
  { id: 'Caitlin 2',      name: 'Caitlin',       sprite: Caitlin2 },
  { id: 'Cedric Juniper', name: 'Cedric Juniper',sprite: CedricJuniper },
  { id: 'Cheren 1',       name: 'Cheren',        sprite: Cheren1 },
  { id: 'Cheren 2',       name: 'Cheren',        sprite: Cheren2 },
  { id: 'Cheren 3',       name: 'Cheren',        sprite: Cheren3 },
  { id: 'Chili',          name: 'Chili',         sprite: Chili },
  { id: 'Christoph',      name: 'Christoph',     sprite: Christoph },
  { id: 'Cilan',          name: 'Cilan',         sprite: Cilan },
  { id: 'Clay',           name: 'Clay',          sprite: Clay },
  { id: 'Colress',        name: 'Colress',       sprite: Colress },
  { id: 'Concordia 1',    name: 'Concordia',     sprite: Concordia1 },
  { id: 'Concordia 2',    name: 'Concordia',     sprite: Concordia2 },
  { id: 'Cress',          name: 'Cress',         sprite: Cress },
  { id: 'Curtis',         name: 'Curtis',        sprite: Curtis },
  { id: 'Drayden',        name: 'Drayden',       sprite: Drayden },
  { id: 'Elesa 1',        name: 'Elesa',         sprite: Elesa1 },
  { id: 'Elesa 2',        name: 'Elesa',         sprite: Elesa2 },
  { id: 'Elesa 3',        name: 'Elesa',         sprite: Elesa3 },
  { id: 'Elesa 4',        name: 'Elesa',         sprite: Elesa4 },
  { id: 'Elesa 5',        name: 'Elesa',         sprite: Elesa5 },
  { id: 'Elesa 6',        name: 'Elesa',         sprite: Elesa6 },
  { id: 'Emmet 1',        name: 'Emmet',         sprite: Emmet1 },
  { id: 'Emmet 2',        name: 'Emmet',         sprite: Emmet2 },
  { id: 'Fennel',         name: 'Fennel',        sprite: Fennel },
  { id: 'Ghetsis 1',      name: 'Ghetsis',       sprite: Ghetsis1 },
  { id: 'Ghetsis 2',      name: 'Ghetsis',       sprite: Ghetsis2 },
  { id: 'Grimsley 1',     name: 'Grimsley',      sprite: Grimsley1 },
  { id: 'Grimsley 2',     name: 'Grimsley',      sprite: Grimsley2 },
  { id: 'Hilbert 1',      name: 'Hilbert',       sprite: Hilbert1 },
  { id: 'Hilbert 2',      name: 'Hilbert',       sprite: Hilbert2 },
  { id: 'Hilbert 3',      name: 'Hilbert',       sprite: Hilbert3 },
  { id: 'Hilbert 4',      name: 'Hilbert',       sprite: Hilbert4 },
  { id: 'Hilda 1',        name: 'Hilda',         sprite: Hilda1 },
  { id: 'Hilda 2',        name: 'Hilda',         sprite: Hilda2 },
  { id: 'Hilda 3',        name: 'Hilda',         sprite: Hilda3 },
  { id: 'Hilda 4',        name: 'Hilda',         sprite: Hilda4 },
  { id: 'Hilda 5',        name: 'Hilda',         sprite: Hilda5 },
  { id: 'Hugh 1',         name: 'Hugh',          sprite: Hugh1 },
  { id: 'Hugh 2',         name: 'Hugh',          sprite: Hugh2 },
  { id: 'Ingo 1',         name: 'Ingo',          sprite: Ingo1 },
  { id: 'Ingo 2',         name: 'Ingo',          sprite: Ingo2 },
  { id: 'Iris 1',         name: 'Iris',          sprite: Iris1 },
  { id: 'Iris 2',         name: 'Iris',          sprite: Iris2 },
  { id: 'Iris 3',         name: 'Iris',          sprite: Iris3 },
  { id: 'Iris 4',         name: 'Iris',          sprite: Iris4 },
  { id: 'Lenora 1',       name: 'Lenora',        sprite: Lenora1 },
  { id: 'Lenora 2',       name: 'Lenora',        sprite: Lenora2 },
  { id: 'Marlon',         name: 'Marlon',        sprite: Marlon },
  { id: 'Marshal',        name: 'Marshal',       sprite: Marshal },
  { id: 'Mom 1',          name: 'Mom',           sprite: Mom1 },
  { id: 'Mom 2',          name: 'Mom',           sprite: Mom2 },
  { id: 'N 1',            name: 'N',             sprite: N1 },
  { id: 'N 2',            name: 'N',             sprite: N2 },
  { id: 'N 3',            name: 'N',             sprite: N3 },
  { id: 'N 4',            name: 'N',             sprite: N4 },
  { id: 'N 5',            name: 'N',             sprite: N5 },
  { id: 'Nancy',          name: 'Nancy',         sprite: Nancy },
  { id: 'Nate 1',         name: 'Nate',          sprite: Nate1 },
  { id: 'Nate 2',         name: 'Nate',          sprite: Nate2 },
  { id: 'Nate 3',         name: 'Nate',          sprite: Nate3 },
  { id: 'Riolu Girl',     name: 'Riolu Girl',    sprite: RioluGirl },
  { id: 'Riolu Kid',      name: 'Riolu Kid',     sprite: RioluKid },
  { id: 'Rood',           name: 'Rood',          sprite: Rood },
  { id: 'Rosa 1',         name: 'Rosa',          sprite: Rosa1 },
  { id: 'Rosa 2',         name: 'Rosa',          sprite: Rosa2 },
  { id: 'Rosa 3',         name: 'Rosa',          sprite: Rosa3 },
  { id: 'Rosa 4',         name: 'Rosa',          sprite: Rosa4 },
  { id: 'Rosa 5',         name: 'Rosa',          sprite: Rosa5 },
  { id: 'Rosa 6',         name: 'Rosa',          sprite: Rosa6 },
  { id: 'Roxie 1',        name: 'Roxie',         sprite: Roxie1 },
  { id: 'Roxie 2',        name: 'Roxie',         sprite: Roxie2 },
  { id: 'Shauntal 1',     name: 'Shauntal',      sprite: Shauntal1 },
  { id: 'Shauntal 2',     name: 'Shauntal',      sprite: Shauntal2 },
  { id: 'Skyla 1',        name: 'Skyla',         sprite: Skyla1 },
  { id: 'Skyla 2',        name: 'Skyla',         sprite: Skyla2 },
  { id: 'Skyla 3',        name: 'Skyla',         sprite: Skyla3 },
  { id: 'Skyla 4',        name: 'Skyla',         sprite: Skyla4 },
  { id: 'Yancy',          name: 'Yancy',         sprite: Yancy },
  { id: 'Zinzolin',       name: 'Zinzolin',      sprite: Zinzolin },
]

// --- Trainer full battle sprites ---
const TRAINER_FULL_SPRITES = {
  // Roaming type specialists — appear on every map
  'Fisher':             fullFisher,
  'Bug Catcher':        fullBugCatcher,
  'Baker':              fullBaker,
  // Fixed-route specialists
  'Youngster':          fullYoungster,
  'Nursery Aide':       fullNurseryAide,
  'Hiker':              fullHiker,
  'Black Belt':         fullBlackBelt,
  'Cyclist M':          fullCyclist1,
  'Cyclist F':          fullCyclist2,
  'Depot Agent':        fullDepotAgent,
  'Pilot':              fullPilot,
  'Pokemon Ranger M':   fullPokemonRanger1,
  'Pokemon Ranger F':   fullPokemonRanger2,
  'Janitor':            fullJanitor,
  'Roughneck':          fullRoughneck,
  // Non-route trainer classes (not part of TRAINER_POOLS placement)
  'Artist':             fullArtist,
  'Backers M':          fullBackers1,
  'Backers F':          fullBackers2,
  'Beauty':             fullBeauty,
  'Dancer':             fullDancer,
  'Doctor':             fullDoctor,
  'Gentleman':          fullGentleman,
  'Harlequin':          fullHarlequin,
  'Hoopster':           fullHoopster,
  'Infielder':          fullInfielder,
  'Lady':               fullLady,
  'Linebacker':         fullLinebacker,
  'Socialite':          fullSocialite,
  'Maid':               fullMaid,
  'Musician':           fullMusician,
  'Guitarist':          fullGuitarist,
  'Neo Plasma Grunt M': fullNeoPlasmaGrunt1,
  'Neo Plasma Grunt F': fullNeoPlasmaGrunt2,
  'Nurse':              fullNurse,
  'Clerk M':            fullClerk1,
  'Clerk F':            fullClerk2,
  'Clerk':              fullClerk3,
  'Policeman':          fullPoliceman,
  'Parasol Lady':       fullParasolLady,
  'Plasma Grunt M':     fullPlasmaGrunt1,
  'Plasma Grunt F':     fullPlasmaGrunt2,
  'Poke Fan M':         fullPokeFan1,
  'Poke Fan F':         fullPokeFan2,
  'Pokemon Breeder M':  fullPokemonBreeder1,
  'Pokemon Breeder F':  fullPokemonBreeder2,
  'Psychic M':          fullPsychic1,
  'Psychic F':          fullPsychic2,
  'Rich Boy':           fullRichBoy,
  'Scientist M':        fullScientist1,
  'Scientist F':        fullScientist2,
  'Shadow Triad':       fullShadowTriad,
  'Smasher':            fullSmasher,
  'Striker':            fullStriker,
  'Suit Actor':         fullSuitActor,
  'Swimmer M':          fullSwimmer1,
  'Swimmer F':          fullSwimmer2,
  'Waiter':             fullWaiter,
  'Waitress':           fullWaitress,
  // Bosses
  'Chili':   fullChili,
  'Cilan':   fullCilan,
  'Cress':   fullCress,
  'Lenora':  fullLenora,
  'Burgh':   fullBurgh,
  'Elesa':   fullElesa,
  'Clay':    fullClay,
  'Skyla':   fullSkyla,
  'Brycen':  fullBrycen,
  'Drayden': fullDrayden,
  // Elite Four + Champion (Character Full Sprites, already imported above)
  'Shauntal': Shauntal1,
  'Grimsley': Grimsley1,
  'Caitlin':  Caitlin1,
  'Marshal':  Marshal,
  'Alder':    Alder,
}

// --- Trainer overworld sprites ---
const TRAINER_SPRITES = {
  // Roaming type specialists — appear on every map
  'Fisher':           trainerFisher,
  'Bug Catcher':      trainerBugCatcher,
  'Baker':            trainerBaker,
  // Fixed-route specialists
  'Youngster':        trainerYoungster,
  'Nursery Aide':     trainerNurseryAide,
  'Hiker':            trainerHiker,
  'Black Belt':       trainerBlackBelt,
  'Cyclist M':        trainerCyclistM,
  'Cyclist F':        trainerCyclistF,
  'Depot Agent':      trainerDepotAgent,
  'Pilot':            trainerPilot,
  'Pokemon Ranger M': trainerRangerM,
  'Pokemon Ranger F': trainerRangerF,
  'Janitor':          trainerJanitor,
  'Roughneck':        trainerRoughneck,
  // Gym leaders
  'Chili':            trainerChili,
  'Cilan':            trainerCilan,
  'Cress':            trainerCress,
  'Lenora':           trainerLenora,
  'Burgh':            trainerBurgh,
  'Elesa':            trainerElesa,
  'Clay':             trainerClay,
  'Skyla':            trainerSkyla,
  'Brycen':           trainerBrycen,
  'Drayden':          trainerDrayden,
}

// Snivy(495) → Chili(Fire), Tepig(498) → Cress(Water), Oshawott(501) → Cilan(Grass)
const STARTER_BOSS = {
  495: 'Chili',
  498: 'Cress',
  501: 'Cilan',
}

// --- Catch pools per map ---
// Each entry is { id, rarity }. Pokéball nodes draw 3 by rarity weight (see
// pickCatchOffer). Pools are evolution-gated by band: early maps hold base
// forms, late maps hold evolved forms (a species only appears where its band
// can reach its evolution level). Every non-legendary Unova line has at least
// one representative across the 8 maps; each species appears on only one map.
// Rarity mirrors the item system (common/rare/epic/legendary, 60/25/10/5).
const CATCH_POOLS = [
  // Map 1 — Routes 1–2 (base forms): patrat, lillipup, purrloin, pidove, blitzle,
  // sewaddle, venipede, scraggy, sandile, zorua
  [{ id: 504, rarity: 'common' }, { id: 506, rarity: 'common' }, { id: 509, rarity: 'common' }, { id: 519, rarity: 'common' }, { id: 522, rarity: 'common' }, { id: 540, rarity: 'common' }, { id: 543, rarity: 'common' }, { id: 559, rarity: 'rare' }, { id: 551, rarity: 'epic' }, { id: 570, rarity: 'legendary' }],
  // Map 2 — Route 3: pansage, pansear, panpour, roggenrola, woobat, drilbur,
  // timburr, tympole, cottonee, petilil, munna, audino
  [{ id: 511, rarity: 'common' }, { id: 513, rarity: 'common' }, { id: 515, rarity: 'common' }, { id: 524, rarity: 'common' }, { id: 527, rarity: 'common' }, { id: 529, rarity: 'common' }, { id: 532, rarity: 'common' }, { id: 535, rarity: 'common' }, { id: 546, rarity: 'common' }, { id: 548, rarity: 'rare' }, { id: 517, rarity: 'epic' }, { id: 531, rarity: 'legendary' }],
  // Map 3 — Route 4 (desert): watchog, darumaka, dwebble, yamask, trubbish,
  // basculin, maractus, sigilyph, sawk
  [{ id: 505, rarity: 'common' }, { id: 554, rarity: 'common' }, { id: 557, rarity: 'common' }, { id: 562, rarity: 'common' }, { id: 568, rarity: 'common' }, { id: 550, rarity: 'rare' }, { id: 556, rarity: 'rare' }, { id: 561, rarity: 'epic' }, { id: 539, rarity: 'legendary' }],
  // Map 4 — Route 6 (electric): zebstrika, gurdurr, palpitoad, whirlipede,
  // krokorok, excadrill, emolga, darmanitan, galvantula
  [{ id: 523, rarity: 'common' }, { id: 533, rarity: 'common' }, { id: 536, rarity: 'common' }, { id: 544, rarity: 'common' }, { id: 552, rarity: 'common' }, { id: 530, rarity: 'rare' }, { id: 587, rarity: 'rare' }, { id: 555, rarity: 'epic' }, { id: 596, rarity: 'legendary' }],
  // Map 5 — Route 7 (finals): leavanny, scolipede, crustle, cofagrigus, garbodor,
  // sawsbuck, bouffalant, whimsicott, lilligant, carracosta, archeops, scrafty,
  // amoonguss, throh
  [{ id: 542, rarity: 'common' }, { id: 545, rarity: 'common' }, { id: 558, rarity: 'common' }, { id: 563, rarity: 'common' }, { id: 569, rarity: 'common' }, { id: 586, rarity: 'common' }, { id: 626, rarity: 'common' }, { id: 547, rarity: 'rare' }, { id: 549, rarity: 'rare' }, { id: 565, rarity: 'rare' }, { id: 567, rarity: 'rare' }, { id: 560, rarity: 'epic' }, { id: 591, rarity: 'epic' }, { id: 538, rarity: 'legendary' }],
  // Map 6 — Route 8 (flying/water): musharna, swoobat, seismitoad, cinccino,
  // swanna, jellicent, alomomola, gigalith, eelektrik, zoroark, krookodile
  [{ id: 518, rarity: 'common' }, { id: 528, rarity: 'common' }, { id: 537, rarity: 'common' }, { id: 573, rarity: 'common' }, { id: 581, rarity: 'common' }, { id: 593, rarity: 'common' }, { id: 594, rarity: 'common' }, { id: 526, rarity: 'rare' }, { id: 603, rarity: 'rare' }, { id: 571, rarity: 'epic' }, { id: 553, rarity: 'legendary' }],
  // Map 7 — Route 9 (ice): gothitelle, reuniclus, vanilluxe, beheeyem, beartic,
  // golurk, heatmor, mienshao, cryogonal, chandelure
  [{ id: 576, rarity: 'common' }, { id: 579, rarity: 'common' }, { id: 584, rarity: 'common' }, { id: 606, rarity: 'common' }, { id: 614, rarity: 'common' }, { id: 623, rarity: 'common' }, { id: 631, rarity: 'common' }, { id: 620, rarity: 'rare' }, { id: 615, rarity: 'epic' }, { id: 609, rarity: 'legendary' }],
  // Map 8 — Route 16 (dragon finale): escavalier, ferrothorn, klinklang,
  // eelektross, stunfisk, bisharp, accelgor, druddigon, braviary, mandibuzz,
  // durant, haxorus, hydreigon, volcarona
  [{ id: 589, rarity: 'common' }, { id: 598, rarity: 'common' }, { id: 601, rarity: 'common' }, { id: 604, rarity: 'common' }, { id: 618, rarity: 'common' }, { id: 625, rarity: 'common' }, { id: 617, rarity: 'rare' }, { id: 621, rarity: 'rare' }, { id: 628, rarity: 'rare' }, { id: 630, rarity: 'rare' }, { id: 632, rarity: 'rare' }, { id: 612, rarity: 'epic' }, { id: 635, rarity: 'epic' }, { id: 637, rarity: 'legendary' }],
]

// --- Legendary pools per map (Master Ball nodes) ---
// Fixed levels per species (not position-scaled). Tiered weakest→strongest so a
// Lv70 Kyurem can't appear while the player's team is still low level.
const LEG_MUSKETEERS = [
  { id: 638, level: 40 }, // Cobalion
  { id: 639, level: 40 }, // Terrakion
  { id: 640, level: 40 }, // Virizion
]
const LEG_FORCES = [
  { id: 641, level: 45 }, // Tornadus
  { id: 642, level: 45 }, // Thundurus
  { id: 647, level: 45 }, // Keldeo
  { id: 649, level: 50 }, // Genesect
]
const LEG_TAO = [
  { id: 643, level: 65 }, // Reshiram
  { id: 644, level: 65 }, // Zekrom
  { id: 646, level: 75 }, // Kyurem
]
const LEGENDARY_POOLS = [
  [],                                                 // Map 1 — none
  [],                                                 // Map 2 — none
  LEG_MUSKETEERS,                                     // Map 3
  LEG_MUSKETEERS,                                     // Map 4
  LEG_MUSKETEERS,                                     // Map 5
  [...LEG_MUSKETEERS, ...LEG_FORCES],                 // Map 6
  [...LEG_MUSKETEERS, ...LEG_FORCES],                 // Map 7
  [...LEG_MUSKETEERS, ...LEG_FORCES, ...LEG_TAO],     // Map 8
]

// --- Trainer pools per map ---
// --- Themed species pools per trainer class ---
// Every route trainer is a type specialist: the pool is every Unova line
// carrying that type (dual-types included), minus starters and legendaries.
// Base forms only — rollStageForLevel picks the evolution stage by level, so
// one entry covers the whole line (Tympole on map 2, Seismitoad on map 6).
// Availability per map is gated by SPECIES_MIN_MAP below.
const TRAINER_TYPE_POOLS = {
  // Water
  'Fisher':           [515, 535, 550, 564, 580, 592, 594],
  // Bug
  'Bug Catcher':      [540, 543, 557, 588, 595, 616, 632, 636],
  // Fire
  'Baker':            [513, 554, 607, 631, 636],
  // Normal — early-route half (Nursery Aide takes the caretaker half)
  'Youngster':        [504, 506, 519, 627],
  // Normal — caretaker half
  'Nursery Aide':     [531, 572, 585, 626],
  // Ground / Rock
  'Hiker':            [524, 529, 536, 551, 557, 564, 566, 618, 622],
  // Fighting
  'Black Belt':       [532, 538, 539, 559, 619],
  // Electric
  'Cyclist M':        [522, 587, 595, 602, 618],
  'Cyclist F':        [522, 587, 595, 602, 618],
  // Steel
  'Depot Agent':      [530, 589, 597, 599, 624, 632],
  // Flying
  'Pilot':            [519, 527, 561, 566, 580, 587, 627, 629],
  // Grass
  'Pokemon Ranger M': [511, 540, 546, 548, 556, 585, 590, 597],
  'Pokemon Ranger F': [511, 540, 546, 548, 556, 585, 590, 597],
  // Poison
  'Janitor':          [543, 568, 590],
  // Dark
  'Roughneck':        [509, 551, 559, 570, 624, 629, 633],
}

// First map (1-based) each species may appear on a trainer's team. Seeded from
// CATCH_POOLS (when the line first becomes catchable), then hand-corrected
// earlier where a specialist would otherwise have fewer than two lines on
// early maps — when a trainer should own a species is a different question
// from when the player can catch one.
const SPECIES_MIN_MAP = {
  504: 1, 506: 1, 509: 1, 513: 1, 515: 1, 519: 1, 522: 1, 535: 1,
  540: 1, 543: 1, 551: 1, 559: 1, 570: 1,
  511: 2, 524: 2, 527: 2, 529: 2, 530: 2, 531: 2, 532: 2, 536: 2,
  546: 2, 548: 2, 554: 2, 568: 2, 587: 2, 595: 2, 599: 2,
  539: 3, 550: 3, 556: 3, 557: 3, 561: 3, 590: 3, 597: 3, 602: 3,
  624: 4,
  538: 5, 564: 5, 566: 5, 585: 5, 626: 5,
  572: 6, 580: 6, 592: 6, 594: 6,
  607: 7, 619: 7, 622: 7, 631: 7,
  588: 8, 589: 8, 616: 8, 618: 8, 627: 8, 629: 8, 632: 8, 633: 8, 636: 8,
}

// Which trainer classes can appear on each map. The three roaming specialists
// (Fisher, Bug Catcher, Baker) are on every map — their species pool changes
// with progression, not their presence. The rest are placed to match their
// Black/White route and city locations.
const TRAINER_POOLS = [
  ['Fisher', 'Bug Catcher', 'Baker', 'Youngster', 'Roughneck', 'Hiker'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Youngster', 'Nursery Aide', 'Pokemon Ranger M', 'Pokemon Ranger F'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Hiker', 'Janitor', 'Black Belt', 'Roughneck'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Cyclist M', 'Cyclist F', 'Depot Agent', 'Roughneck'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Hiker', 'Pokemon Ranger M', 'Pokemon Ranger F', 'Nursery Aide'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Pilot', 'Pokemon Ranger M', 'Pokemon Ranger F', 'Depot Agent'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Black Belt', 'Roughneck', 'Hiker', 'Janitor'],
  ['Fisher', 'Bug Catcher', 'Baker', 'Depot Agent', 'Pilot', 'Roughneck', 'Hiker'],
]

// Fixed boss per map (Map 1 is starter-assigned, handled in generate())
const MAP_BOSSES = [null, 'Lenora', 'Burgh', 'Elesa', 'Clay', 'Skyla', 'Brycen', 'Drayden']

// Shared edge layout (same node structure for all maps)
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

// The 8 maps correspond to Unova's gym cities, in order. Display-only labels —
// the engine still addresses maps by index (see regionRegistry config shape).
const MAP_NAMES = [
  'Striaton City', 'Nacrene City', 'Castelia City', 'Nimbasa City',
  'Driftveil City', 'Mistralton City', 'Icirrus City', 'Opelucid City',
]

// Maps 1–5 have their own art; maps 6–8 reuse earlier city art as placeholders
// until their own backgrounds are authored.
const MAP_BACKGROUNDS = [bgStriaton, bgNacrene, bgCastelia, bgNimbasa, bgDriftveil, bgFlying, bgIce, bgDragon]

// Gym badges in map order (index i is earned by beating map i's gym leader).
// { name, icon } — the badge list UI blacks these out until earned.
const BADGES = [
  { name: 'Trio Badge',   icon: badgeTrio },
  { name: 'Basic Badge',  icon: badgeBasic },
  { name: 'Insect Badge', icon: badgeInsect },
  { name: 'Bolt Badge',   icon: badgeBolt },
  { name: 'Quake Badge',  icon: badgeQuake },
  { name: 'Jet Badge',    icon: badgeJet },
  { name: 'Freeze Badge', icon: badgeFreeze },
  { name: 'Legend Badge', icon: badgeLegend },
]

// --- Region config ---
export const unovaConfig = {
  name: 'Unova',
  generation: 5,
  damageMultiplier: 2.5,
  trainerSprites: TRAINER_SPRITES,
  trainerFullSprites: TRAINER_FULL_SPRITES,
  characters: CHARACTERS,
  catchPools: CATCH_POOLS,
  legendaryPools: LEGENDARY_POOLS,
  // Flat set of every legendary species id (for the stats "Legendaries" box).
  legendaryIds: [...new Set(LEGENDARY_POOLS.flat().map(l => l.id))],
  // Pokémart shelves — see game/shop.js and
  // docs/superpowers/specs/2026-07-31-map-shop-curation-design.md.
  //
  // Only the heal is universal, matching Kanto. Unova's per-map plates and
  // town fiction are NOT yet authored: the plate mapping is written against a
  // region's gym-type order, and the town-by-town pass Kanto received has not
  // been done here. Rather than invent one blind, Unova re-homes the three
  // former generics onto the same rungs Kanto uses and leaves the remaining
  // pools empty — an empty pool resolves to no curated items, not an error.
  //
  // To finish Unova: give each map a `plate_<gymtype>` plus two items drawn
  // from what that city is, keeping roughly one mid-tier and one ceiling item
  // per shelf. See kanto.js shopPools for the worked example.
  shopGeneric: ['max_heal'],
  shopPools: [
    ['light_clay'],                                     // map 1 — mid-tier defensive
    [],
    ['muscle_band'],                                    // map 3 — mid-tier offensive
    ['mega_revive', { id: 'max_heal', stock: 3 }],      // map 4 — the logistics stop
    [],
    [],
    [],
    [],
  ],
  badges: BADGES,
  // Battle data (see unova.teams.js) — read by the generic loop via config.
  trainerSpeciesPools: TRAINER_SPECIES_POOLS,
  trainerTypePools: TRAINER_TYPE_POOLS,
  // Gates themed pools by progression (game/trainerPools.js).
  speciesMinMap: SPECIES_MIN_MAP,
  bossTeams: BOSS_TEAMS,
  eliteFourTeams: ELITE_FOUR_TEAMS,
  mapLevelRanges: MAP_LEVEL_RANGES,
  // Catch offers use their own bands, not the trainer/grass ones.
  catchLevelRanges: CATCH_LEVEL_RANGES,
  // Catch tuning + generic draw algorithm (game/catch.js).
  catchTierBudget: CATCH_TIER_BUDGET,
  pickCatchOffer,
  // Map-1 boss depends on the chosen starter; fallback is Chili (Fire).
  starterBoss: STARTER_BOSS,
  // Gym leader guarding each map, by map index. Index 0 is null because the
  // map-1 boss depends on the chosen starter (see starterBoss above). Exposed
  // on the config so the admin dashboard can label each map's boss team; the
  // generator still reads the module-local MAP_BOSSES directly.
  mapBosses: MAP_BOSSES,
  // Species used when a map's catch/grass pool is empty (region-safe default).
  fallbackSpeciesId: 504,
  // Elite Four stage — a linear gauntlet after the 8th gym; beating the
  // champion wins the run. Teams live in ELITE_FOUR_TEAMS (unova.teams.js).
  eliteFour: [
    { name: 'Shauntal', type: 'ghost',    sprite: owShauntal, fullSprite: Shauntal1 },
    { name: 'Grimsley', type: 'dark',     sprite: owGrimsley, fullSprite: Grimsley1 },
    { name: 'Caitlin',  type: 'psychic',  sprite: owCaitlin,  fullSprite: Caitlin1 },
    { name: 'Marshal',  type: 'fighting', sprite: owMarshal,  fullSprite: Marshal },
    { name: 'Alder',    type: 'champion', sprite: owAlder,    fullSprite: Alder, champion: true },
  ],
  maps: MAP_BACKGROUNDS.map((background, i) => ({
    name: MAP_NAMES[i],
    generate: (starter, { mode = 'classic', megaStoneAvailable = true } = {}) => {
      const boss = i === 0 ? (STARTER_BOSS[starter?.id] ?? 'Chili') : MAP_BOSSES[i]
      // Unova applies no post-buildRows fixups, so the bake can run inside
      // buildRows via its options bag.
      return {
        region: 'Unova',
        mapIndex: i,
        rows: buildRows(TRAINER_POOLS[i], boss, i, {
          mode,
          config: unovaConfig,
          maxSpeciesId: GEN_MAX_ID[5],
          megaStoneAvailable,
        }),
      }
    },
    edges: MAP_EDGES,
    background,
    grassIcon,
  })),
}
