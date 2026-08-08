import { test, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '../lib/theme'
import { SettingsProvider } from '../lib/settings'
import StarterSelect from './StarterSelect.jsx'

// Same jsdom localStorage stub RunEndScreen.test.jsx needs — ThemeProvider
// reads/writes it on mount and this environment doesn't supply one.
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

// Render with the same providers the real screen sits inside (Layout, which
// StarterSelect wraps its content in, reads theme + settings context).
const show = props => render(
  <ThemeProvider>
    <SettingsProvider>
      <StarterSelect
        region={{ name: 'Kanto' }}
        onBack={() => {}}
        onSelectStarter={() => {}}
        pokedexOpen={false}
        setPokedexOpen={() => {}}
        {...props}
      />
    </SettingsProvider>
  </ThemeProvider>,
)

// This is the surface that tells a logged-in player their just-spent key
// didn't reach their account (App.jsx's unlockAndEnterRegion → handleSelect
// Region sets `unlockNotice` from saveProfile's return and passes it here,
// the screen the player is guaranteed to land on right after a successful
// unlock — RegionSelect/MainMenu's region column has already unmounted by
// the time the save's await resolves).
test('an unlock whose save did not reach the account tells the player, instead of staying silent', () => {
  show({ unlockNotice: 'Saved on this device — sign in again to bank it' })
  expect(screen.getByText(/Saved on this device/)).toBeTruthy()
})

test('a normal (saved) unlock shows no local-save notice', () => {
  const { container } = show({ unlockNotice: null })
  expect(container.textContent).not.toContain('Saved on this device')
})

// ── Déjà Vu (key item): a second row for previously-used starters ─────────

test('no profile at all: no Déjà Vu section renders', async () => {
  const { container } = show({})
  // Wait for the region row's own load to settle before asserting absence.
  await screen.findByText('bulbasaur')
  expect(container.textContent).not.toContain('Déjà Vu')
})

test('Déjà Vu not owned, even with run history: no section renders', async () => {
  const profile = { ownedUpgrades: [], usedStarters: [495, 152] }
  const { container } = show({ profile })
  await screen.findByText('bulbasaur')
  expect(container.textContent).not.toContain('Déjà Vu')
})

test('Déjà Vu owned but no run history yet: no section renders (not an empty box)', async () => {
  const profile = { ownedUpgrades: ['deja_vu'], usedStarters: [] }
  const { container } = show({ profile })
  await screen.findByText('bulbasaur')
  expect(container.textContent).not.toContain('Déjà Vu')
})

test('Déjà Vu owned with history from another region: section renders with that starter', async () => {
  // 495 (Snivy) is a Unova starter, offered here while region is Kanto.
  const profile = { ownedUpgrades: ['deja_vu'], usedStarters: [495] }
  show({ profile })
  await screen.findByText('Déjà Vu')
  expect(screen.getByText('snivy')).toBeTruthy()
})

test('Déjà Vu owned with a used starter that is ALSO one of Kanto\'s three: not shown twice', async () => {
  // 4 (Charmander) is already one of Kanto's own three starters.
  const profile = { ownedUpgrades: ['deja_vu'], usedStarters: [4] }
  const { container } = show({ profile })
  await screen.findByText('bulbasaur')
  // No Déjà Vu section at all — Charmander is fully absorbed into the region row.
  expect(container.textContent).not.toContain('Déjà Vu')
  expect(screen.getAllByText('charmander').length).toBe(1)
})
