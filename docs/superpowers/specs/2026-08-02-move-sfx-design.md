# Move Sound Effects — Design

**Date:** 2026-08-02
**Status:** Approved, ready for implementation plan

## Goal

Every attack in a battle plays a Gen 1 (RBY) sound effect matched to the move
being used. Today battles are silent apart from the level-up cue added in
`src/lib/sound.js`.

## Source material

`src/assets/sounds/GEN 1 SFX - Attack Moves - RBY/` holds 328 WAV files ripped
from Red/Blue/Yellow, named in PascalCase after their move (`Tackle.wav`,
`HyperBeam.wav`).

Per the pack's README, files ending in a digit are **component parts** that were
combined to produce the un-numbered file (`Absorb1` + `Absorb2` → `Absorb`), and
files ending in `Direct` are alternate rips kept for comparison. Suffixes
`Single`, `Delay`, and `(LOOP)` mark similar variants.

**Only primary files are used** — those with no trailing digit and no `Direct` /
`Single` / `Delay` / `(LOOP)` suffix. That reduces 328 candidates to 171 usable
sounds, of which this design references 53.

## What must be mapped

`src/game/typeMoves.js` is the single source of truth for moves: 18 types × 4
tiers = **72 move slots**, all distinct, all PokéAPI kebab-case.

Matching those 72 against the sound pack:

| Resolution | Count | How |
| --- | --- | --- |
| Exact filename match | 31 | `tackle` → `Tackle` |
| Reuses the existing animation alias | 18 | `crunch` → (alias `bite`) → `Bite` |
| Authored substitution | 23 | `dragon-pulse` → `HyperBeam` |
| **Unresolved** | **0** | — |

Gen 1 predates the Dark, Steel, and Fairy types and has few Bug/Dragon attack
sounds, so those types carry most of the substitutions.

### Reusing the animation aliases

`src/game/moveAnimations.js` already solves this same problem for visuals. Its
`MOVE_ANIMATION_ALIASES` table maps uncovered moves onto similar covered ones,
and `getMoveAnimation()` resolves exact-match-then-alias.

Sound reuses that table rather than duplicating its judgements. When a move has
no sound of its own but its animation alias does, the alias's sound is used.
This keeps one mental model: a move that *looks* like Bite also *sounds* like
Bite, and a future edit to the alias table moves both together.

## The mapping

Tier 1 → Tier 4, left to right.

| Type | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | --- | --- | --- | --- |
| `normal` | `tackle` → **Tackle** | `headbutt` → **Headbutt** | `body-slam` → **BodySlam** | `hyper-beam` → **HyperBeam** |
| `fire` | `ember` → **Ember** | `flamethrower` → **Flamethrower** | `fire-blast` → **FireBlast** | `blast-burn` → **Ember** |
| `water` | `water-gun` → **WaterGun** | `bubble-beam` → **Bubblebeam** | `hydro-pump` → **HydroPump** | `hydro-cannon` → **HydroPump** |
| `grass` | `vine-whip` → **VineWhip** | `razor-leaf` → **RazorLeaf** | `solar-beam` → **SolarBeam** | `frenzy-plant` → **VineWhip** |
| `electric` | `thunder-shock` → **ThunderShock** | `spark` → **ThunderPunch** | `thunderbolt` → **Thunderbolt** | `thunder` → **Thunder** |
| `ice` | `powder-snow` → **PoisonPowder** | `ice-shard` → **AuroraBeam** | `ice-beam` → **IceBeam** | `blizzard` → **Blizzard** |
| `fighting` | `karate-chop` → **KarateChop** | `brick-break` → **KarateChop** | `cross-chop` → **KarateChop** | `close-combat` → **DoubleKick** |
| `poison` | `acid` → **Acid** | `sludge` → **Sludge** | `sludge-bomb` → **Toxic** | `gunk-shot` → **Toxic** |
| `ground` | `mud-shot` → **Dig** | `bulldoze` → **Dig** | `earthquake` → **Earthquake** | `earth-power` → **Dig** |
| `flying` | `gust` → **Gust** | `wing-attack` → **WingAttack** | `air-slash` → **Cut** | `brave-bird` → **SkyAttack** |
| `psychic` | `confusion` → **Confusion** | `psybeam` → **Psybeam** | `psychic` → **Psychic** | `future-sight` → **Psywave** |
| `bug` | `struggle-bug` → **FurySwipes** | `bug-bite` → **FurySwipes** | `x-scissor` → **Slash** | `megahorn` → **HornDrill** |
| `rock` | `rock-throw` → **RockThrow** | `rock-slide` → **RockSlide** | `rock-blast` → **RockThrow** | `stone-edge` → **RockThrow** |
| `ghost` | `lick` → **Lick** | `shadow-punch` → **DizzyPunch** | `shadow-ball` → **NightShade** | `shadow-force` → **NightShade** |
| `dragon` | `twister` → **Whirlwind** | `dragon-breath` → **DragonRage** | `dragon-pulse` → **HyperBeam** | `draco-meteor` → **Explosion** |
| `dark` | `bite` → **Bite** | `feint-attack` → **Bite** | `crunch` → **Bite** | `dark-pulse` → **Bite** |
| `steel` | `metal-claw` → **Slash** | `metal-sound` → **Screech** | `iron-head` → **SkullBash** | `flash-cannon` → **HyperBeamLaser** |
| `fairy` | `fairy-wind` → **Gust** | `draining-kiss` → **Absorb** | `dazzling-gleam` → **Swift** | `moonblast` → **Psychic** |

53 unique files. Full list:

> Absorb, Acid, AuroraBeam, Bite, Blizzard, BodySlam, Bubblebeam, Confusion,
> Cut, Dig, DizzyPunch, DoubleKick, DragonRage, Earthquake, Ember, Explosion,
> FireBlast, Flamethrower, FurySwipes, Gust, Headbutt, HornDrill, HydroPump,
> HyperBeam, HyperBeamLaser, IceBeam, KarateChop, Lick, NightShade,
> PoisonPowder, Psybeam, Psychic, Psywave, RazorLeaf, RockSlide, RockThrow,
> Screech, SkullBash, SkyAttack, Slash, Sludge, SolarBeam, Swift, Tackle,
> Thunder, ThunderPunch, ThunderShock, Thunderbolt, Toxic, VineWhip, WaterGun,
> Whirlwind, WingAttack

## Audio encoding

The source WAVs are **stereo 44.1 kHz 16-bit** — heavily oversampled for Game
Boy source material. The 53 referenced files total **18.7 MB** raw, against a
current app bundle of roughly 1 MB. Shipping them as-is is not viable.

They are re-encoded to **AAC in an `.m4a` container at 64 kbps mono**, using
`afconvert` (ships with macOS):

```
afconvert -f m4af -d aac -b 64000 --mix <in>.wav <out>.m4a
```

Measured on a sample: `HyperBeam` 726 KB → 19 KB, `Tackle` 142 KB → 6 KB,
`Explosion` 591 KB → 16 KB — roughly **25× smaller**, bringing the full set
under 1 MB. Encoded files were verified to load and report correct durations in
Chromium.

Encoding is a **one-time offline conversion**, not a build step. The 53 `.m4a`
files are committed to `src/assets/sounds/moves/`; the 328-file source pack
stays in the repo as reference but is never imported, so no WAV reaches the
bundle.

## Architecture

Three pieces, each with one job.

### 1. The mapping — two modules, not one

> **Revised during planning.** This section originally specified a single
> `moveSounds.js` that imported the assets, held the table, and consulted
> `MOVE_ANIMATION_ALIASES` at runtime. That is not testable: `npm test` runs
> `node --test`, and Node throws `ERR_UNKNOWN_FILE_EXTENSION` on any module that
> statically imports `.m4a` — or that imports `moveAnimations.js`, which pulls in
> 79 PNGs. A single module would have made the spec's own coverage test
> impossible to write. The mapping is therefore split.

**`src/game/moveSounds.data.js`** — pure data, no imports of any kind.

- `MOVE_SOUND_FILES` — all 72 kebab-case move names → PascalCase file stems.
  The 18 alias-resolved moves are **inlined as already-resolved stems** rather
  than looked up at runtime, since `moveAnimations.js` cannot be imported here.
  The alias table remains the source of those 18 judgements; they are copied,
  not re-derived.
- `soundFileFor(moveName)` — returns a stem or `undefined`.

Because this module is plain JS, `node --test` can import it, which is what
makes the coverage test in the Testing section possible.

**`src/game/moveSounds.js`** — asset binding, Vite-only.

- Static imports of the 53 `.m4a` files (Vite resolves each to a hashed URL).
- `SFX_URLS` — file stem → imported URL.
- `getMoveSound(moveName)` — `soundFileFor(name)`, then `SFX_URLS[stem]`.
  Returns `undefined` when the move has no sound.

Returning `undefined` rather than throwing keeps an unmapped move silent instead
of breaking a battle. With the current move table every name resolves, but the
table is authored data and can gain entries.

### 2. `src/lib/sound.js` (extend)

Already exists with `playSound(name)`, a per-key `Audio` cache, mute state, and
swallowed autoplay rejections.

Add `playSoundUrl(url, { volume })` for callers that hold a resolved URL rather
than a registry key. Same caching (keyed by URL), same failure behaviour. The
existing `playSound` stays for named one-offs like `levelup`.

### 3. `src/components/BattleCard.jsx` (wire up)

The battle log effect already fires `setProjectile(...)` at the start of each
entry, `PROJECTILE_MS` before the hit lands. The move sound fires **there, at
launch**, alongside the projectile and the attacker's animation — not at impact.
That matches how the visuals are already sequenced.

```js
const url = getMoveSound(entry.moveName)
if (url) playSoundUrl(url)
```

One call site covers both layouts, and `EliteFour` renders the same component,
so gauntlet battles are included.

## Behaviour details

- **Volume** — move SFX at `0.45`, below the level-up cue's `0.6`. Attacks fire
  many times per battle; the level-up fires once and should sit on top.
- **Battle speed** — the app has a `battleSpeed` multiplier (1×–3×, in 0.5
  steps; see `SettingsPanel.jsx`). Sounds play at natural rate and are **not**
  pitch-shifted. At 3× a long sound may still be playing when the next attack
  fires; the existing cache rewinds to `currentTime = 0`, so the new attack cuts
  the old one off. That is the desired behaviour: one attack, one audible sound.
- **Moveless attackers** — `battle.js` writes the literal `'(no move)'` into
  `entry.moveName` when an attacker has no move. `getMoveSound` returns
  `undefined` for it by the normal unknown-name path, so it plays silently. No
  special-casing needed, but the unit test should cover this exact string so the
  behaviour is pinned.
- **Mute** — `playSoundUrl` respects the existing `isMuted()` check, so a future
  settings toggle covers move SFX for free.
- **Fainting and item effects** — out of scope. This design covers attack moves
  only.

## Testing

Tests run on **`node --test`** via `npm test` (vitest is not installed), using
`node:test` and `node:assert/strict`, beside their source as `*.test.js` —
matching `src/game/shop.test.js`.

- **Unit** — a test over `typeMoves.js` asserting every one of the 72 move slots
  resolves through `soundFileFor()` to a defined file stem. This is the guard
  that matters: it fails when someone adds a move to the type table without a
  sound. It targets `moveSounds.data.js` rather than `moveSounds.js` because
  only the former is importable under Node.
- **Unit** — `getMoveSound` returns `undefined` rather than throwing for an
  unknown name, for `'(no move)'`, and for `undefined`/`null` input.
- **Manual** — play a battle at 1× and at 4×, confirming sounds fire on attack
  and that rapid attacks cut cleanly rather than overlapping into noise.

## Known rough edges

Two types resolve to a single sound across most of their tiers, so levelling up
within them will not sound different:

- **`dark`** — all four tiers → `Bite`
- **`ground`** — three of four tiers → `Dig`
- **`fighting`** — three of four tiers → `KarateChop`

This follows from the existing animation aliases, which make the same
compression visually. It is accepted for this pass. Differentiating them means
authoring direct sound substitutions that diverge from the animation aliases —
`Earthquake` and `Slash` are unused candidates for Ground and Dark. Deferred
rather than dismissed.

## Out of scope

- A settings UI for mute or volume (the state exists; no control is added here).
- Sounds for non-attack events: fainting, healing, held-item procs, catching,
  shopping.
- Pitch-shifting sounds to match battle speed.
- Replacing the RBY pack's substitutions with true Gen 2+ sounds.
