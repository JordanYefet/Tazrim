/*
 * Geometry and motion of the card wallet (ENG-56; components/cards/card-wallet.tsx).
 * Pure functions, so they are unit-tested.
 */

/** Card height as a share of its width: 54 / 85.6 mm. */
export const CARD_HEIGHT_CQW = 63.0841
/** A stack strip: the visible top of a card behind another (nickname + issuer, an easy tap target). */
export const STRIP = 'max(52px, 17cqw)'
/** Gap below the open card before the hidden cards' resting place. */
const HIDDEN_GAP_PX = 24
const HIDDEN_STEP_PX = 14

export type WalletMode = { kind: 'stack' } | { kind: 'open'; id: string } | { kind: 'none' }

export interface WalletCardInfo {
  id: string
  archived: boolean
}

/** Which state a path puts the wallet in: the stack on /cards, one card open on /cards/<id>. */
export function walletModeFor(path: string, cards: WalletCardInfo[]): WalletMode {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  if (clean === '/cards') return cards.some(c => !c.archived) ? { kind: 'stack' } : { kind: 'none' }
  const m = clean.match(/^\/cards\/([^/]+)$/)
  if (!m) return { kind: 'none' }
  let id = m[1]
  try {
    id = decodeURIComponent(id)
  } catch {
    // keep the raw segment
  }
  return cards.some(c => c.id === id) ? { kind: 'open', id } : { kind: 'none' }
}

export interface CardPlacement {
  transform: string
  opacity: number
  /** Out of the way (open mode's other cards, archived cards in the stack) */
  hidden: boolean
  zIndex: number
  /** The card in front of the stack */
  front: boolean
}

/**
 * Where every card sits in a mode. `stackOrder` is back to front (the front
 * card last, so document order is paint order). CSS lengths in container
 * units of the wallet, so the server render is right at any width.
 */
export function placements(mode: WalletMode, cards: WalletCardInfo[], stackOrder: string[]): Map<string, CardPlacement> {
  const out = new Map<string, CardPlacement>()
  const hidden = (k: number, z: number): CardPlacement => ({
    transform: `translate3d(0, calc(${CARD_HEIGHT_CQW}cqw + ${HIDDEN_GAP_PX + k * HIDDEN_STEP_PX}px), 0) scale(0.97)`,
    opacity: 0,
    hidden: true,
    zIndex: z,
    front: false,
  })
  if (mode.kind === 'open') {
    // The open card on top; the others below it, out of sight, nearest first
    let k = 0
    const others = [...stackOrder].reverse()
    for (const c of cards) if (!others.includes(c.id)) others.push(c.id)
    for (const id of others) {
      if (id === mode.id) continue
      out.set(id, hidden(k++, stackOrder.indexOf(id) + 1))
    }
    out.set(mode.id, { transform: 'translate3d(0, 0, 0)', opacity: 1, hidden: false, zIndex: cards.length + 1, front: true })
    return out
  }
  stackOrder.forEach((id, i) => {
    out.set(id, {
      transform: i === 0 ? 'translate3d(0, 0, 0)' : `translate3d(0, calc(${i} * ${STRIP}), 0)`,
      opacity: 1,
      hidden: false,
      zIndex: i + 1,
      front: i === stackOrder.length - 1,
    })
  })
  cards.forEach((c, k) => {
    if (!out.has(c.id)) out.set(c.id, hidden(k, 0))
  })
  return out
}

/** Height of the wallet box in a mode (CSS). */
export function boxHeight(mode: WalletMode, stackCount: number): string {
  if (mode.kind === 'open' || stackCount <= 1) return `${CARD_HEIGHT_CQW}cqw`
  return `calc(${stackCount - 1} * ${STRIP} + ${CARD_HEIGHT_CQW}cqw)`
}

/**
 * A spring as a CSS linear() easing, so WAAPI can run it on the compositor.
 * Apple's parameters: damping ratio (1 = no overshoot) and response (s).
 * Sampled until it settles within 0.1% of the target.
 */
export function springEasing(dampingRatio = 0.92, response = 0.42): { easing: string; duration: number } {
  const omega = (2 * Math.PI) / response
  const z = dampingRatio
  const at = (t: number) => {
    if (z >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t)
    const wd = omega * Math.sqrt(1 - z * z)
    return 1 - Math.exp(-z * omega * t) * (Math.cos(wd * t) + ((z * omega) / wd) * Math.sin(wd * t))
  }
  const step = 1 / 120
  let end = step
  // Settled once the envelope is within 0.1%
  while (Math.exp(-z * omega * end) * (z >= 1 ? 1 + omega * end : 1 / Math.sqrt(1 - z * z)) > 0.001 && end < 2) end += step
  const n = Math.max(12, Math.round(end / step))
  const points: string[] = []
  for (let i = 0; i <= n; i++) {
    const v = i === n ? 1 : at((i / n) * end)
    points.push(String(Math.round(v * 10000) / 10000))
  }
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(end * 1000) }
}
