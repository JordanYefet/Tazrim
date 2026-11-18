import { describe, expect, it } from 'vitest'
import { BLUR_LEVELS, SPIN_RAMP, SPIN_SPEED, blurFilter, landing, rollBlur, rowTransform, spinAt, spinStart, spinTurn } from '../digit-motion'

const row = (k: Keyframe) => -Number(/translateY\((-?[\d.]+)%\)/.exec(String(k.transform))![1]) * (11 / 100)
const offsets = (ks: Keyframe[]) => ks.map(k => k.offset as number)
const ordered = (ks: Keyframe[]) => offsets(ks).every((o, i, a) => o >= 0 && o <= 1 && (i === 0 || o >= a[i - 1]))

describe('digit motion', () => {
  it('places digits on the 11-row strip', () => {
    expect(rowTransform(0)).toBe('translateY(0.0000%)')
    expect(row({ transform: rowTransform(7) })).toBeCloseTo(7)
  })

  it('speeds the spin up from rest, then turns at full speed', () => {
    expect(spinAt(0)).toEqual({ dist: 0, speed: 0 })
    expect(spinAt(SPIN_RAMP / 2).speed).toBeCloseTo(SPIN_SPEED / 2)
    expect(spinAt(SPIN_RAMP).speed).toBeCloseTo(SPIN_SPEED)
    expect(spinAt(SPIN_RAMP + 100).dist - spinAt(SPIN_RAMP).dist).toBeCloseTo(SPIN_SPEED * 100)
  })

  it('starts the spin from the digit on screen, sharp', () => {
    const p = spinStart(3)
    expect(row(p.transform[0])).toBeCloseTo(3)
    expect(p.filter[0].filter).toBe('none')
    expect(p.filter.at(-1)!.filter).toBe(blurFilter(BLUR_LEVELS))
    expect(ordered(p.transform) && ordered(p.filter)).toBe(true)
  })

  it('turns once, wrapping 9 → 0 with no run back through the digits', () => {
    const p = spinTurn(8)
    const rows = p.transform.map(row)
    expect(rows[0]).toBeCloseTo(rows.at(-1)!, 3)
    // one cut: a 10 followed by a 0 at the same offset
    const cut = p.transform.findIndex(k => Math.abs(row(k) - 10) < 1e-3)
    expect(cut).toBeGreaterThan(0)
    expect(row(p.transform[cut + 1])).toBeCloseTo(0)
    expect(p.transform[cut].offset).toBe(p.transform[cut + 1].offset)
    expect(ordered(p.transform)).toBe(true)
  })

  it('lands on the new digit at rest and sharp, after spinning through its delay', () => {
    for (const to of [0, 1, 6, 9]) {
      const p = landing(2, 1500, to, 140, 670)
      expect(row(p.transform.at(-1)!)).toBeCloseTo(to, 3)
      expect(p.filter.at(-1)!.filter).toBe('none')
      expect(p.filter[0].filter).toBe(blurFilter(BLUR_LEVELS))
      expect(p.duration).toBeGreaterThanOrEqual(140 + 670)
      expect(p.duration).toBeLessThanOrEqual(140 + 1400)
      expect(ordered(p.transform) && ordered(p.filter)).toBe(true)
    }
  })

  it('blurs a plain roll by its speed: sharp at both ends, a short roll less', () => {
    const far = rollBlur(1, 9, 670)
    const near = rollBlur(4, 5, 670)
    expect(far[0].filter).toBe('none')
    expect(far.at(-1)!.filter).toBe('none')
    const peak = (ks: Keyframe[]) => Math.max(...ks.map(k => Number(/(\d+)\)$/.exec(String(k.filter))?.[1] ?? 0)))
    expect(peak(far)).toBe(BLUR_LEVELS)
    expect(peak(near)).toBeLessThan(peak(far))
  })
})
