import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { UpdatePlan } from '@/lib/updates/compose'

// The real window renders in a portal (nothing in static markup): show its children instead
vi.mock('@/components/ui/app-dialog', () => ({
  AppDialog: (p: { open: boolean; title: ReactNode; children: ReactNode }) => (
    <div data-open={String(p.open)}>
      <h2>{p.title}</h2>
      {p.children}
    </div>
  ),
}))

const { ComposeFiles, ComposeFilesDialog, DiffBlock, shownFiles } = await import('../compose-files')

// Made-up hashes and diffs only.
const H = 'd'.repeat(64)
const DIFF = ['@@ -1,3 +1,3 @@', ' services:', '-  old: 1', '+  new: 2', ' end'].join('\n')

const plan = (files: UpdatePlan['files'], extra: Partial<UpdatePlan> = {}): UpdatePlan => ({ version: '9.2.0', applicable: true, files, needsApproval: true, approvers: false, step: true, ...extra })
const replace = { name: 'docker-compose.yml', action: 'replace' as const, diff: DIFF, sha256: H }
const edited = { name: 'docker-compose.egress.yml', action: 'edited' as const, diff: DIFF, sha256: H }

describe('DiffBlock', () => {
  it('is left to right, monospace, scrollable and reachable by keyboard', () => {
    const h = renderToStaticMarkup(<DiffBlock name="docker-compose.yml" diff={DIFF} />)
    expect(h).toContain('dir="ltr"')
    expect(h).toContain('font-mono')
    expect(h).toContain('overflow-auto')
    expect(h).toContain('tabindex="0"')
    expect(h).toContain('aria-label="השינויים ב-docker-compose.yml"')
  })

  it('tints added and removed lines with the income and expense tokens, and keeps the signs', () => {
    const h = renderToStaticMarkup(<DiffBlock name="x" diff={DIFF} />)
    expect(h).toMatch(/data-diff="add"[^>]*text-income[^>]*>\+  new: 2</)
    expect(h).toMatch(/data-diff="del"[^>]*text-expense[^>]*>-  old: 1</)
    expect(h).toMatch(/data-diff="ctx"[^>]*> services:</)
    // no stripes or gradients, no colours outside the tokens
    expect(h).not.toMatch(/border-[lr]-|gradient|#[0-9a-f]{3,6}/i)
  })

  it('says when the diff was cut', () => {
    expect(renderToStaticMarkup(<DiffBlock name="x" diff={DIFF} truncated />)).toContain('מוצגת רק ההתחלה שלה')
    expect(renderToStaticMarkup(<DiffBlock name="x" diff={DIFF} />)).not.toContain('מוצגת רק ההתחלה שלה')
  })
})

describe('ComposeFiles', () => {
  it('lists only the files that are replaced, created or edited, each with its action word', () => {
    const p = plan([replace, { name: 'docker-compose.egress.yml', action: 'skip' }])
    expect(shownFiles(p).map(f => f.name)).toEqual(['docker-compose.yml'])
    const h = renderToStaticMarkup(<ComposeFiles plan={p} />)
    expect(h).toContain('docker-compose.yml')
    expect(h).toContain('יוחלף')
    expect(h).not.toContain('docker-compose.egress.yml')
    expect(renderToStaticMarkup(<ComposeFiles plan={plan([{ name: 'docker-compose.egress.yml', action: 'create', diff: '+a', sha256: H }])} />)).toContain('ייווצר')
  })

  it('an edited file says it stays and where the new one is saved', () => {
    const h = renderToStaticMarkup(<ComposeFiles plan={plan([edited])} />)
    expect(h).toContain('ערכת את הקובץ הזה בעצמך, אז הוא לא יוחלף. הגרסה החדשה נשמרה לידו בשם')
    expect(h).toContain('docker-compose.egress.yml.new')
    expect(h).toContain('לא יוחלף')
    expect(renderToStaticMarkup(<ComposeFiles plan={plan([replace])} />)).not.toContain('ערכת את הקובץ')
  })
})

describe('ComposeFilesDialog', () => {
  const render = (p: UpdatePlan, o: { busy?: boolean; error?: string | null } = {}) =>
    renderToStaticMarkup(<ComposeFilesDialog open onOpenChange={() => {}} plan={p} busy={o.busy ?? false} error={o.error ?? null} onConfirm={() => {}} />)

  it('has a title, the files, the confirm and the cancel', () => {
    const h = render(plan([replace, edited]))
    expect(h).toContain('קובצי ההתקנה ישתנו')
    expect(h).toContain('אישור ועדכון')
    expect(h).toContain('ביטול')
    expect(h).toContain('docker-compose.override.yml')
    expect(h).toContain('הגרסה החדשה מביאה איתה גם קובצי התקנה חדשים')
  })

  it('with only edited files it does not talk of replacing', () => {
    const h = render(plan([edited], { needsApproval: false }))
    expect(h).toContain('ולכן לא יוחלפו')
    expect(h).not.toContain('מביאה איתה גם קובצי התקנה חדשים')
  })

  it('keeps the room for its error line, and shows the error when there is one', () => {
    expect(render(plan([replace]))).toMatch(/<p role="alert" class="min-h-5[^"]*"><\/p>/)
    expect(render(plan([replace]), { error: 'משהו השתבש' })).toContain('משהו השתבש')
  })

  it('both buttons wait while it works, and the label stays where it is', () => {
    const h = render(plan([replace]), { busy: true })
    expect(h.match(/disabled=""/g)).toHaveLength(2)
    expect(h).toContain('aria-busy="true"')
    expect(h).toContain('invisible')
  })
})
