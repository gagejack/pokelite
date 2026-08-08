import { test, expect, vi, beforeEach } from 'vitest'
import { META_CATALOG_BY_ID, SPRITE_TIER_PRICES } from '../game/metaCatalog.js'

// Supabase mocking follows the pattern established in metaSave.test.js:
// vi.mock is hoisted above the imports by vitest, so the mock is in place
// before metaShopBalance.js's own `import { supabase } from './supabase'`
// runs.
vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
  },
}))

const { supabase } = await import('./supabase.js')
const {
  getShopPrice, getShopOverrides, loadShopPrices, saveShopPrice, isCommittablePrice, PRICE_MIN, PRICE_MAX,
} = await import('./metaShopBalance.js')

beforeEach(() => {
  supabase.from.mockReset()
  supabase.auth.getUser.mockClear()
})

// ── getShopPrice: catalog default vs override ────────────────────────────

test('getShopPrice returns the catalog default when no override is cached', () => {
  expect(getShopPrice('quick_heal')).toBe(META_CATALOG_BY_ID.quick_heal.cost)
  expect(getShopPrice('extra_slot')).toBe(META_CATALOG_BY_ID.extra_slot.cost)
})

test('getShopPrice returns a sprite tier default when no override is cached', () => {
  expect(getShopPrice('common')).toBe(SPRITE_TIER_PRICES.common)
  expect(getShopPrice('champion')).toBe(SPRITE_TIER_PRICES.champion)
})

test('getShopPrice returns 0 for an unrecognized id rather than undefined/NaN', () => {
  expect(getShopPrice('not_a_real_item')).toBe(0)
})

test('a successful saveShopPrice updates the cache so getShopPrice reflects it immediately', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveShopPrice('quick_heal', 600)
  expect(getShopPrice('quick_heal')).toBe(600)
})

// ── loadShopPrices: populates the cache, non-fatal on failure ────────────

test('loadShopPrices populates the cache from Supabase rows', async () => {
  supabase.from.mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [{ item_id: 'side_hustle', price: 999 }, { item_id: 'uncommon', price: 750 }],
      error: null,
    }),
  })
  await loadShopPrices()
  expect(getShopPrice('side_hustle')).toBe(999)
  expect(getShopPrice('uncommon')).toBe(750)
})

test('loadShopPrices leaves the cache untouched (defaults apply) when Supabase errors', async () => {
  supabase.from.mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: null, error: { message: 'no such table' } }),
  })
  await loadShopPrices()
  expect(getShopPrice('bonded')).toBe(META_CATALOG_BY_ID.bonded.cost)
})

test('loadShopPrices does not throw when the Supabase client itself throws (offline)', async () => {
  supabase.from.mockImplementation(() => { throw new Error('offline') })
  await expect(loadShopPrices()).resolves.toBeUndefined()
  expect(getShopPrice('bonded')).toBe(META_CATALOG_BY_ID.bonded.cost)
})

// ── getShopOverrides: the map handed to MetaShop / effectivePrice ────────

test('getShopOverrides returns only cached overrides, in the shape effectivePrice expects', async () => {
  supabase.from.mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [{ item_id: 'deja_vu', price: 8 }],
      error: null,
    }),
  })
  await loadShopPrices()
  const overrides = getShopOverrides()
  expect(overrides.deja_vu).toBe(8)
  // Unrelated catalog items are not present unless overridden.
  expect(Object.prototype.hasOwnProperty.call(overrides, 'hp_up')).toBe(false)
})

// ── saveShopPrice: validation/clamping ────────────────────────────────────

test('saveShopPrice clamps a negative price up to PRICE_MIN', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveShopPrice('iron', -50)
  expect(getShopPrice('iron')).toBe(PRICE_MIN)
})

test('saveShopPrice clamps an absurdly large price down to PRICE_MAX', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveShopPrice('carbos', 99999999)
  expect(getShopPrice('carbos')).toBe(PRICE_MAX)
})

test('saveShopPrice rounds a fractional price to the nearest whole number', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveShopPrice('zinc', 499.6)
  expect(getShopPrice('zinc')).toBe(500)
})

test('saveShopPrice treats non-numeric garbage input as PRICE_MIN, not NaN', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveShopPrice('calcium', 'garbage')
  expect(getShopPrice('calcium')).toBe(PRICE_MIN)
})

test('saveShopPrice allows exactly 0 (a legitimate free-promo price)', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveShopPrice('protein', 0)
  expect(getShopPrice('protein')).toBe(0)
})

test('saveShopPrice returns { error } and does NOT update the cache when the upsert fails (RLS rejection)', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: 'RLS violation' } }) })
  const before = getShopPrice('shiny_charm')
  const { error } = await saveShopPrice('shiny_charm', 12345)
  expect(error).toBeTruthy()
  expect(getShopPrice('shiny_charm')).toBe(before) // unchanged — non-admin write rejected server-side
})

test('saveShopPrice calls upsert with onConflict item_id and includes updated_by from auth.getUser', async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  supabase.from.mockReturnValue({ upsert })
  await saveShopPrice('interest', 1100)
  expect(supabase.from).toHaveBeenCalledWith('meta_shop_prices')
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ item_id: 'interest', price: 1100, updated_by: 'admin-1' }),
    { onConflict: 'item_id' },
  )
})

// ── isCommittablePrice: the empty-box guard ───────────────────────────────

test('an empty or whitespace-only box is not committable', () => {
  // The bug this exists for: Number('') is 0, and 0 is a LEGITIMATE price (a
  // free promo), so clamp() can't distinguish "mid-edit" from "make this
  // free". Selecting a price, clearing it, and tabbing away before retyping
  // would silently zero the item for every player and report "Saved".
  expect(isCommittablePrice('')).toBe(false)
  expect(isCommittablePrice('   ')).toBe(false)
  expect(isCommittablePrice(null)).toBe(false)
  expect(isCommittablePrice(undefined)).toBe(false)
})

test('an explicit zero IS committable — free is a real price', () => {
  expect(isCommittablePrice('0')).toBe(true)
})

test('ordinary values are committable', () => {
  expect(isCommittablePrice('600')).toBe(true)
  expect(isCommittablePrice('5')).toBe(true)
})
