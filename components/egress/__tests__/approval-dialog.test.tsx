import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The real window renders in a portal (nothing in static markup): show its children instead
vi.mock('@/components/ui/app-dialog', () => ({
  AppDialog: (p: { title: ReactNode; children: ReactNode }) => (
    <div>
      <h2>{p.title}</h2>
      {p.children}
    </div>
  ),
}))

const { ApprovalDialog, describeChange } = await import('../approval-dialog')

const H = 'e'.repeat(64)

describe('the approval window', () => {
  it('says what an update that replaces compose files asks, and why it needs an approval', () => {
    const html = renderToStaticMarkup(<ApprovalDialog change={{ action: 'update-compose', version: '9.2.0', files: { 'docker-compose.yml': H } }} onClose={() => {}} onApproved={() => {}} />)
    expect(html).toContain('להחליף את קובצי ההתקנה בגרסה')
    expect(html).toContain('v9.2.0')
    expect(html).toContain('הקבצים האלה קובעים מה רץ על המחשב ומה מותר לו ברשת')
    expect(html).not.toContain('מרחיב את מה שהאפליקציה יכולה לעשות ברשת')
  })

  it('a change that loosens the filter keeps its own reason', () => {
    const html = renderToStaticMarkup(<ApprovalDialog change={{ action: 'turn-off' }} onClose={() => {}} onApproved={() => {}} />)
    expect(html).toContain('לכבות את בידוד הרשת')
    expect(html).toContain('השינוי מרחיב את מה שהאפליקציה יכולה לעשות ברשת')
  })

  it('describes every change', () => {
    for (const c of [{ action: 'turn-off' as const }, { action: 'remove-approver' as const, id: 'k' }, { action: 'update-compose' as const, version: '9.2.0', files: { 'docker-compose.yml': H } }]) {
      expect(renderToStaticMarkup(<>{describeChange(c)}</>).length).toBeGreaterThan(5)
    }
  })

  it('an addition says whose list it goes to: one provider\'s, or everyone\'s (ENG-142)', () => {
    const html = (c: Parameters<typeof describeChange>[0]) => renderToStaticMarkup(<>{describeChange(c)}</>)
    expect(html({ action: 'add-domain', domain: 'cdn.example.test', provider: 'leumi' })).toContain('של בנק לאומי')
    expect(html({ action: 'add-domain', domain: 'cdn.example.test' })).toContain('של כל הספקים')
    expect(html({ action: 'remove-domain', domain: 'cdn.example.test', provider: 'max' })).toContain('של מקס')
  })
})
