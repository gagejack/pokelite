import { test, expect, beforeAll, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../lib/theme'

// Supabase is mocked at the module boundary: these tests pin the WIRING —
// controls, per-panel error isolation, stale-data clearing — not the database.
const rpc = vi.fn()
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { default: PlayerStatsPanel } = await import('./PlayerStatsPanel.jsx')

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

// Mirrors the bundle BalanceDashboard builds and passes to its panels.
const theme = {
  textColor: '#DBDBDB', mutedColor: '#9a9a9a', innerBg: '#1a1a1a',
  panelBorder: '2px solid #121212', trackBg: '#333', accentColor: '#facc15',
  shadow: '-2px 3px 0 0 #121212', titleSize: '15px', labelWidth: '130px',
}

const ENGAGEMENT = { total_runs: '1284', active_players: '212', new_players: '44', returning_players: '144' }
const DIFFICULTY = { total_runs: '1284', wins: '115', avg_maps: '3.40', avg_elapsed_ms: '760000' }
const DEPTH = [{ deepest_map: 1, runs: '500' }, { deepest_map: 2, runs: '400' }]
const STARTERS = [{ starter_id: 4, picks: '44', wins: '5' }]
const ECONOMY = { total_runs: '1284', avg_cash: '612', avg_catches: '6.80', runs_with_shiny: '32', runs_with_legendary: '12' }

function mockAll({ failing = null } = {}) {
  rpc.mockImplementation(name => {
    if (name === failing) return Promise.resolve({ data: null, error: new Error('boom') })
    if (name === 'admin_player_engagement') return Promise.resolve({ data: [ENGAGEMENT], error: null })
    if (name === 'admin_player_difficulty') return Promise.resolve({ data: [DIFFICULTY], error: null })
    if (name === 'admin_player_depth') return Promise.resolve({ data: DEPTH, error: null })
    if (name === 'admin_player_starters') return Promise.resolve({ data: STARTERS, error: null })
    if (name === 'admin_player_economy') return Promise.resolve({ data: [ECONOMY], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
}

const renderPanel = () =>
  render(<ThemeProvider><PlayerStatsPanel theme={theme} /></ThemeProvider>)

test('renders every panel figure once the queries land', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())   // total runs
  expect(screen.getByText('212')).toBeTruthy()                          // active players
  expect(screen.getByText('6.1')).toBeTruthy()                          // runs per player
  expect(screen.getByText('9%')).toBeTruthy()                           // win rate
  expect(screen.getByText('$612')).toBeTruthy()                         // avg cash
})

test('one failed query leaves the other panels standing', async () => {
  // The whole point of per-panel error state: an empty Economy panel and a
  // broken one lead to opposite tuning decisions, so they must look different.
  mockAll({ failing: 'admin_player_economy' })
  renderPanel()

  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())
  expect(screen.getByText(/didn't load/)).toBeTruthy()
  // The healthy panels still rendered.
  expect(screen.getByText('212')).toBeTruthy()
  expect(screen.getByText('9%')).toBeTruthy()
})

test('a region with no runs reads as empty, not as a failure', async () => {
  rpc.mockImplementation(name => {
    if (name === 'admin_player_depth' || name === 'admin_player_starters') {
      return Promise.resolve({ data: [], error: null })
    }
    return Promise.resolve({
      data: [{
        total_runs: '0', active_players: '0', new_players: '0', returning_players: '0',
        wins: '0', avg_maps: null, avg_elapsed_ms: null,
        avg_cash: null, avg_catches: null, runs_with_shiny: '0', runs_with_legendary: '0',
      }],
      error: null,
    })
  })
  renderPanel()

  await waitFor(() => expect(screen.getAllByText(/No runs recorded/).length).toBeGreaterThan(0))
  expect(screen.queryByText('NaN%')).toBeNull()
  expect(screen.queryByText(/didn't load/)).toBeNull()
})

test('changing region clears the previous figures while loading', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  // Hold the next round of requests open.
  rpc.mockImplementation(() => new Promise(() => {}))
  // Kanto, not Johto: Johto is on the menu's region list (regionList.js) but
  // has no registered config yet, so it isn't a real option in this <select> —
  // picking it here would leave the control's value unchanged and never fire
  // the region-clearing effect this test exists to check.
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Kanto' } })

  // Stale figures under a new region's heading would misattribute one region's
  // numbers to another.
  await waitFor(() => expect(screen.queryByText('1,284')).toBeNull())
  expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
})

test('selecting Unknown asks for unattributed runs, not a region named Unknown', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  rpc.mockClear()
  mockAll()
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: '__unknown__' } })

  await waitFor(() => expect(rpc).toHaveBeenCalled())
  const [, args] = rpc.mock.calls.find(c => c[0] === 'admin_player_engagement')
  // p_unknown_only overrides p_region; sending both would be unsatisfiable.
  expect(args.p_unknown_only).toBe(true)
  expect(args.p_region).toBeNull()
})

test('changing the range sends a p_since, and All time sends null', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  const firstCall = rpc.mock.calls.find(c => c[0] === 'admin_player_engagement')
  expect(firstCall[1].p_since).toBeNull()   // defaults to all time

  rpc.mockClear()
  mockAll()
  fireEvent.change(screen.getByLabelText('Range'), { target: { value: '30d' } })

  await waitFor(() => expect(rpc).toHaveBeenCalled())
  const [, args] = rpc.mock.calls.find(c => c[0] === 'admin_player_engagement')
  expect(typeof args.p_since).toBe('string')
  expect(Number.isNaN(Date.parse(args.p_since))).toBe(false)
})
