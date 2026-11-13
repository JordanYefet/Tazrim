import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LastUpdate } from '@/lib/updates/state'

// The real dialog renders in a portal (nothing in static markup): show its props instead
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: (p: { confirmDisabled?: boolean; title?: ReactNode; description?: ReactNode; children?: ReactNode }) => (
    <div data-confirm-disabled={String(Boolean(p.confirmDisabled))}>
      {p.title}
      {p.description}
      {p.children}
    </div>
  ),
}))

const { RollbackConfirmDialog } = await import('../update-dialogs')

// Made-up versions and counts only.
const last: LastUpdate = {
  from: '9.1.0',
  to: '9.2.0',
  at: '2030-01-01T09:20:00.000Z',
  canRollBack: true,
  backupAt: '2030-01-01T09:14:00.000Z',
  since: { uploads: 0, transactions: 0 },
}

const html = (syncRunning: boolean) =>
  renderToStaticMarkup(<RollbackConfirmDialog open onOpenChange={() => {}} last={last} backupWhen={null} syncRunning={syncRunning} />)

describe('RollbackConfirmDialog', () => {
  it('a last update from an unknown version never prints "vunknown"', () => {
    const h = renderToStaticMarkup(
      <RollbackConfirmDialog open onOpenChange={() => {}} last={{ ...last, from: 'unknown' }} backupWhen={null} syncRunning={false} />
    )
    expect(h).not.toContain('unknown')
    expect(h).toContain('חזרה לגרסה הקודמת')
  })

  it('waits while a sync runs, like the update confirm', () => {
    expect(html(true)).toContain('data-confirm-disabled="true"')
    expect(html(true)).toContain('סנכרון רץ עכשיו')
    expect(html(false)).toContain('data-confirm-disabled="false"')
    expect(html(false)).not.toContain('סנכרון רץ עכשיו')
  })

  it('says only those who signed in after the update sign in again', () => {
    expect(html(false)).toContain('מי שהתחבר אחרי העדכון יצטרך להתחבר מחדש.')
    expect(html(false)).not.toContain('כל מי שמחובר')
  })
})
