/**
 * Faces of the card and bank account elements (ENG-56 / ENG-57).
 *
 * Colours are inspired by each issuer's or bank's brand colours; no logos or
 * trademarks are reproduced. Card networks are shown as their name set in the
 * app font, never as a drawn mark. Every face is dark enough for white text,
 * and the element always shows the name (and digits), so colour is never the
 * only way to tell accounts apart.
 */

export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'diners'

export const CARD_NETWORKS: { key: CardNetwork; label: string }[] = [
  { key: 'visa', label: 'VISA' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'amex', label: 'AMEX' },
  { key: 'diners', label: 'Diners' },
]

export function isCardNetwork(value: unknown): value is CardNetwork {
  return typeof value === 'string' && CARD_NETWORKS.some(n => n.key === value)
}

export function networkLabel(network: string | null | undefined): string | null {
  return CARD_NETWORKS.find(n => n.key === network)?.label ?? null
}

/** Three gradient stops, from the lit corner to the deep one. */
export interface Face {
  key: string
  stops: [string, string, string]
}

/** Card issuers with a face of their own. */
export const CARD_FACES: Record<string, Face> = {
  max: { key: 'max', stops: ['#ff6a5c', '#e2316f', '#7c1d55'] },
  cal: { key: 'cal', stops: ['#2bb3e6', '#1663c7', '#0b2f73'] },
  isracard: { key: 'isracard', stops: ['#3a4f9e', '#1f2c6b', '#111737'] },
  amex: { key: 'amex', stops: ['#5bb2c9', '#1f7393', '#0f3d52'] },
}

/** Banks with a face of their own. */
export const BANK_FACES: Record<string, Face> = {
  leumi: { key: 'leumi', stops: ['#3b9be0', '#0a63b4', '#073e78'] },
  hapoalim: { key: 'hapoalim', stops: ['#f0524d', '#c81e2b', '#7e1019'] },
  discount: { key: 'discount', stops: ['#33b06e', '#0c7f45', '#064a2a'] },
  mizrahi: { key: 'mizrahi', stops: ['#f58a3a', '#d4561a', '#8a2f0c'] },
}

/** Graphite: a quiet default for providers without a face and no account colour. */
export const NEUTRAL_FACE: Face = { key: 'neutral', stops: ['#5d6878', '#363e4b', '#1b2029'] }

/**
 * Hebrew names (and common spellings) typed as a free-text provider, mapped
 * to the provider key, so "ישראכרט" gets the Isracard face.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  לאומי: 'leumi',
  'בנק לאומי': 'leumi',
  הפועלים: 'hapoalim',
  'בנק הפועלים': 'hapoalim',
  פועלים: 'hapoalim',
  דיסקונט: 'discount',
  'בנק דיסקונט': 'discount',
  מזרחי: 'mizrahi',
  'מזרחי טפחות': 'mizrahi',
  'mizrahi tefahot': 'mizrahi',
  מקס: 'max',
  כאל: 'cal',
  ישראכרט: 'isracard',
  'אמריקן אקספרס': 'amex',
  'american express': 'amex',
  אמקס: 'amex',
}

/** Hebrew names of the providers the app knows. */
export const PROVIDER_LABELS: Record<string, string> = {
  leumi: 'לאומי',
  hapoalim: 'הפועלים',
  discount: 'דיסקונט',
  mizrahi: 'מזרחי טפחות',
  max: 'מקס',
  cal: 'כאל',
  isracard: 'ישראכרט',
  amex: 'אמריקן אקספרס',
  hitech: 'הייטקזון',
}

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[providerKey(provider)] ?? provider
}

export function providerKey(provider: string | null | undefined): string {
  const p = (provider ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return PROVIDER_ALIASES[p] ?? p
}

export type FaceKind = 'BANK' | 'CREDIT_CARD'

/**
 * The face for a provider: its own, else one made from the account's colour
 * (any CSS colour, e.g. the chart series var), else graphite.
 */
export function faceFor(kind: FaceKind, provider: string | null | undefined, accountColor?: string): Face {
  const key = providerKey(provider)
  const own = (kind === 'BANK' ? BANK_FACES : CARD_FACES)[key]
  if (own) return own
  if (accountColor) {
    // Deepened copies of the colour, so white text stays readable on any series colour
    return {
      key: `color:${accountColor}`,
      stops: [
        `color-mix(in oklab, ${accountColor} 88%, white)`,
        `color-mix(in oklab, ${accountColor} 72%, black)`,
        `color-mix(in oklab, ${accountColor} 38%, black)`,
      ],
    }
  }
  return NEUTRAL_FACE
}

/** Network a card issuer implies (an Amex card is an Amex card). */
export function impliedNetwork(provider: string | null | undefined): CardNetwork | null {
  return providerKey(provider) === 'amex' ? 'amex' : null
}

/** What the card element says to assistive tech: issuer, name, last digits, network. */
export function cardLabel({
  provider,
  name,
  lastFour,
  network,
}: {
  provider: string
  name: string
  lastFour?: string | null
  network?: string | null
}): string {
  return [
    `כרטיס אשראי${provider ? ` ${providerLabel(provider)}` : ''}`,
    name,
    lastFour ? `מסתיים ב-${lastFour}` : null,
    networkLabel(network),
  ]
    .filter(Boolean)
    .join(', ')
}
