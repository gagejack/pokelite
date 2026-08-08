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

test('an owned item shows OWNED instead of a Buy button', () => {
  const profile = { ...createProfile(), metacash: 1000, ownedUpgrades: ['side_hustle'] }
  show({ profile })
  const row = screen.getByText('Side Hustle').closest('div').parentElement
  expect(row.textContent).toContain('OWNED')
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
