'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Loader2, LockKeyhole, ScanFace, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AppDialog } from '@/components/ui/app-dialog'
import { SegmentedTabs } from '@/components/ui/segmented-tabs'
import { RecoveryCode } from '@/components/auth/recovery-code'
import { errorText } from '@/components/auth/ui'
import { vaultWithPasskey } from '@/components/vault/vault-client'
import { FIELD_LABELS, SYNC_COMPANIES, type SyncCompany } from '@/lib/sync/providers'
import { FAILURE_TEXT, STEP_TEXT } from '@/lib/sync/format'
import type { RunView } from '@/lib/sync/runs'
import type { LinkAction, UnknownAccount } from '@/lib/sync/store'
import { AccountMini } from './account-element'
import { inputClass } from './add-account-form'
import type { CreatableKindValue } from './account-kinds'

/** Whether this device can add an account that syncs, and why not */
export interface SyncReadiness {
  /** The login is on and this device may sync */
  available: boolean
  /** Shown under "סנכרון אוטומטי" when it isn't available */
  reason: string | null
}

export interface AddedAccount {
  id: string
  displayName: string
}

type Step = 'pick' | 'how' | 'signin' | 'recovery' | 'syncing' | 'found' | 'upload'
type Company = SyncCompany | 'other'

interface FoundRow {
  externalAccount: string
  /** A card's last four digits, else the account number */
  label: string
  rows: number
  include: boolean
  name: string
  /** An account already in Tazrim it links to */
  existing: { id: string; name: string } | null
}

/** The account made before the first sync (the sync needs one) and its sign-in */
interface Draft {
  accountId: string
  credentialId: string
}

const KIND_OPTIONS: { key: CreatableKindValue; label: string }[] = [
  { key: 'BANK', label: 'בנק' },
  { key: 'CREDIT_CARD', label: 'כרטיס אשראי' },
]

async function call<T = Record<string, unknown>>(url: string, body?: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string }
  return { ok: res.ok, data }
}

/** Runs `send`; when the vault is locked, opens it with Face ID / Touch ID and tries once more */
async function withVault<T>(send: () => Promise<{ ok: boolean; data: T & { error?: string; code?: string } }>) {
  let res = await send()
  if (!res.ok && res.data.code === 'VAULT_LOCKED') {
    await vaultWithPasskey('unlock')
    res = await send()
  }
  if (!res.ok) throw new Error(res.data.error ?? 'משהו השתבש. נסו שוב')
  return res.data
}

const fourDigits = (s: string) => (/^\d{4}$/.test(s) ? s : s.replace(/\D/g, '').slice(-4))

/**
 * Adding an account (one flow, option A on the design canvas): בנק / כרטיס
 * אשראי, a company of that kind, how its data comes in, then either the
 * site's sign-in (sealed in the vault with one Face ID, the vault created
 * here if there is none) and the accounts found in it, or the account's
 * details for uploading files.
 */
export function AddAccountSheet({
  open,
  onOpenChange,
  initialKind,
  sync,
  existingAccounts,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialKind: CreatableKindValue
  sync: SyncReadiness
  /** Accounts already here, to say which found ones they are */
  existingAccounts: { id: string; displayName: string }[]
  onAdded: (accounts: AddedAccount[]) => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('pick')
  const [kind, setKind] = useState<CreatableKindValue>(initialKind)
  const [company, setCompany] = useState<Company | null>(null)
  const [method, setMethod] = useState<'sync' | 'files'>(sync.available ? 'sync' : 'files')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [lastFour, setLastFour] = useState('')
  const [otherName, setOtherName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [run, setRun] = useState<RunView | null>(null)
  const [found, setFound] = useState<FoundRow[]>([])
  const [code, setCode] = useState('')
  const draft = useRef<Draft | null>(null)
  const finished = useRef(false)

  const syncCo = company && company !== 'other' ? company : null
  const isCard = kind === 'CREDIT_CARD'

  // A fresh start each time the sheet opens
  useEffect(() => {
    if (!open) return
    setStep('pick')
    setKind(initialKind)
    setCompany(null)
    setMethod(sync.available ? 'sync' : 'files')
    setFields({})
    setName('')
    setLastFour('')
    setOtherName('')
    setError(null)
    setBusy(false)
    setRecoveryKey(null)
    setRun(null)
    setFound([])
    setCode('')
    draft.current = null
    finished.current = false
  }, [open, initialKind, sync.available])

  // Follow the run while it goes
  const runId = run?.id
  const going = run?.status.state === 'running' || run?.status.state === 'needs-code'
  useEffect(() => {
    if (!runId || !going) return
    let stopped = false
    const id = setInterval(async () => {
      const res = await call<{ run: RunView }>(`/api/sync/runs/${runId}`, undefined, 'GET').catch(() => null)
      if (!stopped && res?.ok) setRun(res.data.run)
    }, 1000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [runId, going])

  // What the run asks for next
  const state = run?.status.state
  useEffect(() => {
    if (!run || step !== 'syncing') return
    const s = run.status
    if (s.state === 'needs-links') {
      setFound(foundRows(s.unknown))
      setStep('found')
    } else if (s.state === 'done') {
      void finishWith(s.results.map(r => ({ id: r.accountId, displayName: r.displayName })))
    } else if (s.state === 'failed') {
      setError(FAILURE_TEXT[s.code] ?? 'הסנכרון נכשל')
      setStep('signin')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, step])

  function foundRows(unknown: UnknownAccount[]): FoundRow[] {
    return unknown.map(u => {
      // A suggestion that is the account made for this sheet is no match: it is still nameless
      const match = u.suggestedAccountId && u.suggestedAccountId !== draft.current?.accountId
        ? existingAccounts.find(a => a.id === u.suggestedAccountId) ?? null
        : null
      const four = isCard ? fourDigits(u.label) : ''
      return {
        externalAccount: u.externalAccount,
        label: u.label,
        rows: u.rows,
        include: true,
        name: match ? match.displayName : syncCo ? (four ? `${syncCo.label} ${four}` : syncCo.label) : u.label,
        existing: match ? { id: match.id, name: match.displayName } : null,
      }
    })
  }

  async function finishWith(added: AddedAccount[]) {
    finished.current = true
    onAdded(added)
    onOpenChange(false)
    router.refresh()
  }

  /** Closing before the first sync went through: take back the account and sign-in made for it */
  async function cleanUp() {
    const d = draft.current
    draft.current = null
    if (!d || finished.current) return
    if (run && (run.status.state === 'running' || run.status.state === 'needs-code' || run.status.state === 'needs-links')) {
      await call(`/api/sync/runs/${run.id}`, { cancel: true }).catch(() => null)
    }
    await call(`/api/vault/logins/${d.credentialId}`, undefined, 'DELETE').catch(() => null)
    await call(`/api/accounts/${d.accountId}`, {}, 'DELETE').catch(() => null)
    router.refresh()
  }

  function change(next: boolean) {
    if (!next) void cleanUp()
    onOpenChange(next)
  }

  function pickCompany(c: Company) {
    setCompany(c)
    setError(null)
    setFields({})
    if (c === 'other') {
      setMethod('files')
      setName('')
      setStep('upload')
      return
    }
    setName(c.label)
    setStep('how')
  }

  async function saveSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!syncCo) return
    setBusy(true)
    setError(null)
    try {
      // The vault: made here when there is none (its recovery key shown next), opened when locked
      const info = await call<{ vault: { exists: boolean; open: boolean } }>('/api/vault', undefined, 'GET')
      if (!info.ok) throw new Error(info.data.error ?? 'הכספת לא זמינה')
      let key: string | null = null
      if (!info.data.vault.exists) key = (await vaultWithPasskey('create')).recoveryKey ?? null
      else if (!info.data.vault.open) await vaultWithPasskey('unlock')

      if (!draft.current) {
        // The sync needs an account of the company: this one becomes the first one found
        const acct = await call<{ id: string }>('/api/accounts', { kind, provider: syncCo.provider, displayName: syncCo.label })
        if (!acct.ok) throw new Error(acct.data.error ?? 'החשבון לא נוסף')
        try {
          const login = await withVault(() =>
            call<{ id: string }>('/api/vault/logins', { company: syncCo.id, label: syncCo.label, accountId: acct.data.id, fields })
          )
          draft.current = { accountId: acct.data.id, credentialId: login.id }
        } catch (err) {
          await call(`/api/accounts/${acct.data.id}`, {}, 'DELETE').catch(() => null)
          throw err
        }
      } else {
        const d = draft.current
        await withVault(() => call(`/api/vault/logins/${d.credentialId}`, { label: syncCo.label, accountId: d.accountId, fields }, 'PUT'))
      }
      if (key) {
        setRecoveryKey(key)
        setStep('recovery')
      } else {
        await startSync()
      }
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function startSync() {
    if (!syncCo) return
    setError(null)
    const info = await call<{ companies: { id: string; defaultStart: string }[] }>('/api/sync', undefined, 'GET')
    const startDate = info.data.companies?.find(c => c.id === syncCo.id)?.defaultStart
    const res = await call<{ run: RunView }>('/api/sync', { company: syncCo.id, credentials: fields, startDate })
    if (!res.ok || !res.data.run) {
      setError(res.data.error ?? 'הסנכרון לא התחיל')
      setStep('signin')
      return
    }
    setRun(res.data.run)
    setStep('syncing')
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!run) return
    const res = await call(`/api/sync/runs/${run.id}`, { code })
    if (!res.ok) setError(res.data.error ?? 'הקוד לא נשלח')
    else setRun({ ...run, status: { state: 'running', step: 'logging-in' } })
  }

  async function addFound(e: React.FormEvent) {
    e.preventDefault()
    const d = draft.current
    if (!run || !d || !syncCo) return
    setBusy(true)
    setError(null)
    try {
      const links: LinkAction[] = []
      const added: AddedAccount[] = []
      let draftUsed = false
      for (const row of found) {
        if (!row.include) {
          links.push({ externalAccount: row.externalAccount, action: 'ignore' })
          continue
        }
        if (row.existing) {
          links.push({ externalAccount: row.externalAccount, action: 'link', accountId: row.existing.id })
          added.push({ id: row.existing.id, displayName: row.existing.name })
          continue
        }
        const displayName = row.name.trim() || syncCo.label
        const four = isCard ? fourDigits(row.label) : ''
        const details = { displayName, ...(four.length === 4 ? { cardLastFour: four } : {}) }
        let id: string
        if (!draftUsed) {
          draftUsed = true
          id = d.accountId
          const res = await call(`/api/accounts/${id}`, details, 'PATCH')
          if (!res.ok) throw new Error(res.data.error ?? 'השמירה נכשלה')
        } else {
          const res = await call<{ id: string }>('/api/accounts', { kind, provider: syncCo.provider, ...details })
          if (!res.ok) throw new Error(res.data.error ?? 'החשבון לא נוסף')
          id = res.data.id
        }
        links.push({ externalAccount: row.externalAccount, action: 'link', accountId: id })
        added.push({ id, displayName })
      }
      if (!draftUsed) {
        // Every chosen one was already here: the sign-in names the first of them, the draft goes
        const first = added[0]
        await withVault(() => call(`/api/vault/logins/${d.credentialId}`, { label: syncCo.label, accountId: first.id, fields: {} }, 'PUT'))
        await call(`/api/accounts/${d.accountId}`, {}, 'DELETE')
      }
      const res = await call(`/api/sync/runs/${run.id}`, { links })
      if (!res.ok) throw new Error(res.data.error ?? 'השיוך נכשל')
      // The run stores the rows in the background; the sheet is done
      await finishWith(added)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function createForUpload(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const provider = company === 'other' ? otherName.trim().toLowerCase() : company?.provider
    const displayName = name.trim() || (company === 'other' ? otherName.trim() : company?.label) || ''
    const res = await call<{ id: string; displayName: string }>('/api/accounts', {
      kind,
      provider,
      displayName,
      ...(isCard && lastFour ? { cardLastFour: lastFour } : {}),
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.data.error ?? 'החשבון לא נוסף')
      return
    }
    finished.current = true
    onAdded([{ id: res.data.id, displayName: res.data.displayName }])
    onOpenChange(false)
    router.push('/upload')
  }

  const companies = SYNC_COMPANIES.filter(c => c.kind === kind)
  const back = (to: Step) => () => {
    setError(null)
    setStep(to)
  }
  const included = found.filter(f => f.include).length

  const title =
    step === 'pick' ? 'חשבון חדש'
      : step === 'found' ? (found.length > 1 ? `נמצאו ${found.length} ${isCard ? 'כרטיסים' : 'חשבונות'}` : isCard ? 'נמצא כרטיס' : 'נמצא חשבון')
        : step === 'recovery' ? 'מפתח השחזור של הכספת'
          : step === 'signin' && syncCo ? `הכניסה ל${syncCo.label}`
            : company === 'other' ? (isCard ? 'כרטיס מחברה אחרת' : 'בנק אחר')
              : syncCo?.label ?? 'חשבון חדש'

  return (
    <AppDialog
      open={open}
      onOpenChange={change}
      title={
        <span className="flex items-center gap-2.5">
          {syncCo && step !== 'pick' && <AccountMini kind={kind} provider={syncCo.provider} className="w-8" />}
          {title}
        </span>
      }
      className="flex flex-col sm:min-h-[560px]"
    >
      <div className="mt-4 flex min-h-[60dvh] flex-1 flex-col gap-4 sm:min-h-0">
        {error && <p className={errorText} role="alert">{error}</p>}

        {step === 'pick' && (
          <>
            <SegmentedTabs ariaLabel="סוג החשבון" value={kind} onChange={k => { setKind(k); setCompany(null) }} options={KIND_OPTIONS} />
            <p className="px-1 text-[13px] font-semibold text-muted-foreground">באיזו חברה?</p>
            <ul className="overflow-hidden rounded-2xl surface divide-y">
              {companies.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => pickCompany(c)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-muted/40 active:bg-muted/60">
                    <AccountMini kind={kind} provider={c.provider} className="w-11" />
                    <span className="flex-1 text-[15px] font-medium">{c.label}</span>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground/70" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => pickCompany('other')} className="self-start rounded-lg px-1 py-2 text-sm font-medium text-primary hover:underline">
              {isCard ? 'חברה אחרת' : 'בנק אחר'} (העלאת קבצים בלבד)
            </button>
          </>
        )}

        {step === 'how' && syncCo && (
          <>
            <BackLink onClick={back('pick')} />
            <p className="px-1 text-[13px] font-semibold text-muted-foreground">איך הנתונים מגיעים?</p>
            <div role="radiogroup" aria-label="איך הנתונים מגיעים" className="flex flex-col gap-3">
              <Choice
                on={method === 'sync'}
                disabled={!sync.available}
                onClick={() => setMethod('sync')}
                title="סנכרון אוטומטי"
                text={sync.available
                  ? `תזרים נכנס לאתר של ${syncCo.label} עם שם המשתמש והסיסמה, ומביא את כל ${isCard ? 'הכרטיסים' : 'החשבונות'} שבכניסה. הפרטים נשמרים מוצפנים בכספת.`
                  : sync.reason ?? 'לא זמין כאן'}
              />
              <Choice
                on={method === 'files'}
                onClick={() => setMethod('files')}
                title="העלאת קבצים"
                text={`מורידים פירוט מהאתר של ${syncCo.label} ומעלים כאן. את העמודות מתאימים פעם אחת.`}
              />
            </div>
            <p className="px-1 text-[13px] text-muted-foreground">אפשר לעבור בין השניים אחר כך, בחלון החשבון.</p>
            <div className="mt-auto">
              <button type="button" onClick={() => setStep(method === 'sync' ? 'signin' : 'upload')} className={primary}>המשך</button>
            </div>
          </>
        )}

        {step === 'signin' && syncCo && (
          <form onSubmit={saveSignIn} className="flex flex-1 flex-col gap-4">
            <BackLink onClick={back('how')} />
            {syncCo.fields.map(f => (
              <label key={f} className="block space-y-1.5">
                <span className="text-sm font-medium">{FIELD_LABELS[f]}</span>
                <input
                  type={f === 'password' ? 'password' : 'text'}
                  dir="ltr"
                  required
                  autoComplete={f === 'password' ? 'current-password' : 'off'}
                  value={fields[f] ?? ''}
                  onChange={e => setFields({ ...fields, [f]: e.target.value })}
                  className={cn(inputClass, 'h-11')}
                />
              </label>
            ))}
            <p className="flex gap-2.5 rounded-2xl bg-muted/60 p-3.5 text-[13px] leading-relaxed text-muted-foreground">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>נשמרים מוצפנים בכספת, ורק Face ID או Touch ID של מישהו בבית פותח אותה. אם עוד אין כספת, היא נוצרת עכשיו ומקבלים מפתח שחזור לשמור.</span>
            </p>
            <div className="mt-auto">
              <button type="submit" disabled={busy} className={primary}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <ScanFace className="h-5 w-5" aria-hidden />}
                שמירה וסנכרון
              </button>
            </div>
          </form>
        )}

        {step === 'recovery' && recoveryKey && (
          <>
            <p className="text-sm text-muted-foreground text-pretty">הכספת נוצרה. שמרו את המפתח הזה במנהל סיסמאות או על דף: הוא לא יוצג שוב, ובלעדיו, אם כל המפתחות יאבדו, אי אפשר לפתוח אותה.</p>
            <RecoveryCode code={recoveryKey} link />
            <div className="mt-auto">
              <button type="button" disabled={busy} onClick={async () => { setBusy(true); await startSync(); setBusy(false) }} className={primary}>שמרתי, להמשיך</button>
            </div>
          </>
        )}

        {step === 'syncing' && syncCo && (
          <div className="flex flex-1 flex-col gap-4">
            <p className="flex items-center gap-2.5 rounded-2xl bg-muted/60 p-4 text-[15px]">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              {run?.status.state === 'running' ? STEP_TEXT[run.status.step] ?? 'מסנכרן…' : run?.status.state === 'needs-code' ? `מחכה לקוד מ${syncCo.label}` : 'מסנכרן…'}
            </p>
            {run?.status.state === 'needs-code' && (
              <form onSubmit={sendCode} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">הקוד שהגיע ב-SMS</span>
                  <input dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} className={cn(inputClass, 'h-11')} />
                </label>
                <button type="submit" disabled={!code.trim()} className={primary}>שליחה</button>
              </form>
            )}
          </div>
        )}

        {step === 'found' && syncCo && (
          <form onSubmit={addFound} className="flex flex-1 flex-col gap-4">
            <p className="text-sm text-muted-foreground text-pretty">
              {found.length > 1
                ? `הכניסה של ${syncCo.label} מביאה את כולם. בוחרים אילו להוסיף ונותנים שם. מה שלא נבחר לא ייובא, וזה נשמר לסנכרונים הבאים.`
                : 'נותנים לו שם. בפעם הבאה הוא יסונכרן לבד.'}
            </p>
            <ul className="overflow-hidden rounded-2xl surface divide-y">
              {found.map((f, i) => (
                <li key={f.externalAccount} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={f.include}
                    aria-label={`להוסיף את ${f.label}`}
                    onClick={() => setFound(found.map((r, j) => (j === i ? { ...r, include: !r.include } : r)))}
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors',
                      f.include ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                    )}
                  >
                    {f.include && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                  </button>
                  <AccountMini kind={kind} provider={syncCo.provider} className={cn('w-11', !f.include && 'opacity-50 grayscale')} />
                  <span className={cn('min-w-0 flex-1', !f.include && 'opacity-60')}>
                    {f.existing ? (
                      <span className="block truncate text-[15px] font-medium">{f.existing.name}</span>
                    ) : (
                      <input
                        aria-label={`השם של ${f.label}`}
                        value={f.name}
                        disabled={!f.include}
                        onChange={e => setFound(found.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                        className="block w-full rounded-md bg-transparent text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    )}
                    <span className="block text-[13px] text-muted-foreground">
                      <span dir="ltr">{isCard ? `•••• ${fourDigits(f.label)}` : f.label}</span>
                      {' · '}
                      {f.rows.toLocaleString('he-IL')} תנועות
                      {f.existing && ' · כבר בתזרים'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-1 text-[13px] text-muted-foreground">
              {isCard ? 'כרטיס שכבר קיים בתזרים (לפי 4 הספרות) מתחבר אליו, בלי כפילות.' : 'חשבון שכבר קיים בתזרים מתחבר אליו, בלי כפילות.'}
            </p>
            <div className="mt-auto">
              <button type="submit" disabled={busy || included === 0} className={primary}>
                {busy && <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />}
                {included === 0 ? 'בוחרים לפחות אחד' : included === 1 ? 'הוספה' : `הוספת ${included} ${isCard ? 'כרטיסים' : 'חשבונות'}`}
              </button>
            </div>
          </form>
        )}

        {step === 'upload' && (
          <form onSubmit={createForUpload} className="flex flex-1 flex-col gap-4">
            <BackLink onClick={back(company === 'other' ? 'pick' : 'how')} />
            {company === 'other' && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">{isCard ? 'חברת האשראי' : 'הבנק'}</span>
                <input required value={otherName} maxLength={40} onChange={e => setOtherName(e.target.value)} className={cn(inputClass, 'h-11')} />
              </label>
            )}
            <div className={cn('grid gap-3', isCard && 'grid-cols-2')}>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">שם</span>
                <input value={name} maxLength={60} placeholder={isCard ? 'הכרטיס שלי' : 'החשבון שלי'} onChange={e => setName(e.target.value)} className={cn(inputClass, 'h-11')} />
              </label>
              {isCard && (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">4 ספרות אחרונות</span>
                  <input dir="ltr" inputMode="numeric" maxLength={4} pattern="\d{4}" value={lastFour} onChange={e => setLastFour(e.target.value.replace(/\D/g, ''))} className={cn(inputClass, 'h-11')} />
                </label>
              )}
            </div>
            <div className="mt-auto">
              <button type="submit" disabled={busy || (company === 'other' && !otherName.trim())} className={primary}>
                <Upload className="h-[18px] w-[18px]" aria-hidden />
                הוספה והעלאת קובץ
              </button>
            </div>
          </form>
        )}
      </div>
    </AppDialog>
  )
}

const primary =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ms-1 inline-flex items-center gap-0.5 self-start rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ChevronRight className="h-4 w-4" aria-hidden />
      חזרה
    </button>
  )
}

function Choice({ on, disabled, onClick, title, text }: { on: boolean; disabled?: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-start transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-55',
        on ? 'border-primary ring-[3px] ring-primary/15' : 'hover:border-foreground/20'
      )}
    >
      <span className={cn('mt-0.5 h-5 w-5 shrink-0 rounded-full border-[1.5px]', on ? 'border-[6px] border-primary' : 'border-border')} aria-hidden />
      <span className="space-y-1">
        <span className="block text-base font-semibold">{title}</span>
        <span className="block text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{text}</span>
      </span>
    </button>
  )
}
