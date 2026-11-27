import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EgressView } from '@/lib/egress/types'
import { EgressSettings } from '../egress-settings'

const view = (extra: Partial<EgressView> = {}): EgressView => ({
  helper: 'ready',
  reason: null,
  on: false,
  overrideDiffers: false,
  extraDomains: [],
  household: [],
  approvers: [],
  changes: [],
  blocked: null,
  job: null,
  ...extra,
})

const render = (v: EgressView) => renderToStaticMarkup(<EgressSettings initial={v} />)

describe('EgressSettings and the updater', () => {
  it('an older updater: why, and the one command that refreshes it, beside the manual steps', () => {
    const html = render(view({ helper: 'old' }))
    expect(html).toContain('שירות העזר ישן. עדכון חד-פעמי, בתיקייה של תזרים:')
    expect(html).toContain('docker compose pull updater &amp;&amp; docker compose up -d updater')
    expect(html).toContain('הצגת שלבים ידניים')
  })

  it('unavailable (not started by compose, no install folder): says it can only be done by hand', () => {
    const html = render(view({ helper: 'unavailable', reason: 'NO_INSTALL_MOUNT' }))
    expect(html).toContain('אי אפשר לשנות את זה מכאן. משנים ידנית')
    expect(html).not.toContain('שירות העזר ישן')
  })

  it('a ready updater shows neither line', () => {
    const html = render(view())
    expect(html).not.toContain('שירות העזר ישן')
    expect(html).not.toContain('אי אפשר לשנות את זה מכאן')
  })

  it('no approvers: approvals use the sign-in key or password, nothing to set up, no recovery link, no code file', () => {
    const html = render(view())
    expect(html).toContain('האישור הראשון קובע')
    expect(html).not.toContain('אין גישה לאף מפתח אישור')
    expect(html).not.toContain('tazrim-approval-code')
    expect(html).not.toContain('המפתח שאיתו אני נכנס')
  })

  it('with approvers: the recovery link is there, and still no word about the file in the normal flow', () => {
    const html = render(view({ approvers: [{ id: 'cred-1', name: 'Dana · iPhone', rpId: 'tazrim.test', createdAt: '2030-01-01T00:00:00Z', kind: 'passkey' }] }))
    expect(html).toContain('אין גישה לאף מפתח אישור?')
    expect(html).not.toContain('tazrim-approval-code')
  })

  it('isolation on with no approvers: the switch can still be used (the first approval pins one)', () => {
    const html = render(view({ on: true }))
    expect(html).toContain('כיבוי דורש אישור עם מפתח הכניסה או סיסמת הכניסה')
  })
})
