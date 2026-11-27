'use client'

/**
 * Settings → Network isolation (ENG-133/134): the switch, the allowed sites, what was blocked, the
 * approval keys and the change log. Turning isolation ON only tightens, so it needs a confirmation.
 * Anything that loosens the filter (off, add or remove a site, remove a key) needs an approval the
 * updater verifies itself: a passkey, or the approval password.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Disclosure, CopyLine, OldUpdaterNote, SectionHeading, sectionClass } from '@/components/install/guide'
import { SwitchButton } from '@/components/install/container-settings'
import { INSTALL_MESSAGES } from '@/lib/install/messages'
import { PROVIDERS } from '@/lib/egress/allowlist'
import type { Approver, ChangeAction, ChangeRequest, EgressView } from '@/lib/egress/types'
import { call, fetchSignin, fetchView, sleep, type Approved, type SigninChoices } from './api'
import { ApprovalDialog } from './approval-dialog'
import { RegisterDialog, type RegisterMode } from './register-dialog'
import { Busy, Host, INPUT, PRIMARY, ROW_ACTION, SECONDARY, When } from './ui'

const GIVE_UP_MS = 4 * 60 * 1000

const ON_LINES = [
  'curl -O https://raw.githubusercontent.com/JordanYefet/Tazrim/main/docker-compose.egress.yml',
  "echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.egress.yml' >> .env",
  'docker compose up -d',
]

const ACTION_TEXT: Record<ChangeAction, string> = {
  'add-domain': 'נוסף אתר',
  'remove-domain': 'הוסר אתר',
  'turn-on': 'הופעל הבידוד',
  'turn-off': 'כובה הבידוד',
  'add-approver': 'נוסף אישור',
  'remove-approver': 'הוסר אישור',
  'update-compose': 'אושר עדכון של קובצי ההתקנה',
}

type Line = { tone: 'busy' | 'error' | 'ok'; text: string } | null

export function EgressSettings({ initial }: { initial: EgressView }) {
  const [view, setView] = useState(initial)
  const [line, setLine] = useState<Line>(null)
  const [working, setWorking] = useState(false)
  const [confirmOn, setConfirmOn] = useState(false)
  const [approve, setApprove] = useState<ChangeRequest | null>(null)
  const [register, setRegister] = useState<RegisterMode | null>(null)
  const [signin, setSignin] = useState<SigninChoices | null>(null)
  const [draft, setDraft] = useState({ domain: '', note: '' })
  const alive = useRef(true)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // What the signed-in person can adopt as an approval key; the buttons stay where they are, disabled, until it is known
  useEffect(() => {
    fetchSignin()
      .then(r => alive.current && setSignin(r))
      .catch(() => alive.current && setSignin({ passkeys: 0, password: false }))
  }, [])

  const refresh = useCallback(async () => {
    try {
      const v = await fetchView()
      if (alive.current) setView(v)
      return v
    } catch {
      return null
    }
  }, [])

  /** The switch is applying: wait for it, then reload (the app restarts, and the page with it) */
  const follow = useCallback(async (target: boolean) => {
    setWorking(true)
    setLine({ tone: 'busy', text: 'מחילים את השינוי. תזרים מופעל מחדש, זה לוקח כחצי דקה' })
    const deadline = Date.now() + GIVE_UP_MS
    while (alive.current && Date.now() < deadline) {
      await sleep(2000)
      const v = await fetchView().catch(() => null)
      if (!v || !alive.current) continue
      if (v.job?.state === 'failed') {
        setView(v)
        setWorking(false)
        setLine({ tone: 'error', text: INSTALL_MESSAGES[v.job.code ?? 'APPLY_FAILED'] ?? INSTALL_MESSAGES.APPLY_FAILED })
        return
      }
      if (v.on === target && v.job?.state !== 'running') {
        window.location.reload()
        return
      }
    }
    if (alive.current) {
      setWorking(false)
      setLine({ tone: 'error', text: INSTALL_MESSAGES.TIMEOUT })
    }
  }, [])

  async function turnOn() {
    setConfirmOn(false)
    setLine(null)
    setWorking(true)
    try {
      await call('/on', {})
    } catch (e) {
      setWorking(false)
      setLine({ tone: 'error', text: (e as Error).message })
      return
    }
    void follow(true)
  }

  function approved(r: Approved, c: ChangeRequest) {
    setApprove(null)
    if (c.action === 'turn-off') {
      void follow(false)
      return
    }
    setLine({ tone: 'ok', text: c.action === 'add-domain' ? 'האתר נוסף' : c.action === 'remove-domain' ? 'האתר הוסר' : 'המפתח הוסר' })
    if (c.action === 'add-domain') setDraft({ domain: '', note: '' })
    void refresh()
  }

  const ready = view.helper === 'ready'
  const canEdit = ready && !working
  const hasApprover = view.approvers.length > 0
  const switchHint = !ready
    ? null
    : view.on && !hasApprover
      ? 'כדי לכבות מכאן, מוסיפים קודם מפתח אישור או סיסמת אישור'
      : view.on
        ? 'כיבוי דורש אישור'
        : null

  return (
    <div className="space-y-4">
      {/* 1. The switch */}
      <section aria-labelledby="egress-switch-label" className={cn('space-y-3', sectionClass(false))}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="egress-switch-label" className="text-base font-semibold">
                בידוד רשת
              </h2>
              {view.on ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[0.8125rem] text-muted-foreground">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  פעיל
                </span>
              ) : (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.8125rem] font-medium text-primary">מומלץ</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground text-pretty">האפליקציה יכולה להגיע רק לאתרים של הבנקים וחברות האשראי, גם אם יהיה בה קוד זדוני.</p>
          </div>
          <SwitchButton
            on={view.on}
            labelledBy="egress-switch-label"
            busy={working}
            disabled={!ready || working || (view.on && !hasApprover)}
            onClick={() => (view.on ? setApprove({ action: 'turn-off' }) : setConfirmOn(true))}
          />
        </div>
        <p aria-live="polite" className={cn('flex min-h-5 items-center gap-1.5 text-xs text-pretty', line?.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {line?.tone === 'busy' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
          {line?.text ?? switchHint}
        </p>
        {view.overrideDiffers && (
          <p className="text-xs text-muted-foreground text-pretty">
            הקובץ <bdi dir="ltr">docker-compose.egress.yml</bdi> בתיקייה של תזרים שונה מזה שבגרסה הזאת. תזרים לא דורס אותו; אם משהו לא עובד, מוחקים אותו והוא יוחלף.
          </p>
        )}
        {view.helper === 'old' && <OldUpdaterNote />}
        {view.helper === 'unavailable' && <p className="text-sm text-muted-foreground text-pretty">{INSTALL_MESSAGES.NOT_AVAILABLE}</p>}
        {!ready && (
          <Disclosure label="הצגת שלבים ידניים">
            <div className="mt-1 space-y-2 rounded-xl bg-muted/60 p-3">
              {view.on ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    לכיבוי: מוחקים מהקובץ <bdi dir="ltr">.env</bdi> שבתיקייה של תזרים את השורה <bdi dir="ltr">COMPOSE_FILE</bdi>, ואז, באותה תיקייה:
                  </p>
                  <CopyLine text="docker compose up -d --remove-orphans" className="bg-background" />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">בתיקייה של תזרים במחשב (ב-Windows כותבים ; במקום : בשורה השנייה):</p>
                  <CopyLine text={ON_LINES.join('\n')} className="bg-background" />
                </>
              )}
            </div>
          </Disclosure>
        )}
      </section>

      {/* 2. Allowed sites */}
      <section aria-labelledby="egress-allowed" className={cn('space-y-4', sectionClass(false))}>
        <SectionHeading id="egress-allowed" line="אלה האתרים שהאפליקציה יכולה להגיע אליהם. כל השאר חסום.">
          אתרים מותרים
        </SectionHeading>
        <Disclosure label={`אתרי הבנקים וחברות האשראי (${PROVIDERS.length})`}>
          <ul className="mt-1 divide-y rounded-xl border">
            {PROVIDERS.map(p => (
              <li key={p.id} className="space-y-1 px-3 py-2.5 text-sm">
                <span className="block font-medium">{p.name}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {p.domains.map(d => (
                    <Host key={d}>{d}</Host>
                  ))}
                </span>
                {p.thirdParty.map(t => (
                  <span key={t.domain} className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <Host className="text-xs">{t.domain}</Host>
                    <span>{t.why}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Disclosure>

        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">הוספות שלך</h3>
          {view.extraDomains.length === 0 ? (
            <p className="min-h-11 text-sm text-muted-foreground">עוד לא הוספת אתרים.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {view.extraDomains.map(d => (
                <li key={d.domain} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 space-y-0.5">
                    <Host className="block">{d.domain}</Host>
                    <span className="block text-xs text-muted-foreground text-pretty">
                      {d.note && <>{d.note} · </>}
                      {d.approver && <>אושר על ידי {d.approver} · </>}
                      <When at={d.addedAt} />
                    </span>
                  </span>
                  <button type="button" className={ROW_ACTION} disabled={!canEdit} onClick={() => setApprove({ action: 'remove-domain', domain: d.domain })} aria-label={`הסרת ${d.domain}`}>
                    הסרה
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          ref={formRef}
          aria-label="הוספת אתר"
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault()
            const domain = draft.domain.trim()
            if (domain && canEdit) setApprove({ action: 'add-domain', domain, ...(draft.note.trim() ? { note: draft.note.trim() } : {}) })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="egress-domain" className="text-sm font-medium">
                אתר להוספה
              </label>
              <input id="egress-domain" dir="ltr" className={INPUT} value={draft.domain} onChange={e => setDraft(d => ({ ...d, domain: e.target.value }))} placeholder="example.com" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="egress-note" className="text-sm font-medium">
                הערה (לא חובה)
              </label>
              <input id="egress-note" className={INPUT} value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} maxLength={200} placeholder="למה האתר הזה" autoComplete="off" disabled={!canEdit} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={PRIMARY} disabled={!canEdit || !draft.domain.trim()}>
              הוספה, עם אישור
            </button>
            {!ready && <span className="text-xs text-muted-foreground text-pretty">הוספה מהאפליקציה דורשת את רכיב העדכון.</span>}
          </div>
        </form>
      </section>

      {/* 3. Blocked recently */}
      {view.on && (
        <section aria-labelledby="egress-blocked" className={cn('space-y-3', sectionClass(false))}>
          <div className="flex items-start justify-between gap-3">
            <SectionHeading id="egress-blocked" line="מה שנחסם לאחרונה. אם סנכרון נכשל, כנראה שהאתר שהוא צריך מופיע כאן.">
              נחסמו לאחרונה
            </SectionHeading>
            <button type="button" className={cn(ROW_ACTION, 'gap-1.5')} onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              רענון
            </button>
          </div>
          {!view.blocked?.length ? (
            <p className="min-h-11 text-sm text-muted-foreground">לא נחסם שום דבר לאחרונה.</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {view.blocked.map((b, i) => (
                <li key={`${b.at}-${b.host}-${i}`} className="flex min-h-14 items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <Host className="block text-right">{b.host}</Host>
                    <span className="block text-xs text-muted-foreground">
                      {b.who === 'app' ? 'האפליקציה' : b.who === 'updater' ? 'רכיב העדכון' : 'אחר'} · <When at={b.at} />
                    </span>
                  </span>
                  {b.who === 'app' ? (
                    <button
                      type="button"
                      className={ROW_ACTION}
                      onClick={() => {
                        setDraft({ domain: b.host, note: '' })
                        document.getElementById('egress-domain')?.focus()
                        formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      }}
                    >
                      לאשר
                    </button>
                  ) : (
                    <span className="w-14 shrink-0" aria-hidden />
                  )}
                </li>
              ))}
            </ul>
          )}
          <Disclosure label="להוסיף אתר ידנית, מהמחשב">
            <div className="mt-1 space-y-2 rounded-xl bg-muted/60 p-3">
              <p className="text-sm text-muted-foreground text-pretty">בלי רכיב העדכון: בתיקייה של תזרים מוסיפים שורה לקובץ, ומבקשים מהפרוקסי לקרוא אותו שוב.</p>
              <CopyLine className="bg-background" text={`echo '${draft.domain.trim().replace(/[^\w.-]/g, '') || 'example.com'}' >> egress/extra-domains.txt`} />
              <CopyLine className="bg-background" text="docker compose exec squid squid -k reconfigure" />
            </div>
          </Disclosure>
        </section>
      )}

      {/* 4. Approval keys */}
      {ready && (
        <section aria-labelledby="egress-keys" className={cn('space-y-3', sectionClass(false))}>
          <SectionHeading id="egress-keys" line="שינויים שמרחיבים את מה שמותר (כיבוי, הוספת אתר) צריכים מפתח או סיסמה שהאפליקציה עצמה לא יכולה לזייף.">
            מפתחות אישור
          </SectionHeading>
          {view.approvers.length === 0 ? (
            <p className="min-h-11 text-sm text-muted-foreground">עוד אין מפתח אישור.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {view.approvers.map(a => (
                <li key={a.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{a.kind === 'password' ? <ShieldCheck className="h-[18px] w-[18px]" aria-hidden /> : <KeyRound className="h-[18px] w-[18px]" aria-hidden />}</span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.kind === 'password' ? 'סיסמה' : <Host className="text-xs">{a.rpId}</Host>} · <When at={a.createdAt} />
                    </span>
                  </span>
                  <ApproverRemove a={a} disabled={!canEdit} onRemove={() => setApprove({ action: 'remove-approver', id: a.id })} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} disabled={!canEdit || !signin?.passkeys} onClick={() => setRegister('signin-passkey')}>
              המפתח שאיתו אני נכנס/ת
            </button>
            <button type="button" className={SECONDARY} disabled={!canEdit || !signin?.password} onClick={() => setRegister('signin-password')}>
              סיסמת הכניסה שלי
            </button>
          </div>
          <p className="min-h-5 text-xs text-muted-foreground text-pretty">
            {signin && !signin.passkeys && !signin.password ? 'עוד אין לך מפתח או סיסמה לכניסה. מוסיפים אותם בהגדרות ← אנשים.' : signin && !signin.passkeys ? 'אין לך מפתח כניסה (Face ID, Touch ID).' : signin && !signin.password ? 'אין לך סיסמת כניסה.' : ''}
          </p>
          <p className="text-xs text-muted-foreground text-pretty">מפתח בטוח יותר מסיסמה: את הסיסמה מקלידים בתוך האפליקציה. גם מפתח לא מראה למה הוא מאשר, ולכן היומן שלמטה הוא הרשומה של מה שאושר בפועל.</p>
        </section>
      )}

      {/* 5. Change log */}
      {(ready || view.changes.length > 0) && (
        <section aria-labelledby="egress-log" className={cn('space-y-3', sectionClass(false))}>
          <SectionHeading id="egress-log" line="מה שאושר, מתי ועל ידי מי. ה-50 האחרונים.">
            יומן שינויים
          </SectionHeading>
          {view.changes.length === 0 ? (
            <p className="min-h-11 text-sm text-muted-foreground">עוד לא היו שינויים.</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {view.changes.map((c, i) => (
                <li key={`${c.at}-${i}`} className="space-y-0.5 px-3 py-2 text-sm">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{ACTION_TEXT[c.action]}</span>
                    {c.detail && (c.action === 'add-domain' || c.action === 'remove-domain' ? <Host>{c.detail}</Host> : <span className="text-muted-foreground">{c.detail}</span>)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    <When at={c.at} />
                    {c.approver && <> · {c.approver}</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmOn}
        onOpenChange={setConfirmOn}
        onConfirm={() => void turnOn()}
        title="להפעיל בידוד רשת?"
        confirmLabel="הפעלה"
        destructive={false}
      >
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          תזרים יופעל מחדש, וזה לוקח כחצי דקה. אחר כך האפליקציה תגיע רק לאתרים של הבנקים וחברות האשראי. אם סנכרון נכשל בגלל אתר חסום, אפשר לאשר אותו כאן.
        </p>
      </ConfirmDialog>
      <ApprovalDialog change={approve} onClose={() => setApprove(null)} onApproved={approved} />
      <RegisterDialog
        mode={register}
        onClose={() => setRegister(null)}
        onDone={() => {
          setRegister(null)
          setLine({ tone: 'ok', text: 'אישור נוסף' })
          void refresh()
        }}
      />
    </div>
  )
}

function ApproverRemove({ a, disabled, onRemove }: { a: Approver; disabled: boolean; onRemove: () => void }) {
  return (
    <button type="button" className={ROW_ACTION} disabled={disabled} onClick={onRemove} aria-label={`הסרת ${a.name}`}>
      הסרה
    </button>
  )
}
