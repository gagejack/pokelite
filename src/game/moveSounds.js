// Binds the move→stem table to real asset URLs.
//
// Vite rewrites each import below to a hashed, bundled URL. This module is
// therefore Vite-only and unimportable from `node --test` — which is exactly
// why the mapping itself lives in moveSounds.data.js. Keep logic out of here.

import { soundFileFor } from './moveSounds.data.js'

import absorbSfx from '../assets/sounds/moves/Absorb.m4a'
import acidSfx from '../assets/sounds/moves/Acid.m4a'
import auroraBeamSfx from '../assets/sounds/moves/AuroraBeam.m4a'
import biteSfx from '../assets/sounds/moves/Bite.m4a'
import blizzardSfx from '../assets/sounds/moves/Blizzard.m4a'
import bodySlamSfx from '../assets/sounds/moves/BodySlam.m4a'
import bubblebeamSfx from '../assets/sounds/moves/Bubblebeam.m4a'
import confusionSfx from '../assets/sounds/moves/Confusion.m4a'
import cutSfx from '../assets/sounds/moves/Cut.m4a'
import digSfx from '../assets/sounds/moves/Dig.m4a'
import dizzyPunchSfx from '../assets/sounds/moves/DizzyPunch.m4a'
import doubleKickSfx from '../assets/sounds/moves/DoubleKick.m4a'
import dragonRageSfx from '../assets/sounds/moves/DragonRage.m4a'
import earthquakeSfx from '../assets/sounds/moves/Earthquake.m4a'
import emberSfx from '../assets/sounds/moves/Ember.m4a'
import explosionSfx from '../assets/sounds/moves/Explosion.m4a'
import fireBlastSfx from '../assets/sounds/moves/FireBlast.m4a'
import flamethrowerSfx from '../assets/sounds/moves/Flamethrower.m4a'
import furySwipesSfx from '../assets/sounds/moves/FurySwipes.m4a'
import gustSfx from '../assets/sounds/moves/Gust.m4a'
import headbuttSfx from '../assets/sounds/moves/Headbutt.m4a'
import hornDrillSfx from '../assets/sounds/moves/HornDrill.m4a'
import hydroPumpSfx from '../assets/sounds/moves/HydroPump.m4a'
import hyperBeamSfx from '../assets/sounds/moves/HyperBeam.m4a'
import hyperBeamLaserSfx from '../assets/sounds/moves/HyperBeamLaser.m4a'
import iceBeamSfx from '../assets/sounds/moves/IceBeam.m4a'
import karateChopSfx from '../assets/sounds/moves/KarateChop.m4a'
import lickSfx from '../assets/sounds/moves/Lick.m4a'
import nightShadeSfx from '../assets/sounds/moves/NightShade.m4a'
import poisonPowderSfx from '../assets/sounds/moves/PoisonPowder.m4a'
import psybeamSfx from '../assets/sounds/moves/Psybeam.m4a'
import psychicSfx from '../assets/sounds/moves/Psychic.m4a'
import psywaveSfx from '../assets/sounds/moves/Psywave.m4a'
import razorLeafSfx from '../assets/sounds/moves/RazorLeaf.m4a'
import rockSlideSfx from '../assets/sounds/moves/RockSlide.m4a'
import rockThrowSfx from '../assets/sounds/moves/RockThrow.m4a'
import screechSfx from '../assets/sounds/moves/Screech.m4a'
import skullBashSfx from '../assets/sounds/moves/SkullBash.m4a'
import skyAttackSfx from '../assets/sounds/moves/SkyAttack.m4a'
import slashSfx from '../assets/sounds/moves/Slash.m4a'
import sludgeSfx from '../assets/sounds/moves/Sludge.m4a'
import solarBeamSfx from '../assets/sounds/moves/SolarBeam.m4a'
import swiftSfx from '../assets/sounds/moves/Swift.m4a'
import tackleSfx from '../assets/sounds/moves/Tackle.m4a'
import thunderSfx from '../assets/sounds/moves/Thunder.m4a'
import thunderPunchSfx from '../assets/sounds/moves/ThunderPunch.m4a'
import thunderShockSfx from '../assets/sounds/moves/ThunderShock.m4a'
import thunderboltSfx from '../assets/sounds/moves/Thunderbolt.m4a'
import toxicSfx from '../assets/sounds/moves/Toxic.m4a'
import vineWhipSfx from '../assets/sounds/moves/VineWhip.m4a'
import waterGunSfx from '../assets/sounds/moves/WaterGun.m4a'
import whirlwindSfx from '../assets/sounds/moves/Whirlwind.m4a'
import wingAttackSfx from '../assets/sounds/moves/WingAttack.m4a'

// File stem → bundled URL. Keys match the values in MOVE_SOUND_FILES.
const SFX_URLS = {
  Absorb: absorbSfx,
  Acid: acidSfx,
  AuroraBeam: auroraBeamSfx,
  Bite: biteSfx,
  Blizzard: blizzardSfx,
  BodySlam: bodySlamSfx,
  Bubblebeam: bubblebeamSfx,
  Confusion: confusionSfx,
  Cut: cutSfx,
  Dig: digSfx,
  DizzyPunch: dizzyPunchSfx,
  DoubleKick: doubleKickSfx,
  DragonRage: dragonRageSfx,
  Earthquake: earthquakeSfx,
  Ember: emberSfx,
  Explosion: explosionSfx,
  FireBlast: fireBlastSfx,
  Flamethrower: flamethrowerSfx,
  FurySwipes: furySwipesSfx,
  Gust: gustSfx,
  Headbutt: headbuttSfx,
  HornDrill: hornDrillSfx,
  HydroPump: hydroPumpSfx,
  HyperBeam: hyperBeamSfx,
  HyperBeamLaser: hyperBeamLaserSfx,
  IceBeam: iceBeamSfx,
  KarateChop: karateChopSfx,
  Lick: lickSfx,
  NightShade: nightShadeSfx,
  PoisonPowder: poisonPowderSfx,
  Psybeam: psybeamSfx,
  Psychic: psychicSfx,
  Psywave: psywaveSfx,
  RazorLeaf: razorLeafSfx,
  RockSlide: rockSlideSfx,
  RockThrow: rockThrowSfx,
  Screech: screechSfx,
  SkullBash: skullBashSfx,
  SkyAttack: skyAttackSfx,
  Slash: slashSfx,
  Sludge: sludgeSfx,
  SolarBeam: solarBeamSfx,
  Swift: swiftSfx,
  Tackle: tackleSfx,
  Thunder: thunderSfx,
  ThunderPunch: thunderPunchSfx,
  ThunderShock: thunderShockSfx,
  Thunderbolt: thunderboltSfx,
  Toxic: toxicSfx,
  VineWhip: vineWhipSfx,
  WaterGun: waterGunSfx,
  Whirlwind: whirlwindSfx,
  WingAttack: wingAttackSfx,
}

// Resolve a PokéAPI kebab-case move name to its bundled sound URL.
// Returns undefined when the move has no sound; callers stay silent.
export function getMoveSound(moveName) {
  const stem = soundFileFor(moveName)
  return stem ? SFX_URLS[stem] : undefined
}
