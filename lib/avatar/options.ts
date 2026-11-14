/** Person avatars: the choices on offer, and the shape a stored avatar must have */

export const PASTEL = ['#b6e3f4', '#c0aede', '#d1d4f9', '#ffd5dc', '#ffdfbf', '#c7ecd5', '#f9e4a8', '#e2e8f0', '#fbcfe8', '#a7f3d0']
/** Eight text colours, each readable on every pastel */
export const INK = ['#1e3a8a', '#b91c1c', '#c2410c', '#15803d', '#0f766e', '#6d28d9', '#be185d', '#1f2937']
export const AVATAR_SETS = ['notionists', 'lorelei', 'thumbs'] as const
export type AvatarSet = (typeof AVATAR_SETS)[number]
/** The same twelve seeds in every set; the order is the grid's */
export const SEEDS = ['tamar', 'noa', 'eitan', 'yael', 'omer', 'shira', 'lior', 'maya', 'gal', 'roni', 'itai', 'dana']
export const TEXT_MAX = 12

export type Avatar =
  | { kind: 'art'; set: AvatarSet; seed: string; bg: number }
  | { kind: 'text'; text: string; ink: number; bg: number }

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const inRange = (n: unknown, len: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < len

/** A valid avatar (text trimmed), or null for anything else */
export function validateAvatar(v: unknown): Avatar | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!inRange(o.bg, PASTEL.length)) return null
  if (o.kind === 'art') {
    if (!AVATAR_SETS.includes(o.set as AvatarSet) || typeof o.seed !== 'string' || !SEEDS.includes(o.seed)) return null
    return { kind: 'art', set: o.set as AvatarSet, seed: o.seed, bg: o.bg }
  }
  if (o.kind === 'text') {
    if (typeof o.text !== 'string' || !inRange(o.ink, INK.length)) return null
    const text = o.text.trim()
    const len = [...text].length
    if (len === 0 || len > TEXT_MAX || CONTROL.test(text)) return null
    return { kind: 'text', text, ink: o.ink, bg: o.bg }
  }
  return null
}

/** One line, or two when the text is longer than 6 characters and has a space: broken at the space nearest the middle */
export function avatarLines(text: string): string[] {
  const t = text.trim()
  const chars = [...t]
  if (chars.length <= 6 || !chars.includes(' ')) return [t]
  const mid = chars.length / 2
  let best = -1
  chars.forEach((c, i) => {
    if (c === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  })
  return [chars.slice(0, best).join(''), chars.slice(best + 1).join('')]
}

/** Font size by the longest line: one character fills the tile, twelve still fit */
const SCALE = [0, 0.46, 0.38, 0.3, 0.25, 0.21, 0.18, 0.16, 0.14, 0.13, 0.12, 0.11, 0.1]
export function avatarFontSize(text: string, size: number): number {
  const lines = avatarLines(text)
  const longest = Math.max(...lines.map(l => [...l].length), 1)
  return Math.round(size * SCALE[Math.min(TEXT_MAX, longest)] * (lines.length > 1 ? 1.15 : 1))
}

/** The first character of a name: what a person without an avatar shows */
export const nameInitial = (name: string) => [...name.trim()][0] ?? '?'
