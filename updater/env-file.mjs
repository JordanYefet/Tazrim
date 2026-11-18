/**
 * The install's settings in `.env` (ENG-121): the fixed keys the app may change, their checks,
 * and reading and editing the file's text. Pure (no fs, no Node built-ins), so the app imports
 * the same checks for its forms.
 *
 * Editing keeps every other line and comment exactly as it was: a key's lines are rewritten in
 * place (all of them, when it appears twice), a new key goes at the end, and a removed key
 * (`null`) loses its lines.
 */

/** The only keys the helper ever writes, and the value compose falls back to without them */
export const CONFIG_DEFAULTS = Object.freeze({
  TAZRIM_PORT: '3000',
  TAZRIM_PHONE_PORT: '3001',
  COMPOSE_PROFILES: '',
  TAZRIM_LAN_IP: '',
  TAZRIM_HOST: 'tazrim.internal',
  TAZRIM_DNS_HOST: 'dns.internal',
  // Where AdGuard's plain DNS (port 53) listens: this computer only, or the home network too
  // (ENG-123: Android phones and other computers set it as their DNS for the .internal names)
  TAZRIM_DNS_BIND: '127.0.0.1',
})

/** The two places AdGuard's port 53 may listen */
export const DNS_BINDS = Object.freeze(['127.0.0.1', '0.0.0.0'])
export const CONFIG_KEYS = Object.freeze(Object.keys(CONFIG_DEFAULTS))

/** The profiles the app may turn on or off, in the order they are written */
export const PROFILES = Object.freeze(['updater', 'https', 'dns'])

const PORT_RE = /^[1-9]\d{3,4}$/
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export const isPort = v => PORT_RE.test(v) && Number(v) >= 1024 && Number(v) <= 65535

/** An IPv4 address in a home-network range: 10/8, 172.16/12, 192.168/16 */
export function isPrivateIPv4(v) {
  const m = IPV4_RE.exec(v)
  if (!m) return false
  const p = m.slice(1).map(Number)
  if (p.some((n, i) => n > 255 || String(n) !== m[i + 1])) return false
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)
}

/** A DNS host name with at least two labels, lower case: tazrim.internal, money.home.arpa */
export function isHostName(v) {
  if (typeof v !== 'string' || v.length > 253) return false
  const labels = v.split('.')
  return labels.length >= 2 && labels.every(l => LABEL_RE.test(l)) && !/^\d+$/.test(labels.at(-1))
}

/** "https, updater" -> ["updater", "https"] (known names, PROFILES order), or null if any name is unknown */
export function parseProfiles(v) {
  const names = String(v ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (names.some(n => !PROFILES.includes(n))) return null
  return PROFILES.filter(p => names.includes(p))
}

/** A refusal: a fixed code the app words in Hebrew, the key it is about, and English detail */
const refuse = (code, key, error) => ({ ok: false, code, key, error })

/** Normalizes one value; null when it can't be valid */
function normalize(key, value) {
  if (value === null) return key === 'COMPOSE_PROFILES' ? null : { value: null }
  if (typeof value !== 'string') return null
  const v = value.trim()
  switch (key) {
    case 'TAZRIM_PORT':
    case 'TAZRIM_PHONE_PORT':
      return isPort(v) ? { value: v } : null
    case 'COMPOSE_PROFILES': {
      const list = parseProfiles(v)
      return list ? { value: list.join(',') } : null
    }
    case 'TAZRIM_LAN_IP':
      return v === '' || isPrivateIPv4(v) ? { value: v } : null
    case 'TAZRIM_DNS_BIND':
      return v === '' || DNS_BINDS.includes(v) ? { value: v } : null
    case 'TAZRIM_HOST':
    case 'TAZRIM_DNS_HOST':
      return isHostName(v.toLowerCase()) ? { value: v.toLowerCase() } : null
    default:
      return null
  }
}

/** What compose would use: the file's value, or the default when it's missing or empty */
export function effectiveValues(values) {
  const out = {}
  for (const k of CONFIG_KEYS) {
    const v = values?.[k]
    out[k] = v === null || v === undefined || (v === '' && k !== 'COMPOSE_PROFILES' && k !== 'TAZRIM_LAN_IP') ? CONFIG_DEFAULTS[k] : v
  }
  return out
}

/**
 * Checks `changes` ({ KEY: string | null }, null = remove the line) against the current file
 * values. `{ ok: true, changes }` with the values normalized, or a refusal; nothing is partly
 * accepted.
 */
export function validateChanges(changes, current = {}) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return refuse('INVALID', null, 'changes must be an object')
  const keys = Object.keys(changes)
  if (keys.length === 0) return refuse('INVALID', null, 'nothing to change')
  const out = {}
  for (const key of keys) {
    if (!CONFIG_KEYS.includes(key)) return refuse('UNKNOWN_KEY', key, `${key} can't be changed from the app`)
    const n = normalize(key, changes[key])
    if (!n) return refuse('INVALID_VALUE', key, `${key}: not a valid value`)
    out[key] = n.value
  }

  const after = effectiveValues({ ...current, ...out })
  if (after.TAZRIM_PORT === after.TAZRIM_PHONE_PORT) {
    return refuse('SAME_PORT', 'TAZRIM_PORT' in out ? 'TAZRIM_PORT' : 'TAZRIM_PHONE_PORT', 'the two ports must differ')
  }
  if (after.TAZRIM_HOST === after.TAZRIM_DNS_HOST) {
    return refuse('SAME_HOST', 'TAZRIM_HOST' in out ? 'TAZRIM_HOST' : 'TAZRIM_DNS_HOST', 'the two host names must differ')
  }
  // The helper itself runs under the updater profile: turning it off from the app would stop it mid-job
  if ('COMPOSE_PROFILES' in out && !out.COMPOSE_PROFILES.split(',').includes('updater')) {
    return refuse('KEEP_UPDATER', 'COMPOSE_PROFILES', 'the updater profile can only be turned off by hand')
  }
  return { ok: true, changes: out }
}

const LINE_RE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=[ \t]*)(.*)$/

/** A value as compose reads it: quotes removed, an unquoted ` # comment` dropped */
function unquote(raw) {
  const s = raw.trim()
  const q = s[0]
  if ((q === '"' || q === "'") && s.length > 1) {
    const end = s.indexOf(q, 1)
    if (end > 0) return s.slice(1, end)
  }
  return s.replace(/\s+#.*$/, '').trim()
}

/** The lines of `text`, each with its own line ending kept */
const splitLines = text => (text === '' ? [] : text.match(/[^\n]*\n|[^\n]+$/g))

/** { KEY: value } for every key the file sets (a later line wins, as in compose) */
export function parseEnv(text) {
  const out = {}
  for (const line of splitLines(text ?? '')) {
    const m = LINE_RE.exec(line.replace(/\r?\n$/, ''))
    if (m) out[m[2]] = unquote(m[4])
  }
  return out
}

/** The file's values for CONFIG_KEYS: a string, or null when the key isn't in the file */
export function configValues(text) {
  const all = parseEnv(text)
  return Object.fromEntries(CONFIG_KEYS.map(k => [k, k in all ? all[k] : null]))
}

/** `text` with `changes` applied (validated values only: they never need quotes) */
export function applyChanges(text, changes) {
  const lines = splitLines(text ?? '')
  const eol = (text ?? '').includes('\r\n') ? '\r\n' : '\n'
  const seen = new Set()
  const out = []
  for (const line of lines) {
    const ending = /\r?\n$/.exec(line)?.[0] ?? ''
    const m = LINE_RE.exec(line.slice(0, line.length - ending.length))
    if (!m || !(m[2] in changes)) {
      out.push(line)
      continue
    }
    seen.add(m[2])
    if (changes[m[2]] === null) continue
    // An unquoted value's ` # comment` stays
    const comment = /^["']/.test(m[4]) ? '' : (/\s+#.*$/.exec(m[4])?.[0] ?? '')
    out.push(`${m[1]}${m[2]}${m[3]}${changes[m[2]]}${comment}${ending}`)
  }
  const added = Object.entries(changes).filter(([k, v]) => v !== null && !seen.has(k))
  if (added.length) {
    if (out.length && !/\n$/.test(out.at(-1))) out[out.length - 1] += eol
    for (const [k, v] of added) out.push(`${k}=${v}${eol}`)
  }
  return out.join('')
}
