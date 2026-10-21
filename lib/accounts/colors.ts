/**
 * Account colours (ENG-66): what Account.color holds and how a chosen colour
 * becomes a face (card and bank elements, mini faces) and a solid colour (pill
 * dots, chart series), so one account looks the same everywhere.
 *
 * Account.color is one of:
 *   null           the brand default: the issuer's or bank's own face, else the positional colour
 *   a palette key  one of ACCOUNT_PALETTE (tested as card and bank faces in light and dark)
 *   '#rrggbb'      a custom colour
 *   'glass'        a translucent, frosted face (styles in app/globals.css, "Account colours")
 *
 * Text on a face stays AA (4.5:1) against every stop of its gradient: a face
 * made from a light colour gets dark text, and a mid-tone colour is deepened
 * (or lightened) just enough for its text tone.
 */

export interface PaletteColor {
  key: string
  label: string
  hex: string
}

/** Curated swatches. Mid-tones, so they also work as chart series on light and dark backgrounds. */
export const ACCOUNT_PALETTE: PaletteColor[] = [
  { key: 'blue', label: 'כחול', hex: '#2f6fd6' },
  { key: 'teal', label: 'טורקיז', hex: '#0f9b8e' },
  { key: 'green', label: 'ירוק', hex: '#2e9d5b' },
  { key: 'gold', label: 'זהב', hex: '#e2a52b' },
  { key: 'orange', label: 'כתום', hex: '#e0662f' },
  { key: 'rose', label: 'ורוד', hex: '#d4466f' },
  { key: 'violet', label: 'סגול', hex: '#7c5ad8' },
  { key: 'graphite', label: 'גרפיט', hex: '#4b5563' },
]

export const GLASS = 'glass'

export type ColorChoice =
  | { type: 'default' }
  | { type: 'palette'; key: string; hex: string; label: string }
  | { type: 'custom'; hex: string }
  | { type: 'glass' }

const HEX6 = /^#[0-9a-f]{6}$/
const HEX3 = /^#[0-9a-f]{3}$/

/**
 * Validates and normalizes a colour for Account.color. undefined / null / ''
 * / 'default' mean the brand default (null). Hex is lower-cased and #rgb
 * expanded. Returns { ok: false } for anything else.
 */
export function normalizeColorValue(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const v = value.trim().toLowerCase()
  if (v === '' || v === 'default') return { ok: true, value: null }
  if (v === GLASS) return { ok: true, value: GLASS }
  if (ACCOUNT_PALETTE.some(p => p.key === v)) return { ok: true, value: v }
  if (HEX6.test(v)) return { ok: true, value: v }
  if (HEX3.test(v)) return { ok: true, value: `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` }
  return { ok: false }
}

/** What a stored value means. Unknown values (never written by the app) fall back to the default. */
export function parseColorChoice(value: string | null | undefined): ColorChoice {
  const norm = normalizeColorValue(value)
  if (!norm.ok || norm.value === null) return { type: 'default' }
  if (norm.value === GLASS) return { type: 'glass' }
  const swatch = ACCOUNT_PALETTE.find(p => p.key === norm.value)
  if (swatch) return { type: 'palette', key: swatch.key, hex: swatch.hex, label: swatch.label }
  return { type: 'custom', hex: norm.value }
}

/** The colour's hex (palette or custom); null for the default and glass. */
export function choiceHex(choice: ColorChoice): string | null {
  return choice.type === 'palette' || choice.type === 'custom' ? choice.hex : null
}

// ── Colour math (sRGB) ────────────────────────────────────────────────────

type RGB = [number, number, number]

function toRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

/** `amount` of `b` mixed into `a` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const x = toRgb(a)
  const y = toRgb(b)
  return toHex([0, 1, 2].map(i => x[i] + (y[i] - x[i]) * amount) as RGB)
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const INK_LIGHT = '#ffffff'
/** Text on light faces (and on glass in light mode) */
export const INK_DARK = '#16181d'
export const AA = 4.5

/** Mixes `toward` into `hex` in small steps until `ink` reaches `ratio` on it. */
function ensureContrast(hex: string, ink: string, toward: string, ratio = AA): string {
  let c = hex
  for (let i = 0; i < 25 && contrast(c, ink) < ratio; i++) c = mix(c, toward, 0.06)
  return c
}

export type Ink = 'light' | 'dark'

/** The text tone for a colour: white unless dark text reads clearly better. */
export function inkFor(hex: string): Ink {
  const white = contrast(hex, INK_LIGHT)
  if (white >= AA) return 'light'
  const dark = contrast(hex, INK_DARK)
  return dark >= AA && dark > white ? 'dark' : 'light'
}

export interface ColorFace {
  /** Gradient stops, read like the brand faces in lib/accounts/brands.ts */
  stops: [string, string, string]
  ink: Ink
}

/**
 * A card or bank face made from a colour. Cards read their stops as [glow,
 * base, deep] over a deep field; banks as a 135deg band [light, base, deep].
 * Every stop keeps the text tone at AA.
 */
export function faceFromColor(kind: 'BANK' | 'CREDIT_CARD', hex: string): ColorFace {
  const ink = inkFor(hex)
  const black = '#07080b'
  if (ink === 'light') {
    const fix = (c: string) => ensureContrast(c, INK_LIGHT, black)
    if (kind === 'CREDIT_CARD') {
      return { ink, stops: [fix(hex), fix(mix(hex, black, 0.2)), mix(hex, black, 0.72)] }
    }
    return { ink, stops: [fix(mix(hex, '#ffffff', 0.12)), fix(mix(hex, black, 0.12)), mix(hex, black, 0.5)] }
  }
  const fix = (c: string) => ensureContrast(c, INK_DARK, '#ffffff')
  const base = fix(hex)
  if (kind === 'CREDIT_CARD') {
    return { ink, stops: [mix(base, '#ffffff', 0.45), base, fix(mix(hex, black, 0.2))] }
  }
  return { ink, stops: [mix(base, '#ffffff', 0.35), base, fix(mix(hex, black, 0.16))] }
}

/** Neutral solid for glass accounts' dots and chart series (a CSS var, so it follows the theme). */
export const GLASS_SERIES = 'var(--acct-glass)'

/**
 * The account's solid colour for pill dots and chart series: its chosen
 * colour (kept visible on light and dark backgrounds), the glass neutral, or
 * `fallback` (the positional colour) for the brand default.
 */
export function seriesColor(value: string | null | undefined, fallback: string): string {
  const choice = parseColorChoice(value)
  if (choice.type === 'glass') return GLASS_SERIES
  const hex = choiceHex(choice)
  if (!hex) return fallback
  // A near-white or near-black custom colour would vanish on one of the themes
  if (contrast(hex, '#ffffff') < 1.6) return ensureContrast(hex, '#ffffff', '#000000', 1.6)
  if (contrast(hex, '#0b0d12') < 1.6) return ensureContrast(hex, '#0b0d12', '#ffffff', 1.6)
  return hex
}

/** Hebrew name of a choice, for the picker and assistive tech. */
export function choiceLabel(choice: ColorChoice): string {
  switch (choice.type) {
    case 'default':
      return 'ברירת מחדל'
    case 'palette':
      return choice.label
    case 'custom':
      return 'צבע מותאם'
    case 'glass':
      return 'זכוכית'
  }
}
