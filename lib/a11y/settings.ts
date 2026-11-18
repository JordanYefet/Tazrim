/*
 * Settings → Accessibility (ENG-128): nine options, kept per person as one JSON value
 * (lib/preferences/accessibility.ts) with a cookie copy for pages without a session. Each option
 * is a token of the data-a11y attribute on <html> (a11yAttribute); app/globals.css and postcss/a11y-media.cjs do the rest.
 * Pure: no database, safe in the browser.
 */

export const A11Y_COOKIE = 'tazrim_a11y'

export const TEXT_SIZES = [100, 115, 130, 150] as const
export type TextSize = (typeof TEXT_SIZES)[number]

export interface A11ySettings {
  size: TextSize
  /** Assistant instead of Heebo */
  font: boolean
  bold: boolean
  spacing: boolean
  /** Same as the system's more-contrast and reduced-transparency */
  contrast: boolean
  /** Blue and orange for income and expense, plus arrows */
  cb: boolean
  /** Same as the system's reduced-motion */
  still: boolean
  focus: boolean
  underline: boolean
}

export const A11Y_DEFAULTS: A11ySettings = {
  size: 100,
  font: false,
  bold: false,
  spacing: false,
  contrast: false,
  cb: false,
  still: false,
  focus: false,
  underline: false,
}

export const A11Y_FLAGS = ['font', 'bold', 'spacing', 'contrast', 'cb', 'still', 'focus', 'underline'] as const
export type A11yFlag = (typeof A11Y_FLAGS)[number]

/** Anything -> valid settings: unknown or invalid parts fall back to the defaults */
export function normalizeA11y(raw: unknown): A11ySettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: A11ySettings = { ...A11Y_DEFAULTS }
  // An off-scale size snaps to the nearest step
  if (typeof o.size === 'number' && Number.isFinite(o.size)) {
    out.size = TEXT_SIZES.reduce((best, s) => (Math.abs(s - (o.size as number)) < Math.abs(best - (o.size as number)) ? s : best), TEXT_SIZES[0])
  }
  for (const f of A11Y_FLAGS) if (o[f] === true) out[f] = true
  return out
}

/** The stored / cookie text -> settings (bad JSON, nothing: the defaults) */
export function parseA11y(value: string | undefined | null): A11ySettings {
  if (!value) return { ...A11Y_DEFAULTS }
  try {
    return normalizeA11y(JSON.parse(value))
  } catch {
    return { ...A11Y_DEFAULTS }
  }
}

/** The normal form of the settings, as stored */
export function formatA11y(s: A11ySettings): string {
  const n = normalizeA11y(s)
  return JSON.stringify({ size: n.size, font: n.font, bold: n.bold, spacing: n.spacing, contrast: n.contrast, cb: n.cb, still: n.still, focus: n.focus, underline: n.underline })
}

/** The value of data-a11y on <html>: space-separated tokens (text-130, font, bold ...); "" when everything is off */
export function a11yAttribute(s: A11ySettings): string {
  const out: string[] = []
  if (s.size !== 100) out.push(`text-${s.size}`)
  for (const f of A11Y_FLAGS) if (s[f]) out.push(f)
  return out.join(' ')
}

export function sameA11y(a: A11ySettings, b: A11ySettings): boolean {
  return a.size === b.size && A11Y_FLAGS.every(f => a[f] === b[f])
}
