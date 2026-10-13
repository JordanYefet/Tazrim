'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Check, ChevronDown, CheckCircle2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { providerLabel } from '@/components/upload/account-picker'
import { KIND_META, type AccountKindValue, type CreatableKindValue } from './account-kinds'
import { AddAccountForm, inputClass, type CreatedAccount } from './add-account-form'
import { DeleteAccountDialog } from './delete-account-dialog'

export interface ManagedAccount {
  id: string
  kind: AccountKindValue
  provider: string
  displayName: string
  cardLastFour: string | null
  archived: boolean
  transactionCount: number
  uploadCount: number
  importSupported: boolean
}

const iconButton =
  'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40'

const n = (v: number) => v.toLocaleString('he-IL')

type Notice = { kind: 'created'; account: CreatedAccount } | { kind: 'deleted'; name: string } | null

export function AccountsManager({
  accounts,
  initialNewKind,
}: {
  accounts: ManagedAccount[]
  initialNewKind: CreatableKindValue | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [adding, setAdding] = useState<CreatableKindValue | null>(initialNewKind)
  const [notice, setNotice] = useState<Notice>(null)
  const [deleting, setDeleting] = useState<ManagedAccount | null>(null)

  const refresh = () => startTransition(() => router.refresh())

  const active = accounts.filter(a => !a.archived)
  const archived = accounts.filter(a => a.archived)
  const kindCount = (kind: AccountKindValue) => accounts.filter(a => a.kind === kind).length
  const groups = KIND_META.map(g => ({ ...g, accounts: active.filter(a => a.kind === g.kind) })).filter(g => g.accounts.length)

  function created(account: CreatedAccount) {
    setAdding(null)
    setNotice({ kind: 'created', account })
    // Drop ?new= so a refresh does not reopen the form
    router.replace('/accounts', { scroll: false })
    refresh()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">ניהול חשבונות</h1>
          <p className="text-sm text-muted-foreground">חשבונות הבנק וכרטיסי האשראי שאליהם מעלים קבצים</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => { setAdding('CREDIT_CARD'); setNotice(null) }}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            חשבון חדש
          </button>
        )}
      </div>

      {notice && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[hsl(var(--income)/0.35)] bg-[hsl(var(--income)/0.08)] px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--income))]" aria-hidden />
          <span className="flex-1 min-w-0">
            {notice.kind === 'created' ? <>החשבון <b>{notice.account.displayName}</b> נוסף.</> : <>החשבון <b>{notice.name}</b> נמחק.</>}
          </span>
          {notice.kind === 'created' && (
            <Link
              href="/upload"
              className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 font-medium text-primary shadow-sm hover:bg-muted"
            >
              <Upload className="h-4 w-4" aria-hidden />
              להעלאת קובץ
            </Link>
          )}
          <button type="button" className={cn(iconButton, 'h-7 w-7')} aria-label="סגור הודעה" onClick={() => setNotice(null)}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {adding && (
        <section className="rounded-xl border bg-card p-4 md:p-6">
          <AddAccountForm key={adding} initialKind={adding} onCreated={created} onCancel={() => setAdding(null)} />
        </section>
      )}

      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">אין חשבונות פעילים</p>
      )}

      {groups.map(group => (
        <section key={group.kind} className="rounded-xl border bg-card">
          <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium md:px-6">
            <group.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            {group.label}
            <span className="text-muted-foreground tabular-nums">({group.accounts.length})</span>
          </h2>
          <ul className="divide-y">
            {group.accounts.map(a => (
              <AccountRow
                key={a.id}
                account={a}
                lastOfKind={kindCount(a.kind) <= 1}
                onChanged={refresh}
                onDelete={() => setDeleting(a)}
              />
            ))}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/50 md:px-6 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-muted-foreground" aria-hidden />
              בארכיון <span className="text-muted-foreground tabular-nums">({archived.length})</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t">
            <p className="px-4 pt-3 text-xs text-muted-foreground md:px-6">
              חשבונות בארכיון לא מופיעים בהעלאת קבצים. הנתונים שלהם נשמרים.
            </p>
            <ul className="divide-y">
              {archived.map(a => (
                <AccountRow
                  key={a.id}
                  account={a}
                  lastOfKind={kindCount(a.kind) <= 1}
                  onChanged={refresh}
                  onDelete={() => setDeleting(a)}
                />
              ))}
            </ul>
          </div>
        </details>
      )}

      <DeleteAccountDialog
        account={deleting}
        onOpenChange={open => { if (!open) setDeleting(null) }}
        onDeleted={a => {
          setDeleting(null)
          setNotice({ kind: 'deleted', name: a.displayName })
          refresh()
        }}
      />
    </div>
  )
}

function AccountRow({
  account,
  lastOfKind,
  onChanged,
  onDelete,
}: {
  account: ManagedAccount
  lastOfKind: boolean
  onChanged: () => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = KIND_META.find(m => m.kind === account.kind)!.icon

  async function patch(data: { displayName?: string; archived?: boolean }) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(account.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'השמירה נכשלה')
        return false
      }
      onChanged()
      return true
    } catch {
      setError('השמירה נכשלה')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault()
    if (editing === null) return
    const name = editing.trim()
    if (!name || name === account.displayName) { setEditing(null); setError(null); return }
    if (await patch({ displayName: name })) setEditing(null)
  }

  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-4 py-3 md:px-6', account.archived && 'opacity-80')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>

      {editing !== null ? (
        <form onSubmit={submitRename} className="flex min-w-0 flex-1 items-center gap-1">
          <input
            autoFocus
            aria-label="שם חדש לחשבון"
            className={cn(inputClass, 'h-9 min-w-0 flex-1')}
            value={editing}
            maxLength={60}
            onChange={e => setEditing(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setEditing(null); setError(null) } }}
          />
          <button type="submit" className={iconButton} aria-label="שמור שם" disabled={busy}>
            <Check className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label="בטל עריכה" onClick={() => { setEditing(null); setError(null) }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{account.displayName}</span>
            {!account.importSupported && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                ייבוא עדיין לא נתמך
              </span>
            )}
          </p>
          <p className="flex flex-col text-xs text-muted-foreground sm:flex-row sm:gap-x-1.5">
            <span className="truncate">
              {providerLabel(account.provider)}
              {account.cardLastFour && <> · <span dir="ltr">•••• {account.cardLastFour}</span></>}
            </span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span className="whitespace-nowrap tabular-nums">
              {n(account.transactionCount)} תנועות · {n(account.uploadCount)} העלאות
            </span>
          </p>
        </div>
      )}

      {editing === null && (
        <div className="flex shrink-0 items-center gap-0.5 ms-auto" aria-busy={busy}>
          <button type="button" className={iconButton} aria-label={`שנה שם: ${account.displayName}`} title="שנה שם" disabled={busy} onClick={() => setEditing(account.displayName)}>
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          {account.archived ? (
            <button
              type="button"
              className={cn(iconButton, 'w-auto gap-1 px-2 text-xs')}
              disabled={busy}
              onClick={() => patch({ archived: false })}
            >
              <ArchiveRestore className="h-4 w-4" aria-hidden />
              שחזר
            </button>
          ) : (
            <button type="button" className={iconButton} aria-label={`העבר לארכיון: ${account.displayName}`} title="העבר לארכיון" disabled={busy} onClick={() => patch({ archived: true })}>
              <Archive className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={cn(iconButton, 'hover:bg-destructive/10 hover:text-destructive')}
            aria-label={`מחק: ${account.displayName}`}
            title={lastOfKind ? 'אי אפשר למחוק את החשבון האחרון מסוגו' : 'מחק'}
            disabled={busy || lastOfKind}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {error && <p className="basis-full text-xs text-destructive" role="alert">{error}</p>}
    </li>
  )
}
