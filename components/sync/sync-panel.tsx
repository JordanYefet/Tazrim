'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Circle, Loader2, LockKeyhole } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { faceFor } from '@/lib/accounts/brands'
import { FIELD_LABELS, syncCompany, type LoginField } from '@/lib/sync/providers'
import { FAILURE_TEXT, monthsBackDay, shortDay, timeAgo } from '@/lib/sync/format'
import type { QueueView, RunView } from '@/lib/sync/runs'
import type { LinkAction, UnknownAccount, Candidate } from '@/lib/sync/store'
import type { CompanyInfo, LoginInput, SyncApi } from './use-sync'

const ROW =
  'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
const INPUT =
  'h-11 w-full rounded-xl border border-border bg-muted px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring md:h-10 md:text-sm'
const PRIMARY =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-[opacity,transform] duration-quick ease-ui active:scale-[0.97] disabled:opacity-40 md:h-10 md:text-sm'
const SECONDARY =
  'inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted md:h-10 md:text-sm'

/** "עו״ש משותף", "2 כרטיסים": what a company's row fills */
function accountsLabel(c: CompanyInfo): string {
  if (c.accounts.length === 1) return c.accounts[0]
  return c.kind === 'CREDIT_CARD' ? `${c.accounts.length} כרטיסים` : `${c.accounts.length} חשבונות`
}

/** The company's mini face: the same colours its accounts' cards and statements carry. */
function Swatch({ company }: { company: Pick<CompanyInfo, 'kind' | 'id'> }) {
  const face = faceFor(company.kind, syncCompany(company.id)?.provider)
  return (
    <span
      aria-hidden
      className="h-[22px] w-[34px] shrink-0 rounded-[5px] shadow-sm"
      style={{ background: `linear-gradient(135deg, ${face.stops[1]}, ${face.stops[2]})` }}
    />
  )
}

function BackHeader({ company, onBack, back = true }: { company: CompanyInfo; onBack?: () => void; back?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-3 pt-3">
      {back && onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/70 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}
      <Swatch company={company} />
      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{company.label}</span>
      {!company.verified && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title="עוד לא נוסה מול חשבון אמיתי">
          לא נבדק עדיין
        </span>
      )}
    </div>
  )
}

/**
 * The list: the companies the household's accounts sync through (ENG-102), each
 * with its accounts. None yet: a way to add one in Settings.
 */
function CompanyList({
  info,
  onPick,
  onClose,
  onAll,
}: {
  info: NonNullable<SyncApi['info']>
  onPick: (id: string) => void
  onClose: () => void
  onAll: () => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const own = info.companies
  const saved = own.filter(c => c.savedLogin)
  const last = own.map(c => c.lastSyncedAt).filter(Boolean).sort().at(-1)
  const disabled = !info.available
  return (
    <div className="pb-2">
      <div className="px-4 pb-2 pt-3">
        <div className="text-[17px] font-semibold">סנכרון</div>
        <div className="text-xs text-muted-foreground">{last ? `סנכרון אחרון ${timeAgo(last)}` : 'משיכת תנועות ישירות מאתר הבנק או חברת האשראי'}</div>
      </div>
      {disabled && own.length > 0 && (
        <p className="mx-4 mb-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          הכניסה עם מפתח כבויה בשרת הזה, אז אפשר לסנכרן רק מהמחשב שעליו Tazrim רץ.
        </p>
      )}
      {own.length === 0 ? (
        <div className="mx-4 mb-1 mt-1 flex flex-col items-center gap-2 rounded-xl bg-muted px-4 py-5 text-center">
          <span className="text-sm font-medium">אין עדיין חשבון שמסתנכרן</span>
          <span className="text-xs leading-relaxed text-muted-foreground">מוסיפים חשבון בנק או כרטיס מחברה שנתמכת בסנכרון, והיא תופיע כאן.</span>
          <Link href="/settings?new=bank" onClick={onClose} className="mt-1 text-sm font-medium text-primary underline-offset-2 hover:underline">
            הוספת חשבון בהגדרות
          </Link>
        </div>
      ) : (
        <ul className={cn(disabled && 'pointer-events-none opacity-50')} aria-disabled={disabled || undefined}>
          {own.map((c, i) => (
            <li key={c.id}>
              {i > 0 && <div aria-hidden className="ms-[3.75rem] h-px bg-border" />}
              <button type="button" disabled={disabled} onClick={() => onPick(c.id)} className={cn(ROW, 'hover:bg-muted active:bg-muted')}>
                <Swatch company={c} />
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className="text-[15px] font-medium md:text-sm">{c.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {accountsLabel(c)} · {c.lastSyncedAt ? timeAgo(c.lastSyncedAt) : 'טרם סונכרן'}
                  </span>
                </span>
                {c.savedLogin && (
                  <span title="פרטי הכניסה שמורים בכספת" className="shrink-0 text-muted-foreground">
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">פרטי הכניסה שמורים בכספת</span>
                  </span>
                )}
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {own.length > 0 && (
        <div className="px-4 pb-2 pt-3">
          {/* Every company with a sign-in saved in the vault, one after another (ENG-92) */}
          <button
            type="button"
            disabled={disabled || busy || saved.length === 0}
            onClick={async () => {
              setBusy(true)
              setError(null)
              const err = await onAll()
              setBusy(false)
              setError(err)
            }}
            className={SECONDARY + ' w-full gap-2 disabled:opacity-50'}
            aria-describedby="sync-all-hint"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
            {saved.length > 1 ? `סנכרן הכול (${saved.length})` : 'סנכרן הכול'}
          </button>
          {error && (
            <p role="alert" className="mt-1.5 text-center text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <p id="sync-all-hint" className="mt-1.5 text-center text-[11px] leading-relaxed text-muted-foreground text-pretty">
            {saved.length === 0
              ? info.vault.exists
                ? 'שומרים את פרטי הכניסה בכספת בסנכרון של חשבון, ואז הכול מסתנכרן בלחיצה אחת.'
                : 'כדי לסנכרן הכול בלחיצה אחת, יוצרים כספת בהגדרות ← כספת ושומרים בה את פרטי הכניסה.'
              : info.vault.open
                ? 'כל חשבון עם פרטים שמורים, בזה אחר זה, מהסנכרון האחרון שלו.'
                : 'Face ID או Touch ID פותח את הכספת, ואז כל חשבון עם פרטים שמורים מסתנכרן בזה אחר זה.'}
          </p>
        </div>
      )}
    </div>
  )
}

/** Login fields and the start date; the password goes to this one sync and is never kept. */
/** "חודש", "חצי שנה", "שנתיים": how far a range option reaches */
function monthsLabel(m: number): string {
  if (m === 1) return 'חודש אחורה'
  if (m === 6) return 'חצי שנה אחורה'
  if (m === 12) return 'שנה אחורה'
  if (m === 18) return 'שנה וחצי אחורה'
  if (m === 24) return 'שנתיים אחורה'
  if (m % 12 === 0) return `${m / 12} שנים אחורה`
  return `${m} חודשים אחורה`
}

const RANGE_MONTHS = [1, 3, 6, 12, 18, 24, 36, 48]

function LoginForm({
  company,
  vault,
  onBack,
  onStart,
}: {
  company: CompanyInfo
  vault: { exists: boolean; open: boolean }
  onBack: () => void
  onStart: (login: LoginInput, startDate: string) => Promise<string | null>
}) {
  // A sign-in saved in the vault (ENG-92) is used as is; "other details" types new ones
  const [typing, setTyping] = useState(!company.savedLogin)
  const [save, setSave] = useState(vault.exists)
  const [values, setValues] = useState<Record<string, string>>({})
  const [range, setRange] = useState('default')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [custom, setCustom] = useState(company.defaultStart)
  const { earliest } = company
  const today = monthsBackDay(0)

  // Only the ranges the company's site keeps; the last one reaches as far as it goes
  const options = [
    { value: 'default', label: `${company.lastSyncedAt ? 'מהסנכרון האחרון' : 'מהתנועה האחרונה'} (${shortDay(company.defaultStart)})`, day: company.defaultStart },
    ...RANGE_MONTHS.filter(m => m <= company.historyMonths).map(m => ({
      value: String(m),
      label:
        monthsLabel(m) +
        (company.provenMonths && m > company.provenMonths ? ' (ניסיוני)' : m === company.historyMonths ? ' (הכי רחוק שהאתר מאפשר)' : ''),
      day: m === company.historyMonths ? earliest : monthsBackDay(m),
    })),
    { value: 'custom', label: 'תאריך אחר…', day: custom },
  ]
  const complete =
    (!typing || company.fields.every(f => (values[f] ?? '').trim())) && (range !== 'custom' || (custom >= earliest && custom <= today))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!complete || busy) return
    setBusy(true)
    setError(null)
    const day = options.find(o => o.value === range)?.day ?? company.defaultStart
    const login: LoginInput = typing ? { credentials: values, save: vault.exists && save } : { saved: true }
    const err = await onStart(login, day < earliest ? earliest : day)
    // The typed password is not kept in the page either
    setValues({})
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <form onSubmit={submit} autoComplete="off" className="pb-4">
      <BackHeader company={company} onBack={onBack} />
      <div className="flex flex-col gap-3 px-4">
        {!typing && (
          <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
            <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-[13px]">
              <span className="block font-medium">פרטי הכניסה שמורים בכספת</span>
              <span className="block text-xs text-muted-foreground">
                {vault.open ? 'הם נקראים בשרת ולא מגיעים לדפדפן.' : 'Face ID או Touch ID יפתח את הכספת.'}
              </span>
            </span>
            <button type="button" onClick={() => setTyping(true)} className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
              פרטים אחרים
            </button>
          </div>
        )}
        {typing && company.fields.map((f: LoginField, i) => (
          <label key={f} className="flex flex-col gap-1.5 text-[13px] font-medium">
            {FIELD_LABELS[f]}
            <input
              type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'}
              inputMode={f === 'id' || f === 'nationalID' || f === 'card6Digits' || f === 'phoneNumber' || f === 'num' ? 'numeric' : undefined}
              name={`sync-${company.id}-${f}`}
              autoComplete="off"
              autoFocus={i === 0}
              dir="ltr"
              value={values[f] ?? ''}
              onChange={e => setValues(v => ({ ...v, [f]: e.target.value }))}
              className={INPUT}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          מתאריך
          <select value={range} onChange={e => setRange(e.target.value)} className={INPUT}>
            {options.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {range === 'custom' && (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            <span className="sr-only">תאריך התחלה</span>
            <input type="date" min={earliest} max={today} value={custom} onChange={e => setCustom(e.target.value)} className={INPUT} />
            <span className="text-xs font-normal text-muted-foreground">
              {company.provenMonths
                ? `${company.label}: עד ${shortDay(monthsBackDay(company.provenMonths))} בוודאות, ועד ${shortDay(earliest)} בניסיון`
                : `${company.label} מאפשר לחזור עד ${shortDay(earliest)}`}
            </span>
          </label>
        )}
        {typing && vault.exists && (
          <label className="flex items-center gap-2.5 text-[13px]">
            <input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            {company.savedLogin ? 'לעדכן בכספת, במקום הפרטים השמורים' : 'לשמור בכספת, לסנכרונים הבאים'}
          </label>
        )}
        <p className="text-xs text-muted-foreground text-pretty">
          {!typing
            ? 'הדפדפן של הסנכרון רץ ברקע, בלי חלון.'
            : vault.exists && save
              ? `נשמרים מוצפנים בכספת${vault.open ? '' : ' (Face ID או Touch ID יפתח אותה)'}. הדפדפן של הסנכרון רץ ברקע, בלי חלון.`
              : 'הסיסמה משמשת לסנכרון הזה בלבד ולא נשמרת. הדפדפן של הסנכרון רץ ברקע, בלי חלון.'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={!complete || busy} className={PRIMARY}>
          {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          סנכרן
        </button>
      </div>
    </form>
  )
}

type StepState = 'done' | 'active' | 'waiting' | 'todo' | 'failed'

function StepRow({ label, state, end }: { label: string; state: StepState; end?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-[13px]">
      {state === 'done' && <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />}
      {state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />}
      {state === 'waiting' && <Circle className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden />}
      {state === 'failed' && <AlertCircle className="h-4 w-4 text-red-600" aria-hidden />}
      {state === 'todo' && <Circle className="h-4 w-4 text-border" aria-hidden />}
      <span className={cn('flex-1', state === 'todo' && 'text-muted-foreground', state === 'waiting' && 'font-medium text-amber-900 dark:text-amber-200')}>
        {label}
      </span>
      {end}
    </li>
  )
}

/** Where the run is: logging in, the SMS code, fetching, storing. */
function Steps({ run, company }: { run: RunView; company: CompanyInfo }) {
  const s = run.status
  const order = ['logging-in', 'code', 'fetching', 'storing'] as const
  const stepOf = (step: string | undefined): (typeof order)[number] | 'end' =>
    step === 'starting' || step === 'logging-in' ? 'logging-in' : step === 'done' ? 'storing' : (order as readonly string[]).includes(step ?? '') ? (step as (typeof order)[number]) : 'end'
  const at =
    s.state === 'running'
      ? stepOf(s.step)
      : s.state === 'needs-code'
        ? 'code'
        : s.state === 'needs-links'
          ? 'storing'
          : s.state === 'failed'
            ? // The step it failed in; unknown: the first, so no step shows as done
              s.at
              ? stepOf(s.at)
              : 'logging-in'
            : 'end'
  const idx = at === 'end' ? order.length : order.indexOf(at)
  const stateOf = (i: number): StepState => {
    if (s.state === 'failed' && i === idx) return 'failed'
    if (i < idx || s.state === 'done') return 'done'
    if (i === idx) return s.state === 'needs-code' || s.state === 'needs-links' ? 'waiting' : 'active'
    return 'todo'
  }
  const rows: { key: (typeof order)[number]; label: string }[] = [
    { key: 'logging-in', label: 'התחברות' },
    ...(company.otp ? [{ key: 'code' as const, label: 'קוד SMS' }] : []),
    { key: 'fetching', label: 'משיכת תנועות' },
    { key: 'storing', label: s.state === 'needs-links' ? 'שיוך חשבונות' : 'שמירה' },
  ]
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(r => (
        <StepRow key={r.key} label={r.label} state={stateOf(order.indexOf(r.key))} />
      ))}
    </ul>
  )
}

function CodeEntry({ onSubmit, onCancel }: { onSubmit: (code: string) => Promise<string | null>; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      onSubmit={async e => {
        e.preventDefault()
        setError(await onSubmit(code))
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        הקוד שקיבלת ב-SMS
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          dir="ltr"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
          className={cn(INPUT, 'h-12 border-2 border-amber-300 text-center text-xl tracking-[0.4em] md:h-12 md:text-xl')}
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <button type="submit" disabled={code.length < 4} className={PRIMARY}>
        אישור
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        ביטול הסנכרון
      </button>
    </form>
  )
}

const CREATE = '__create'
const IGNORE = '__ignore'

/** Accounts the site reported that no answer exists for yet: link, create or ignore; asked once. */
function LinkAccounts({
  company,
  unknown,
  candidates,
  onSubmit,
  onCancel,
}: {
  company: CompanyInfo
  unknown: UnknownAccount[]
  candidates: Candidate[]
  onSubmit: (links: LinkAction[]) => Promise<string | null>
  onCancel: () => void
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(unknown.map(u => [u.externalAccount, u.suggestedAccountId ?? CREATE]))
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const card = company.kind === 'CREDIT_CARD'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const links = unknown.map((u): LinkAction => {
      const v = choice[u.externalAccount]
      if (v === CREATE) return { externalAccount: u.externalAccount, action: 'create' }
      if (v === IGNORE) return { externalAccount: u.externalAccount, action: 'ignore' }
      return { externalAccount: u.externalAccount, action: 'link', accountId: v }
    })
    const err = await onSubmit(links)
    setBusy(false)
    setError(err)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        {unknown.length > 1 ? 'נמצאו חשבונות' : card ? 'נמצא כרטיס' : 'נמצא חשבון'} שעוד לא מוכרים ל-Tazrim. התשובה נשמרת, כך שבפעם הבאה זה יקרה לבד.
      </p>
      {unknown.map(u => (
        <label key={u.externalAccount} className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-[13px]">
          <span className="font-medium">
            {card ? `כרטיס שמסתיים ב-${u.label}` : `חשבון ${u.label}`}
            <span className="font-normal text-muted-foreground"> · {u.rows} תנועות</span>
          </span>
          <select
            value={choice[u.externalAccount]}
            onChange={e => setChoice(c => ({ ...c, [u.externalAccount]: e.target.value }))}
            className={INPUT}
          >
            {candidates.map(a => (
              <option key={a.id} value={a.id}>
                {`שייך ל: ${a.displayName}${a.cardLastFour ? ` (${a.cardLastFour})` : ''}`}
              </option>
            ))}
            <option value={CREATE}>{card ? 'כרטיס חדש ב-Tazrim' : 'חשבון חדש ב-Tazrim'}</option>
            <option value={IGNORE}>להתעלם ממנו</option>
          </select>
        </label>
      ))}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <button type="submit" disabled={busy} className={PRIMARY}>
        המשך
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        ביטול הסנכרון
      </button>
    </form>
  )
}

function Result({ run, company, onAgain, onClose }: { run: RunView; company: CompanyInfo; onAgain: () => void; onClose: () => void }) {
  const s = run.status
  if (s.state === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
          {FAILURE_TEXT[s.code] ?? FAILURE_TEXT.GENERIC}
        </p>
        <button type="button" onClick={onAgain} className={PRIMARY}>
          לנסות שוב
        </button>
      </div>
    )
  }
  if (s.state !== 'done') return null
  const pending = s.results.reduce((n, r) => n + r.pending, 0)
  // Asked past the proven range (Cal past 18 months): say how far back the site answered
  const experimental = !!company.provenMonths && run.startDate < monthsBackDay(company.provenMonths)
  const reached = experimental
    ? s.results.map(r => r.oldest).filter((d): d is string => !!d).sort()[0]
    : undefined
  return (
    <div className="flex flex-col gap-3">
      {s.results.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {s.results.map(r => (
            <li key={r.accountId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
              <span className="min-w-0 truncate font-medium">{r.displayName}</span>
              <span className="flex shrink-0 flex-col items-end tabular-nums text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{r.created} חדשות</span>
                  {r.skipped > 0 && ` · ${r.skipped} כבר היו`}
                  {r.skippedByAmount > 0 && ` (${r.skippedByAmount} לפי סכום ותאריך)`}
                </span>
                {/* Uploaded rows the site gave a missing אסמכתא or note (ENG-103) */}
                {r.filled > 0 && <span className="text-[12px]">הושלמו אסמכתא או הערות ב-{r.filled}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">לא נשמרו תנועות (כל החשבונות שנמצאו מסומנים להתעלמות).</p>
      )}
      {s.results.map(
        r =>
          r.balanceMismatch && (
            <p key={`b-${r.accountId}`} role="alert" className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              {`${r.displayName}: היתרה המחושבת לא תואמת את הקובץ שהועלה ב-${shortDay(r.balanceMismatch.day)} (הפרש ₪${Math.abs(r.balanceMismatch.difference).toLocaleString('he-IL')}). התנועות נשמרו; כדאי לבדוק את היתרה מול האתר.`}
            </p>
          )
      )}
      {experimental && (
        <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          {reached
            ? `${company.label} החזירה תנועות עד ${shortDay(reached)} (ביקשת מ-${shortDay(run.startDate)}).`
            : `${company.label} לא החזירה תנועות מהתקופה שביקשת.`}
        </p>
      )}
      {pending > 0 && (
        <p className="text-xs text-muted-foreground">
          {pending === 1
            ? 'תנועה אחת עוד בהמתנה באתר. היא תיכנס בסנכרון הבא, כשיסתיים עיבודה.'
            : `${pending} תנועות עוד בהמתנה באתר. הן ייכנסו בסנכרון הבא, כשיסתיים עיבודן.`}
        </p>
      )}
      <button type="button" onClick={onClose} className={PRIMARY}>
        סגור
      </button>
    </div>
  )
}

/** "Sync all" (ENG-92): every company in it, where it stands, in a fixed order */
function QueueList({ queue, companies }: { queue: QueueView; companies: CompanyInfo[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {queue.items.map(item => {
        const c = companies.find(x => x.id === item.company)
        const text =
          item.state === 'waiting'
            ? 'בתור'
            : item.state === 'running'
              ? 'מסתנכרן…'
              : item.state === 'done'
                ? `${item.created ?? 0} חדשות`
                : item.state === 'skipped'
                  ? item.code === 'VAULT_LOCKED'
                    ? 'דולג: הכספת ננעלה'
                    : 'דולג: פרטי הכניסה השמורים חסרים'
                  : (FAILURE_TEXT[item.code ?? ''] ?? FAILURE_TEXT.GENERIC)
        return (
          <li key={item.company} className="flex min-h-11 items-center gap-3 px-3 py-2 text-[13px]">
            {item.state === 'running' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
            ) : item.state === 'done' ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : item.state === 'failed' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{c?.label ?? item.company}</span>
            <span className={cn('shrink-0 text-end tabular-nums', item.state === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground')}>
              {text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * What the sync button opens (ENG-91): the companies, then a company's login,
 * then the run (progress, the SMS code, linking new accounts, the result).
 * Every step lives in the same panel; closing it leaves a run going.
 */
export function SyncPanel({ sync, onClose }: { sync: SyncApi; onClose: () => void }) {
  const { info, run, active } = sync
  const [picked, setPicked] = useState<string | null>(null)
  // Shows the run while one is going, or until it is dismissed
  const [showRun, setShowRun] = useState(active)
  useEffect(() => {
    if (active) setShowRun(true)
  }, [active])

  if (!info) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> טוען…
      </div>
    )
  }

  const queue = info.queue
  if (showRun && queue) {
    const going = !queue.finishedAt
    const current = run && run.company === queue.items.find(i => i.state === 'running')?.company ? run : null
    const currentCompany = current ? info.companies.find(c => c.id === current.company) : undefined
    const s = current?.status
    const finished = queue.items.filter(i => i.state !== 'waiting' && i.state !== 'running').length
    return (
      <div className="pb-4">
        <div className="px-4 pb-3 pt-3">
          <div className="text-[17px] font-semibold">סנכרון הכול</div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {going ? `${Math.min(finished + 1, queue.items.length)} מתוך ${queue.items.length}` : 'הסתיים'}
          </div>
        </div>
        <div className="flex flex-col gap-4 px-4">
          <QueueList queue={queue} companies={info.companies} />
          {current && currentCompany && s && (s.state === 'running' || s.state === 'needs-code' || s.state === 'needs-links') && (
            <>
              <Steps run={current} company={currentCompany} />
              {s.state === 'needs-code' && <CodeEntry onSubmit={code => sync.act({ code })} onCancel={() => void sync.act({ cancel: true })} />}
              {s.state === 'needs-links' && (
                <LinkAccounts
                  company={currentCompany}
                  unknown={s.unknown}
                  candidates={s.candidates}
                  onSubmit={links => sync.act({ links })}
                  onCancel={() => void sync.act({ cancel: true })}
                />
              )}
            </>
          )}
          {going ? (
            <p className="text-xs text-muted-foreground">אפשר לסגור את החלון; הסנכרון ממשיך, והכפתור בכותרת יראה מתי הוא מסתיים.</p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowRun(false)
                onClose()
              }}
              className={PRIMARY}
            >
              סגור
            </button>
          )}
        </div>
      </div>
    )
  }

  const runCompany = run ? info.companies.find(c => c.id === run.company) : undefined
  if (showRun && run && runCompany) {
    const s = run.status
    return (
      <div className="pb-4">
        <BackHeader company={runCompany} back={false} />
        <div className="flex flex-col gap-4 px-4">
          <Steps run={run} company={runCompany} />
          {s.state === 'needs-code' && <CodeEntry onSubmit={code => sync.act({ code })} onCancel={() => void sync.act({ cancel: true })} />}
          {s.state === 'needs-links' && (
            <LinkAccounts
              company={runCompany}
              unknown={s.unknown}
              candidates={s.candidates}
              onSubmit={links => sync.act({ links })}
              onCancel={() => void sync.act({ cancel: true })}
            />
          )}
          {s.state === 'running' && <p className="text-xs text-muted-foreground">אפשר לסגור את החלון; הסנכרון ממשיך, והכפתור בכותרת יראה מתי הוא מסתיים.</p>}
          <Result
            company={runCompany}
            run={run}
            onAgain={() => {
              setPicked(runCompany.id)
              setShowRun(false)
            }}
            onClose={() => {
              setShowRun(false)
              setPicked(null)
              onClose()
            }}
          />
        </div>
      </div>
    )
  }

  const company = picked ? info.companies.find(c => c.id === picked) : undefined
  if (company && info.available) {
    return (
      <LoginForm
        key={company.id + (company.savedLogin ?? '')}
        company={company}
        vault={info.vault}
        onBack={() => setPicked(null)}
        onStart={async (login, startDate) => {
          const err = await sync.start(company.id, login, startDate)
          if (!err) setShowRun(true)
          return err
        }}
      />
    )
  }
  return (
    <CompanyList
      info={info}
      onPick={setPicked}
      onClose={onClose}
      onAll={async () => {
        const err = await sync.startAll()
        if (!err) setShowRun(true)
        return err
      }}
    />
  )
}
