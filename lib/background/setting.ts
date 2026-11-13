/*
 * The page background (ENG-72): a pattern behind every page, chosen in
 * Settings → רקע and remembered in a cookie, so the server renders the right
 * background on the first paint (no flash), like the sidebar mode.
 *
 *   plain    today's tonal backdrop
 *   lines    faint looping lines (the default), strength 4-30%, three palettes
 *   ribbons  soft blurred ribbons of colour
 * and seven wallpapers without options (lib/background/wallpapers.ts), each
 * with a light and a dark version:
 *   aurora   זוהר      soft glows of colour, fixed to the screen
 *   waves    גלים      layered wave bands at the bottom of the screen
 *   topo     טופוגרפי  thin contour lines, a tile down the page
 *   dots     נקודות    a dot grid fading out from behind the heading, fixed
 *   sunrise  זריחה     one warm glow from the top corner, fixed
 *   grid     רשת       a fine blueprint grid, a tile down the page
 *   bubbles  בועות     large soft out-of-focus circles, a tile down the page
 * The strength and palette belong to the lines only (the cookie keeps them).
 *
 * Pure helpers only; components/background/ reads and writes the setting.
 */

export const BACKGROUND_COOKIE = 'tazrim_bg'

export type BackgroundKind = 'plain' | 'lines' | 'ribbons' | 'aurora' | 'waves' | 'topo' | 'dots' | 'sunrise' | 'grid' | 'bubbles'
export type BackgroundPalette = 'indigo-pink' | 'ocean' | 'grey'

export interface BackgroundSetting {
  kind: BackgroundKind
  /** Opacity of the lines, in percent (4-30) */
  strength: number
  palette: BackgroundPalette
}

export const STRENGTH_MIN = 4
export const STRENGTH_MAX = 30

export const DEFAULT_BACKGROUND: BackgroundSetting = { kind: 'lines', strength: 10, palette: 'indigo-pink' }

export const BACKGROUND_KINDS: ReadonlyArray<{ value: BackgroundKind; label: string }> = [
  { value: 'plain', label: 'רגיל' },
  { value: 'lines', label: 'קווים עדינים' },
  { value: 'ribbons', label: 'סרטי צבע' },
  { value: 'aurora', label: 'זוהר' },
  { value: 'waves', label: 'גלים' },
  { value: 'topo', label: 'טופוגרפי' },
  { value: 'dots', label: 'נקודות' },
  { value: 'sunrise', label: 'זריחה' },
  { value: 'grid', label: 'רשת' },
  { value: 'bubbles', label: 'בועות' },
]

/**
 * Kinds painted on a layer fixed to the viewport (body::before), like the
 * plain backdrop; the others are a tile on <html> that scrolls with the page.
 */
const FIXED_KINDS: ReadonlySet<BackgroundKind> = new Set<BackgroundKind>(['plain', 'aurora', 'waves', 'dots', 'sunrise'])

export function isFixedKind(kind: BackgroundKind): boolean {
  return FIXED_KINDS.has(kind)
}

/** The two line colours of each palette, for light and dark pages. */
export const BACKGROUND_PALETTES: ReadonlyArray<{
  value: BackgroundPalette
  label: string
  light: readonly [string, string]
  dark: readonly [string, string]
}> = [
  { value: 'indigo-pink', label: 'סגול ורוד', light: ['#4f46e5', '#d946ef'], dark: ['#818cf8', '#f0abfc'] },
  { value: 'ocean', label: 'ים', light: ['#0369a1', '#0d9488'], dark: ['#38bdf8', '#5eead4'] },
  { value: 'grey', label: 'אפור', light: ['#334155', '#64748b'], dark: ['#cbd5e1', '#94a3b8'] },
]

export function paletteColors(palette: BackgroundPalette, dark: boolean): readonly [string, string] {
  const p = BACKGROUND_PALETTES.find(x => x.value === palette) ?? BACKGROUND_PALETTES[0]
  return dark ? p.dark : p.light
}

export function clampStrength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BACKGROUND.strength
  return Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, Math.round(n)))
}

export function isKind(v: string): v is BackgroundKind {
  return BACKGROUND_KINDS.some(k => k.value === v)
}

function isPalette(v: string): v is BackgroundPalette {
  return BACKGROUND_PALETTES.some(p => p.value === v)
}

/** "lines.10.indigo-pink" */
export function formatBackgroundCookie(s: BackgroundSetting): string {
  return `${s.kind}.${clampStrength(s.strength)}.${s.palette}`
}

/**
 * The setting a cookie holds. Each part falls back to its default on its own,
 * so a cookie from an older or newer version keeps whatever still makes sense.
 */
export function parseBackgroundCookie(value: string | undefined | null): BackgroundSetting {
  if (!value) return { ...DEFAULT_BACKGROUND }
  let raw = value
  try {
    raw = decodeURIComponent(value)
  } catch {
    // keep the raw value
  }
  const [kind = '', strength = '', palette = ''] = raw.trim().split('.')
  return {
    kind: isKind(kind) ? kind : DEFAULT_BACKGROUND.kind,
    strength: /^\d{1,3}$/.test(strength) ? clampStrength(Number(strength)) : DEFAULT_BACKGROUND.strength,
    palette: isPalette(palette) ? palette : DEFAULT_BACKGROUND.palette,
  }
}

/** The opacity the lines are drawn with (strength 10 → 0.1). */
export function lineOpacity(s: BackgroundSetting): number {
  return clampStrength(s.strength) / 100
}

/** Attributes for <html>: the stylesheet picks the backdrop and colours from these. */
export function backgroundHtmlAttributes(s: BackgroundSetting): Record<string, string> {
  return { 'data-bg': s.kind, 'data-bg-palette': s.palette }
}

/** Custom properties for <html> (the line strength). */
export function backgroundHtmlStyle(s: BackgroundSetting): Record<string, string> {
  return { '--bg-strength': String(lineOpacity(s)) }
}
