import { supabase } from './supabase'
import { META_CATALOG_BY_ID, SPRITE_TIER_PRICES } from '../game/metaCatalog.js'

// Admin-tunable shop prices, stored in the `meta_shop_prices` table (see
// supabase/meta_shop_prices.sql). Everyone reads them; only admins can write.
// Mirrors regionBalance.js's cache/load/save shape exactly.
//
// Unlike region_balance (per-region, two fixed keys), this table has one row
// PER CATALOG ITEM plus one per sprite tier — item_id is either a
// metaCatalog.js item id (e.g. 'quick_heal') or a sprite tier id ('common' |
// 'uncommon' | 'elite' | 'champion'). metaCatalog.js's own values are the
// fallback, so a missing row, an offline client, or a failed fetch always
// degrades to shipped prices.

// Prices are whole numbers (dollars or keys — this table doesn't care which,
// see metaCatalog.js's per-item `currency`) with a floor of 0 (a legitimate
// free-promo price, not an error) and a ceiling that catches a fat-fingered
// extra digit without being so tight it blocks a deliberately expensive
// item. Matches supabase/meta_shop_prices.sql's CHECK constraint so a
// client-side reject and a server-side reject agree on the same range.
export const PRICE_MIN = 0
export const PRICE_MAX = 1000000

// itemId -> price override; populated by loadShopPrices().
const cache = new Map()

// Clamp to [PRICE_MIN, PRICE_MAX] and drop to the nearest whole number —
// prices are always whole dollars/keys elsewhere in this codebase (see
// metaProfile.js's roundMoney), and a fractional override would either
// silently truncate downstream or show a decimal nowhere else does.
// Non-numeric input (a cleared/garbage text box) clamps to PRICE_MIN rather
// than propagating NaN through every price display.
function clamp(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return PRICE_MIN
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(num)))
}

// The catalog default for `itemId` — either a metacash/key item's `cost` or
// (for the four sprite-tier ids) SPRITE_TIER_PRICES' base price. Falls back
// to 0 for an unrecognized id rather than undefined, so arithmetic on a
// stale/typo'd id never produces NaN.
function catalogDefault(itemId) {
  return META_CATALOG_BY_ID[itemId]?.cost ?? SPRITE_TIER_PRICES[itemId] ?? 0
}

// Cached price for one item, falling back to its catalog default. Synchronous
// so shop/dashboard render paths can read it without awaiting.
export function getShopPrice(itemId) {
  return cache.has(itemId) ? cache.get(itemId) : catalogDefault(itemId)
}

// The full override map (itemId -> price), for passing straight to
// MetaShop's `overrides` prop and to metaProfile.js's effectivePrice/
// canAfford, both of which already accept this exact shape.
export function getShopOverrides() {
  return Object.fromEntries(cache)
}

// Fetch every price override into the cache. Call once on app start;
// failures are non-fatal (the cache simply stays empty and catalog defaults
// apply throughout the shop).
export async function loadShopPrices() {
  try {
    const { data, error } = await supabase
      .from('meta_shop_prices')
      .select('item_id, price')
    if (error || !data) return
    for (const row of data) {
      cache.set(row.item_id, clamp(row.price))
    }
  } catch {
    // Offline or misconfigured Supabase — catalog defaults apply.
  }
}

// Admin write. Upserts the row and updates the local cache so the change is
// live immediately for this session (including in this admin's own shop, if
// open). Returns { error } on failure (the RLS policy rejects non-admins
// server-side).
export async function saveShopPrice(itemId, price) {
  const value = clamp(price)
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('meta_shop_prices')
    .upsert({
      item_id: itemId,
      price: value,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'item_id' })
  if (!error) cache.set(itemId, value)
  return { error }
}
