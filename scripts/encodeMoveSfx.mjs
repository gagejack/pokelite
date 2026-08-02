// One-time offline conversion of the Gen 1 SFX this game references.
//
// The source pack is stereo 44.1kHz 16-bit WAV — wildly oversampled for Game
// Boy audio. The 53 files we reference total 18.7MB, against an app bundle of
// roughly 1MB. At 48kbps mono AAC they come in around 25x smaller.
//
// -c 1 is what forces mono. `--mix` alone does NOT downmix: verified with
// afinfo, `-b 64000 --mix` emits 2-channel AAC. Mono at 64kbps is larger than
// that stereo output, so the bitrate drops to 48k for size parity.
//
// Run once from the repo root (paths below are relative):
//   node scripts/encodeMoveSfx.mjs
// Requires macOS (afconvert ships with the OS). Commit the output.

import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src/assets/sounds/GEN 1 SFX - Attack Moves - RBY'
const OUT = 'src/assets/sounds/moves'

// The 53 primary sounds referenced by src/game/moveSounds.data.js.
const FILES = [
  'Absorb', 'Acid', 'AuroraBeam', 'Bite', 'Blizzard', 'BodySlam', 'Bubblebeam',
  'Confusion', 'Cut', 'Dig', 'DizzyPunch', 'DoubleKick', 'DragonRage',
  'Earthquake', 'Ember', 'Explosion', 'FireBlast', 'Flamethrower', 'FurySwipes',
  'Gust', 'Headbutt', 'HornDrill', 'HydroPump', 'HyperBeam', 'HyperBeamLaser',
  'IceBeam', 'KarateChop', 'Lick', 'NightShade', 'PoisonPowder', 'Psybeam',
  'Psychic', 'Psywave', 'RazorLeaf', 'RockSlide', 'RockThrow', 'Screech',
  'SkullBash', 'SkyAttack', 'Slash', 'Sludge', 'SolarBeam', 'Swift', 'Tackle',
  'Thunder', 'ThunderPunch', 'ThunderShock', 'Thunderbolt', 'Toxic', 'VineWhip',
  'WaterGun', 'Whirlwind', 'WingAttack',
]

mkdirSync(OUT, { recursive: true })

let inBytes = 0
let outBytes = 0
const missing = []

for (const stem of FILES) {
  const src = join(SRC, `${stem}.wav`)
  const out = join(OUT, `${stem}.m4a`)
  if (!existsSync(src)) { missing.push(stem); continue }
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-c', '1', '-b', '48000', '--mix', src, out])
  inBytes += statSync(src).size
  outBytes += statSync(out).size
}

if (missing.length) {
  console.error(`MISSING ${missing.length} source file(s): ${missing.join(', ')}`)
  process.exit(1)
}

const mb = n => (n / 1048576).toFixed(2)
console.log(`encoded ${readdirSync(OUT).length} files`)
console.log(`${mb(inBytes)}MB -> ${mb(outBytes)}MB`)
