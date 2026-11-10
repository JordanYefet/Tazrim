'use client'

import { useState } from 'react'
import { Loader2, RefreshCw, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RecoveryCode } from '@/components/auth/recovery-code'
import { errorText } from '@/components/auth/ui'
import { vaultWithPasskey } from '@/components/vault/vault-client'
import { FIELD_LABELS, companyForAccount } from '@/lib/sync/providers'
import { timeAgo } from '@/lib/sync/format'
import { AccountMini } from './account-element'
import { inputClass } from './add-account-form'
import type { SyncReadiness } from './add-account-sheet'

/** Another account the same sign-in brings in */
export interface SharedAccount {
  id: string
  kind: 'BANK' | 'CREDIT_CARD'
  provider: string
  displayName: string
  cardLastFour: string | null
  color: string | null
  positionColor?: string
}

/** Where an account's data comes from: a sign-in saved in the vault, or none (files) */
export interface AccountSource {
  credentialId: string
  company: string
  updatedAt: string
  lastSyncedAt: string | null
  /** The other accounts it covers */
  shares: SharedAccount[]
}

async function call(url: string, body?: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
  return { ok: res.ok, data }
}

/** Opens the vault with Face ID / Touch ID when a call finds it locked, and tries once more */
async function withVault(send: () => Promise<{ ok: boolean; data: { error?: string; code?: string } }>) {
  let res = await send()
  if (!res.ok && res.data.code === 'VAULT_LOCKED') {
    await vaultWithPasskey('unlock')
    res = await send()
  }
  if (!res.ok) throw new Error(res.data.error ?? 'משהו השתבש. נסו שוב')
}

const rowButton = 'flex min-h-12 w-full items-center px-3.5 py-2 text-start text-[15px] transition-colors hover:bg-muted disabled:opacity-50'

/**
 * "מקור הנתונים" in an account's window: synced (the sign-in sealed in the
 * vault, and the other accounts it brings) or files; change the sign-in,
 * remove it (back to files), or start syncing an account of files.
 */
export function DataSource({
  account,
  source,
  sync,
  onChanged,
}: {
  account: { id: string; kind: 'BANK' | 'CREDIT_CARD'; provider: string }
  source: AccountSource | null
  sync: SyncReadiness
  onChanged: () => void
}) {
  const company = companyForAccount(account.kind, account.provider)
  const [form, setForm] = useState<'change' | 'start' | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const others = source?.shares ?? []
  const isCard = account.kind === 'CREDIT_CARD'

  function openForm(which: 'change' | 'start') {
    setForm(which)
    setFields({})
    setError(null)
  }

  // Not a <form>: the block sits inside the account window's own form
  async function save() {
    if (!company) return
    if (form === 'start' && company.fields.some(f => !fields[f]?.trim())) {
      setError('יש למלא את כל פרטי הכניסה')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (form === 'change' && source) {
        // Empty fields keep their stored value
        await withVault(() => call(`/api/vault/logins/${source.credentialId}`, { label: company.label, accountId: account.id, fields }, 'PUT'))
      } else {
        const info = await fetch('/api/vault', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
        if (!info?.vault) throw new Error(info?.error ?? 'הכספת לא זמינה')
        if (!info.vault.exists) {
          const { recoveryKey: key } = await vaultWithPasskey('create')
          if (key) setRecoveryKey(key)
        } else if (!info.vault.open) await vaultWithPasskey('unlock')
        await withVault(() => call('/api/vault/logins', { company: company.id, label: company.label, accountId: account.id, fields }))
      }
      setForm(null)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function remove() {
    if (!source) return
    setBusy(true)
    setError(null)
    try {
      await withVault(() => call(`/api/vault/logins/${source.credentialId}`, undefined, 'DELETE'))
      setRemoving(false)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  const canStart = !source && !!company && sync.available

  return (
    <section aria-labelledby={`source-${account.id}`} className="space-y-2">
      <h3 id={`source-${account.id}`} className="px-1 text-[13px] font-semibold text-muted-foreground">מקור הנתונים</h3>
      <div className="overflow-hidden rounded-xl border divide-y">
        <div className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
              source ? 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]' : 'bg-muted text-muted-foreground'
            )}
            aria-hidden
          >
            {source ? <RefreshCw className="h-[18px] w-[18px]" /> : <Upload className="h-[18px] w-[18px]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{source ? 'סנכרון אוטומטי' : 'העלאת קבצים'}</span>
            <span className="block text-[13px] text-muted-foreground text-pretty">
              {source
                ? `נשמר בכספת · ${source.lastSyncedAt ? `סונכרן ${timeAgo(source.lastSyncedAt)}` : 'עוד לא סונכרן'}`
                : 'מורידים פירוט מהאתר ומעלים בהעלאת קבצים'}
            </span>
          </span>
        </div>

        {others.length > 0 && (
          <div className="space-y-2 px-3.5 py-2.5">
            <p className="text-[13px] text-muted-foreground">אותה כניסה מביאה גם את</p>
            <ul className="flex flex-wrap gap-2">
              {others.map(o => (
                <li key={o.id} className="inline-flex items-center gap-2 rounded-full bg-muted py-1 pe-3 ps-1.5 text-[13px]">
                  <AccountMini kind={o.kind} provider={o.provider} color={o.positionColor} colorChoice={o.color} className="w-7" />
                  {o.displayName}
                  {o.cardLastFour && <span dir="ltr" className="text-muted-foreground">•••• {o.cardLastFour}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {source && company && (
          <>
            <button type="button" className={cn(rowButton, 'font-medium text-primary')} onClick={() => openForm('change')} aria-expanded={form === 'change'}>
              שינוי שם משתמש או סיסמה
            </button>
            <button type="button" className={rowButton} onClick={() => setRemoving(true)}>
              <span>
                <span className="block font-medium text-destructive dark:text-red-400">הסרת פרטי הכניסה</span>
                <span className="block text-xs text-muted-foreground">
                  {others.length ? `מכל ${others.length + 1} החשבונות. ` : ''}עוברים להעלאת קבצים; התנועות נשארות
                </span>
              </span>
            </button>
          </>
        )}

        {canStart && (
          <button type="button" className={cn(rowButton, 'font-medium text-primary')} onClick={() => openForm('start')} aria-expanded={form === 'start'}>
            מעבר לסנכרון אוטומטי
          </button>
        )}
        {!source && company && !sync.available && sync.reason && (
          <p className="px-3.5 py-2.5 text-xs text-muted-foreground text-pretty">סנכרון אוטומטי: {sync.reason}</p>
        )}
      </div>

      {error && <p className={errorText} role="alert">{error}</p>}

      {form && company && (
        <div
          role="group"
          aria-label="פרטי הכניסה"
          className="space-y-3 rounded-xl border p-3.5"
          onKeyDown={e => {
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              e.preventDefault()
              void save()
            }
          }}
        >
          <p className="text-sm font-medium">{form === 'change' ? `פרטי הכניסה ל${company.label}` : `הכניסה לאתר של ${company.label}`}</p>
          {company.fields.map(f => (
            <label key={f} className="block space-y-1.5">
              <span className="text-sm">{FIELD_LABELS[f]}</span>
              <input
                type={f === 'password' ? 'password' : 'text'}
                dir="ltr"
                autoComplete={f === 'password' ? 'new-password' : 'off'}
                placeholder={form === 'change' ? 'ללא שינוי' : undefined}
                value={fields[f] ?? ''}
                onChange={e => setFields({ ...fields, [f]: e.target.value })}
                className={inputClass}
              />
            </label>
          ))}
          <p className="text-xs text-muted-foreground text-pretty">
            {form === 'change'
              ? `נשמרים מוצפנים בכספת, ${others.length ? `לכל ${others.length + 1} ${isCard ? 'הכרטיסים' : 'החשבונות'} שבכניסה. ` : ''}שדה ריק נשאר כמו שהוא.`
              : 'נשמרים מוצפנים בכספת. הסנכרון הבא מביא את התנועות.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              שמירה
            </button>
            <button type="button" onClick={() => setForm(null)} className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted">
              ביטול
            </button>
          </div>
        </div>
      )}

      {recoveryKey && (
        <div className="space-y-2 rounded-xl border p-3.5">
          <p className="text-sm text-muted-foreground text-pretty">הכספת נוצרה. שמרו את מפתח השחזור: הוא לא יוצג שוב.</p>
          <RecoveryCode code={recoveryKey} link />
        </div>
      )}

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        onConfirm={remove}
        busy={busy}
        title="להסיר את פרטי הכניסה?"
        description={`${others.length ? `הכניסה משמשת ${others.length + 1} ${isCard ? 'כרטיסים' : 'חשבונות'}, והיא תוסר מכולם. ` : ''}הם יימחקו מהכספת, והחשבון יעבור להעלאת קבצים. התנועות נשארות.`}
        confirmLabel="הסרה"
        cancelLabel="השארה"
      />
    </section>
  )
}
