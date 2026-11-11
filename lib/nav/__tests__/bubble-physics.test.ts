import { describe, expect, it } from 'vitest'
import { atRest, follow, FOLLOW, nearestSlot, slotLayout, project, releaseSlot, rubberBand, SETTLE, step, velocityOf } from '../bubble-physics'

// Five 66px slots, RTL: slot 0 rests at 0 and the others run to the left
const RTL = [0, -66, -132, -198, -264]

describe('rubberBand', () => {
  it('gives less than the overshoot, never more than the dimension', () => {
    expect(rubberBand(10, 66)).toBeLessThan(10)
    expect(rubberBand(10_000, 66)).toBeLessThan(66)
    expect(rubberBand(-10, 66)).toBeCloseTo(-rubberBand(10, 66))
  })
})

describe('follow', () => {
  it('tracks 1:1 inside the bar', () => {
    expect(follow(-100, RTL, 66)).toBe(-100)
  })
  it('resists past either end', () => {
    expect(follow(40, RTL, 66)).toBeGreaterThan(0)
    expect(follow(40, RTL, 66)).toBeLessThan(40)
    expect(follow(-300, RTL, 66)).toBeLessThan(-264)
    expect(follow(-300, RTL, 66)).toBeGreaterThan(-300)
  })
})

describe('releaseSlot', () => {
  it('settles on the nearest slot when let go gently', () => {
    expect(releaseSlot(-120, 0, RTL)).toBe(2)
    expect(releaseSlot(-20, 30, RTL)).toBe(0)
  })
  it('a flick carries one slot further, never two', () => {
    expect(releaseSlot(-132, -800, RTL)).toBe(3)
    expect(releaseSlot(-132, -6000, RTL)).toBe(3)
    expect(releaseSlot(-132, 800, RTL)).toBe(1)
  })
  it('stays inside the bar', () => {
    expect(releaseSlot(-264, -6000, RTL)).toBe(4)
    expect(releaseSlot(0, 6000, RTL)).toBe(0)
  })
})

describe('project and velocity', () => {
  it('projects about a tenth of a second of velocity', () => {
    expect(project(0, 1000)).toBeCloseTo(99)
  })
  it('measures velocity over the samples', () => {
    expect(velocityOf([[0, 0], [50, 100]])).toBe(500)
    expect(velocityOf([[0, 0]])).toBe(0)
  })
  it('nearestSlot picks the closest', () => {
    expect(nearestSlot(-170, RTL)).toBe(3)
  })
})

describe('step', () => {
  it('reaches the target and comes to rest', () => {
    for (const p of [FOLLOW, SETTLE]) {
      let s = { x: 0, v: 0 }
      let frames = 0
      while (!atRest(s, -132) && frames < 600) {
        s = step(s, -132, p, 1 / 60)
        frames++
      }
      expect(frames).toBeLessThan(120)
      expect(s.x).toBeCloseTo(-132, 0)
    }
  })
  it('stays stable at 60Hz and at a dropped frame', () => {
    let s = { x: 0, v: 0 }
    for (let i = 0; i < 30; i++) s = step(s, -100, FOLLOW, 1 / 20)
    expect(s.x).toBeCloseTo(-100, 0)
  })
  it('follows without overshoot (critically damped)', () => {
    let s = { x: 0, v: 0 }
    let min = 0
    for (let i = 0; i < 120; i++) {
      s = step(s, -100, FOLLOW, 1 / 60)
      min = Math.min(min, s.x)
    }
    expect(min).toBeGreaterThanOrEqual(-100.5)
  })
})

describe('slotLayout', () => {
  // RTL bar: slot 0 is the rightmost box
  const boxes = [300, 234, 168, 102, 36].map(left => ({ left, width: 66 }))
  it('measures from the middle of each slot, so a finger anywhere on an icon picks that icon', () => {
    const { origin, positions } = slotLayout(boxes)
    expect(positions).toEqual(RTL)
    for (let i = 0; i < boxes.length; i++) {
      const { left, width } = boxes[i]
      for (const x of [left + 2, left + width / 2, left + width - 2]) {
        expect(nearestSlot(x - origin, positions)).toBe(i)
      }
    }
  })
  it('puts the capsule centre under the finger', () => {
    const { origin, positions } = slotLayout(boxes)
    expect(234 + 33 - origin).toBe(positions[1])
  })
})
