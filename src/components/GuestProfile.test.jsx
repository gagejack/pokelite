import { test, expect, beforeAll, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../lib/theme'

// Supabase is mocked at the module boundary: these tests pin the WIRING —
// leaderboard row → guest tab → shared panel — not the database. The RPC
// contract itself is covered by playerProfile.test.js.
const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { default: Leaderboard } = await import('./Leaderboard.jsx')
const { default: GuestProfile } = await import('./GuestProfile.jsx')

// ThemeProvider reads and writes localStorage on mount, which this jsdom
// environment doesn't supply. Mirrors Roster.test.jsx's setup.
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

const board = [
  { username: 'ash', xp: 12740, maps_played: 48, champions: 5, is_self: false },
  { username: 'misty', xp: 900, maps_played: 12, champions: 1, is_self: false },
  { username: 'me', xp: 400, maps_played: 6, champions: 0, is_self: true },
]

const profileRow = {
  username: 'ash', xp: '12740', total_runs: '20', wins: '5', losses: '15',
  total_badges: '48', total_catches: '133', best_maps: 9, best_elapsed_ms: '842000',
}

const caughtRows = [
  { kind: 'caught', species_id: 25, name: 'pikachu', count: '12' },
  { kind: 'caught', species_id: 133, name: 'eevee', count: '9' },
]
const rareRows = [
  { kind: 'legendary', species_id: 150, name: 'mewtwo', count: '2' },
  { kind: 'shiny', species_id: 129, name: 'magikarp', count: '3' },
]
const starterRow = { starter_id: 4, count: '8' }

function mockBoard({ collections = true } = {}) {
  rpc.mockImplementation(name => {
    if (name === 'leaderboard') return Promise.resolve({ data: board, error: null })
    if (name === 'leaderboard_self_rank') return Promise.resolve({ data: [], error: null })
    if (name === 'player_profile') return Promise.resolve({ data: [profileRow], error: null })
    if (!collections) return Promise.resolve({ data: null, error: new Error('collections down') })
    if (name === 'player_collections') return Promise.resolve({ data: caughtRows, error: null })
    if (name === 'player_collection_rares') return Promise.resolve({ data: rareRows, error: null })
    if (name === 'player_favourite_starter') return Promise.resolve({ data: [starterRow], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
}

const withTheme = ui => render(<ThemeProvider>{ui}</ThemeProvider>)

test('clicking a name on the board opens that player, and your own row is not a link', async () => {
  mockBoard()
  const onOpenProfile = vi.fn()
  withTheme(<Leaderboard onOpenProfile={onOpenProfile} />)

  const ash = await screen.findByRole('button', { name: 'ash' })
  fireEvent.click(ash)
  expect(onOpenProfile).toHaveBeenCalledWith('ash')

  // Your own row stays plain text: "My Profile" is already a tab, so a guest
  // copy of yourself would put the same player on the strip twice.
  expect(screen.queryByRole('button', { name: 'me' })).toBeNull()
  expect(screen.getByText('me')).toBeTruthy()
})

test('a guest profile renders the shared panel with that player\'s figures', async () => {
  mockBoard()
  withTheme(<GuestProfile username="ash" />)

  // The figures the RPC returns, formatted the way the panel formats them.
  await waitFor(() => expect(screen.getByText('LV 16')).toBeTruthy())
  expect(screen.getByText('20')).toBeTruthy()          // total runs
  expect(screen.getByText('25%')).toBeTruthy()         // win rate, recomputed
  expect(screen.getByText('$12,740')).toBeTruthy()     // thousands separator
  expect(screen.getByText('14m 02s')).toBeTruthy()     // best-run time

  // A guest's level line shows their XP total, not "860 XP to level 17" —
  // how close someone else is to levelling is a detail about them, not a
  // figure you opened their profile to read.
  expect(screen.getByText('12,740 XP')).toBeTruthy()
  expect(screen.queryByText(/XP to level/)).toBeNull()

  // Collections are public, so every section a guest profile can show is here.
  expect(screen.getByText('Most Caught')).toBeTruthy()
  expect(screen.getByText('Favourite Starter')).toBeTruthy()
  expect(screen.getByText('Legendaries')).toBeTruthy()
  expect(screen.getByText('Shinies')).toBeTruthy()
  expect(screen.getByText('pikachu')).toBeTruthy()
  expect(screen.getByText('×12')).toBeTruthy()
  expect(screen.getByText('Charmander')).toBeTruthy()   // favourite starter, by id
  expect(screen.getByText('Chosen 8 times')).toBeTruthy()

  // The Hall of Fame is the one thing still private, and the closing line is
  // what keeps its absence from reading as a profile that failed to load.
  expect(screen.getByText(/Hall of Fame teams stay private/)).toBeTruthy()
})

test('the legendaries popup opens on a guest profile with that player\'s species', async () => {
  mockBoard()
  withTheme(<GuestProfile username="ash" />)
  await waitFor(() => expect(screen.getByText('Legendaries')).toBeTruthy())

  fireEvent.click(screen.getByText('Legendaries'))
  // The shared CollectionDetail, opened from the guest tab.
  await waitFor(() => expect(screen.getByText('Legendaries Caught')).toBeTruthy())
  expect(screen.getByText('mewtwo')).toBeTruthy()
  expect(screen.getByText('×2')).toBeTruthy()
  // Shinies are a separate list and must not leak into the legendary popup.
  expect(screen.queryByText('magikarp')).toBeNull()
})

test('View all opens the full species list, beyond the ten in the grid', async () => {
  // Fourteen species: the grid shows ten, the popup shows all fourteen.
  const many = Array.from({ length: 14 }, (_, i) => ({
    kind: 'caught', species_id: i + 1, name: `mon${i + 1}`, count: String(20 - i),
  }))
  rpc.mockImplementation(name => {
    if (name === 'player_profile') return Promise.resolve({ data: [profileRow], error: null })
    if (name === 'player_collections') return Promise.resolve({ data: many, error: null })
    if (name === 'player_collection_rares') return Promise.resolve({ data: [], error: null })
    if (name === 'player_favourite_starter') return Promise.resolve({ data: [], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
  withTheme(<GuestProfile username="ash" />)

  await waitFor(() => expect(screen.getByText('Most Caught')).toBeTruthy())
  // The grid stops at ten, so the eleventh is not on the page yet.
  expect(screen.getByText('mon10')).toBeTruthy()
  expect(screen.queryByText('mon11')).toBeNull()

  fireEvent.click(screen.getByText('View all 14 species'))
  await waitFor(() => expect(screen.getByText('All Species Caught')).toBeTruthy())
  expect(screen.getByText('mon14')).toBeTruthy()
})

test('View all stays hidden when the grid already shows everything', async () => {
  mockBoard()   // two caught species, well under the cap
  withTheme(<GuestProfile username="ash" />)
  await waitFor(() => expect(screen.getByText('Most Caught')).toBeTruthy())
  // A popup holding nothing the grid doesn't already show is not worth a control.
  expect(screen.queryByText(/View all/)).toBeNull()
})

test('a collection query that fails leaves the profile standing', async () => {
  // The figures are the page; the collections are detail on it. A collections
  // outage must not replace a good profile with an error screen.
  mockBoard({ collections: false })
  withTheme(<GuestProfile username="ash" />)

  await waitFor(() => expect(screen.getByText('LV 16')).toBeTruthy())
  expect(screen.getByText('$12,740')).toBeTruthy()
  expect(screen.queryByText(/didn't load/)).toBeNull()
  // The section still renders, with its empty state rather than stale data.
  expect(screen.getByText('No catches recorded yet.')).toBeTruthy()
})

test('a player with no recorded runs reads as empty, not as a failure', async () => {
  rpc.mockResolvedValue({ data: [], error: null })
  withTheme(<GuestProfile username="ghost" />)
  await waitFor(() => expect(screen.getByText(/No runs recorded for ghost/)).toBeTruthy())
})

test('a failed lookup says what to do instead of rendering an empty profile', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('boom') })
  withTheme(<GuestProfile username="ash" />)
  await waitFor(() => expect(screen.getByText(/didn't load/)).toBeTruthy())
  // The critical part: a zero-filled profile must never be shown for an error,
  // which is exactly what RLS would have produced without the RPC.
  expect(screen.queryByText('LV 1')).toBeNull()
})

test('switching to another player clears the previous figures while loading', async () => {
  mockBoard()
  const { rerender } = withTheme(<GuestProfile username="ash" />)
  await waitFor(() => expect(screen.getByText('$12,740')).toBeTruthy())

  // Point the tab at someone else. The profile fetch is held open; the three
  // collection calls resolve normally, since it is the headline figures that
  // gate the loading state.
  let releaseProfile
  rpc.mockImplementation(name => {
    if (name === 'player_profile') return new Promise(r => { releaseProfile = r })
    return Promise.resolve({ data: [], error: null })
  })
  rerender(
    <ThemeProvider><GuestProfile username="misty" /></ThemeProvider>
  )

  // ash's numbers must be gone immediately — a stale profile shown under a new
  // player's name misattributes one player's record to another.
  expect(screen.queryByText('$12,740')).toBeNull()
  expect(screen.getByText('Loading...')).toBeTruthy()

  releaseProfile({ data: [{ ...profileRow, username: 'misty', xp: '900' }], error: null })
  await waitFor(() => expect(screen.getByText('$900')).toBeTruthy())
})
