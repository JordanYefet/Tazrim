'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { SETUP_STEP_COOKIE, SETUP_STEP_COUNT, nextStep, previousStep, setupHref, stepNumber, type SetupStep } from '@/lib/setup/steps'
import type { SettingView } from '@/lib/settings/app-settings'
import { PlainSettingCards, SettingCard } from '@/components/settings/app-setting-controls'
import { TimeZoneSetting } from '@/components/settings/time-zone-setting'
import { PhonesSettings } from '@/components/settings/phones-settings'
import { HttpsSettings } from '@/components/settings/https-settings'
import { AutoCheckSwitch } from '@/components/updates/auto-check-switch'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from './passkey-client'
import { RecoveryCode } from './recovery-code'
import { RECOVERY_STORAGE_KEY, SetupForm, type SetupCodeInfo } from './setup-form'
import { PasskeyIntro } from './steps/passkey-step'
import { card, errorText, ghostButton, primaryButton } from './ui'

/** One line of the last step's summary: what it is now, and where it lives in Settings */
export interface SetupSummaryRow {
  label: string
  value: string
  where: string
}

export interface SetupWizardProps {
  step: SetupStep
  /** The account step (ENG-119) */
  account: { thisComputer: boolean; code: string | null; codeInfo: SetupCodeInfo }
  /** The basics step; null before the household exists */
  basics: { timeZone: SettingView<string>; autoCheck: boolean } | null
  /** The last step's summary; null before the household exists */
  summary: SetupSummaryRow[] | null
}

/** "שלב 3 מתוך 6", with a quiet dot per step */
export function StepCounter({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground" aria-label={`שלב ${n} מתוך ${SETUP_STEP_COUNT}`}>
      <span aria-hidden className="flex items-center gap-1">
        {Array.from({ length: SETUP_STEP_COUNT }, (_, i) => (
          <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < n ? 'bg-primary' : 'bg-muted-foreground/25')} />
        ))}
      </span>
      <span aria-hidden className="tabular-nums">
        שלב {n} מתוך {SETUP_STEP_COUNT}
      </span>
    </div>
  )
}

/** Remembers the step on this browser, so a plain later visit to /setup resumes there (lib/setup/steps.ts) */
function rememberStep(step: SetupStep) {
  document.cookie = `${SETUP_STEP_COOKIE}=${step}; path=/setup; max-age=${60 * 60 * 24 * 60}; samesite=lax`
}

/**
 * The guided first run (ENG-125): one step per screen in the sign-in card's look,
 * the current one in the URL. Name and password; the recovery code, shown once;
 * a passkey on this device; the basics (time zone, the daily update check); phones
 * and tablets; HTTPS; a summary. Each optional step renders the same component
 * as its Settings page and saves as it changes, so leaving mid-way loses nothing.
 */
export function SetupWizard({ step, account, basics, summary }: SetupWizardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [blocked, setBlocked] = useState(false)
  useEffect(() => setBlocked(!!passkeyBlocker()), [])

  useEffect(() => {
    if (step !== 'account') rememberStep(step)
    window.scrollTo({ top: 0 })
  }, [step])

  const go = (s: SetupStep | null) => {
    if (!s) return
    startTransition(() => {
      router.replace(setupHref(s), { scroll: false })
      // The browser keeps pages it has shown (next.config.ts, staleTimes), and a step saves
      // as it changes: fetch afresh, so going back shows what was just saved
      router.refresh()
    })
  }
  const forward = () => go(nextStep(step, !!passkeyBlocker()))

  if (step === 'account') {
    return (
      <div className={FRAME}>
        <SetupForm
          {...account}
          counter={<div className="flex justify-center pb-1"><StepCounter n={1} /></div>}
          onCreated={code => {
            if (code) sessionStorage.setItem(RECOVERY_STORAGE_KEY, code)
            go('recovery')
          }}
        />
      </div>
    )
  }

  const back = previousStep(step, blocked)
  return (
    <div className={FRAME}>
      <div className={cn(card, 'flex min-h-[calc(100svh-5rem)] flex-col gap-6 space-y-0 md:min-h-[600px]')}>
        <div className="flex h-8 items-center justify-between gap-3">
          <StepCounter n={stepNumber(step)} />
          {/* Its place stays when there is no going back; only its ink goes */}
          <button
            type="button"
            onClick={() => go(back)}
            disabled={!back || pending}
            aria-hidden={!back || undefined}
            tabIndex={back ? undefined : -1}
            className={cn(
              '-me-2 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors duration-quick hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !back && 'invisible'
            )}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
            חזרה
          </button>
        </div>

        <div key={step} className="auth-swap flex flex-1 flex-col gap-5">
          {step === 'recovery' && <RecoveryScreen pending={pending} onDone={forward} />}
          {step === 'passkey' && <PasskeyScreen pending={pending} onDone={forward} />}
          {step === 'basics' && basics && (
            <OptionalScreen
              title="הבסיס"
              intro={
                <>
                  אזור הזמן ובדיקת העדכונים. מה שמשנים כאן נשמר מיד, ונמצא גם ב<Where>הגדרות ← כללי</Where> וב<Where>עדכונים</Where>.
                </>
              }
              pending={pending}
              onNext={forward}
            >
              <TimeZoneSetting setting={basics.timeZone} />
              <SettingCard
                title="עדכונים"
                help="פעם ביום תזרים שואל את GitHub אם יצאה גרסה חדשה, ואם כן מציג הודעה בהגדרות. זו שאלה אחת, בלי שום מידע מהחשבונות. העדכון עצמו רק בלחיצה."
                locked={false}
              >
                <AutoCheckSwitch initial={basics.autoCheck} />
              </SettingCard>
            </OptionalScreen>
          )}
          {step === 'phones' && (
            <OptionalScreen
              title="טלפונים וטאבלטים"
              intro="לפתוח את תזרים גם מהטלפון או מהטאבלט, ברשת הביתית. לא חובה, ואפשר לחזור לזה בכל זמן."
              pending={pending}
              onNext={forward}
            >
              <PhonesSettings inSetup />
            </OptionalScreen>
          )}
          {step === 'https' && (
            <OptionalScreen
              title="HTTPS ומפתחות בטלפון"
              tag="מתקדם"
              intro="צריך את זה רק כדי להיכנס מהטלפון עם Face ID במקום סיסמה. זה החלק הטכני של ההתקנה. אפשר לדלג בלי לאבד כלום."
              pending={pending}
              onNext={forward}
            >
              <HttpsSettings inSetup />
            </OptionalScreen>
          )}
          {step === 'done' && <DoneScreen rows={summary ?? []} />}
        </div>
      </div>
    </div>
  )
}

/**
 * The card hangs from a fixed place near the top instead of the middle, so its
 * header (the counter, "חזרה") stays put while the steps' heights differ. On a
 * phone it fills the screen, its buttons at the foot, as the sign-in card does.
 */
const FRAME = 'flex w-full max-w-md justify-center self-start md:mt-[6vh]'

/** Two equal halves at the card's foot */
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto grid grid-cols-2 gap-3 pt-1">{children}</div>
}

/** "הגדרות ← כללי" never breaks at the arrow */
const Where = ({ children }: { children: React.ReactNode }) => <span className="whitespace-nowrap">{children}</span>

function StepHeading({ title, tag, intro }: { title: string; tag?: string; intro: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        {title}
        {tag && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tag}</span>}
      </h1>
      <p className="text-sm text-muted-foreground text-pretty">{intro}</p>
    </div>
  )
}

/** A step that saves as it changes: "המשך" and "דילוג" both move on, nothing is lost either way */
function OptionalScreen({
  title,
  tag,
  intro,
  pending,
  onNext,
  children,
}: {
  title: string
  tag?: string
  intro: React.ReactNode
  pending: boolean
  onNext: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <StepHeading title={title} tag={tag} intro={intro} />
      <PlainSettingCards>
        <div className="space-y-4">{children}</div>
      </PlainSettingCards>
      <Actions>
        <button type="button" onClick={onNext} disabled={pending} className={primaryButton}>המשך</button>
        <button type="button" onClick={onNext} disabled={pending} className={ghostButton}>דילוג</button>
      </Actions>
    </>
  )
}

/**
 * The recovery code (ENG-119), right after the account is made: the moment it
 * exists, so a closed tab later on can't lose it. Kept in this tab's
 * sessionStorage until "saved", so a reload still shows it.
 */
function RecoveryScreen({ pending, onDone }: { pending: boolean; onDone: () => void }) {
  // undefined: not read yet (first paint, same size); null: not here (another tab, already saved)
  const [code, setCode] = useState<string | null | undefined>(undefined)
  useEffect(() => setCode(sessionStorage.getItem(RECOVERY_STORAGE_KEY)), [])
  return (
    <>
      <StepHeading
        title="קוד השחזור שלכם"
        intro="אם תשכחו את הסיסמה ולא יהיה מכשיר עם מפתח, זו הדרך היחידה להיכנס. שמרו אותו במקום בטוח (מנהל סיסמאות, דף מודפס). הוא לא יוצג שוב."
      />
      {code === null ? (
        <p className="rounded-xl bg-muted px-3 py-3 text-sm text-pretty">
          הקוד כבר הוצג בלשונית אחרת או נשמר. אם לא שמרתם אותו, יוצרים קוד חדש בהגדרות ← אנשים ומכשירים, והקודם מפסיק לעבוד.
        </p>
      ) : (
        <div className={cn(code === undefined && 'invisible')}>
          <RecoveryCode code={code ?? '·····-·····-·····-·····-·····'} />
        </div>
      )}
      <Actions>
        <button
          type="button"
          disabled={pending || code === undefined}
          onClick={() => {
            sessionStorage.removeItem(RECOVERY_STORAGE_KEY)
            onDone()
          }}
          className={cn(primaryButton, 'col-span-2')}
        >
          {code === null ? 'המשך' : 'שמרתי, אפשר להמשיך'}
        </button>
      </Actions>
    </>
  )
}

/** A passkey on this device (ENG-119's step, in this card); passed over where passkeys can't work */
function PasskeyScreen({ pending, onDone }: { pending: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const skipped = useRef(false)
  // Plain http from a phone: nothing to offer here, straight on
  useEffect(() => {
    if (passkeyBlocker() && !skipped.current) {
      skipped.current = true
      onDone()
    }
  }, [onDone])

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await createPasskey('/api/people/devices', {}, guessDeviceLabel() || 'מכשיר')
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pt-4">
        <PasskeyIntro />
      </div>
      <p className={cn(errorText, !error && 'invisible')} role={error ? 'alert' : undefined}>
        {error ?? ' '}
      </p>
      <p className="text-center text-xs text-muted-foreground text-pretty">אפשר להוסיף בכל זמן: <Where>הגדרות ← אנשים ומכשירים</Where>.</p>
      <Actions>
        <button type="button" onClick={add} disabled={busy || pending} className={cn(primaryButton, 'whitespace-nowrap')}>
          הוספת מפתח
        </button>
        <button type="button" onClick={onDone} disabled={busy || pending} className={ghostButton}>דילוג</button>
      </Actions>
    </>
  )
}

/** The end: what is on, where each setting lives, the overview, and installing Tazrim as an app */
function DoneScreen({ rows }: { rows: SetupSummaryRow[] }) {
  return (
    <>
      <StepHeading title="הכול מוכן" intro="ככה הגדרתם את תזרים. כל דבר אפשר לשנות אחר כך בהגדרות." />
      <dl className="divide-y border-y">
        {rows.map(r => (
          <div key={r.label} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0 space-y-0.5">
              <dt className="text-sm font-medium">{r.label}</dt>
              <p className="text-xs text-muted-foreground">{r.where}</p>
            </div>
            <dd dir="auto" className="shrink-0 text-end text-sm text-muted-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <h2 className="text-sm font-medium">להתקין כאפליקציה</h2>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          תזרים נפתח בחלון משלו, עם סמל ב-Dock או בשורת המשימות.
        </p>
        <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <li><span className="font-medium text-foreground/80">Chrome או Edge:</span> סמל ההתקנה בקצה שורת הכתובת.</li>
          <li><span className="font-medium text-foreground/80">Safari במק:</span> <span dir="ltr">File → Add to Dock</span>.</li>
          <li><span className="font-medium text-foreground/80">באייפון:</span> שיתוף ← הוספה למסך הבית.</li>
        </ul>
      </div>
      <Actions>
        <button type="button" onClick={() => window.location.assign('/')} className={primaryButton}>לסקירה</button>
        <button type="button" onClick={() => window.location.assign('/settings')} className={ghostButton}>להגדרות</button>
      </Actions>
    </>
  )
}
