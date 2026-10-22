import { describe, expect, it } from 'vitest'
import {
  CARD_HEIGHT_CQW,
  STACK_SCALE,
  boxHeight,
  placements,
  pocketTop,
  predictCardPlacement,
  springEasing,
  springResponseFor,
  stripPx,
  walletModeFor,
} from '../wallet-motion'
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
    expect(p.get('card_b')).toMatchObject({ transform: 'translate3d(0, 0, 0) scale(0.93)', zIndex: 1, front: false, hidden: false })
    expect(p.get('card_a')).toMatchObject({ zIndex: 2, front: true, opacity: 1 })
    expect(p.get('card_a')!.transform).toBe('translate3d(0, calc(1 * max(50px, 13.7cqw)), 0) scale(0.93)')
    expect(p.get('card_old')).toMatchObject({ hidden: true, opacity: 0 })
  })

  it('puts the open card on top and the others out of sight below it', () => {
    const p = placements({ kind: 'open', id: 'card_b' }, cards, stackOrder)
    expect(p.get('card_b')).toMatchObject({ transform: 'translate3d(0, 0, 0)', opacity: 1, zIndex: 5, front: true })
    expect(p.get('card_a')).toMatchObject({ hidden: true, opacity: 0 })
    expect(p.get('card_old')).toMatchObject({ hidden: true })
  })
})

describe('boxHeight and pocketTop', () => {
  it('is one card when open, the strips plus the pocket when stacked', () => {
    expect(boxHeight({ kind: 'open', id: 'card_a' }, 2)).toBe('63.0841cqw')
    expect(boxHeight({ kind: 'stack' }, 3)).toBe('calc(2 * max(50px, 13.7cqw) + max(44px, 12cqw) + 61cqw)')
    expect(pocketTop(3)).toBe('calc(2 * max(50px, 13.7cqw) + max(44px, 12cqw))')
  })

  it('shows the top of a single card above the pocket', () => {
    expect(pocketTop(1)).toBe('calc(max(44px, 12cqw))')
    expect(boxHeight({ kind: 'stack' }, 1)).toBe('calc(max(44px, 12cqw) + 61cqw)')
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
    expect(Math.abs(springEasing(0.92, springResponseFor(MOTION.page, 0.92)).duration - MOTION.page)).toBeLessThanOrEqual(25)
  })

  it('derives the response from any duration', () => {
    for (const ms of [300, 480, 600, 800]) {
      expect(Math.abs(springEasing(0.92, springResponseFor(ms, 0.92)).duration - ms)).toBeLessThanOrEqual(10)
    }
  })
})

describe('predictCardPlacement (ENG-72: baking glass ahead)', () => {
  const box = { x: 16, y: 400, width: 358 }
  const order = ['back', 'middle', 'front']
  it('the open card fills the box at its top', () => {
    const p = predictCardPlacement({ kind: 'open', id: 'front' }, 'front', order, box)!
    expect(p.rect).toEqual({ x: 16, y: 400, width: 358, height: (358 * CARD_HEIGHT_CQW) / 100 })
    expect(p.scaleX).toBe(1)
  })
  it('other cards are hidden while one is open', () => {
    expect(predictCardPlacement({ kind: 'open', id: 'front' }, 'back', order, box)).toBeNull()
  })
  it('stack cards are scaled from their top centre and stepped down by a strip', () => {
    const back = predictCardPlacement({ kind: 'stack' }, 'back', order, box)!
    const front = predictCardPlacement({ kind: 'stack' }, 'front', order, box)!
    expect(back.rect.y).toBe(400)
    expect(front.rect.y).toBeCloseTo(400 + 2 * stripPx(358))
    expect(back.rect.width).toBeCloseTo(358 * STACK_SCALE)
    expect(back.rect.x).toBeCloseTo(16 + (358 * (1 - STACK_SCALE)) / 2)
    expect(front.scaleX).toBe(STACK_SCALE)
  })
  it('the strip is at least 50px, else 13.7% of the wallet', () => {
    expect(stripPx(300)).toBe(50)
    expect(stripPx(1000)).toBeCloseTo(137)
  })
  it('a card not in the stack has no stack place', () => {
    expect(predictCardPlacement({ kind: 'stack' }, 'archived', order, box)).toBeNull()
    expect(predictCardPlacement({ kind: 'none' }, 'front', order, box)).toBeNull()
  })
})
