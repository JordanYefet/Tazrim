/**
 * Release versions for the update check (ENG-98): comparing x.y.z numbers, and
 * turning GitHub's "latest release" JSON into the few fields the app shows.
 */

export type Version = [number, number, number]

export interface ReleaseInfo {
  version: string
  url: string
  notes: string[]
  publishedAt: string
}

const MAX_NOTES = 5
const MAX_NOTE_LENGTH = 140

/** "1.2.3" or "v1.2.3" -> [1, 2, 3]; anything else -> null */
export function parseVersion(s: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(s.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Is `candidate` a higher version than `current`? False when either can't be read. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** One changelog bullet as plain text: no PR link or "by @x in ..." tail, no "feat:" prefix, no markdown */
function cleanNote(line: string): string {
  let s = line
    .replace(/\s+by\s+@\S+(\s+in\s+\S+)?\s*$/i, '')
    .replace(/\s+in\s+https?:\/\/\S+\s*$/i, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\w+(\([^)]*\))?!?:\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > MAX_NOTE_LENGTH) s = s.slice(0, MAX_NOTE_LENGTH - 1).trimEnd() + '…'
  return s
}

function notesFrom(body: unknown): string[] {
  if (typeof body !== 'string') return []
  const notes: string[] = []
  for (const raw of body.split(/\r?\n/)) {
    // GitHub's generated tail: nothing after these is a change
    if (/^\s*#+\s*New Contributors\b/i.test(raw) || /^\s*[-*]?\s*\**Full Changelog\b/i.test(raw)) break
    const m = /^\s*[-*]\s+(.*)$/.exec(raw)
    if (!m || /made their first contribution/i.test(m[1])) continue
    const note = cleanNote(m[1])
    if (note) notes.push(note)
    if (notes.length === MAX_NOTES) break
  }
  return notes
}

/** GitHub's release JSON -> ReleaseInfo; null for drafts, prereleases and tags that aren't x.y.z */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null
  const r = json as Record<string, unknown>
  if (r.draft === true || r.prerelease === true) return null
  if (typeof r.tag_name !== 'string') return null
  const v = parseVersion(r.tag_name)
  if (!v) return null
  return {
    version: v.join('.'),
    url: typeof r.html_url === 'string' ? r.html_url : '',
    notes: notesFrom(r.body),
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
  }
}
