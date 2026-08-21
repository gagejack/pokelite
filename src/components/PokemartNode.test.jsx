import { describe, it, expect, beforeAll } from 'vitest'
import { StrictMode, useState, useRef, useEffect } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import PokemartNode from './PokemartNode'
import { ThemeProvider } from '../lib/theme'
import { toBagItem } from '../game/bagItem.js'

// Same jsdom localStorage stub the other component tests need — ThemeProvider
// reads/writes it on mount.
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

const ITEM = { id: 'potion', name: 'Potion', description: 'Heals', tier: 'common' }

// Mirrors App.jsx's speedCash/spendCash and NodeMap's onBuy wiring, rendered
// under StrictMode exactly like main.jsx does. The bug this covers only appears
// from the SECOND purchase onward: React evaluates a state updater eagerly only
// while the queue is empty, so the first buy happened to work and every one
// after it debited the money without handing over the item.
function Harness({ startingCash = 500, stock = 3 }) {
  const [speedCash, setSpeedCash] = useState(startingCash)
  const speedCashRef = useRef(startingCash)
  useEffect(() => { speedCashRef.current = speedCash }, [speedCash])
  const [bag, setBag] = useState([])
  const [inventory] = useState(() => [{ item: ITEM, price: 100, stock }])

  function spendCash(amount) {
    if (speedCashRef.current < amount) return false
    speedCashRef.current -= amount
    setSpeedCash(prev => Math.max(0, prev - amount))
    return true
  }

  return (
    <div>
      <div data-testid="cash">{speedCash}</div>
      <div data-testid="bagcount">{bag.length}</div>
      <PokemartNode
        inventory={inventory}
        speedCash={speedCash}
        onClose={() => {}}
        onBuy={entry => {
          const paid = spendCash(entry.price)
          if (paid) setBag(prev => [...prev, toBagItem(entry.item)])
          return !!paid
        }}
      />
    </div>
  )
}

const show = props => render(
  <StrictMode><ThemeProvider><Harness {...props} /></ThemeProvider></StrictMode>,
)
const buy = () => fireEvent.click(screen.getByLabelText('Buy Potion for $100'))
const cash = () => screen.getByTestId('cash').textContent
const bagCount = () => screen.getByTestId('bagcount').textContent

describe('shop purchase', () => {
  it('debits cash AND adds the item to the bag on the first buy', () => {
    show()
    buy()
    expect(cash()).toBe('400')
    expect(bagCount()).toBe('1')
  })

  it('hands over an item on EVERY buy, not just the first', () => {
    show()
    buy()
    buy()
    buy()
    expect(cash()).toBe('200')
    expect(bagCount()).toBe('3')
  })

  it('decrements the visible stock on every successful buy', () => {
    show({ stock: 3 })
    expect(screen.getByText('×3')).toBeTruthy()
    buy()
    expect(screen.getByText('×2')).toBeTruthy()
    buy()
    // A single remaining unit renders no multiplier at all.
    expect(screen.queryByText('×2')).toBeNull()
    expect(screen.queryByText('×1')).toBeNull()
  })

  it('takes no money when the player cannot afford the item', () => {
    show({ startingCash: 50 })
    // The price doubles as the buy button, and it is disabled when unaffordable.
    const button = screen.getByLabelText('Potion, $100, costs more than you have')
    fireEvent.click(button)
    expect(cash()).toBe('50')
    expect(bagCount()).toBe('0')
  })

  it('never lets the balance go negative across back-to-back buys', () => {
    show({ startingCash: 250, stock: 5 })
    buy()
    buy()
    // Third buy would need $300 of the $250 started with — only two go through.
    expect(cash()).toBe('50')
    expect(bagCount()).toBe('2')
  })
})
