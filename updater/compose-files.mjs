/**
 * The install folder's compose files, brought along by an update (ENG-137). Pure pieces and the
 * GitHub fetch: what is managed, the record of what Tazrim last wrote, the decision per file, and
 * the diff the person sees first. The flow that uses them is compose-update.mjs.
 *
 * Only the two files below are ever managed. `.env` and `docker-compose.override.yml` are the
 * person's and are never touched here (the update only bumps a pinned TAZRIM_VERSION in `.env`).
 */
import crypto from 'node:crypto'
import { GITHUB_API, getWithTimeout, TIMEOUT_MS } from './latest.mjs'

export const MANAGED = Object.freeze(['docker-compose.yml', 'docker-compose.egress.yml'])
export const RECORD_FILE = '.tazrim-managed.json'
export const MAX_FILE_BYTES = 256 * 1024
export const MAX_DIFF_LINES = 400
export const CONTEXT_LINES = 3

const VERSION_RE = /^\d+\.\d+\.\d+$/
const HASH_RE = /^[0-9a-f]{64}$/

export const sha256 = text => crypto.createHash('sha256').update(text).digest('hex')

/** A fixed-code failure the update flow words in Hebrew */
export const fetchFailed = detail => Object.assign(new Error(detail), { code: 'COMPOSE_FETCH_FAILED' })

/**
 * `name` at the release tag `v<version>`: { text }, or { none: true } when the file is not in that
 * release (404). Anything else throws COMPOSE_FETCH_FAILED. The ref is only ever built from a
 * strict x.y.z and a managed name.
 */
export async function fetchReleaseFile({ version, name, fetchImpl = fetch, helperVersion = '0.0.0', timeoutMs = TIMEOUT_MS }) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) throw fetchFailed('not a release version')
  if (!MANAGED.includes(name)) throw fetchFailed('not a managed file')
  const url = `${GITHUB_API}/contents/${name}?ref=v${version}`
  let got
  try {
    got = await getWithTimeout(url, { fetchImpl, helperVersion, timeoutMs, accept: 'application/vnd.github.raw' })
    const res = got.res
    if (res === 'timeout') throw new Error('timed out')
    if (res.status === 404) {
      await res.body?.cancel().catch(() => {})
      return { none: true }
    }
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    return { text: await readCapped(res, got.timeout) }
  } catch (e) {
    throw e?.code === 'COMPOSE_FETCH_FAILED' ? e : fetchFailed(String(e?.message ?? e))
  } finally {
    got?.done()
  }
}

/** The body as text, never more than MAX_FILE_BYTES (it stops reading past that) */
async function readCapped(res, timeout) {
  const declared = Number(res.headers.get('content-length'))
  if (declared > MAX_FILE_BYTES) {
    await res.body?.cancel().catch(() => {})
    throw fetchFailed('the file is too large')
  }
  const chunks = []
  let size = 0
  const reader = res.body?.getReader()
  if (!reader) {
    const text = await res.text()
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw fetchFailed('the file is too large')
    return text
  }
  for (;;) {
    const r = await Promise.race([reader.read(), timeout.then(() => ({ timedOut: true }))])
    if (r.timedOut) {
      reader.cancel().catch(() => {})
      throw new Error('timed out')
    }
    if (r.done) break
    size += r.value.byteLength
    if (size > MAX_FILE_BYTES) {
      reader.cancel().catch(() => {})
      throw fetchFailed('the file is too large')
    }
    chunks.push(r.value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// ---- the record -------------------------------------------------------------------------------

/** { name: sha256 } from the record's text; anything that is not a known name with a hash is ignored */
export function parseRecord(text) {
  try {
    const files = JSON.parse(text ?? 'null')?.files
    if (!files || typeof files !== 'object' || Array.isArray(files)) return {}
    return Object.fromEntries(Object.entries(files).filter(([k, v]) => MANAGED.includes(k) && typeof v === 'string' && HASH_RE.test(v)))
  } catch {
    return {}
  }
}

export const renderRecord = files => `${JSON.stringify({ files }, null, 2)}\n`

// ---- the decision -----------------------------------------------------------------------------

/**
 * What to do with one file.
 *   local    its text in the install folder, or null (missing)
 *   next     the file at the target release, or null (not in that release)
 *   recorded the hash Tazrim last wrote or accepted, or undefined
 *   base     the file at the CURRENT version's tag (only looked at when there is no record), or null
 * Result: 'skip' | 'same' | 'create' | 'replace' | 'edited'
 */
export function decide({ name, local, next, recorded, base }) {
  if (next === null) return 'skip'
  if (local === next) return 'same'
  // Missing: never created here. The isolation switch copies the egress file from the image when it turns on
  if (local === null) return 'skip'
  if (recorded !== undefined ? sha256(local) === recorded : base !== null && base !== undefined && local === base) return 'replace'
  return 'edited'
}

// ---- the diff ---------------------------------------------------------------------------------

const lines = text => {
  if (text === '') return []
  const l = text.split('\n')
  if (l.at(-1) === '') l.pop()
  return l
}

/** The line-by-line edit script from a to b: [{ t: ' ' | '-' | '+', s }] */
function script(a, b) {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a.at(-1 - tail) === b.at(-1 - tail)) tail++
  const x = a.slice(head, a.length - tail)
  const y = b.slice(head, b.length - tail)
  const out = a.slice(0, head).map(s => ({ t: ' ', s }))
  if (x.length * y.length > 4_000_000) {
    // Far too different for an LCS table: the whole middle is replaced
    for (const s of x) out.push({ t: '-', s })
    for (const s of y) out.push({ t: '+', s })
  } else {
    const w = y.length + 1
    const table = new Uint16Array((x.length + 1) * w)
    for (let i = x.length - 1; i >= 0; i--) {
      for (let j = y.length - 1; j >= 0; j--) {
        table[i * w + j] = x[i] === y[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) {
        out.push({ t: ' ', s: x[i] })
        i++
        j++
      }
      else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) out.push({ t: '-', s: x[i++] })
      else out.push({ t: '+', s: y[j++] })
    }
    while (i < x.length) out.push({ t: '-', s: x[i++] })
    while (j < y.length) out.push({ t: '+', s: y[j++] })
  }
  for (const s of a.slice(a.length - tail)) out.push({ t: ' ', s })
  return out
}

/**
 * A unified diff from `from` to `to` with 3 lines of context, cut at `maxLines` lines:
 * { diff, truncated }. Identical texts give an empty diff.
 */
export function unifiedDiff(from, to, { context = CONTEXT_LINES, maxLines = MAX_DIFF_LINES } = {}) {
  const ops = script(lines(from ?? ''), lines(to ?? ''))
  const changed = ops.flatMap((o, i) => (o.t === ' ' ? [] : [i]))
  if (!changed.length) return { diff: '', truncated: false }

  // Hunks: runs of changes whose context touches
  const hunks = []
  for (const i of changed) {
    const last = hunks.at(-1)
    if (last && i - last.end <= 2 * context + 1) last.end = i
    else hunks.push({ start: i, end: i })
  }
  const out = []
  // Line numbers before each op
  const oldAt = []
  const newAt = []
  let o = 1
  let n = 1
  for (const op of ops) {
    oldAt.push(o)
    newAt.push(n)
    if (op.t !== '+') o++
    if (op.t !== '-') n++
  }
  for (const h of hunks) {
    const from0 = Math.max(0, h.start - context)
    const to0 = Math.min(ops.length - 1, h.end + context)
    const slice = ops.slice(from0, to0 + 1)
    const oldCount = slice.filter(x => x.t !== '+').length
    const newCount = slice.filter(x => x.t !== '-').length
    out.push(`@@ -${oldCount ? oldAt[from0] : oldAt[from0] - 1},${oldCount} +${newCount ? newAt[from0] : newAt[from0] - 1},${newCount} @@`)
    for (const x of slice) out.push(`${x.t}${x.s}`)
  }
  const truncated = out.length > maxLines
  return { diff: out.slice(0, maxLines).join('\n'), truncated }
}

// ---- the change the person approves -----------------------------------------------------------

/**
 * The approval's change for an update, in one fixed shape (names sorted) so the one the person
 * signed and the one the update job rebuilds compare equal. null when it is malformed.
 */
export function updateChange(version, files) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) return null
  if (!files || typeof files !== 'object' || Array.isArray(files)) return null
  const names = Object.keys(files)
  if (!names.length || names.some(n => !MANAGED.includes(n) || typeof files[n] !== 'string' || !HASH_RE.test(files[n]))) return null
  return { action: 'update-compose', version, files: Object.fromEntries(names.sort().map(n => [n, files[n]])) }
}
