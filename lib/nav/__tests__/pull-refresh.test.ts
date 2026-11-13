import { describe, expect, it } from 'vitest'
import { PULL, PULL_INITIAL, canStartPull, pullReducer, resist, spinRemaining, type PullEvent, type PullState } from '../pull-refresh'

const run = (events: PullEvent[], from: PullState = PULL_INITIAL) => events.reduce(pullReducer, from)
const down = (y: number): PullEvent[] => [{ type: 'start', x: 100, y: 100 }, { type: 'move', x: 100, y: 100 + y }]

describe('pullReducer', () => {
  it('waits for the gesture to declare itself', () => {
    expect(run(down(5)).phase).toBe('tracking')
  })

  it('locks to a clear downward drag and moves at half the finger pace', () => {
    const s = run(down(60))
    expect(s.phase).toBe('pulling')
    expect(s.pull).toBe((60 - PULL.slop) * PULL.resistance)
    expect(s.armed).toBe(false)
  })

  it('ignores an upward drag', () => {
    expect(run(down(-30)).phase).toBe('idle')
  })

  it('ignores a drag that is mostly sideways', () => {
    expect(run([{ type: 'start', x: 100, y: 100 }, { type: 'move', x: 140, y: 120 }]).phase).toBe('idle')
  })

  it('caps the travel', () => {
    expect(run(down(1000)).pull).toBe(PULL.max)
    expect(resist(-5)).toBe(0)
  })

  it('arms past the threshold and disarms when the finger comes back', () => {
    const far = run(down(PULL.threshold / PULL.resistance + PULL.slop))
    expect(far.armed).toBe(true)
    const back = run([{ type: 'move', x: 100, y: 130 }], far)
    expect(back.armed).toBe(false)
    expect(back.phase).toBe('pulling')
  })

  it('releasing armed refreshes and rests', () => {
    const s = run([...down(300), { type: 'end' }])
    expect(s.phase).toBe('refreshing')
    expect(s.pull).toBe(PULL.rest)
  })

  it('releasing short of the threshold does nothing', () => {
    expect(run([...down(60), { type: 'end' }])).toEqual(PULL_INITIAL)
  })

  it('a second pull while refreshing is ignored', () => {
    const refreshing = run([...down(300), { type: 'end' }])
    expect(run([{ type: 'start', x: 1, y: 1 }, { type: 'move', x: 1, y: 300 }, { type: 'end' }], refreshing)).toEqual(refreshing)
    expect(run([{ type: 'cancel' }], refreshing)).toEqual(refreshing)
  })

  it('goes idle when settled, and cancel drops a gesture', () => {
    const refreshing = run([...down(300), { type: 'end' }])
    expect(run([{ type: 'settled' }], refreshing)).toEqual(PULL_INITIAL)
    expect(run([...down(300), { type: 'cancel' }])).toEqual(PULL_INITIAL)
  })
})

describe('canStartPull', () => {
  const ok = { scrollY: 0, touches: 1, overlayOpen: false, onTabBar: false, inScrolledScroller: false, onDragSurface: false }
  it('starts at the top with one finger', () => expect(canStartPull(ok)).toBe(true))
  it.each([
    ['scrolled down', { scrollY: 40 }],
    ['two fingers', { touches: 2 }],
    ['a dialog open', { overlayOpen: true }],
    ['on the tab bar', { onTabBar: true }],
    ['in a scrolled scroller', { inScrolledScroller: true }],
    ['on the wallet', { onDragSurface: true }],
  ])('not when %s', (_, patch) => expect(canStartPull({ ...ok, ...patch })).toBe(false))
})

describe('spinRemaining', () => {
  it('keeps a quick refresh up to the minimum', () => {
    expect(spinRemaining(1000, 1100)).toBe(PULL.minSpinMs - 100)
    expect(spinRemaining(1000, 2000)).toBe(0)
  })
})
