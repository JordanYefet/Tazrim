import { describe, expect, it } from 'vitest'
import { boxHeight, placements, springEasing, walletModeFor } from '../wallet-motion'
import { MOTION } from '@/lib/motion'

// Made-up account ids
const cards = [
  { id: 'card_a', archived: false },
  { id: 'card_b', archived: false },
  { id: 'card_old', archived: true },
]
const stackOrder = ['card_b', 'card_a'] // back to front

describe('walletModeFor', () => {
  it('is the stack on /cards and one open card on /cards/<id>', () => {
    expect(walletModeFor('/cards', cards)).toEqual({ kind: 'stack' })
    expect(walletModeFor('/cards?year=2030', cards)).toEqual({ kind: 'stack' })
    expect(walletModeFor('/cards/card_a', cards)).toEqual({ kind: 'open', id: 'card_a' })
    expect(walletModeFor('/cards/card_old/', cards)).toEqual({ kind: 'open', id: 'card_old' })
  })

  it('is off for other pages, unknown cards and an empty wallet', () => {
    expect(walletModeFor('/cards/categories', cards)).toEqual({ kind: 'none' })
    expect(walletModeFor('/cards/card_a/categories', cards)).toEqual({ kind: 'none' })
    expect(walletModeFor('/cards/nope', cards)).toEqual({ kind: 'none' })
    expect(walletModeFor('/banks', cards)).toEqual({ kind: 'none' })
    expect(walletModeFor('/cards', [{ id: 'x', archived: true }])).toEqual({ kind: 'none' })
  })
})

describe('placements', () => {
  it('stacks back to front with the front card last', () => {
    const p = placements({ kind: 'stack' }, cards, stackOrder)
    expect(p.get('card_b')).toMatchObject({ transform: 'translate3d(0, 0, 0)', zIndex: 1, front: false, hidden: false })
    expect(p.get('card_a')).toMatchObject({ zIndex: 2, front: true, opacity: 1 })
    expect(p.get('card_a')!.transform).toContain('calc(1 * max(52px, 17cqw))')
    expect(p.get('card_old')).toMatchObject({ hidden: true, opacity: 0 })
  })

  it('puts the open card on top and the others out of sight below it', () => {
    const p = placements({ kind: 'open', id: 'card_b' }, cards, stackOrder)
    expect(p.get('card_b')).toMatchObject({ transform: 'translate3d(0, 0, 0)', opacity: 1, zIndex: 4, front: true })
    expect(p.get('card_a')).toMatchObject({ hidden: true, opacity: 0 })
    expect(p.get('card_old')).toMatchObject({ hidden: true })
  })
})

describe('boxHeight', () => {
  it('is one card when open or single, the strips plus a card when stacked', () => {
    expect(boxHeight({ kind: 'open', id: 'card_a' }, 2)).toBe('63.0841cqw')
    expect(boxHeight({ kind: 'stack' }, 1)).toBe('63.0841cqw')
    expect(boxHeight({ kind: 'stack' }, 3)).toBe('calc(2 * max(52px, 17cqw) + 63.0841cqw)')
  })
})

describe('springEasing', () => {
  it('runs from 0 to 1 and settles in about half a second', () => {
    const { easing, duration } = springEasing(0.92, 0.42)
    const values = easing.slice('linear('.length, -1).split(', ').map(Number)
    expect(values[0]).toBe(0)
    expect(values[values.length - 1]).toBe(1)
    expect(duration).toBeGreaterThan(350)
    expect(duration).toBeLessThan(700)
    // barely underdamped: any overshoot stays tiny
    expect(Math.max(...values)).toBeLessThan(1.01)
  })

  it('does not overshoot when critically damped', () => {
    const values = springEasing(1, 0.4).easing.slice(7, -1).split(', ').map(Number)
    expect(Math.max(...values)).toBeLessThanOrEqual(1)
  })
})

describe('the wallet spring and the page beat (ENG-67)', () => {
  it('settles within 25ms of MOTION.page, so the card lands with the page content', () => {
    // Same parameters as components/cards/card-wallet.tsx
    expect(Math.abs(springEasing(0.92, 0.35).duration - MOTION.page)).toBeLessThanOrEqual(25)
  })
})
