import { describe, it, expect } from 'vitest'
import { decideGlassRenderer } from '../policy'
import { chooseBackend } from '../bake'

describe('decideGlassRenderer', () => {
  const base = { baked: true, reducedTransparency: false, moreContrast: false }
  it('large elements get the baked lens, small ones the static look', () => {
    expect(decideGlassRenderer(base)).toBe('baked')
    expect(decideGlassRenderer({ ...base, baked: false })).toBe('static')
  })
  it('is solid under reduced transparency or more contrast, whatever the size', () => {
    expect(decideGlassRenderer({ ...base, reducedTransparency: true })).toBe('solid')
    expect(decideGlassRenderer({ ...base, moreContrast: true })).toBe('solid')
    expect(decideGlassRenderer({ ...base, baked: false, moreContrast: true })).toBe('solid')
  })
})

describe('chooseBackend', () => {
  it('bakes with WebGL2 when it is there and has not failed', () => {
    expect(chooseBackend({ webgl2: true, failed: false })).toBe('webgl')
  })
  it('falls back to Canvas2D otherwise', () => {
    expect(chooseBackend({ webgl2: false, failed: false })).toBe('canvas2d')
    expect(chooseBackend({ webgl2: true, failed: true })).toBe('canvas2d')
  })
})
