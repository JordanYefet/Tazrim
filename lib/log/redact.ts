/**
 * Nothing personal reaches a log line (ENG-129). Every message and field passes
 * through here before it is written to the in-memory buffer (lib/log/buffer.ts)
 * or to the server console: logins, ID and card numbers, account numbers, e-mail
 * addresses and tokens are replaced by a mask. Dates, times and short numbers
 * (an HTTP status, milliseconds, a count) stay readable, since they are what a
 * log is for.
 *
 * Broader than safeReason (lib/sync/scrape.ts), which also masks 3-digit runs
 * for the one place the bank library's own text is logged; that one calls this first.
 */

export const MASK = '••••'

/** The longest a message or a string field is kept */
export const MAX_LENGTH = 500

/** Field names whose value is never kept, whatever it holds (matched whole, ignoring case) */
const SECRET_KEYS = [
  'password',
  'passwd',
  'pwd',
  'id',
  'userCode',
  'user_code',
  'num',
  'card6Digits',
  'otp',
  'otpCode',
  'token',
  'accessToken',
  'username',
  'user',
  'userId',
  'nationalID',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'credentials',
]
const SECRET_SET = new Set(SECRET_KEYS.map(k => k.toLowerCase().replace(/_/g, '')))

export const isSecretKey = (key: string) => SECRET_SET.has(key.toLowerCase().replace(/_/g, ''))

// key=value, key: value, "key":"value", 'key':'value'. The key must stand alone ("pid" is not "id").
const KEY_ALT = SECRET_KEYS.join('|')
const KEY_VALUE = new RegExp(`(?<![A-Za-z0-9_])(["']?)(${KEY_ALT})\\1(\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&}\\]]+)`, 'gi')
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// 1234 5678 9012 3456, 1234-5678-9012-3456 and the 4-6-5 shape
const CARD_GROUPS = /(?<!\d)(?:\d{4}([ -])\d{4}\1\d{4}\1\d{1,4}|\d{4}([ -])\d{6}\2\d{5})(?!\d)/g
// A long run of letters and digits with both kinds in it: a token, a hash, a key
const TOKEN = /(?=[A-Za-z0-9+/_=-]*\d)(?=[A-Za-z0-9+/_=-]*[A-Za-z])[A-Za-z0-9+/_=-]{32,}/g
// IDs, account numbers, phone numbers: five digits or more in a row
const LONG_DIGITS = /\d{5,}/g

/** A message with everything personal masked, cut to MAX_LENGTH. */
export function redact(text: string): string {
  let out = String(text ?? '')
    .replace(KEY_VALUE, (_m, q: string, key: string, sep: string, value: string) => {
      const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : ''
      return `${q}${key}${q}${sep}${quote}${MASK}${quote}`
    })
    .replace(BEARER, `Bearer ${MASK}`)
    .replace(EMAIL, MASK)
    .replace(CARD_GROUPS, MASK)
    .replace(TOKEN, MASK)
    .replace(LONG_DIGITS, MASK)
  if (out.length > MAX_LENGTH) out = `${out.slice(0, MAX_LENGTH)}…`
  return out
}

const MAX_DEPTH = 4
const MAX_ITEMS = 50

/** Structured fields, redacted: a secret field's value is masked outright, strings go through redact. */
export function redactData<T>(value: T, depth = 0): T {
  return walk(value, depth) as T
}

function walk(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'boolean') return value
  if (typeof value === 'string') return redact(value)
  if (typeof value === 'number') return Number.isInteger(value) && Math.abs(value) >= 1e9 ? MASK : value
  if (typeof value === 'bigint') return MASK
  if (value instanceof Error) return redact(describeError(value))
  if (depth >= MAX_DEPTH) return '…'
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map(v => walk(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      out[k] = isSecretKey(k) ? MASK : walk(v, depth + 1)
    }
    return out
  }
  return MASK
}

/**
 * An error as one redacted line: its name and message, never its stack (a stack
 * carries file paths and, from the bank library, sometimes the page's text).
 */
export function describeError(e: unknown): string {
  if (e instanceof Error) return redact(`${e.name}: ${e.message}`)
  return redact(String(e ?? 'unknown error'))
}
