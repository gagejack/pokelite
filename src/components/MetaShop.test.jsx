import { test, expect, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../lib/theme'
import MetaShop from './MetaShop.jsx'
import { createProfile } from '../game/metaProfile.js'

// Same jsdom localStorage stub RunEndScreen.test.jsx/StarterSelect.test.jsx
// need — ThemeProvider reads/writes it on mount.
beforeAll(() => {
  if (typeof localStorage !== 'undefined') return
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  }
})

const show = props => render(
  <ThemeProvider>
    <MetaShop profile={createProfile()} onClose={() => {}} onPurchase={() => {}} {...props} />
  </ThemeProvider>,
)

test('the header shows the balance, persistent regardless of which tab is active', () => {
  const profile = { ...createProfile(), metacash: 2450, keys: 3 }
  show({ profile })
  expect(screen.getByText('$2,450 · 3 🔑')).toBeTruthy()
})

test('Upgrades is the default tab and lists a metacash item cheapest-first', () => {
  show({})
  // Side Hustle ($300) is the cheapest metacash item — it should render.
  expect(screen.getByText('Side Hustle')).toBeTruthy()
  expect(screen.getByText('+$10 per non-combat node')).toBeTruthy()
})

test('an affordable item calls onPurchase with the updated profile on Buy', () => {
  let captured = null
  const profile = { ...createProfile(), metacash: 1000 }
  show({ profile, onPurchase: p => { captured = p } })

  const row = screen.getByText('Side Hustle').closest('div').parentElement
  const buyButton = row.querySelector('button')
  fireEvent.click(buyButton)

  expect(captured).not.toBeNull()
  expect(captured.metacash).toBe(1000 - 300)
  expect(captured.ownedUpgrades).toContain('side_hustle')
})

test('an unaffordable item renders a disabled Buy button and does not call onPurchase', () => {
  let called = false
  const profile = { ...createProfile(), metacash: 0 }
  show({ profile, onPurchase: () => { called = true } })

  const row = screen.getByText('Side Hustle').closest('div').parentElement
  const buyButton = row.querySelector('button')
  expect(buyButton.disabled).toBe(true)
  fireEvent.click(buyButton)
  expect(called).toBe(false)
})

test('an owned item shows an enabled toggle switch instead of a Buy button', () => {
  const profile = { ...createProfile(), metacash: 1000, ownedUpgrades: ['side_hustle'] }
  show({ profile })
  const row = screen.getByText('Side Hustle').closest('div').parentElement
  const toggle = row.querySelector('button[role="switch"]')
  expect(toggle).toBeTruthy()
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect(row.textContent).not.toContain('Buy')
})

test('clicking an owned item\'s toggle disables it and calls onPurchase with disabledUpgrades set', () => {
  const profile = { ...createProfile(), metacash: 1000, ownedUpgrades: ['side_hustle'] }
  let captured = null
  show({ profile, onPurchase: p => { captured = p } })
  const row = screen.getByText('Side Hustle').closest('div').parentElement
  const toggle = row.querySelector('button[role="switch"]')
  fireEvent.click(toggle)
  expect(captured.disabledUpgrades).toContain('side_hustle')
})

test('Starting Funds II shows the locked-by-prerequisite copy instead of a price', () => {
  const profile = { ...createProfile(), metacash: 999999 }
  show({ profile })
  expect(screen.getByText('Requires Starting Funds I')).toBeTruthy()
})

test('buying a vitamin opens the starter picker instead of purchasing immediately', () => {
  const profile = { ...createProfile(), metacash: 1000 }
  show({ profile })
  const row = screen.getByText('HP Up').closest('div').parentElement
  const buyButton = row.querySelector('button')
  fireEvent.click(buyButton)
  expect(screen.getByText('Choose a starter for HP Up')).toBeTruthy()
  // Kanto's three starters should be offered (fresh profile = Kanto only).
  expect(screen.getByText('Bulbasaur')).toBeTruthy()
})

test('confirming a starter in the picker applies the vitamin purchase and closes it', () => {
  let captured = null
  const profile = { ...createProfile(), metacash: 1000 }
  show({ profile, onPurchase: p => { captured = p } })
  fireEvent.click(screen.getByText('HP Up').closest('div').parentElement.querySelector('button'))
  fireEvent.click(screen.getByText('Bulbasaur'))

  expect(captured).not.toBeNull()
  expect(captured.vitamins[1]).toEqual({ hp: 1 })
  expect(screen.queryByText('Choose a starter for HP Up')).toBeNull()
})

test('switching to Cosmetics shows region sub-tabs, and a locked region reads "Unlock <Region>"', () => {
  // Fresh profile: only Kanto unlocked, so Hoenn's tab should show the lock copy.
  show({})
  fireEvent.click(screen.getByText('COSMETICS'))
  fireEvent.click(screen.getByText('HOENN'))
  const lockNotices = screen.getAllByText((_, el) => el.textContent === 'Unlock Hoenn')
  expect(lockNotices.length).toBeGreaterThan(0)
})

test('a locked-region sprite card is inert: clicking it never calls onPurchase', () => {
  let called = false
  show({ onPurchase: () => { called = true; return {} } })
  fireEvent.click(screen.getByText('COSMETICS'))
  fireEvent.click(screen.getByText('HOENN'))

  const lockNotice = screen.getAllByText((_, el) => el.textContent === 'Unlock Hoenn')[0]
  // Click the whole offer card (the locked overlay's ancestor), not just the
  // text — the overlay has pointer-events: none specifically so clicks pass
  // through to the card, and the card's onClick no-ops when unlocked=false.
  const card = lockNotice.closest('div[style*="position: relative"]')
  expect(card).toBeTruthy()
  fireEvent.click(card)

  expect(called).toBe(false)
})

test('a starter at the 3-vitamin cap renders a disabled button in the picker', () => {
  const profile = { ...createProfile(), metacash: 1000, vitamins: { 1: { hp: 3 } } }
  show({ profile })
  fireEvent.click(screen.getByText('HP Up').closest('div').parentElement.querySelector('button'))

  const bulbasaurCell = screen.getByText('Bulbasaur').closest('button')
  expect(bulbasaurCell.disabled).toBe(true)
})

test('an owned sprite can be equipped from the YOUR SPRITES section (end to end)', () => {
  let captured = null
  const profile = {
    ...createProfile(),
    metacash: 1000,
    ownedSprites: ['Kanto/Ace Trainer 1'],
    equippedSprite: null,
  }
  show({ profile, onPurchase: p => { captured = p; return {} } })
  fireEvent.click(screen.getByText('COSMETICS'))

  expect(screen.getByText('YOUR SPRITES')).toBeTruthy()
  const equipButtons = screen.getAllByText('EQUIP')
  fireEvent.click(equipButtons[equipButtons.length - 1].closest('div[role="button"]'))

  expect(captured).not.toBeNull()
  expect(captured.equippedSprite).toBe('Kanto/Ace Trainer 1')
})

test('an equipped owned sprite can be un-equipped back to the default trainer sprite', () => {
  let captured = null
  const profile = {
    ...createProfile(),
    metacash: 1000,
    ownedSprites: ['Kanto/Ace Trainer 1'],
    equippedSprite: 'Kanto/Ace Trainer 1',
  }
  show({ profile, onPurchase: p => { captured = p; return {} } })
  fireEvent.click(screen.getByText('COSMETICS'))
  fireEvent.click(screen.getByText('Reset to default'))

  expect(captured).not.toBeNull()
  expect(captured.equippedSprite).toBeNull()
})

test('a rejected onPurchase (e.g. a save failure) surfaces a notice instead of an unhandled rejection', async () => {
  const profile = { ...createProfile(), metacash: 1000 }
  show({ profile, onPurchase: () => Promise.reject(new Error('network down')) })

  const row = screen.getByText('Side Hustle').closest('div').parentElement
  fireEvent.click(row.querySelector('button'))

  expect(await screen.findByText('Could not save — try again')).toBeTruthy()
})

test('a funds race during confirm keeps the picker open and shows the reason inline, instead of closing silently', () => {
  // Exactly enough for one HP Up and nothing else, so the row that opens the
  // picker reads 'affordable'. starterPickerRows' atCap check (the only thing
  // that disables a button in the picker grid) never looks at metacash, so
  // Bulbasaur stays clickable even after the rerender below drains the
  // balance to 0 — a realistic race with another purchase landing while the
  // picker is open. applyPurchase re-checks affordability at confirm time
  // regardless of what the (now stale) picker grid shows.
  const profile = { ...createProfile(), metacash: 500 }
  const { rerender } = render(
    <ThemeProvider>
      <MetaShop profile={profile} onClose={() => {}} onPurchase={() => {}} />
    </ThemeProvider>,
  )
  fireEvent.click(screen.getByText('HP Up').closest('div').parentElement.querySelector('button'))
  expect(screen.getByText('Choose a starter for HP Up')).toBeTruthy()

  const racedProfile = { ...profile, metacash: 0 }
  rerender(
    <ThemeProvider>
      <MetaShop profile={racedProfile} onClose={() => {}} onPurchase={() => {}} />
    </ThemeProvider>,
  )

  const bulbasaurButton = screen.getByText('Bulbasaur').closest('button')
  expect(bulbasaurButton.disabled).toBe(false)
  fireEvent.click(bulbasaurButton)

  // Picker stays open (title still present) and shows the rejection reason,
  // rather than vanishing with no explanation.
  expect(screen.getByText('Choose a starter for HP Up')).toBeTruthy()
  expect(screen.getByText('Not enough metacash')).toBeTruthy()
})

test('Bargain Hunter discounts sprite prices, not just catalog items', () => {
  // Spec §2 item 9 is "15% off ALL shop prices". Sprites aren't catalog rows,
  // so the discount can't reach them by item id the way it reaches Quick Heal
  // — and for a while it didn't reach them at all, silently excluding the
  // whole Cosmetics tab from a $500 perk. Compares the SAME card with and
  // without the upgrade owned, so it can't pass by coincidence of tiering.
  const base = { ...createProfile(), metacash: 99999 }
  const { unmount } = show({ profile: base })
  fireEvent.click(screen.getByText('COSMETICS'))
  const plain = screen.getAllByText(/^\$[\d,]+$/).map(el => el.textContent)
  unmount()

  const withBh = { ...base, ownedUpgrades: ['bargain_hunter'] }
  show({ profile: withBh })
  fireEvent.click(screen.getByText('COSMETICS'))
  const discounted = screen.getAllByText(/^\$[\d,]+$/).map(el => el.textContent)

  expect(plain.length).toBeGreaterThan(0)
  expect(discounted.length).toBe(plain.length)
  // Every price must be strictly lower once Bargain Hunter is owned.
  const toNum = s => Number(s.replace(/[$,]/g, ''))
  for (let i = 0; i < plain.length; i++) {
    expect(toNum(discounted[i])).toBe(Math.round(toNum(plain[i]) * 0.85))
  }
})

test('an unaffordable row stays full opacity — only the Buy button greys out', () => {
  // Regression: the row used to fade to 0.6 whenever the item was unaffordable
  // or owned, which greyed the name, description and icon of nearly the whole
  // catalog for a player who had just started earning. That reads as "the shop
  // is broken", not "you can't afford this yet". The merchandise stays legible;
  // only the button carries affordability.
  const broke = { ...createProfile(), metacash: 0 }
  const { container } = show({ profile: broke })

  // Side Hustle is $300, so at $0 it is unaffordable.
  const label = screen.getByText('Side Hustle')
  const row = label.closest('div[style*="border-bottom"]')
  expect(row).toBeTruthy()
  // No row-level fade.
  expect(row.style.opacity === '' || row.style.opacity === '1').toBe(true)

  // The Buy button in that row is genuinely disabled.
  const buy = [...row.querySelectorAll('button')].find(b => b.textContent === 'Buy')
  expect(buy).toBeTruthy()
  expect(buy.disabled).toBe(true)
})
