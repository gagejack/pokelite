// Which character art represents the PLAYER on screen: the Cosmetics-shop skin
// they have equipped, or the default protagonist when they have none.
//
// Split out of App.jsx rather than living beside DEFAULT_CHARACTER there
// because App.jsx may only export the component (react-refresh/only-export-
// components), and this needs to be independently testable.
//
// Not a leaf module — spriteIndex.js is Vite-coupled (import.meta.glob) — but
// DOM-free and pure, same as spriteIndex itself.
import { spriteById } from './spriteIndex.js'

// The character drawn on every region's map (NodeMap's current-node icon), in
// battle (BattleCard's player column), and on the Elite Four screen.
//
// Derived from the LIVE profile rather than from run state, which is what makes
// equipping in the shop take effect everywhere at once: the skins are a single
// GLOBAL pool, not per-region, so a Kanto-tagged sprite shows in Johto and
// Unova too, and a run resumed after an equip picks up the new skin instead of
// the character saved with its snapshot.
//
// `spriteById` returns null both for "nothing equipped" (equippedSprite null)
// and for a stale id whose asset no longer exists — a renamed or deleted sprite
// sitting in a real saved profile. Both fall back to `fallback` rather than
// rendering a broken image.
export function characterForProfile(profile, fallback) {
  const equipped = spriteById(profile?.equippedSprite)
  if (!equipped) return fallback
  return { id: equipped.id, name: equipped.name, sprite: equipped.url }
}
