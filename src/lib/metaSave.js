// Persistence for the player's meta-progression profile (metacash, keys,
// owned upgrades/sprites, vitamins, unlocked regions, streak) — the
// account-wide wallet, separate from a single in-progress run (runSave.js).
//
// Storage: the logged-in user's Supabase account (row per user, upsert) so
// the profile follows them across devices; logged-out players fall back to
// browser localStorage so it survives closing the tab on that device. This
// mirrors runSave.js exactly, including its failure posture: a Supabase
// error never throws and never loses the player's money — it warns and
// falls back to localStorage, because a network blip is not a reason to
// wipe a wallet the player can see on screen.
//
//   Expected Supabase schema:
//     table meta_profiles (
//       user_id uuid primary key references auth.users,
//       profile jsonb not null,
//       updated_at timestamptz default now()
//     )
//     -- RLS: user can select/insert/update where user_id = auth.uid()

import { supabase } from './supabase'
// Vitamin cap (spec §3), imported rather than re-declared so a future change
// to the cap can't silently drift between metaProfile.js's purchase-time
// enforcement and this merge-time enforcement.
import { VITAMIN_CAP_PER_STARTER } from '../game/metaCatalog.js'

const LOCAL_KEY = 'speedmon.metaProfile'

// Save (or overwrite) the profile. `user` may be null (→ localStorage).
export async function saveProfile(profile, user) {
  if (user) {
    const { error } = await supabase
      .from('meta_profiles')
      .upsert({ user_id: user.id, profile, updated_at: new Date().toISOString() })
    if (error) {
      console.warn('saveProfile (supabase) failed, falling back to localStorage:', error.message)
      writeLocal(profile)
    }
    return
  }
  writeLocal(profile)
}

// Load the profile, or null if there isn't one yet (caller should fall back
// to createProfile() from metaProfile.js — this module doesn't decide that,
// same division of labor as loadRun/runSave.js).
export async function loadProfile(user) {
  if (user) {
    const { data, error } = await supabase
      .from('meta_profiles')
      .select('profile')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      console.warn('loadProfile (supabase) failed, falling back to localStorage:', error.message)
      return readLocal()
    }
    return data?.profile ?? null
  }
  return readLocal()
}

function writeLocal(profile) {
  try {
    if (profile == null) localStorage.removeItem(LOCAL_KEY)
    else localStorage.setItem(LOCAL_KEY, JSON.stringify(profile))
  } catch (e) {
    console.warn('writeLocal failed:', e)
  }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.warn('readLocal failed:', e)
    return null
  }
}

// Clear the local guest copy. Called after a successful migration merge, and
// ONLY then — never on every login, or a second device's still-guest browser
// tab would lose its balance the moment the same person logs in elsewhere.
export function clearLocalProfile() {
  writeLocal(null)
}

/**
 * Merge a guest's local profile into an account's profile on login/signup.
 * Pure — returns a NEW profile, mutates neither input, same posture as
 * metaProfile.js's applyPurchase. The caller is responsible for persisting
 * the result and clearing the local copy (see clearLocalProfile above); this
 * function only computes the merge.
 *
 * Either side may be null/absent (a brand-new account has no row yet; a
 * guest who never played has no local profile) — in that case the other
 * side wins unchanged, so migration is safe to call unconditionally.
 *
 * Field-by-field rules (spec §7):
 *
 *  - metacash, keys: SUM. Losing progress feels worse than a small windfall
 *    (guest $800 + account $2,000 = $2,800) — an overwrite in either
 *    direction would destroy real progress on one side.
 *  - ownedUpgrades, ownedSprites, unlockedRegions, usedStarters: UNION
 *    (dedupe). These are "do you have it" flags, not counters — owning an
 *    item on both sides isn't double progress, it's the same fact observed
 *    twice.
 *  - vitamins: union per starter per stat, but the cap from Task 1
 *    (VITAMIN_CAP_PER_STARTER, 3 total per starter across all six stats)
 *    still applies to the MERGED result. Two independent purchase histories
 *    (guest device + account) can each be legally at-or-under cap on their
 *    own and still sum past it (e.g. guest bought 2 Protein, account bought
 *    2 Iron on the same starter — 2+2=4 > 3). Summing blindly would produce
 *    a profile applyPurchase() would never have allowed to exist, and every
 *    later reader (metaModifiers.js, the shop's "2/3" badge) trusts the cap
 *    as an invariant. Per stat we take max(guestCount, accountCount) rather
 *    than sum — the same conceptual "I bought N Proteins" fact shouldn't
 *    double just because it was recorded in two places — and if THAT still
 *    exceeds the cap (different stats maxed on each side), we clamp the
 *    total down to the cap by trimming from the stat(s) with the smaller
 *    per-side max first, in stat key order for determinism. Net effect: the
 *    player never loses a vitamin purchase that was the higher of the two
 *    records, and the merged profile is never one applyPurchase() itself
 *    would reject.
 *  - winStreak: HIGHER of the two. A streak is a "how good is your current
 *    form" fact, not an accumulator — summing two streaks that happened on
 *    different devices would invent a streak neither device ever earned.
 *  - equippedSprite: the ACCOUNT's choice wins if the account had one set,
 *    else the guest's. Rationale: the account is the durable identity a
 *    player returns to across devices/sessions; a device-local guest
 *    session merging in should not silently swap the calling card an
 *    account-holder already chose elsewhere. A brand-new account (no prior
 *    equippedSprite) falls through to whatever the guest had equipped, so a
 *    first-time signup doesn't lose its sprite either.
 *
 * @param {import('../game/metaProfile.js').MetaProfile|null|undefined} localProfile
 * @param {import('../game/metaProfile.js').MetaProfile|null|undefined} accountProfile
 * @returns {import('../game/metaProfile.js').MetaProfile}
 */
export function migrateGuestProfile(localProfile, accountProfile) {
  if (!localProfile) return accountProfile
  if (!accountProfile) return localProfile

  const unlockedRegions = union(accountProfile.unlockedRegions, localProfile.unlockedRegions)
  const ownedUpgrades = union(accountProfile.ownedUpgrades, localProfile.ownedUpgrades)
  const ownedSprites = union(accountProfile.ownedSprites, localProfile.ownedSprites)
  const usedStarters = union(accountProfile.usedStarters, localProfile.usedStarters)

  return {
    metacash: (accountProfile.metacash ?? 0) + (localProfile.metacash ?? 0),
    keys: (accountProfile.keys ?? 0) + (localProfile.keys ?? 0),
    unlockedRegions,
    ownedUpgrades,
    vitamins: mergeVitamins(accountProfile.vitamins, localProfile.vitamins),
    ownedSprites,
    equippedSprite: accountProfile.equippedSprite ?? localProfile.equippedSprite ?? null,
    usedStarters,
    winStreak: Math.max(accountProfile.winStreak ?? 0, localProfile.winStreak ?? 0),
  }
}

function union(a = [], b = []) {
  return [...new Set([...a, ...b])]
}

// Per-starter, per-stat: take the higher of the two recorded counts (not the
// sum — see migrateGuestProfile's doc comment), then clamp the starter's
// total down to VITAMIN_CAP_PER_STARTER if the combination of per-stat
// maxima still exceeds it.
function mergeVitamins(accountVitamins = {}, localVitamins = {}) {
  const speciesIds = new Set([...Object.keys(accountVitamins), ...Object.keys(localVitamins)])
  const result = {}

  for (const speciesId of speciesIds) {
    const a = accountVitamins[speciesId] ?? {}
    const l = localVitamins[speciesId] ?? {}
    const stats = [...new Set([...Object.keys(a), ...Object.keys(l)])].sort()

    const merged = {}
    for (const stat of stats) {
      merged[stat] = Math.max(a[stat] ?? 0, l[stat] ?? 0)
    }

    result[speciesId] = clampVitaminTotal(merged)
  }

  return result
}

// Trim a { stat: count } map down to VITAMIN_CAP_PER_STARTER total, removing
// from the smallest counts first (stat order already deterministic from the
// sorted keys above) so the trim is reproducible regardless of which side
// (account/local) supplied which value.
function clampVitaminTotal(statCounts) {
  let total = Object.values(statCounts).reduce((sum, n) => sum + n, 0)
  if (total <= VITAMIN_CAP_PER_STARTER) return statCounts

  const next = { ...statCounts }
  const statsBySizeAsc = Object.keys(next).sort((s1, s2) => next[s1] - next[s2])

  for (const stat of statsBySizeAsc) {
    while (total > VITAMIN_CAP_PER_STARTER && next[stat] > 0) {
      next[stat] -= 1
      total -= 1
    }
    if (total <= VITAMIN_CAP_PER_STARTER) break
  }

  // Drop stats that trimmed to zero so the map matches what applyPurchase
  // would ever produce (a stat only appears once it has at least one point).
  for (const stat of Object.keys(next)) {
    if (next[stat] === 0) delete next[stat]
  }

  return next
}
