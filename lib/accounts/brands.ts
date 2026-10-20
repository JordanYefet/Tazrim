/**
 * Faces of the card and bank account elements (ENG-56 / ENG-57).
 *
 * Colours are inspired by each issuer's or bank's brand colours; no logos or
 * issuer logos are reproduced: issuers get a typeset wordmark. Card networks
 * show their published mark (components/accounts/network-mark.tsx), or a
 * typeset name where none is published. Every face is dark enough for white text,
 * and the element always shows the name (and digits), so colour is never the
 * only way to tell accounts apart.
 */

export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'diners' | 'isracard'

export const CARD_NETWORKS: { key: CardNetwork; label: string }[] = [
  { key: 'visa', label: 'Visa' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'amex', label: 'American Express' },
  { key: 'diners', label: 'Diners Club' },
  { key: 'isracard', label: 'Isracard' },
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

/**
 * Card issuers with a face of their own. A card face reads its stops as
 * [glow, base, deep]: a deep two-stop field lit by a soft glow of the brand
 * colour (see .acct-card__field in app/globals.css).
 */
export const CARD_FACES: Record<string, Face> = {
  max: { key: 'max', stops: ['#ff5a6e', '#8c1a52', '#2a0a22'] },
  cal: { key: 'cal', stops: ['#3cc4f5', '#1554c0', '#081d4f'] },
  isracard: { key: 'isracard', stops: ['#f5a524', '#1d2a6e', '#0a0f2b'] },
  amex: { key: 'amex', stops: ['#6fd0e6', '#1a6f90', '#06283a'] },
}

/** A matte near-black card, for issuers without a face and no account colour. */
export const CARD_NEUTRAL_FACE: Face = { key: 'neutral', stops: ['#8c96a8', '#2a2e37', '#0e1014'] }

/**
 * Issuer wordmarks, set in type (never a logo file). Others show the
 * provider's label as written.
 */
const ISSUER_WORDMARKS: Record<string, string> = { max: 'max', cal: 'cal', isracard: 'isracard', amex: 'amex' }

/** An issuer with a typeset wordmark of its own (and so a face of its own). */
export function isKnownIssuer(provider: string | null | undefined): boolean {
  return providerKey(provider) in ISSUER_WORDMARKS
}

export function issuerWordmark(provider: string | null | undefined): string {
  const key = providerKey(provider)
  return ISSUER_WORDMARKS[key] ?? (provider ? providerLabel(provider) : '')
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
  if (kind === 'CREDIT_CARD') {
    if (!accountColor) return CARD_NEUTRAL_FACE
    // Glow of the account colour over a deep field of the same hue
    return {
      key: `color:${accountColor}`,
      stops: [
        accountColor,
        `color-mix(in oklab, ${accountColor} 55%, black)`,
        `color-mix(in oklab, ${accountColor} 18%, #07080b)`,
      ],
    }
  }
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
