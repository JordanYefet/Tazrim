import { describe, it, expect } from 'vitest'
import { GLASS_GLOW, GLOW_BLOBS, GLOW_COLORS, GLOW_STRENGTH, blobAlpha, glassGlowEnabled, glowGradients } from '../glow'

describe('glassGlowEnabled', () => {
  it('follows the constant without an override', () => {
    expect(glassGlowEnabled(null)).toBe(GLASS_GLOW)
    expect(glassGlowEnabled(undefined)).toBe(GLASS_GLOW)
    expect(glassGlowEnabled('maybe')).toBe(GLASS_GLOW)
  })
  it('a browser can switch it either way (to show both versions)', () => {
    expect(glassGlowEnabled('0')).toBe(false)
    expect(glassGlowEnabled('1')).toBe(true)
  })
})

describe('the blobs', () => {
  it('use both palette colours', () => {
    expect(new Set(GLOW_BLOBS.map(b => b.color))).toEqual(new Set([0, 1]))
  })
  it('fade softly from the centre to nothing well outside', () => {
    const b = GLOW_BLOBS[0]
    expect(blobAlpha(b, b.cx, b.cy)).toBeCloseTo(b.alpha)
    expect(blobAlpha(b, b.cx + b.rx / 2, b.cy)).toBeLessThan(b.alpha)
    expect(blobAlpha(b, b.cx + b.rx * 3, b.cy)).toBeLessThan(0.001)
  })
  it('reach a little past the element (the halo) without covering it all in one colour', () => {
    const reach = GLOW_BLOBS.some(b => b.cx - b.rx < 0 || b.cx + b.rx > 1 || b.cy - b.ry < 0 || b.cy + b.ry > 1)
    expect(reach).toBe(true)
    // The middle of the element is a mix: no blob is at full strength there
    for (const b of GLOW_BLOBS) expect(blobAlpha(b, 0.5, 0.5)).toBeLessThan(0.75)
  })
  it('are calm: richer on dark pages, but never opaque', () => {
    expect(GLOW_STRENGTH.dark).toBeGreaterThan(GLOW_STRENGTH.light)
    expect(GLOW_STRENGTH.dark).toBeLessThan(0.8)
  })
  it('follow the Settings palettes', () => {
    expect(GLOW_COLORS['indigo-pink']).toEqual(['#4f46e5', '#d946ef'])
    expect(Object.keys(GLOW_COLORS).sort()).toEqual(['grey', 'indigo-pink', 'ocean'])
  })
})

describe('glowGradients', () => {
  it('turns each blob into a radial gradient of the stylesheet colours', () => {
    const css = glowGradients()
    expect(css.match(/radial-gradient/g)).toHaveLength(GLOW_BLOBS.length)
    expect(css).toContain('var(--glow-a)')
    expect(css).toContain('var(--glow-b)')
    expect(css).toContain('62% 85% at 18% 22%')
  })
})
