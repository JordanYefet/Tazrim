import { describe, it, expect, vi } from 'vitest'
import { MAX_GL_INSTANCES, createSlotRegistry, decideGlassRenderer, type GlassEnvironment } from '../policy'

const base: GlassEnvironment = { wantsWebGL: true, webgl2: true, reducedTransparency: false, moreContrast: false, hasSlot: true }

describe('decideGlassRenderer', () => {
  it('a large element with WebGL2 and a slot gets the slab', () => {
    expect(decideGlassRenderer(base)).toBe('webgl')
  })
  it('falls back to the CSS lens', () => {
    expect(decideGlassRenderer({ ...base, wantsWebGL: false })).toBe('css')
    expect(decideGlassRenderer({ ...base, webgl2: false })).toBe('css')
    expect(decideGlassRenderer({ ...base, hasSlot: false })).toBe('css')
    expect(decideGlassRenderer({ ...base, failed: true })).toBe('css')
  })
  it('is solid under reduced transparency or more contrast, whatever else', () => {
    expect(decideGlassRenderer({ ...base, reducedTransparency: true })).toBe('solid')
    expect(decideGlassRenderer({ ...base, moreContrast: true })).toBe('solid')
    expect(decideGlassRenderer({ ...base, wantsWebGL: false, moreContrast: true })).toBe('solid')
  })
})

describe('createSlotRegistry', () => {
  it('caps the WebGL instances at four', () => {
    expect(MAX_GL_INSTANCES).toBe(4)
    const r = createSlotRegistry()
    const got = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => r.acquire(id))
    expect(got).toEqual([true, true, true, true, false, false])
    expect(r.inUse).toBe(4)
  })
  it('asking twice keeps one slot', () => {
    const r = createSlotRegistry(2)
    expect(r.acquire('a')).toBe(true)
    expect(r.acquire('a')).toBe(true)
    expect(r.inUse).toBe(1)
  })
  it('a released slot goes to the oldest waiting element', () => {
    const r = createSlotRegistry(1)
    r.acquire('a')
    r.acquire('b')
    r.acquire('c')
    r.release('a')
    expect(r.holds('b')).toBe(true)
    expect(r.holds('c')).toBe(false)
    r.release('b')
    expect(r.holds('c')).toBe(true)
  })
  it('an element that stops waiting is skipped', () => {
    const r = createSlotRegistry(1)
    r.acquire('a')
    r.acquire('b')
    r.release('b')
    r.release('a')
    expect(r.inUse).toBe(0)
    expect(r.holds('b')).toBe(false)
  })
  it('tells subscribers when slots change hands', () => {
    const r = createSlotRegistry(1)
    const fn = vi.fn()
    const unsub = r.subscribe(fn)
    r.acquire('a')
    r.acquire('b')
    r.release('a')
    expect(fn).toHaveBeenCalledTimes(2)
    unsub()
    r.release('b')
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('releasing an unknown id does nothing', () => {
    const r = createSlotRegistry(1)
    const fn = vi.fn()
    r.subscribe(fn)
    r.release('nobody')
    expect(fn).not.toHaveBeenCalled()
  })
})
