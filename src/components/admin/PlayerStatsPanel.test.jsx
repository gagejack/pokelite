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

// Per-region responses keyed by the p_region argument, so a test can give each
// region genuinely different numbers and prove they are not being combined.
function mockPerRegion(byRegion) {
  rpc.mockImplementation((name, args) => {
    const scoped = args?.p_region
    if (scoped && byRegion[scoped]) {
      const r = byRegion[scoped]
      if (r.error) return Promise.resolve({ data: null, error: new Error('boom') })
      if (name === 'admin_player_difficulty') return Promise.resolve({ data: [r.difficulty], error: null })
      if (name === 'admin_player_depth') return Promise.resolve({ data: r.depth, error: null })
      if (name === 'admin_player_starters') return Promise.resolve({ data: r.starters, error: null })
    }
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

// Region headings inside the breakdown, excluding the <select>'s own <option>
// for the same region — both carry the region's name as their text.
const regionHeadings = name =>
  screen.queryAllByText(name).filter(el => el.tagName !== 'OPTION')

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

test('All regions asks for each region separately, not just one combined set', async () => {
  // The bug this fixes: difficulty and starters were a single blended set of
  // bars, so "which map do Johto players quit on" was unanswerable.
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  const scopedRegions = new Set(
    rpc.mock.calls
      .filter(c => c[0] === 'admin_player_depth' && c[1]?.p_region)
      .map(c => c[1].p_region)
  )

  // More than one region is asked for individually — that is the fix. (Counts
  // aren't asserted: the effect runs twice under StrictMode, so the same
  // region legitimately appears in the call log more than once.)
  expect(scopedRegions.size).toBeGreaterThan(1)
  expect(scopedRegions.has('Kanto')).toBe(true)
  // The scoped calls never carry the unknown-only flag — that bucket is a
  // separate selection, not a region.
  rpc.mock.calls
    .filter(c => c[1]?.p_region)
    .forEach(c => expect(c[1].p_unknown_only).toBe(false))
})

test('each region depth curve is scoped to that region own runs', async () => {
  // Kanto and Johto get different shapes; both must survive to the screen
  // intact rather than being averaged into one curve.
  mockPerRegion({
    Kanto: {
      difficulty: { total_runs: '100', wins: '10', avg_maps: '3', avg_elapsed_ms: '700000' },
      depth: [{ deepest_map: 1, runs: '75' }, { deepest_map: 2, runs: '25' }],
      starters: [{ starter_id: 4, picks: '100', wins: '10' }],
    },
    Johto: {
      difficulty: { total_runs: '10', wins: '5', avg_maps: '4', avg_elapsed_ms: '900000' },
      depth: [{ deepest_map: 6, runs: '10' }],
      starters: [{ starter_id: 155, picks: '10', wins: '5' }],
    },
  })
  renderPanel()

  await waitFor(() => expect(regionHeadings('Kanto').length).toBeGreaterThan(0))
  expect(regionHeadings('Johto').length).toBeGreaterThan(0)

  // Kanto's 75/100 is 75% of Kanto — not 75/110 of the combined field.
  expect(screen.getByText('75% · 75')).toBeTruthy()
  // Johto's single bin is 100% of Johto, though it is only 10 runs overall.
  expect(screen.getByText('100% · 10')).toBeTruthy()
  // Per-region run counts and win rates are labelled, so a 100% bar on ten
  // runs can't be mistaken for a 100% bar on a thousand.
  expect(screen.getByText('100 runs · 10% win')).toBeTruthy()
  expect(screen.getByText('10 runs · 50% win')).toBeTruthy()
})

test('one broken region does not blank the others', async () => {
  mockPerRegion({
    Kanto: {
      difficulty: { total_runs: '100', wins: '10', avg_maps: '3', avg_elapsed_ms: '700000' },
      depth: [{ deepest_map: 1, runs: '100' }],
      starters: [{ starter_id: 4, picks: '100', wins: '10' }],
    },
    Johto: { error: true },
  })
  renderPanel()

  await waitFor(() => expect(regionHeadings('Kanto').length).toBeGreaterThan(0))
  // Johto is still listed, marked broken — dropping it would read as
  // "nobody plays Johto", the opposite of "the Johto query failed".
  expect(regionHeadings('Johto').length).toBeGreaterThan(0)
  expect(screen.getAllByText(/This region didn't load/).length).toBeGreaterThan(0)
})

test('picking a single region drops the breakdown and shows just that region', async () => {
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  rpc.mockClear()
  mockAll()
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Kanto' } })

  await waitFor(() => expect(rpc).toHaveBeenCalled())
  // No per-region fan-out: every scoped call is for the selected region only.
  const scoped = rpc.mock.calls.filter(c => c[1]?.p_region)
  scoped.forEach(c => expect(c[1].p_region).toBe('Kanto'))
  // No per-region headings remain — the breakdown is gone, not just refiltered.
  await waitFor(() => expect(regionHeadings('Johto').length).toBe(0))
  expect(regionHeadings('Kanto').length).toBe(0)
})

test('Unknown does not fan out per region', async () => {
  // Unattributed runs have no region to split by; asking per region would
  // return five empty blocks that say nothing.
  mockAll()
  renderPanel()
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())

  rpc.mockClear()
  mockAll()
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: '__unknown__' } })

  await waitFor(() => expect(rpc).toHaveBeenCalled())
  expect(rpc.mock.calls.filter(c => c[1]?.p_region).length).toBe(0)
})

// --- Per-starter depth colouring ------------------------------------------

// The depth RPC returns one row per (deepest_map, starter_id). The bar for a
// map must be ONE bar split into coloured pieces, not three bars — and the
// pieces must be sized against the whole dataset so the bar keeps its length.
test('a depth bar is one bar split into a segment per starter', async () => {
  rpc.mockImplementation(name => {
    if (name === 'admin_player_depth') {
      return Promise.resolve({
        data: [
          { deepest_map: 1, starter_id: 1, runs: '10' },
          { deepest_map: 1, starter_id: 4, runs: '20' },
          { deepest_map: 1, starter_id: 7, runs: '30' },
          { deepest_map: 2, starter_id: 4, runs: '40' },
        ],
        error: null,
      })
    }
    if (name === 'admin_player_engagement') return Promise.resolve({ data: [ENGAGEMENT], error: null })
    if (name === 'admin_player_difficulty') return Promise.resolve({ data: [DIFFICULTY], error: null })
    if (name === 'admin_player_starters') return Promise.resolve({ data: STARTERS, error: null })
    if (name === 'admin_player_economy') return Promise.resolve({ data: [ECONOMY], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
  renderPanel()

  // Kanto scopes the panel to a single region so only the combined curve runs.
  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Kanto' } })

  await waitFor(() => expect(screen.getByText('Map 1')).toBeTruthy())
  // One bar per depth, not one per (depth, starter).
  expect(screen.queryAllByText('Map 1').length).toBe(1)

  // Three segments under Map 1, each titled with its starter and run count,
  // and each sized against the 100-run total rather than the bin's own 60.
  //
  // Widths are DOUBLE the share, because the depth bars are drawn against a
  // 50% axis — 30 runs of 100 is a 30% share and a 60%-wide bar. The label
  // still reads the true share; only the drawn width is scaled.
  const seg = name => document.querySelector(`[title^="${name}:"]`)
  expect(seg('Squirtle').style.width).toBe('60%')
  expect(seg('Charmander')).toBeTruthy()
  expect(seg('Bulbasaur').style.width).toBe('20%')
  // Three distinct colours, one per starter type.
  const colors = new Set(['Bulbasaur', 'Charmander', 'Squirtle'].map(n => seg(n).style.backgroundColor))
  expect(colors.size).toBe(3)
})

// Runs predating runs.starter_id must be visible as their own segment with a
// legend entry — silently folding them into a starter would misattribute them.
test('runs with no recorded starter get their own segment and legend entry', async () => {
  rpc.mockImplementation(name => {
    if (name === 'admin_player_depth') {
      return Promise.resolve({
        data: [
          { deepest_map: 1, starter_id: null, runs: '25' },
          { deepest_map: 1, starter_id: 4, runs: '75' },
        ],
        error: null,
      })
    }
    if (name === 'admin_player_engagement') return Promise.resolve({ data: [ENGAGEMENT], error: null })
    if (name === 'admin_player_difficulty') return Promise.resolve({ data: [DIFFICULTY], error: null })
    if (name === 'admin_player_starters') return Promise.resolve({ data: STARTERS, error: null })
    if (name === 'admin_player_economy') return Promise.resolve({ data: [ECONOMY], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
  renderPanel()

  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Kanto' } })

  await waitFor(() => expect(screen.getByText('Map 1')).toBeTruthy())
  // 25 of 100 runs — a 25% share, drawn at 50% against the 50% axis.
  expect(document.querySelector('[title^="No starter recorded:"]').style.width).toBe('50%')
  expect(screen.getByText('No starter recorded')).toBeTruthy()
})

// The grey swatch is explained only when a grey segment is actually drawn.
test('the legend omits the unattributed swatch when every run has a starter', async () => {
  rpc.mockImplementation(name => {
    if (name === 'admin_player_depth') {
      return Promise.resolve({ data: [{ deepest_map: 1, starter_id: 4, runs: '100' }], error: null })
    }
    if (name === 'admin_player_engagement') return Promise.resolve({ data: [ENGAGEMENT], error: null })
    if (name === 'admin_player_difficulty') return Promise.resolve({ data: [DIFFICULTY], error: null })
    if (name === 'admin_player_starters') return Promise.resolve({ data: STARTERS, error: null })
    if (name === 'admin_player_economy') return Promise.resolve({ data: [ECONOMY], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
  renderPanel()

  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Kanto' } })

  await waitFor(() => expect(screen.getByText('Map 1')).toBeTruthy())
  expect(screen.getByText('Grass starter')).toBeTruthy()
  expect(screen.queryByText('No starter recorded')).toBeNull()
})

// The 50% axis is a DRAWING choice, not a data one: the numeric labels must
// keep reporting true shares of all runs, or an admin reads every bin as
// twice as common as it is.
test('the 50% axis scales the drawn bar but never the reported percentage', async () => {
  rpc.mockImplementation(name => {
    if (name === 'admin_player_depth') {
      return Promise.resolve({
        data: [
          { deepest_map: 1, starter_id: 4, runs: '20' },
          { deepest_map: 2, starter_id: 4, runs: '80' },
        ],
        error: null,
      })
    }
    if (name === 'admin_player_engagement') return Promise.resolve({ data: [ENGAGEMENT], error: null })
    if (name === 'admin_player_difficulty') return Promise.resolve({ data: [DIFFICULTY], error: null })
    if (name === 'admin_player_starters') return Promise.resolve({ data: STARTERS, error: null })
    if (name === 'admin_player_economy') return Promise.resolve({ data: [ECONOMY], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
  renderPanel()

  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Kanto' } })
  await waitFor(() => expect(screen.getByText('Map 1')).toBeTruthy())

  // 20% of runs, drawn at 40%; the label still says 20%.
  expect(document.querySelector('[title^="Charmander: 20 runs"]').style.width).toBe('40%')
  expect(screen.getByText('20%')).toBeTruthy()

  // 80% is past the axis: it clamps to a full track rather than overflowing,
  // and the label still tells the truth about the share.
  expect(document.querySelector('[title^="Charmander: 80 runs"]').style.width).toBe('100%')
  expect(screen.getByText('80%')).toBeTruthy()
})

// The Starters bars are shares of all picks and really can approach 100%, so
// they must keep the plain 0-100 axis the depth bars opted out of.
test('the starters bars keep a full 0-100 axis', async () => {
  rpc.mockImplementation(name => {
    if (name === 'admin_player_starters') {
      return Promise.resolve({ data: [{ starter_id: 4, picks: '60', wins: '6' }, { starter_id: 1, picks: '40', wins: '4' }], error: null })
    }
    if (name === 'admin_player_engagement') return Promise.resolve({ data: [ENGAGEMENT], error: null })
    if (name === 'admin_player_difficulty') return Promise.resolve({ data: [DIFFICULTY], error: null })
    if (name === 'admin_player_depth') return Promise.resolve({ data: DEPTH, error: null })
    if (name === 'admin_player_economy') return Promise.resolve({ data: [ECONOMY], error: null })
    return Promise.resolve({ data: null, error: new Error('unexpected rpc') })
  })
  renderPanel()

  await waitFor(() => expect(screen.getByText('1,284')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Kanto' } })
  await waitFor(() => expect(screen.getByText('Charmander')).toBeTruthy())

  // 60% of picks is a 60%-wide bar here — NOT doubled to 120/100.
  const row = screen.getByText('Charmander').closest('div')
  const track = [...row.querySelectorAll('div')].find(d => d.style.height === '9px')
  expect(track.firstElementChild.style.width).toBe('60%')
})
