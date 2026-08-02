# Move SFX — Spec & Plan Review

**Date:** 2026-08-02
**Reviewed:** `docs/superpowers/specs/2026-08-02-move-sfx-design.md` + `docs/superpowers/plans/2026-08-02-move-sfx.md`
**Method:** Cross-checked both documents against the live codebase (`battle.js`, `BattleCard.jsx`, `typeMoves.js`, `moveAnimations.js`, `sound.js`, `SettingsPanel.jsx`, `EliteFour.jsx`) and the RBY source pack on disk.

## Verdict

Plan is implementable as written. Anchor lines match, all 53 source WAVs exist, the two-module split is justified, and the mapping covers all 72 move slots. Findings below are doc bugs and maintenance traps, not blockers — except Finding 1, which will send the manual tester on a dead end.

---

## Findings

### 1. BUG — Manual test step requires 4× battle speed, which does not exist

- Spec, Testing section: *"play a battle at 1× and at 4×"*.
- Spec, Behaviour section: battle speed is 1×–3× in 0.5 steps.
- Code confirms: `SettingsPanel.jsx` line 7 — `const SPEEDS = [1, 1.5, 2, 2.5, 3]`. Max is **3×**.

Fix: change the Testing section to "at 1× and at 3×".

### 2. CONTRADICTION — "Alias edits move both together" vs. inlined copies

- Spec, Reusing the animation aliases: *"a future edit to the alias table moves both together."*
- Spec, Architecture (revised): the 18 alias-resolved stems are **inlined as copies** into `moveSounds.data.js` — *"they are copied, not re-derived."* Runtime lookup of `MOVE_ANIMATION_ALIASES` was explicitly rejected because `moveAnimations.js` imports 79 PNGs and breaks `node --test`.

Both statements cannot be true. The inlined table is the one that ships, so editing `MOVE_ANIMATION_ALIASES` will **silently stale** the 18 copied sound entries. No test guards this — and none can, because the test module cannot import the alias table without pulling in the PNGs.

Recommended fix (either):
- **a)** Extract `MOVE_ANIMATION_ALIASES` into its own pure module (e.g. `src/game/moveAliases.data.js`, no asset imports). `moveAnimations.js` re-exports it; `moveSounds.data.test.js` imports it and asserts every alias-resolved move's sound stem equals its alias target's sound stem. This makes the spec's promise real and testable.
- **b)** Cheaper: delete the "moves both together" sentence from the spec and add a comment in `moveSounds.data.js` warning that alias edits require manual sync.

### 3. DOC BUG — "looks like X sounds like X" is overbroad

Spec's mental model: *"a move that looks like Bite also sounds like Bite."* Verified against `MOVE_ANIMATION_ALIASES`: 12 moves have an exact sound file, so the sound follows the **move** while the animation follows the **alias**:

| Move | Animation (alias) | Sound |
|---|---|---|
| `flamethrower`, `fire-blast` | Ember | Flamethrower / FireBlast |
| `razor-leaf` | Cut | RazorLeaf |
| `body-slam` | Stomp | BodySlam |
| `hyper-beam` | Slash | HyperBeam |
| `thunderbolt`, `thunder` | ThunderShock | Thunderbolt / Thunder |
| `earthquake` | Dig | Earthquake |
| `wing-attack` | Peck | WingAttack |
| `acid`, `sludge` | Toxic | Acid / Sludge |
| `rock-slide` | RockThrow | RockSlide |

This is arguably the *right* choice (a real sound beats alias consistency), but the spec's mental model only holds for the 18 alias-resolved moves. Reword to: exact sound wins when it exists; the alias's sound is the fallback.

### 4. DOC — Source pack counts are off by one

- Spec: 328 files → 171 primary. Measured on disk: **329 files**, 157 variant-suffixed → **172 primary**.
- All 53 referenced primary stems confirmed present (including the awkward spellings `Bubblebeam` and `HyperBeamLaser`). No missing files.

Trivial, but the numbers are quoted twice in the spec.

### 5. NOTE — Level-up cue (and therefore the volume rationale) is desktop-only

- `BattleCard.jsx` line 328: `if (isDesktop) playSound('levelup')`.
- Spec's volume reasoning — *"0.45, below the level-up cue's 0.6 … the level-up fires once and should sit on top"* — is moot on mobile, where no level-up cue plays. Not a bug in this plan (0.45 is fine standalone), but manual test step 4 ("level-up audibly louder than the attacks") is unverifiable on mobile. Flag it as desktop-only in the plan.

---

## Verified clean (no action needed)

- **Anchor lines** — `BattleCard.jsx:214–215` match the plan's find/replace target exactly.
- **Non-attack entries** — the `leftovers` branch (`BattleCard.jsx:203–212`) early-returns *before* the insertion point, so passive ticks stay silent. Plan's Task 5 placement is correct.
- **`'(no move)'`** — confirmed written literally at `battle.js:252`; the unknown-name path handles it, and the plan's test pins it.
- **All 72 move names** in the plan's `MOVE_SOUND_FILES` match `typeMoves.js` exactly; the spec's 31 exact / 18 alias / 23 authored split was recounted and is **accurate**.
- **`sound.js`** — existing `cache` Map, rewind-on-retrigger, mute check, and swallowed play() rejections all match what `playSoundUrl` reuses. Name-keyed vs URL-keyed entries cannot collide.
- **Elite Four coverage** — `EliteFour.jsx:421` and `NodeMap.jsx:1532` both render `BattleCard`. One call site does cover gauntlet battles.
- **Two-module split** — the `node --test` / `ERR_UNKNOWN_FILE_EXTENSION` constraint is real; the split is the right shape.
- **`shop.test.js`** exists as the stated pattern reference.

## Minor nits (optional)

- **Task 1 script** — `readdirSync(OUT).length` counts stale files if `src/assets/sounds/moves/` pre-exists with extras; it would print >53 while exiting 0. Step 3's `ls | wc -l` catches this, so harmless. Also requires running from repo root (relative paths) — worth one comment line.
- **`afconvert --mix`** — the spec claims mono output; if verification matters, confirm channel count on one file (`afinfo`), since `--mix` behaviour depends on output format channel defaults. Size math is unaffected (64 kbps either way).
- **53 static imports** — no action. Vite emits each `.m4a` as a separate hashed asset fetched on demand by `Audio()`; none reach the JS bundle as bytes.
