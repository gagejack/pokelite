import { test, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '../lib/theme'
import RunEndScreen from './RunEndScreen.jsx'
import { defeatVerdict, victoryVerdict } from '../game/runVerdict.js'

// ThemeProvider reads and writes localStorage on mount, which this jsdom
// environment doesn't supply. A map-backed stub is enough — no test here
// depends on the stored value, only on the provider mounting.
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

const roster = [
  { name: 'typhlosion', level: 54, sprite: 'a.png', types: ['fire'] },
  { name: 'lanturn', level: 51, sprite: 'b.png', types: ['water', 'electric'] },
]

const badges = [
  { name: 'Zephyr', icon: 'z.png' },
  { name: 'Hive', icon: 'h.png' },
]

// Render with the theme provider the real screens sit inside.
const show = props => render(
  <ThemeProvider>
    <RunEndScreen roster={roster} badges={badges} {...props} />
  </ThemeProvider>,
)

// Strip the two things that are SUPPOSED to differ (the headline and the
// verdict word), so what's left is the structure both endings share.
function skeleton(container, title, verdict) {
  let html = container.innerHTML.replaceAll(title, 'TITLE')
  if (verdict) html = html.replaceAll(verdict, 'VERDICT')
  return html
}

test('victory and defeat render the same structure apart from headline and verdict', () => {
  // Same money on both sides, so any difference is layout, not data.
  const money = { cashEarned: 1200, speedCash: 400, badgesEarned: 2 }

  const lose = show({
    title: 'Defeated...', titleColor: '#ef4444',
    verdict: defeatVerdict(money.speedCash), ...money,
  })
  const loseHtml = skeleton(lose.container, 'Defeated...', 'hoarded')
    .replaceAll('#ef4444', 'HEADCOLOR')
  lose.unmount()

  const win = show({
    title: 'Region Cleared', titleColor: '#3f9d4f',
    verdict: victoryVerdict(money.speedCash), ...money,
  })
  const winHtml = skeleton(win.container, 'Region Cleared', 'banked')
    // The headline color is the other intended difference. The ledger band is
    // also #3f9d4f, so replace only the headline's own occurrence.
    .replace('color: rgb(63, 157, 79); text-shadow', 'color: HEADCOLOR; text-shadow')
    .replaceAll('#3f9d4f', 'LEDGERGREEN')

  const loseNorm = loseHtml.replaceAll('#3f9d4f', 'LEDGERGREEN')
    .replace('color: rgb(239, 68, 68); text-shadow', 'color: HEADCOLOR; text-shadow')

  expect(winHtml).toBe(loseNorm)
})

test('the win screen shows the final team, the full badge row and both money figures', () => {
  show({
    title: 'Region Cleared', titleColor: '#3f9d4f',
    verdict: victoryVerdict(400),
    cashEarned: 1200, speedCash: 400, badgesEarned: 2,
  })

  expect(screen.getByText('Region Cleared')).toBeTruthy()
  expect(screen.getByText('Run Ledger')).toBeTruthy()
  expect(screen.getByText('$1,200')).toBeTruthy()
  expect(screen.getByText('$400')).toBeTruthy()
  expect(screen.getByText('2/2')).toBeTruthy()
  // Both roster members, with levels.
  expect(screen.getByText(/typhlosion/)).toBeTruthy()
  expect(screen.getByText(/lanturn/)).toBeTruthy()
  expect(screen.getByText('LV 54')).toBeTruthy()
})

test('a cleared region reads its leftover cash as banked, a loss reads it as hoarded', () => {
  expect(victoryVerdict(400)).toBe('banked')
  expect(defeatVerdict(400)).toBe('hoarded')
  // Both stay silent in the middle band — the number says nothing useful there.
  expect(victoryVerdict(150)).toBeNull()
  expect(defeatVerdict(150)).toBeNull()
})

test('every badge shows earned on a region clear, unlike a mid-run defeat', () => {
  const { container, unmount } = show({
    title: 'Region Cleared', titleColor: '#3f9d4f', badgesEarned: 2,
  })
  const winIcons = [...container.querySelectorAll('img[alt="Zephyr"], img[alt="Hive"]')]
  expect(winIcons.every(i => i.style.filter === 'none')).toBe(true)
  unmount()

  // A defeat partway through blacks out the badges not yet earned.
  const lost = show({ title: 'Defeated...', titleColor: '#ef4444', badgesEarned: 1 })
  const hive = lost.container.querySelector('img[alt="Hive"]')
  expect(hive.style.filter).toBe('brightness(0) opacity(0.45)')
})

test('a win shows the metacash and key payout, with no maps arithmetic', () => {
  const { container } = show({
    title: 'Region Cleared', titleColor: '#3f9d4f',
    metacashEarned: 200, keysEarned: 1, mapsCleared: 8,
  })
  expect(screen.getByText('+ $200 metacash')).toBeTruthy()
  expect(screen.getByText('+ 1 key')).toBeTruthy()
  // A win's payout isn't a simple maps × $15 the player can reconstruct, so
  // that line is loss-only.
  expect(container.textContent).not.toContain('maps × $15')
})

test('a loss shows the metacash payout with the maps arithmetic beneath it, and no key figure', () => {
  const { container } = show({
    title: 'Defeated...', titleColor: '#ef4444',
    metacashEarned: 45, keysEarned: 0, mapsCleared: 3,
  })
  expect(screen.getByText('+ $45 metacash')).toBeTruthy()
  expect(screen.getByText('3 maps × $15')).toBeTruthy()
  expect(container.textContent).not.toMatch(/\+ \d+ keys?/)
})

test('a map-0 loss still shows the reward band at $0, rather than hiding it', () => {
  show({
    title: 'Defeated...', titleColor: '#ef4444',
    metacashEarned: 0, keysEarned: 0, mapsCleared: 0,
  })
  expect(screen.getByText('+ $0 metacash')).toBeTruthy()
  expect(screen.getByText('0 maps × $15')).toBeTruthy()
})

test('a payout that failed to reach the account tells the player, instead of just showing the number as if it banked', () => {
  const { container } = show({
    title: 'Region Cleared', titleColor: '#3f9d4f',
    metacashEarned: 200, keysEarned: 1, mapsCleared: 8, payoutSaved: false,
  })
  // The figure itself is unchanged — it's true on this device — but the
  // player must be told it hasn't reached their account yet.
  expect(screen.getByText('+ $200 metacash')).toBeTruthy()
  expect(container.textContent).toContain('Saved on this device')
})

// ── Run It Back (key item): the button only appears when explicitly offered ──

test('onRunItBack omitted (the default): no Run It Back button renders, on either ending', () => {
  const lose = show({ title: 'Defeated...', titleColor: '#ef4444' })
  expect(lose.queryByText('Run It Back')).toBeNull()
  lose.unmount()

  const win = show({ title: 'Region Cleared', titleColor: '#3f9d4f' })
  expect(win.queryByText('Run It Back')).toBeNull()
})

test('onRunItBack passed on a loss: the button renders and calls it on click', () => {
  let clicked = false
  const { getByText } = show({
    title: 'Defeated...', titleColor: '#ef4444', onRunItBack: () => { clicked = true },
  })
  getByText('Run It Back').click()
  expect(clicked).toBe(true)
})

test('a normal (saved) payout shows no local-save warning', () => {
  const { container } = show({
    title: 'Region Cleared', titleColor: '#3f9d4f',
    metacashEarned: 200, keysEarned: 1, mapsCleared: 8,
  })
  expect(container.textContent).not.toContain('Saved on this device')
})
