import { STEP_TEXT, timeAgo } from '@/lib/sync/format'
import type { QueueView, RunView } from '@/lib/sync/runs'
import type { SyncInfo } from './use-sync'

/** How long "עודכן · 12 חדשות" stays on the button after a sync */
export const DONE_SHOWN_MS = 8000

export type Tone = 'idle' | 'busy' | 'attention' | 'done' | 'failed'

export function lastSynced(info: SyncInfo | null): string | null {
  const times = (info?.companies ?? []).map(c => c.lastSyncedAt).filter((t): t is string => !!t)
  return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null
}

/** "Sync all": a row waiting for the person first, then the count; once ended, like a single sync */
function queueFace(queue: QueueView, info: SyncInfo | null, now: number, seenFailure: string | null): { tone: Tone; title: string; sub: string } | null {
  const label = (company: string) => info?.companies.find(c => c.id === company)?.label ?? ''
  const code = queue.items.filter(i => i.run?.status.state === 'needs-code')
  const links = queue.items.find(i => i.run?.status.state === 'needs-links')
  const finished = queue.items.filter(i => i.state !== 'waiting' && i.state !== 'running')
  if (!queue.finishedAt) {
    if (code.length) return { tone: 'attention', title: code.length > 1 ? `${code.length} קודים` : 'צריך קוד', sub: code.length > 1 ? 'SMS' : `SMS מ${label(code[0].company)}` }
    if (links) return { tone: 'attention', title: 'חשבון חדש', sub: label(links.company) }
    return { tone: 'busy', title: 'מסנכרן…', sub: `${finished.length} מתוך ${queue.items.length}` }
  }
  if (queue.items.some(i => i.state === 'failed' || i.state === 'skipped') && seenFailure !== queue.id) return { tone: 'failed', title: 'חלק נכשלו', sub: 'לפרטים' }
  if (now - new Date(queue.finishedAt).getTime() < DONE_SHOWN_MS) {
    const created = queue.items.reduce((n, i) => n + (i.created ?? 0), 0)
    return { tone: 'done', title: 'עודכן', sub: created ? `${created} חדשות` : 'אין חדשות' }
  }
  return null
}

export function face(
  run: RunView | null,
  queue: QueueView | null,
  info: SyncInfo | null,
  now: number,
  seenFailure: string | null
): { tone: Tone; title: string; sub: string } {
  const fromQueue = queue && queueFace(queue, info, now, seenFailure)
  if (fromQueue) return fromQueue
  const label = run ? (info?.companies.find(c => c.id === run.company)?.label ?? '') : ''
  const s = run?.status
  if (s?.state === 'running') return { tone: 'busy', title: 'מסנכרן…', sub: `${label} · ${STEP_TEXT[s.step] ?? ''}` }
  if (s?.state === 'needs-code') return { tone: 'attention', title: 'צריך קוד', sub: `SMS מ${label}` }
  if (s?.state === 'needs-links') return { tone: 'attention', title: 'חשבון חדש', sub: label }
  if (s?.state === 'failed' && run && seenFailure !== run.id) return { tone: 'failed', title: 'נכשל', sub: 'לפרטים' }
  if (s?.state === 'done' && run?.finishedAt && now - new Date(run.finishedAt).getTime() < DONE_SHOWN_MS) {
    const created = s.results.reduce((n, r) => n + r.created, 0)
    return { tone: 'done', title: 'עודכן', sub: created ? `${created} חדשות` : 'אין חדשות' }
  }
  const last = lastSynced(info)
  return { tone: 'idle', title: 'סנכרון', sub: last ? timeAgo(last, now) : 'טרם סונכרן' }
}

/** A bank is waiting for an SMS code, in a single run or inside "sync all" */
export function needsCodeNow(run: RunView | null, queue: QueueView | null): boolean {
  return run?.status.state === 'needs-code' || !!queue?.items.some(i => i.run?.status.state === 'needs-code')
}
