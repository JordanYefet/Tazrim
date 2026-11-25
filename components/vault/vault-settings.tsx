'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, CreditCard, KeyRound, Laptop, RotateCcw, Lock, LockKeyhole, LockKeyholeOpen, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react'
import { AppDialog } from '@/components/ui/app-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RecoveryCode } from '@/components/auth/recovery-code'
import { errorText, primaryButton, secondaryButton, textButton } from '@/components/auth/ui'
import { inputClass } from '@/components/accounts/add-account-form'
import { cn } from '@/lib/utils/cn'
import { post, vaultWithPasskey } from './vault-client'
import { unlockVault } from './unlock'

interface Credential { id: string; company: string; label: string; accountId: string | null; updatedAt: string }
interface Passkey { id: string; label: string; personName: string; mine: boolean; thisDevice: boolean; opens: boolean }
interface VaultInfo {
  vault: { exists: boolean; open: boolean; openedBy: string | null; openedAt: string | null; locksAt: string | null; hasRecoveryKey: boolean }
  credentials: Credential[]
  passkeys: Passkey[]
  /** The signed-in person's password: whether they have one, and whether it opens the vault */
  password: { has: boolean; opensVault: boolean; optedOut: boolean }
}

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '')
const date = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })

const ROW = 'flex min-h-14 items-center gap-3.5 px-4 py-2.5 md:px-5 [&+&]:border-t'
const TEXT = 'shrink-0 rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-quick disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const QUIET_DANGER = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:text-red-400'
const isComputer = (label: string) => /mac|windows|linux|chrome ?os|מחשב/i.test(label)

function RowIcon({ icon: Icon, muted = false }: { icon: LucideIcon; muted?: boolean }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-muted', muted ? 'text-muted-foreground' : 'text-foreground/80')} aria-hidden>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  )
}

/**
 * Settings → the vault (ENG-90): whether it is open and until when, which
 * passkeys can open it, the recovery key and starting over. The sign-ins it
 * holds are managed on their accounts (Settings → accounts).
 */
export function VaultSettings() {
  const [info, setInfo] = useState<VaultInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shownKey, setShownKey] = useState<{ title: string; key: string } | null>(null)
  const [renewing, setRenewing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [enablingPassword, setEnablingPassword] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')

  const load = useCallback(() => {
    fetch('/api/vault').then(async r => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) setError(data.error ?? 'משהו השתבש. נסו שוב')
      else setInfo(data)
    })
  }, [])
  useEffect(load, [load])
  // The idle lock happens on the server; check back when it is due
  useEffect(() => {
    if (!info?.vault.locksAt) return
    const t = window.setTimeout(load, Math.max(1000, new Date(info.vault.locksAt).getTime() - Date.now() + 1000))
    return () => window.clearTimeout(t)
  }, [info?.vault.locksAt, load])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
    load()
  }

  const create = () => run(async () => {
    const { recoveryKey } = await vaultWithPasskey('create')
    if (recoveryKey) setShownKey({ title: 'מפתח השחזור של הכספת', key: recoveryKey })
  })

  async function enablePassword(e: React.FormEvent) {
    e.preventDefault()
    await run(async () => {
      await post('/api/vault/password', { password: passwordInput }, 'PUT')
      setEnablingPassword(false)
      setPasswordInput('')
    })
  }

  if (!info) {
    return (
      <div className="space-y-6">
        <Heading />
        {error ? <p className={errorText} role="alert">{error}</p> : <div className="h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-label="טוען" />}
      </div>
    )
  }

  const { vault, credentials, passkeys, password } = info
  const open = vault.open
  const canAddMine = open && passkeys.some(p => p.mine && !p.opens)

  return (
    <div className="space-y-6">
      <Heading />
      {error && <p className={errorText} role="alert">{error}</p>}

      {/* Status: none yet, locked, or open (and until when) */}
      {/* Phones: the state above, the action under it at full width; wider, one row */}
      <section aria-label="מצב הכספת" className="flex flex-col gap-4 rounded-2xl surface p-4 sm:flex-row sm:items-center md:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
          <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', open ? 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]' : 'bg-muted text-muted-foreground')} aria-hidden>
            {open ? <LockKeyholeOpen className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
          </span>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-[1.0625rem] font-bold">{!vault.exists ? 'עוד אין כספת' : open ? 'פתוחה' : 'נעולה'}</span>
            <span className="block text-[0.8125rem] text-muted-foreground text-pretty">
              {!vault.exists
                ? 'יוצרים אותה עם Face ID או Touch ID, ומקבלים מפתח שחזור לשמור.'
                : open
                  ? `נפתחה ב-${time(vault.openedAt)} (${vault.openedBy}). תינעל ב-${time(vault.locksAt)} אם לא ישתמשו בה, או כשהשרת מופעל מחדש.`
                  : 'נפתחת עם Face ID או Touch ID, עם הסיסמה (אם הופעלה) או עם מפתח השחזור, כשסנכרון צריך אותה.'}
            </span>
          </span>
        </div>
        {!vault.exists ? (
          <button type="button" onClick={create} disabled={busy} className={cn(secondaryButton, 'w-full border-transparent bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto')}>
            <KeyRound className="h-4 w-4" aria-hidden />
            יצירת כספת
          </button>
        ) : open ? (
          <button type="button" onClick={() => run(() => post('/api/vault/lock', {}))} disabled={busy} className={cn(secondaryButton, 'w-full sm:w-auto')}>
            נעילה עכשיו
          </button>
        ) : (
          <span className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-2">
            <button type="button" onClick={() => run(() => unlockVault())} disabled={busy} className={cn(secondaryButton, 'w-full border-transparent bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto')}>
              <KeyRound className="h-4 w-4" aria-hidden />
              פתיחה
            </button>
          </span>
        )}
      </section>

      {vault.exists && (
        <>
          <Link href="/settings/accounts" className="flex min-h-14 items-center gap-3.5 rounded-2xl surface px-4 py-2.5 transition-colors hover:bg-muted/40 md:px-5">
            <RowIcon icon={CreditCard} />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium">
                {credentials.length === 0 ? 'עוד אין בה פרטי כניסה' : credentials.length === 1 ? 'פרטי כניסה אחד שמור בה' : `${credentials.length} פרטי כניסה שמורים בה`}
              </span>
              <span className="block text-[0.8125rem] text-muted-foreground">מוסיפים, משנים ומסירים בחלון של כל חשבון</span>
            </span>
            <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />
          </Link>

          <section aria-labelledby="openers-title" className="space-y-2">
            <h2 id="openers-title" className="px-1 text-[0.8125rem] font-semibold text-muted-foreground">מי יכול לפתוח</h2>
            <ul className="overflow-hidden rounded-2xl surface">
              {passkeys.map(p => (
                <li key={p.id} className={ROW}>
                  <RowIcon icon={isComputer(p.label) ? Laptop : Smartphone} muted={!p.opens} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[0.9375rem] font-medium">
                      <span className="truncate">{p.label} של {p.personName}</span>
                      {p.thisDevice && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">המכשיר הזה</span>}
                    </span>
                    <span className="block text-[0.8125rem] text-muted-foreground text-pretty">
                      {p.opens ? 'המפתח הזה פותח את הכספת' : p.mine ? 'עוד לא. מוסיפים כשהכספת פתוחה' : 'עוד לא. נוסף כשבעליו מוסיפים אותו, כשהכספת פתוחה'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {canAddMine && (
              <button type="button" onClick={() => run(() => vaultWithPasskey('add'))} disabled={busy} className={cn(textButton, 'self-start')}>
                הוספת המפתח שלי לכספת
              </button>
            )}
          </section>

          <section aria-labelledby="password-title" className="space-y-2">
            <h2 id="password-title" className="px-1 text-[0.8125rem] font-semibold text-muted-foreground">פתיחה עם הסיסמה</h2>
            <div className="overflow-hidden rounded-2xl surface">
              <div className={ROW}>
                <RowIcon icon={Lock} muted={!password.opensVault} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium">הסיסמה שלי פותחת את הכספת</span>
                  <span className="block text-[0.8125rem] text-muted-foreground text-pretty">
                    {!password.has
                      ? 'עוד אין לך סיסמה. מגדירים אותה בהגדרות ← אנשים.'
                      : password.opensVault
                        ? 'פועל: אפשר לפתוח את הכספת עם הסיסמה שבה נכנסים.'
                        : password.optedOut
                          ? 'כבוי. להפעלה צריך שהכספת תהיה פתוחה ולהקליד את הסיסמה.'
                          : 'תופעל מעצמה בפעם הבאה שנכנסים עם הסיסמה והכספת פתוחה. אפשר להפעיל עכשיו: הכספת צריכה להיות פתוחה, ומקלידים את הסיסמה.'}
                  </span>
                </span>
                {password.opensVault ? (
                  <button type="button" disabled={busy} onClick={() => run(() => post('/api/vault/password', undefined, 'DELETE'))} className={cn(TEXT, QUIET_DANGER)}>כיבוי</button>
                ) : (
                  <button type="button" disabled={busy || !open || !password.has} onClick={() => setEnablingPassword(true)} className={cn(TEXT, 'text-primary hover:bg-primary/10')}>הפעלה</button>
                )}
              </div>
            </div>
            <p className="px-1 text-[0.78125rem] leading-relaxed text-muted-foreground text-pretty">
              מי שיש לו את קובץ מסד הנתונים יכול לנסות לנחש את הסיסמה בלי הגבלה, אז חשובה סיסמה ארוכה. מפתח (Face ID) חזק ממנה.
            </p>
          </section>

          <section aria-labelledby="recovery-title" className="space-y-2">
            <h2 id="recovery-title" className="px-1 text-[0.8125rem] font-semibold text-muted-foreground">אם כל המפתחות אבדו</h2>
            <div className="overflow-hidden rounded-2xl surface">
              <div className={ROW}>
                <RowIcon icon={ShieldCheck} muted={!vault.hasRecoveryKey} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium">מפתח שחזור לכספת</span>
                  <span className="block text-[0.8125rem] text-muted-foreground text-pretty">פותח את הכספת בלי מפתח, כדי להוסיף מפתח חדש.</span>
                </span>
                <button type="button" disabled={!open} onClick={() => setRenewing(true)} className={cn(TEXT, 'text-primary hover:bg-primary/10')}>מפתח חדש</button>
              </div>
              <div className={ROW}>
                <RowIcon icon={RotateCcw} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium">התחלה מחדש</span>
                  <span className="block text-[0.8125rem] text-muted-foreground text-pretty">מוחק את הכספת ואת פרטי הכניסה שבה. החשבונות והתנועות נשארים.</span>
                </span>
                <button type="button" disabled={busy} onClick={() => setResetting(true)} className={cn(TEXT, QUIET_DANGER)}>מחיקה</button>
              </div>
            </div>
            <p className="px-1 text-[0.78125rem] leading-relaxed text-muted-foreground text-pretty">
              בלי מפתח ובלי מפתח השחזור אי אפשר לפתוח את הכספת, גם לא מהשרת. אז מתחילים מחדש ומקלידים את פרטי הכניסה שוב: התנועות לא נפגעות.
            </p>
          </section>
        </>
      )}

      <AppDialog open={!!shownKey} onOpenChange={o => !o && setShownKey(null)} title={shownKey?.title ?? ''}>
        {shownKey && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground text-pretty">שמרו אותו במנהל סיסמאות או על דף. הוא לא יוצג שוב, ובלעדיו, אם כל המפתחות יאבדו, אי אפשר לפתוח את הכספת.</p>
            <RecoveryCode code={shownKey.key} link />
          </div>
        )}
      </AppDialog>

      <AppDialog open={enablingPassword} onOpenChange={o => { setEnablingPassword(o); if (!o) setPasswordInput('') }} title="פתיחה עם הסיסמה">
        <form onSubmit={enablePassword} className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground text-pretty">הקלידו את הסיסמה שבה נכנסים לתזרים. היא לא נשמרת: רק עותק של מפתח הכספת, שהיא פותחת.</p>
          {error && <p className={errorText} role="alert">{error}</p>}
          <input type="password" dir="ltr" autoComplete="current-password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className={inputClass} aria-label="הסיסמה שלך" />
          <button type="submit" disabled={busy || !passwordInput} className={primaryButton}>הפעלה</button>
        </form>
      </AppDialog>

      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        onConfirm={() => run(async () => { await post('/api/vault/reset', {}); setResetting(false) })}
        busy={busy}
        title="למחוק את הכספת?"
        description={`${credentials.length ? `${credentials.length} פרטי כניסה יימחקו, ` : ''}וכל המפתחות יפסיקו לפתוח אותה. אחר כך יוצרים כספת חדשה ושומרים בה את פרטי הכניסה מחדש. החשבונות והתנועות לא נמחקים.`}
        confirmLabel="מחיקת הכספת"
        cancelLabel="ביטול"
      />
      <ConfirmDialog
        open={renewing}
        onOpenChange={setRenewing}
        onConfirm={() => run(async () => {
          const { recoveryKey } = await post<{ recoveryKey: string }>('/api/vault/recovery-key', {})
          setRenewing(false)
          setShownKey({ title: 'מפתח שחזור חדש לכספת', key: recoveryKey })
        })}
        busy={busy}
        destructive={false}
        title="ליצור מפתח שחזור חדש?"
        description="הקודם יפסיק לעבוד מיד."
        confirmLabel="יצירה"
        cancelLabel="ביטול"
      />
    </div>
  )
}

function Heading() {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">כספת</h1>
      <p className="max-w-[62ch] text-sm text-muted-foreground text-pretty">
        שומרת מוצפנים את פרטי הכניסה של החשבונות המסונכרנים, ורק מפתח (Face ID, Touch ID), סיסמה שהופעלה לכך או מפתח השחזור פותחים אותה. הכספת ננעלת לבד.
      </p>
    </div>
  )
}
