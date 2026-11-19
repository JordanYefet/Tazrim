import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../buffer'
import { copyText, filterEntries, groupByAction, groupedView, pageOf, recentRuns } from '../view'

let id = 0
const e = (level: LogEntry['level'], source: LogEntry['source'], msg: string, data?: LogEntry['data']): LogEntry => ({ id: ++id, ts: 1000 + id, level, source, msg, data })
const mark = (page: string, status = 200) => e(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'app', `${page} → ${status} · 9ms`, { page, kind: 'page', status })

const sample = () => [
  e('info', 'app', 'server started'),
  mark('GET /cards'),
  e('info', 'app', 'POST /api/x → 200 · 4ms'),
  mark('GET /bank?year=2026&month=3'),
  e('info', 'sync', 'leumi · LOGGING_IN', { run: 1 }),
  e('warn', 'sync', 'max · OTP required', { run: 1 }),
  e('error', 'sync', 'max · TIMEOUT', { run: 1 }),
  mark('GET /banks', 500),
]

describe('groupByAction', () => {
  it('a page request starts a group and is its first line; the lines after it belong to it', () => {
    const g = groupByAction(sample())
    expect(g.map(x => x.title)).toEqual([null, '/cards', '/bank', '/banks'])
    expect(g.map(x => x.lines.length)).toEqual([1, 2, 4, 1])
    expect(g[2].worst).toBe('error')
    expect(g[1].worst).toBe('ok')
    expect(g[1].lines[0].data?.page).toBe('GET /cards')
  })
  it('every visit to one path shares a group, whatever the query; the groups follow their latest line', () => {
    const g = groupByAction([
      mark('GET /banks/a?year=2026&month=9'),
      e('info', 'app', 'GET /api/x → 200 · 3ms'),
      mark('GET /banks/a?year=2026&month=11'),
      mark('GET /cards'),
      mark('GET /banks/a?year=2026&month=4&flow=in'),
    ])
    expect(g.map(x => x.title)).toEqual(['/cards', '/banks/a'])
    expect(g[1].lines.map(l => l.data?.page ?? l.msg)).toEqual([
      'GET /banks/a?year=2026&month=9', 'GET /api/x → 200 · 3ms', 'GET /banks/a?year=2026&month=11', 'GET /banks/a?year=2026&month=4&flow=in',
    ])
  })
  it('has no groups for no entries', () => {
    expect(groupByAction([])).toEqual([])
  })
})

describe('filterEntries', () => {
  it('detail: errors keeps warnings and errors, info hides debug', () => {
    const list = [e('debug', 'app', 'd'), e('info', 'app', 'i'), e('warn', 'app', 'w'), e('error', 'app', 'x')]
    expect(filterEntries(list, { detail: 'errors' }).map(x => x.msg)).toEqual(['w', 'x'])
    expect(filterEntries(list, { detail: 'info' }).map(x => x.msg)).toEqual(['i', 'w', 'x'])
    expect(filterEntries(list, { detail: 'debug' })).toHaveLength(4)
  })
  it('tabs and search', () => {
    expect(filterEntries(sample(), { tab: 'sync' })).toHaveLength(3)
    expect(filterEntries(sample(), { tab: 'problems' }).map(x => x.level)).toEqual(['warn', 'error', 'error'])
    expect(filterEntries(sample(), { q: 'timeout' })).toHaveLength(1)
  })
  it('level and source (the /logs page)', () => {
    expect(filterEntries(sample(), { level: 'errors' })).toHaveLength(2)
    expect(filterEntries(sample(), { level: 'problems', source: 'sync' })).toHaveLength(2)
  })
})

describe('groupedView', () => {
  it('keeps every group with a line to show, with its title', () => {
    expect(groupedView(sample(), {}).map(g => g.title)).toEqual([null, '/cards', '/bank', '/banks'])
  })
  it('drops the groups a filter leaves empty and keeps the title of the rest', () => {
    const g = groupedView(sample(), { tab: 'problems' })
    expect(g.map(x => x.title)).toEqual(['/bank', '/banks'])
    expect(g[0].lines).toHaveLength(2)
  })
  it('errors-only detail hides a 200 page line but keeps its group when a line shows', () => {
    const g = groupedView(sample(), { detail: 'errors' })
    expect(g.map(x => x.title)).toEqual(['/bank', '/banks'])
  })
})

describe('recentRuns', () => {
  it('derives runs from the lines that carry a run number', () => {
    const list = [
      ...sample(),
      e('info', 'sync', 'leumi · 4 txns fetched · 2 new', { run: 2, fetched: 4, added: 2 }),
      e('info', 'sync', 'run #3 · max · start', { run: 3, company: 'max' }),
    ]
    const runs = recentRuns(list)
    expect(runs.map(r => r.run)).toEqual([3, 2, 1])
    expect(runs[2].failed).toBe(true)
    expect(runs[1].added).toBe(2)
    expect(runs[2].companies).toEqual(['leumi', 'max'])
  })
})

describe('pageOf', () => {
  it('is the latest page request before the line, or null before any', () => {
    const list = sample()
    expect(pageOf(list, list[0].id)).toBeNull()
    expect(pageOf(list, list[2].id)).toBe('GET /cards')
    expect(pageOf(list, list[4].id)).toBe('GET /bank?year=2026&month=3')
    expect(pageOf(list, list[3].id)).toBe('GET /bank?year=2026&month=3')
  })
})

describe('copyText', () => {
  it('writes the visible lines, grouped ones with a blank line between groups, and no divider', () => {
    const list = [mark('GET /banks'), e('info', 'app', 'hello'), mark('GET /cards')]
    expect(copyText(list, null).split('\n')).toHaveLength(3)
    const grouped = copyText(list, groupByAction(list)).split('\n')
    expect(grouped[0]).toContain('GET /banks → 200')
    expect(grouped[1]).toContain('hello')
    expect(grouped[2]).toBe('')
    expect(grouped.join('')).not.toContain('──')
  })
})
