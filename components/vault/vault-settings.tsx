'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Laptop, RotateCcw, LockKeyhole, LockKeyholeOpen, Plus, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react'
import { AppDialog } from '@/components/ui/app-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RecoveryCode } from '@/components/auth/recovery-code'
import { SaveToPasswords, VAULT_KEY_NAME } from './save-to-passwords'
import { errorText, ghostButton, primaryButton, secondaryButton, textButton } from '@/components/auth/ui'
import { inputClass } from '@/components/accounts/add-account-form'
import { FIELD_LABELS, SYNC_COMPANIES, syncCompany } from '@/lib/sync/providers'
import { cn } from '@/lib/utils/cn'
import { post, vaultWithPasskey } from './vault-client'

interface Credential { id: string; company: string; label: string; accountId: string | null; updatedAt: string }
interface Passkey { id: string; label: string; personName: string; mine: boolean; thisDevice: boolean; opens: boolean }
interface VaultInfo {
  vault: { exists: boolean; open: boolean; openedBy: string | null; openedAt: string | null; locksAt: string | null; hasRecoveryKey: boolean }
  credentials: Credential[]
  passkeys: Passkey[]
}
export interface VaultAccount { id: string; name: string; kind: string }

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

interface Draft { id?: string; company: string; label: string; accountId: string; fields: Record<string, string> }

/**
 * Settings → the vault (ENG-90): whether it is open and until when, the
 * stored bank and card sign-ins (names only: a stored value is never shown
 * again), which passkeys can open it, and the recovery key.
 */
export function VaultSettings({ accounts }: { accounts: VaultAccount[] }) {
  const [info, setInfo] = useState<VaultInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shownKey, setShownKey] = useState<{ title: string; key: string } | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Credential | null>(null)
  const [renewing, setRenewing] = useState(false)
  const [resetting, setResetting] = useState(false)

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

  async function recover(e: React.FormEvent) {
    e.preventDefault()
    await run(async () => {
      await post('/api/vault/recover', { recoveryKey: recoveryInput })
      setRecovering(false)
      setRecoveryInput('')
    })
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    setDraftError(null)
    setBusy(true)
    try {
      const body = { label: draft.label, accountId: draft.accountId || null, fields: draft.fields }
      if (draft.id) await post(`/api/vault/logins/${draft.id}`, body, 'PUT')
      else await post('/api/vault/logins', { company: draft.company, ...body })
      setDraft(null)
      load()
    } catch (e) {
      setDraftError((e as Error).message)
    }
    setBusy(false)
  }

  if (!info) {
    return (
      <div className="space-y-6">
        <Heading />
        {error ? <p className={errorText} role="alert">{error}</p> : <div className="h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-label="טוען" />}
      </div>
    )
  }

  const { vault, credentials, passkeys } = info
  const open = vault.open
  const canAddMine = open && passkeys.some(p => p.mine && !p.opens)
  const company = draft ? syncCompany(draft.company) : null
  const accountName = (id: string | null) => accounts.find(a => a.id === id)?.name

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
            <span className="block text-[17px] font-bold">{!vault.exists ? 'עוד אין כספת' : open ? 'פתוחה' : 'נעולה'}</span>
            <span className="block text-[13px] text-muted-foreground text-pretty">
              {!vault.exists
                ? 'יוצרים אותה עם Face ID או Touch ID, ומקבלים מפתח שחזור לשמור.'
                : open
                  ? `נפתחה ב-${time(vault.openedAt)} (${vault.openedBy}). תינעל ב-${time(vault.locksAt)} אם לא ישתמשו בה, או כשהשרת מופעל מחדש.`
                  : 'כדי להוסיף, לשנות או למחוק פרטי כניסה, פותחים אותה.'}
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
            <button type="button" onClick={() => run(() => vaultWithPasskey('unlock'))} disabled={busy} className={cn(secondaryButton, 'w-full border-transparent bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto')}>
              <KeyRound className="h-4 w-4" aria-hidden />
              פתיחה
            </button>
            <button type="button" onClick={() => setRecovering(true)} className={textButton}>עם מפתח השחזור</button>
          </span>
        )}
      </section>

      {vault.exists && (
        <>
          <section aria-labelledby="logins-title" className="space-y-2">
            <div className="flex items-end justify-between gap-3 px-1">
              <h2 id="logins-title" className="text-[13px] font-semibold text-muted-foreground">פרטי כניסה שמורים</h2>
              <button
                type="button"
                disabled={!open}
                onClick={() => { setDraftError(null); setDraft({ company: SYNC_COMPANIES[0].id, label: '', accountId: '', fields: {} }) }}
                className={cn(TEXT, 'inline-flex items-center gap-1 text-primary hover:bg-primary/10')}
              >
                <Plus className="h-4 w-4" aria-hidden />
                הוספה
              </button>
            </div>
            <ul className="overflow-hidden rounded-2xl surface">
              {credentials.length === 0 && (
                <li className={ROW}>
                  <span className="flex-1 text-[15px] text-muted-foreground">עוד אין. מוסיפים כאן, או בעריכת חשבון.</span>
                </li>
              )}
              {credentials.map(c => (
                <li key={c.id} className={ROW}>
                  <RowIcon icon={ShieldCheck} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{c.label}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {syncCompany(c.company)?.label ?? c.company}
                      {accountName(c.accountId) ? `, לחשבון "${accountName(c.accountId)}"` : ''}. עודכן ב-{date(c.updatedAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={!open}
                    onClick={() => { setDraftError(null); setDraft({ id: c.id, company: c.company, label: c.label, accountId: c.accountId ?? '', fields: {} }) }}
                    className={cn(TEXT, 'text-primary hover:bg-primary/10')}
                  >
                    עריכה
                  </button>
                  <button type="button" disabled={!open} onClick={() => setDeleting(c)} className={cn(TEXT, QUIET_DANGER)}>מחיקה</button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="openers-title" className="space-y-2">
            <h2 id="openers-title" className="px-1 text-[13px] font-semibold text-muted-foreground">מי יכול לפתוח</h2>
            <ul className="overflow-hidden rounded-2xl surface">
              {passkeys.map(p => (
                <li key={p.id} className={ROW}>
                  <RowIcon icon={isComputer(p.label) ? Laptop : Smartphone} muted={!p.opens} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-medium">
                      <span className="truncate">{p.label} של {p.personName}</span>
                      {p.thisDevice && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">המכשיר הזה</span>}
                    </span>
                    <span className="block text-[13px] text-muted-foreground text-pretty">
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

          <section aria-labelledby="recovery-title" className="space-y-2">
            <h2 id="recovery-title" className="px-1 text-[13px] font-semibold text-muted-foreground">אם כל המפתחות אבדו</h2>
            <div className="overflow-hidden rounded-2xl surface">
              <div className={ROW}>
                <RowIcon icon={ShieldCheck} muted={!vault.hasRecoveryKey} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">מפתח שחזור לכספת</span>
                  <span className="block text-[13px] text-muted-foreground text-pretty">פותח את הכספת בלי מפתח, כדי להוסיף מפתח חדש.</span>
                </span>
                <button type="button" disabled={!open} onClick={() => setRenewing(true)} className={cn(TEXT, 'text-primary hover:bg-primary/10')}>מפתח חדש</button>
              </div>
              <div className={ROW}>
                <RowIcon icon={RotateCcw} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">התחלה מחדש</span>
                  <span className="block text-[13px] text-muted-foreground text-pretty">מוחק את הכספת ואת פרטי הכניסה שבה. החשבונות והתנועות נשארים.</span>
                </span>
                <button type="button" disabled={busy} onClick={() => setResetting(true)} className={cn(TEXT, QUIET_DANGER)}>מחיקה</button>
              </div>
            </div>
            <p className="px-1 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
              בלי מפתח ובלי מפתח השחזור אי אפשר לפתוח את הכספת, גם לא מהשרת. אז מתחילים מחדש ומקלידים את פרטי הכניסה שוב: התנועות לא נפגעות.
            </p>
          </section>
        </>
      )}

      <AppDialog open={!!shownKey} onOpenChange={o => !o && setShownKey(null)} title={shownKey?.title ?? ''}>
        {shownKey && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground text-pretty">שמרו אותו באפליקציית סיסמאות או על דף. הוא לא יוצג שוב, ובלעדיו, אם כל המפתחות יאבדו, אי אפשר לפתוח את הכספת.</p>
            <RecoveryCode code={shownKey.key} link />
            <SaveToPasswords secret={shownKey.key} />
          </div>
        )}
      </AppDialog>

      <AppDialog open={recovering} onOpenChange={setRecovering} title="פתיחה עם מפתח השחזור">
        <form onSubmit={recover} className="mt-4 space-y-3">
          {error && <p className={errorText} role="alert">{error}</p>}
          {/* With the name it was saved under, so Passwords can fill the key in */}
          <input type="text" name="username" autoComplete="username" value={VAULT_KEY_NAME} readOnly hidden />
          <input dir="ltr" name="password" autoComplete="current-password" autoCapitalize="characters" spellCheck={false} value={recoveryInput} onChange={e => setRecoveryInput(e.target.value)} className={cn(inputClass, 'font-mono')} aria-label="מפתח השחזור" />
          <button type="submit" disabled={busy || !recoveryInput.trim()} className={primaryButton}>פתיחה</button>
        </form>
      </AppDialog>

      <AppDialog open={!!draft} onOpenChange={o => !o && setDraft(null)} title={draft?.id ? 'עריכת פרטי כניסה' : 'פרטי כניסה חדשים'}>
        {draft && company && (
          <form onSubmit={saveDraft} className="mt-4 space-y-3">
            {draftError && <p className={errorText} role="alert">{draftError}</p>}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">בנק או חברת אשראי</span>
              <select
                value={draft.company}
                disabled={!!draft.id}
                onChange={e => setDraft({ ...draft, company: e.target.value, accountId: '', fields: {} })}
                className={inputClass}
              >
                {SYNC_COMPANIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">שם</span>
              <input value={draft.label} maxLength={60} placeholder={company.label} onChange={e => setDraft({ ...draft, label: e.target.value })} className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">לחשבון</span>
              <select value={draft.accountId} onChange={e => setDraft({ ...draft, accountId: e.target.value })} className={inputClass}>
                <option value="">בלי חשבון</option>
                {accounts.filter(a => a.kind === company.kind).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            {company.fields.map(f => (
              <label key={f} className="block space-y-1.5">
                <span className="text-sm font-medium">{FIELD_LABELS[f]}</span>
                <input
                  type={f === 'password' ? 'password' : 'text'}
                  dir="ltr"
                  autoComplete={f === 'password' ? 'new-password' : 'off'}
                  placeholder={draft.id ? 'ללא שינוי' : undefined}
                  value={draft.fields[f] ?? ''}
                  onChange={e => setDraft({ ...draft, fields: { ...draft.fields, [f]: e.target.value } })}
                  className={inputClass}
                />
              </label>
            ))}
            <p className="text-xs text-muted-foreground text-pretty">נשמרים מוצפנים בכספת. אחרי השמירה לא מוצגים שוב.</p>
            <div className="flex flex-col gap-2.5">
              <button type="submit" disabled={busy} className={primaryButton}>שמירה</button>
              <button type="button" onClick={() => setDraft(null)} className={ghostButton}>ביטול</button>
            </div>
          </form>
        )}
      </AppDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        onConfirm={() => run(async () => { await post(`/api/vault/logins/${deleting!.id}`, undefined, 'DELETE'); setDeleting(null) })}
        busy={busy}
        title={`למחוק את "${deleting?.label}"?`}
        description="הסנכרון של החשבון הזה יבקש את הסיסמה בכל פעם, עד שתשמרו אותה שוב."
        confirmLabel="מחיקה"
        cancelLabel="השארה"
      />
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
        פרטי הכניסה לבנקים ולחברות האשראי, לסנכרון. נשמרים מוצפנים, ורק מפתח (Face ID, Touch ID) של מישהו בבית פותח אותם. הכספת ננעלת לבד.
      </p>
    </div>
  )
}
