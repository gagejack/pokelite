// Account level derivation (see docs/superpowers/specs/2026-07-29-account-levels-design.md).
//
// LEAF module: imports only balance.js, so the threshold arithmetic — where an
// off-by-one is the likeliest defect in this feature — is Node-testable in
// isolation. No React, no Supabase, no rng.
//
// XP is lifetime Speed Cash earned. There is no xp column and no level column:
// level is a pure function of a number that already exists, so retuning a
// payout or deleting a run recomputes correctly instead of drifting from a
// stale counter.
import { BALANCE } from './balance.js'

export const MAX_LEVEL = BALANCE.levels.maxLevel
const STEP = BALANCE.levels.xpPerLevelStep

// Total XP required to REACH `level`. Level 1 is the starting state, so it
// requires 0 — a new account is level 1, never level 0.
//   xpToReach(1) = 0, xpToReach(2) = STEP, xpToReach(100) = STEP * 4950
export function xpToReach(level) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  return STEP * L * (L - 1) / 2
}

// Everything a display needs from one call, so no consumer re-derives a
// threshold and no two surfaces can disagree about the same XP.
//
// Non-numeric, negative, and absurdly large inputs all resolve rather than
// throw: this reads a summed database column, and a null from an empty table
// must render as level 1, not crash the Stats page.
export function levelForXp(xp) {
  const total = Number.isFinite(Number(xp)) ? Math.max(0, Number(xp)) : 0

  let level = 1
  while (level < MAX_LEVEL && xpToReach(level + 1) <= total) level++

  const xpIntoLevel = total - xpToReach(level)
  // At the cap there is no next level: report a full bar and a zero cost so a
  // progress consumer neither divides by zero nor renders an empty bar for a
  // maxed account. XP past the cap is retained in the sum but grants nothing.
  const atMax = level >= MAX_LEVEL
  const xpForNext = atMax ? 0 : STEP * level

  return {
    level,
    xpIntoLevel: atMax ? 0 : xpIntoLevel,
    xpForNext,
    progress: atMax ? 1 : xpIntoLevel / xpForNext,
  }
}
