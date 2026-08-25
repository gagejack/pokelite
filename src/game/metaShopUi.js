// Pure view-model helpers for MetaShop.jsx (Task 9, spec §6c) — extracted so
// the four-state row logic and the vitamin picker's eligibility rules are
// unit-testable without mounting the component.
//
// Imports metaCatalog.js/metaProfile.js (both closed, data-only or
// pure-function modules) but no React and no DOM, so this stays testable in
// a plain `vitest run` process the same way metaProfile.js is.

import { canAfford, effectivePrice, totalVitamins } from './metaProfile.js'
import { VITAMIN_CAP_PER_SPECIES } from './metaCatalog.js'

// One row of the vitamin species picker: species id, current vitamin total
// (any stat mix, spec §3), and whether it's still purchasable (under the
// 3-per-species cap). The picker grid renders directly off this array rather
// than re-deriving cap math itself.
//
// Vitamins target any caught/seen species, not just a starter (spec change:
// the picker used to be scoped to unlockedStarterIds, derived internally from
// profile.unlockedRegions). That scoping now lives in MetaShop.jsx, which
// already fetches the account's caught/seen sets for the Pokédex-style picker
// — this module stays a pure leaf (no Supabase) and just takes the resulting
// species id list as `speciesIds`, same as any other caller-supplied data.
//
// @param {MetaProfile} profile
// @param {number[]} speciesIds - species the player may target (caught/seen)
// @returns {{ speciesId: number, count: number, atCap: boolean }[]}
export function vitaminPickerRows(profile, speciesIds) {
  return speciesIds.map(speciesId => {
    const count = totalVitamins(profile, speciesId)
    return { speciesId, count, atCap: count >= VITAMIN_CAP_PER_SPECIES }
  })
}

// The four row states from spec §6c, folded into one decision so MetaShop.jsx
// doesn't reimplement the precedence order (locked-by-prerequisite is checked
// before affordability, ownership before either, matching applyPurchase's own
// own rejection order in metaProfile.js).
//
// @returns {'owned'|'locked'|'affordable'|'too_expensive'}
export function rowState(profile, item, overrides = {}) {
  const isVitamin = item.effect?.type === 'vitamin'
  const owned = !isVitamin && (profile?.ownedUpgrades ?? []).includes(item.id)
  if (owned) return 'owned'

  if (item.effect?.requires && !(profile?.ownedUpgrades ?? []).includes(item.effect.requires)) {
    return 'locked'
  }

  return canAfford(profile, item, overrides) ? 'affordable' : 'too_expensive'
}

// Display price for a row, honoring Bargain Hunter + overrides the same way
// the actual purchase will be charged (effectivePrice) — a row must never
// show a sticker price the Buy button won't actually charge.
export function rowPrice(profile, item, overrides = {}) {
  return effectivePrice(item, profile, overrides)
}
