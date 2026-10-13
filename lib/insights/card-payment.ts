// Recognises the bank's monthly payment to a credit-card company. Shared by the
// recurring (ENG-37) and unusual (ENG-38) detectors so both treat the same rows
// as the card payment: card charges are a breakdown of that debit, never extra
// spending (see ENG-3).

// Short names need word boundaries (JS \b doesn't work for Hebrew); long ones
// are matched anywhere.
const B = `(^|[\\s\\-"'()])`
const E = `($|[\\s\\-"'()])`
const CARD_PAYMENT = new RegExp(
  [
    'מקס איט', 'כרטיסי אשראי', 'כרטיס אשראי', 'ישראכרט', 'מאסטרקרד', 'לאומי קארד', 'אמריקן אקספרס', 'דיינרס',
    `${B}(מקס|כאל|ויזה)${E}`,
    `${B}(max|max it|cal|isracard|mastercard|visa|amex|american express|diners)${E}`,
  ].join('|'),
  'i'
)

/** True for bank rows that are the monthly payment to a credit-card company */
export function isCardPaymentDescription(description: string): boolean {
  return CARD_PAYMENT.test(description.normalize('NFKC'))
}

/**
 * Which card company a bank payment row goes to, keyed by Account.provider
 * (ENG-10: the bank debit tells us a card statement should exist). Company
 * names only. Each pattern is a subset of CARD_PAYMENT above.
 *
 * - max: MAX (formerly Leumi Card).
 * - cal: CAL / Visa CAL; its legal name starts with "כרטיסי אשראי (לישראל)",
 *   which is how banks often print it. The singular "כרטיס אשראי" is generic
 *   and maps to no company.
 * - isracard: Isracard / Mastercard. amex and diners are separate providers
 *   even though Isracard and CAL issue them, since each has its own statement.
 */
export const CARD_PROVIDER_PATTERNS: Record<string, RegExp> = {
  max: new RegExp(['מקס איט', 'לאומי קארד', `${B}מקס${E}`, `${B}(max|max it)${E}`].join('|'), 'i'),
  cal: new RegExp(['כרטיסי אשראי', `${B}(כאל|ויזה)${E}`, `${B}(cal|visa)${E}`].join('|'), 'i'),
  isracard: new RegExp(['ישראכרט', 'מאסטרקרד', `${B}(isracard|mastercard)${E}`].join('|'), 'i'),
  amex: new RegExp(['אמריקן אקספרס', `${B}(amex|american express)${E}`].join('|'), 'i'),
  diners: new RegExp(['דיינרס', `${B}diners${E}`].join('|'), 'i'),
}

/** The card provider a bank row pays, or null when it is not a known card company */
export function cardPaymentProvider(description: string): string | null {
  const d = description.normalize('NFKC')
  for (const [provider, re] of Object.entries(CARD_PROVIDER_PATTERNS)) if (re.test(d)) return provider
  return null
}

/**
 * Plain substrings, for a cheap SQL prefilter (`contains`, which SQLite's LIKE
 * runs case-insensitively for ASCII) before the regexes run: every
 * description cardPaymentProvider() maps contains one of them.
 */
export const CARD_PAYMENT_KEYWORDS = [
  'מקס', 'קארד', 'כרטיסי אשראי', 'כאל', 'ויזה', 'ישראכרט', 'מאסטרקרד', 'אמריקן', 'דיינרס',
  'max', 'cal', 'visa', 'isracard', 'mastercard', 'amex', 'american', 'diners',
] as const

/** True when the description contains a prefilter keyword (mirrors the SQL side) */
export function mayBeCardPayment(description: string): boolean {
  const d = description.normalize('NFKC').toLowerCase()
  return CARD_PAYMENT_KEYWORDS.some(k => d.includes(k))
}
