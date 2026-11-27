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

describe('EgressSettings per provider (ENG-142)', () => {
  const html = (extra: Partial<EgressView>) => render(view({ household: ['leumi', 'max'], ...extra }))

  it('lists the household\'s providers as active and every other as unused and blocked, both lists always there', () => {
    const out = html({})
    expect(out).toContain('בשימוש (2)')
    expect(out).toContain('לא בשימוש: חסום (16)')
    // each provider under its own heading, with its own domains
    expect(out).toContain('בנק לאומי')
    expect(out).toContain('.bankleumi.co.il')
    expect(out).toContain('פעיל')
    // the layout does not depend on the household: nobody uses anything yet
    const none = html({ household: [] })
    expect(none).toContain('בשימוש (0)')
    expect(none).toContain('לא בשימוש: חסום (18)')
    expect(none).toContain('עוד אין חשבונות שמסתנכרנים')
  })

  it('the add form has a provider select: all providers, then the household\'s by their Hebrew names (not the unused ones)', () => {
    const out = html({})
    const select = /<select id="egress-provider"[\s\S]*?<\/select>/.exec(out)?.[0] ?? ''
    expect(select).toContain('כל הספקים')
    expect(select).toContain('value="leumi"')
    expect(select).toContain('מקס')
    expect(select).not.toContain('value="hapoalim"')
  })

  it('an addition shows which provider it is for, or all of them; a refusal shows the provider whose port it was', () => {
    const out = html({
      on: true,
      extraDomains: [
        { domain: '.cdn-one.example', note: '', addedAt: '2030-01-01T00:00:00Z', approver: 'Dana', provider: 'leumi' },
        { domain: '.cdn-two.example', note: '', addedAt: '2030-01-01T00:00:00Z', approver: 'Dana' },
      ],
      blocked: [{ at: Date.parse('2030-01-01T00:00:00Z'), who: 'app', host: 'captcha.example.test', port: 3207, provider: 'max' }],
    })
    expect(out).toMatch(/cdn-one\.example[\s\S]*?בנק לאומי/)
    expect(out).toMatch(/cdn-two\.example[\s\S]*?כל הספקים/)
    expect(out).toMatch(/captcha\.example\.test[\s\S]*?האפליקציה[\s\S]*?מקס/)
  })
})

