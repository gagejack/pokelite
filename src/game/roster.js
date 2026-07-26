// Pure roster helpers shared by the run screens.

// Build an onSwap(a, b) handler that swaps two roster slots in place.
// Used by NodeMap and EliteFour so the reorder logic lives in one spot.
export function swapInRoster(setRoster) {
  return (a, b) => setRoster(prev => {
    const r = [...prev]
    ;[r[a], r[b]] = [r[b], r[a]]
    return r
  })
}

// ── Healing consumables ──────────────────────────────────────────────────
// Each returns { roster, used }. `used: false` means the item did nothing and
// the caller must KEEP it rather than consuming it — the same contract the
// Evolve Stone uses on a Pokémon that cannot evolve, so a mis-drop never
// destroys an item.

// Max Heal — restore one Pokémon to full HP. A fainted Pokémon is NOT revived
// (that is Max Revive's job), and one already at full HP is a no-op.
export function healOne(roster, index) {
  const target = roster[index]
  if (!target || target.fainted) return { roster, used: false }
  if (target.stats.hp >= target.stats.maxHp) return { roster, used: false }
  return {
    roster: roster.map((p, i) =>
      i === index ? { ...p, stats: { ...p.stats, hp: p.stats.maxHp } } : p
    ),
    used: true,
  }
}

// Max Revive — revive a fainted Pokémon at full HP. On a Pokémon that is NOT
// fainted it acts as a full heal, so a mis-drop is never wasted. Only a healthy
// target already at full HP is a no-op.
export function reviveOne(roster, index) {
  const target = roster[index]
  if (!target) return { roster, used: false }
  if (!target.fainted && target.stats.hp >= target.stats.maxHp) return { roster, used: false }
  return {
    roster: roster.map((p, i) =>
      i === index ? { ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } } : p
    ),
    used: true,
  }
}

// Mega Revive — revive and fully heal the entire roster. Ignores any target.
// No-op only if every Pokémon is already alive and at full HP.
export function reviveAll(roster) {
  const needsWork = roster.some(p => p.fainted || p.stats.hp < p.stats.maxHp)
  if (!needsWork) return { roster, used: false }
  return {
    roster: roster.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } })),
    used: true,
  }
}
