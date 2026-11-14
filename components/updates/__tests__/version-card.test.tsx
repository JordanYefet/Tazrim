import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { UpdateView } from '@/lib/updates/state'
import { MANUAL_COMMAND, ManualCommands } from '../manual-commands'
import { VersionCard, rollbackLossText, whenText } from '../version-card'

// Made-up versions and notes only.

const CMD = MANUAL_COMMAND.replace(/&/g, '&amp;')

function view(extra: Partial<UpdateView> = {}): UpdateView {
  return {
    current: '9.1.0',
    latest: { version: '9.1.0', url: 'https://example.invalid/r', notes: [], publishedAt: '2030-01-01T00:00:00Z' },
    newer: false,
    checkedAt: '2030-01-01T09:12:00.000Z',
    error: null,
    auto: true,
    canUpdate: true,
    syncRunning: false,
    job: null,
    lastUpdate: null,
    ...extra,
  }
}

const newer = (extra: Partial<UpdateView> = {}) =>
  view({
    latest: { version: '9.2.0', url: 'https://example.invalid/r', notes: ['הערה בדויה אחת', 'הערה בדויה שתיים'], publishedAt: '2030-01-01T00:00:00Z' },
    newer: true,
    ...extra,
  })

const html = (v: UpdateView) => renderToStaticMarkup(<VersionCard initial={v} />)

describe('VersionCard', () => {
  it('a new version with the helper offers the update button with its version, and the notes', () => {
    const h = html(newer())
    expect(h).toContain('גרסה חדשה')
    expect(h).toMatch(/<button[^>]*>[^]*?עדכון לגרסה[^]*?v9\.2\.0/)
    expect(h).toContain('הערה בדויה אחת')
    expect(h).toContain('href="https://example.invalid/r"')
    expect(h).toContain('בדיקת עדכונים')
  })

  it('without the helper there is no update button; the commands hide behind a toggle', () => {
    const h = html(newer({ canUpdate: false }))
    expect(h).not.toMatch(/<button[^>]*>[^<]*עדכון לגרסה/)
    expect(h).toContain('הצגת פקודות ידניות')
    expect(h).not.toContain(CMD)
    expect(h).not.toMatch(/docker/i)
    expect(h).toContain('href="https://github.com/JordanYefet/Tazrim#עדכון-לגרסה-חדשה"')
    expect(renderToStaticMarkup(<ManualCommands defaultOpen />)).toContain(CMD)
  })

  it('up to date says so', () => {
    const h = html(view())
    expect(h).toContain('זו הגרסה האחרונה')
    expect(h).toContain('v9.1.0')
    expect(h).not.toContain('גרסה חדשה')
  })

  it('offers the roll back only when it can', () => {
    const last = { from: '9.0.0', to: '9.1.0', at: '2030-01-01T09:15:00.000Z', backupAt: '2030-01-01T09:14:00.000Z', since: { uploads: 0, transactions: 0 } }
    expect(html(view({ lastUpdate: { ...last, canRollBack: false } }))).not.toContain('חזרה לגרסה')
    const h = html(view({ lastUpdate: { ...last, canRollBack: true } }))
    expect(h).toContain('משהו לא עובד כמו שצריך בגרסה החדשה?')
    expect(h).toMatch(/חזרה לגרסה[^]*?v9\.0\.0/)
  })

  it('a failed check is a muted line, never red', () => {
    const h = html(view({ error: 'NETWORK' }))
    expect(h).toContain('לא הצליחה')
    expect(h).not.toMatch(/destructive|red-|expense/)
  })

  it('a last update from an unknown version offers the roll back without "vunknown"', () => {
    const lastUpdate = {
      from: 'unknown',
      to: '9.1.0',
      at: '2030-01-01T09:20:00.000Z',
      canRollBack: true,
      backupAt: '2030-01-01T09:14:00.000Z',
      since: { uploads: 0, transactions: 0 },
    }
    const h = html(view({ lastUpdate }))
    expect(h).not.toContain('unknown')
    expect(h).toContain('חזרה לגרסה הקודמת')
  })

  it('the switch has a 44 px hit area around the visual switch', () => {
    const h = html(view())
    const button = /<button[^>]*role="switch"[^>]*>/.exec(h)?.[0] ?? ''
    expect(button).toMatch(/min-h-11/)
    expect(button).toMatch(/min-w-11/)
    expect(h).toMatch(/role="switch"[^>]*>\s*<span aria-hidden="true" class="[^"]*h-6 w-10/)
  })

  it('the switch shows the daily check', () => {
    const h = html(view({ auto: false }))
    expect(h).toContain('בדיקה אוטומטית פעם ביום')
    expect(h).toMatch(/role="switch"[^>]*aria-checked="false"|aria-checked="false"[^>]*role="switch"/)
  })

  it('a running job links to its progress instead of starting another', () => {
    const h = html(newer({ job: { kind: 'update', from: '9.1.0', to: '9.2.0', state: 'running', restored: false, steps: [] } }))
    expect(h).toContain('href="/updating"')
  })

  it('has no em-dash', () => {
    expect(html(newer({ canUpdate: false, error: 'RATE_LIMIT' }))).not.toContain('—')
  })
})

describe('whenText', () => {
  const now = new Date(2030, 0, 2, 12, 0)
  it('words today, yesterday and older days', () => {
    expect(whenText(new Date(2030, 0, 2, 9, 5).toISOString(), now)).toBe('היום ב-09:05')
    expect(whenText(new Date(2030, 0, 1, 21, 30).toISOString(), now)).toBe('אתמול ב-21:30')
    expect(whenText(new Date(2029, 11, 13, 9, 14).toISOString(), now)).toBe('ב-13.12 ב-09:14')
  })
})

describe('rollbackLossText', () => {
  it('counts what a roll back would delete, transactions as an estimate', () => {
    expect(rollbackLossText({ uploads: 3, transactions: 41 })).toBe('כל מה שנוסף או שונה מאז (3 העלאות, כ-41 תנועות) יימחק.')
    expect(rollbackLossText({ uploads: 1, transactions: 1 })).toBe('כל מה שנוסף או שונה מאז (העלאה אחת, תנועה אחת) יימחק.')
    expect(rollbackLossText({ uploads: 0, transactions: 0 })).toBe('מאז הגיבוי לא נוספו קבצים או תנועות.')
  })
})
