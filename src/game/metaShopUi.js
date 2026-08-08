// Pure view-model helpers for MetaShop.jsx (Task 9, spec §6c) — extracted so
// the four-state row logic and the vitamin starter-picker's eligibility rules
// are unit-testable without mounting the component.
//
// Imports metaCatalog.js/metaProfile.js/starters.js (all closed, data-only or
// pure-function modules) but no React and no DOM, so this stays testable in
// a plain `vitest run` process the same way metaProfile.js is.

import { canAfford, effectivePrice, totalVitamins } from './metaProfile.js'
import { VITAMIN_CAP_PER_STARTER } from './metaCatalog.js'
import { REGION_STARTERS } from './starters.js'

// Which starters is `profile` allowed to spend a vitamin on? Spec: "a grid of
// the player's UNLOCKED starters" — derived from unlockedRegions the same way
// Déjà Vu (Task 7) derives its offer list from usedStarters, i.e. by reading
// REGION_STARTERS keyed off which regions the profile has bought into, NOT
// off usedStarters (a player can unlock a region and never have run it yet,
// and should still be able to pre-invest a vitamin the moment they can afford
// one — nothing here requires a starter to have been played).
//
// @param {MetaProfile} profile
// @returns {number[]} species ids, in REGION_STARTERS' own per-region order,
//   regions in SPRITE_REGIONS-independent REGION_STARTERS key order.
export function unlockedStarterIds(profile) {
  const unlocked = profile?.unlockedRegions ?? []
  const ids = []
  for (const region of Object.keys(REGION_STARTERS)) {
    if (!unlocked.includes(region)) continue
    ids.push(...REGION_STARTERS[region])
  }
  return ids
}

// One row of the vitamin starter picker: species id, current vitamin total
// (any stat mix, spec §3), and whether it's still purchasable (under the
// 3-per-starter cap). The picker grid renders directly off this array rather
// than re-deriving cap math itself.
//
// @param {MetaProfile} profile
// @returns {{ speciesId: number, count: number, atCap: boolean }[]}
export function starterPickerRows(profile) {
  return unlockedStarterIds(profile).map(speciesId => {
    const count = totalVitamins(profile, speciesId)
    return { speciesId, count, atCap: count >= VITAMIN_CAP_PER_STARTER }
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
