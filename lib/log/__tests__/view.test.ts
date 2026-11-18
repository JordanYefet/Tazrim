import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../buffer'
import { actionLabel } from '../page-names'
import { copyText, filterEntries, groupByAction, groupedView, recentRuns } from '../view'

let id = 0
const e = (level: LogEntry['level'], source: LogEntry['source'], msg: string, data?: LogEntry['data']): LogEntry => ({ id: ++id, ts: 1000 + id, level, source, msg, data })
const mark = (label: string) => e('info', 'app', label, { action: true })

const sample = () => [
  e('info', 'app', 'server started'),
  mark('מעבר לדף כרטיסים'),
  e('info', 'app', 'GET /api/x → 200'),
  mark('סנכרון'),
  e('info', 'sync', 'leumi · LOGGING_IN', { run: 1 }),
  e('warn', 'sync', 'max · OTP required', { run: 1 }),
  e('error', 'sync', 'max · TIMEOUT', { run: 1 }),
  mark('מעבר לדף בנקים'),
]

describe('groupByAction', () => {
  it('a marker starts a group and the lines after it belong to it', () => {
    const g = groupByAction(sample())
    expect(g.map(x => x.title)).toEqual([null, 'מעבר לדף כרטיסים', 'סנכרון', 'מעבר לדף בנקים'])
    expect(g.map(x => x.lines.length)).toEqual([1, 1, 3, 0])
    expect(g[2].worst).toBe('error')
    expect(g[1].worst).toBe('ok')
  })
  it('can drop the groups with no lines', () => {
    expect(groupByAction(sample(), false).map(x => x.title)).toEqual([null, 'מעבר לדף כרטיסים', 'סנכרון'])
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
    expect(filterEntries(sample(), { tab: 'problems' }).map(x => x.level)).toEqual(['warn', 'error'])
    expect(filterEntries(sample(), { q: 'timeout' })).toHaveLength(1)
  })
  it('level and source (the /logs page)', () => {
    expect(filterEntries(sample(), { level: 'errors' })).toHaveLength(1)
    expect(filterEntries(sample(), { level: 'problems', source: 'sync' })).toHaveLength(2)
  })
})

describe('groupedView', () => {
  it('hides empty groups once a filter is on, keeps them otherwise', () => {
    expect(groupedView(sample(), {}).map(g => g.title)).toContain('מעבר לדף בנקים')
    expect(groupedView(sample(), { tab: 'problems' }).map(g => g.title)).toEqual(['סנכרון'])
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

describe('actionLabel', () => {
  it('names a page change from the nav labels', () => {
    expect(actionLabel('/cards')).toBe('מעבר לדף כרטיסים')
    expect(actionLabel('/settings/debug')).toBe('מעבר לדף הגדרות דיבאג')
    expect(actionLabel('/')).toBe('מעבר לדף ראשי')
  })
  it('skips the logs page itself', () => {
    expect(actionLabel('/logs')).toBeNull()
    expect(actionLabel('/logs/full')).toBeNull()
  })
})

describe('copyText', () => {
  it('writes an action as a divider, flat or grouped', () => {
    const list = [mark('מעבר לדף בנקים'), e('info', 'app', 'hello')]
    expect(copyText(list, null).split('\n')[0]).toBe('── מעבר לדף בנקים ──')
    const grouped = copyText(list, groupByAction(list)).split('\n')
    expect(grouped[0]).toBe('── מעבר לדף בנקים ──')
    expect(grouped[1]).toContain('hello')
  })
})
