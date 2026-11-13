import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { JobStatus, JobStep } from '@/lib/updates/helper'
import type { UpdateView } from '@/lib/updates/state'
import {
  MANUAL_COMMAND,
  STUCK_MS,
  UpdatingCard,
  UpdatingScreen,
  applyPoll,
  progressOf,
  retryErrorText,
  rowsOf,
  startScreen,
  type Screen,
} from '../updating-screen'

// Made-up versions only.

const UPDATE_IDS = ['backup', 'download', 'restart', 'migrate', 'check'] as const

function job(states: Partial<Record<JobStep['id'], JobStep['state']>>, extra: Partial<JobStatus> = {}): JobStatus {
  const ids = extra.kind === 'rollback' ? (['restore', 'restart', 'check'] as const) : UPDATE_IDS
  return {
    kind: 'update',
    from: '9.1.0',
    to: '9.2.0',
    state: 'running',
    restored: false,
    steps: ids.map(id => ({ id, state: states[id] ?? 'waiting' })),
    ...extra,
  }
}

function view(j: JobStatus | null, current = '9.1.0'): UpdateView {
  return {
    current,
    latest: null,
    newer: false,
    checkedAt: null,
    error: null,
    auto: true,
    canUpdate: true,
    syncRunning: false,
    job: j,
    lastUpdate: null,
  }
}

const CMD = MANUAL_COMMAND.replace(/&/g, '&amp;')

const screen = (j: JobStatus, extra: Partial<Screen> = {}): Screen => ({ job: j, current: '9.1.0', offline: false, ...extra })

describe('progressOf', () => {
  it('follows the running step', () => {
    expect(progressOf(job({ backup: 'running' }))).toBe(0.1)
    expect(progressOf(job({ backup: 'done', download: 'running' }))).toBe(0.1)
    expect(progressOf(job({ backup: 'done', download: 'running' }, { downloaded: { current: 50, total: 100 } }))).toBeCloseTo(0.3)
    expect(progressOf(job({ backup: 'done', download: 'running' }, { downloaded: { current: 100, total: 100 } }))).toBeCloseTo(0.5)
    expect(progressOf(job({ backup: 'done', download: 'done', restart: 'running' }))).toBe(0.65)
    expect(progressOf(job({ backup: 'done', download: 'done', restart: 'done', migrate: 'running' }))).toBe(0.8)
    expect(progressOf(job({ backup: 'done', download: 'done', restart: 'done', migrate: 'done', check: 'running' }))).toBe(0.92)
  })

  it('is full when done and stays where it stopped on a failure', () => {
    const all = Object.fromEntries(UPDATE_IDS.map(id => [id, 'done'])) as Record<JobStep['id'], 'done'>
    expect(progressOf(job(all, { state: 'done' }))).toBe(1)
    expect(
      progressOf(job({ backup: 'done', download: 'failed' }, { state: 'failed', downloaded: { current: 25, total: 100 } }))
    ).toBeCloseTo(0.2)
  })
})

describe('rowsOf', () => {
  it('shows the five update rows and never the restore the helper appends', () => {
    const j = job({ backup: 'done', download: 'done', restart: 'failed' }, { state: 'failed', restored: true })
    j.steps.push({ id: 'restore', state: 'done' })
    expect(rowsOf(screen(j)).map(r => r.id)).toEqual([...UPDATE_IDS])
  })

  it('shows three rows for a roll back', () => {
    expect(rowsOf(screen(job({ restore: 'running' }, { kind: 'rollback' }))).map(r => r.id)).toEqual(['restore', 'restart', 'check'])
  })
})

describe('applyPoll', () => {
  it('a fetch that fails keeps the job running with the restart row running', () => {
    const before = screen(job({ backup: 'done', download: 'running' }))
    const after = applyPoll(before, { kind: 'network' })
    expect('go' in after).toBe(false)
    const s = after as Screen
    expect(s.job.state).toBe('running')
    const rows = rowsOf(s)
    expect(rows.find(r => r.id === 'restart')?.state).toBe('running')
    expect(rows.find(r => r.id === 'download')?.state).toBe('done')
    expect(rows.find(r => r.id === 'migrate')?.state).toBe('waiting')
  })

  it('a 404 after the restart means the app now runs a version without this page: go home', () => {
    const s = screen(job({ backup: 'done', download: 'done', restart: 'running' }))
    expect(applyPoll(s, { kind: 'status', status: 404 })).toEqual({ go: '/' })
  })

  it('a 404 before the restart is only a hiccup', () => {
    const s = screen(job({ backup: 'running' }))
    expect('go' in applyPoll(s, { kind: 'status', status: 404 })).toBe(false)
  })

  it('takes the new job and version from a view', () => {
    const j = job({ backup: 'done', download: 'done', restart: 'done', migrate: 'running' })
    const s = applyPoll(screen(job({ backup: 'running' }), { offline: true }), { kind: 'view', view: view(j, '9.2.0') }) as Screen
    expect(s).toMatchObject({ job: j, current: '9.2.0', offline: false })
  })

  it('while waiting for a started job, an old finished job is not shown', () => {
    const old = job({ backup: 'done', download: 'failed' }, { state: 'failed', finishedAt: '2030-01-01T00:00:00.000Z' })
    const s = startScreen(view(old), '9.2.0')
    expect(s.job.state).toBe('running')
    const next = applyPoll(s, { kind: 'view', view: view(old) }) as Screen
    expect(next.job.state).toBe('running')
    const fresh = job({ backup: 'running' })
    expect((applyPoll(next, { kind: 'view', view: view(fresh) }) as Screen).job).toEqual(fresh)
  })
})

describe('UpdatingCard', () => {
  const failed = job({ backup: 'done', download: 'failed' }, { state: 'failed' })

  it('a failed job shows the reason in the failed row, what changed, and both buttons', () => {
    const html = renderToStaticMarkup(<UpdatingCard screen={screen(failed)} manualOpen={false} />)
    expect(html).toContain('העדכון לא הושלם')
    expect(html).toMatch(/data-s="failed"[^]*?ההורדה לא הצליחה/)
    expect(html).toContain('ושום נתון לא השתנה')
    expect(html).toContain('לנסות שוב')
    expect(html).toContain('חזרה לאפליקציה')
    expect(html).toContain('הצגת פקודות ידניות')
  })

  it('a failure after the restart that was undone says the version came back with the data', () => {
    const j = job({ backup: 'done', download: 'done', restart: 'done', migrate: 'failed' }, { state: 'failed', restored: true })
    const html = renderToStaticMarkup(<UpdatingCard screen={screen(j)} manualOpen={false} />)
    expect(html).toContain('תזרים חזר לגרסה')
    expect(html).toContain('הנתונים שמורים כפי שהיו לפני העדכון.')
    expect(html).toContain('הגרסה החדשה לא עלתה')
  })

  it('the manual commands stay hidden until the toggle opens them', () => {
    expect(renderToStaticMarkup(<UpdatingScreen initial={view(failed)} />)).not.toContain(CMD)
    expect(renderToStaticMarkup(<UpdatingCard screen={screen(failed)} manualOpen={false} />)).not.toContain(CMD)
    expect(renderToStaticMarkup(<UpdatingCard screen={screen(failed)} manualOpen />)).toContain(CMD)
  })

  it('a running update titles the version it goes to and keeps the actions row in place', () => {
    const html = renderToStaticMarkup(<UpdatingCard screen={screen(job({ backup: 'running' }))} manualOpen={false} />)
    expect(html).toContain('מעדכנים לגרסה')
    expect(html).toContain('v9.2.0')
    expect(html).toContain('לנסות שוב')
    expect(html).not.toContain('—')
  })

  it('a roll back has its own title', () => {
    const html = renderToStaticMarkup(
      <UpdatingCard screen={screen(job({ restore: 'running' }, { kind: 'rollback', from: '9.2.0', to: '9.1.0' }))} manualOpen={false} />
    )
    expect(html).toContain('חוזרים לגרסה')
    expect(html).toContain('שחזור הנתונים מהגיבוי')
  })
})

describe('review fixes', () => {
  afterEach(() => vi.useRealTimers())

  const card = (s: Screen) => renderToStaticMarkup(<UpdatingCard screen={s} manualOpen={false} />)

  it('a roll back that failed after the restart says the data did not change; an update keeps its sentence', () => {
    const rb = job({ restore: 'done', restart: 'done', check: 'failed' }, { kind: 'rollback', from: '9.2.0', to: '9.1.0', state: 'failed', restored: true })
    const html = card(screen(rb))
    expect(html).toContain('והנתונים לא השתנו.')
    expect(html).not.toContain('לפני העדכון')
    const up = job({ backup: 'done', download: 'done', restart: 'failed' }, { state: 'failed', restored: true })
    expect(card(screen(up))).toContain('הנתונים שמורים כפי שהיו לפני העדכון.')
    expect(card(screen(up))).not.toContain('והנתונים לא השתנו')
  })

  it('offline during a roll back keeps the restore row running, not done', () => {
    const rb = job({ restore: 'running' }, { kind: 'rollback' })
    const s = applyPoll(screen(rb), { kind: 'network' }) as Screen
    expect(rowsOf(s).find(r => r.id === 'restore')?.state).toBe('running')
  })

  it('?start=rollback shows the three roll back rows from the first paint', () => {
    const v = view(null)
    v.lastUpdate = { from: '9.0.0', to: '9.1.0', at: '2030-01-01T00:00:00.000Z', canRollBack: true, backupAt: '2030-01-01T00:00:00.000Z', since: { uploads: 0, transactions: 0 } }
    const s = startScreen(v, 'rollback')
    expect(rowsOf(s).map(r => r.id)).toEqual(['restore', 'restart', 'check'])
    expect(card(s)).toContain('חוזרים לגרסה')
    expect(card(s)).toContain('v9.0.0')
  })

  it('the retry error names what was retried, with a final period', () => {
    expect(retryErrorText('update')).toBe('העדכון לא התחיל. נסו שוב.')
    expect(retryErrorText('rollback')).toBe('החזרה לגרסה הקודמת לא התחילה. נסו שוב.')
  })

  it('five minutes without an answer turns into a failure at the restart; an answer resumes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T10:00:00Z'))
    let s = applyPoll(screen(job({ backup: 'done', download: 'done', restart: 'running' })), { kind: 'network' }) as Screen
    vi.advanceTimersByTime(STUCK_MS - 1000)
    s = applyPoll(s, { kind: 'network' }) as Screen
    expect(card(s)).not.toContain('תזרים לא חזר לפעול')
    vi.advanceTimersByTime(1000)
    s = applyPoll(s, { kind: 'status', status: 502 }) as Screen
    const html = card(s)
    expect(html).toContain('תזרים לא חזר לפעול. אפשר להריץ את הפקודה הידנית כדי להפעיל אותו מחדש.')
    expect(html).toMatch(/data-s="failed"[^]*?ההפעלה מחדש לא הצליחה/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>לנסות שוב/)
    expect(html).toContain('הצגת פקודות ידניות')
    expect(renderToStaticMarkup(<UpdatingCard screen={s} manualOpen />)).toContain(CMD)
    const back = job({ backup: 'done', download: 'done', restart: 'done', migrate: 'running' })
    s = applyPoll(s, { kind: 'view', view: view(back, '9.2.0') }) as Screen
    expect(card(s)).not.toContain('תזרים לא חזר לפעול')
    expect(card(s)).toContain('מעדכנים לגרסה')
  })
})
