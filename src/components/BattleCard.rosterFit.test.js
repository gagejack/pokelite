import { test, expect } from 'vitest'
import { rosterRowPadY, rosterFitsRail } from './BattleCard.jsx'

// The desktop battle rail is a FIXED-height card (DESKTOP_CARD_H = 540,
// overflow: hidden). The roster panel beneath the 74px trainer card gets a
// constant 458px budget (540 - 74 - 8px panel padding), and every row has a
// hard floor from its 58px sprite box. Before this fix, that floor (58 + 2*3
// padding = 64px) was applied unconditionally: 6 rows fit (404px of 458),
// but Extra Slot's 7th row pushed the stack to 472px — 14px past budget,
// silently clipped by the card's overflow:hidden.
//
// rosterRowPadY/rosterFitsRail are the pure extraction of that arithmetic,
// tested independently of DOM measurement per the review's coverage gap:
// partySize was previously exercised only in modifiersFor, never at a
// rendering call site, which is exactly how a clipped 7th row went unnoticed.

test('6 Pokémon (the default, common case): full 3px padding, unchanged from before this fix', () => {
  expect(rosterRowPadY(6)).toBe(3)
  const rowH = 58 + 2 * 3
  expect(rowH).toBe(64)
  const total = 6 * rowH + 5 * 4
  expect(total).toBe(404) // well inside the 458px budget
  expect(rosterFitsRail(6)).toBe(true)
})

test('7 Pokémon (Extra Slot): padding shrinks just enough to fit the budget exactly', () => {
  expect(rosterRowPadY(7)).toBe(2)
  const rowH = 58 + 2 * 2
  expect(rowH).toBe(62)
  const total = 7 * rowH + 6 * 4
  expect(total).toBe(458) // exactly the budget — nothing left over, nothing clipped
  expect(rosterFitsRail(7)).toBe(true)
})

test('regression guard: the OLD unconditional 3px-padding formula would NOT have fit 7 rows', () => {
  // This is the bug the review caught, reproduced directly: with the old
  // fixed 64px row height (no roster-size awareness), 7 rows overflow the
  // 458px budget by 14px, which is exactly what gets clipped by
  // overflow:hidden on the card.
  const OLD_FIXED_ROW_H = 64
  const totalWithOldFormula = 7 * OLD_FIXED_ROW_H + 6 * 4
  expect(totalWithOldFormula).toBe(472)
  expect(totalWithOldFormula).toBeGreaterThan(458)
})

test('fits at every roster size the game can actually produce (1 through 7)', () => {
  for (let n = 1; n <= 7; n++) {
    expect(rosterFitsRail(n)).toBe(true)
  }
})

test('padding never shrinks below the default for rosters at or under the stock cap of 6', () => {
  for (let n = 1; n <= 6; n++) {
    expect(rosterRowPadY(n)).toBe(3)
  }
})
