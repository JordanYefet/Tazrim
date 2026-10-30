'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, ChevronDown, ChevronLeft, CheckCircle2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { providerLabel } from '@/components/upload/account-picker'
import { KIND_META, type AccountKindValue, type CreatableKindValue } from './account-kinds'
import { AddAccountForm, type CreatedAccount } from './add-account-form'
import { EditAccountDialog } from './edit-account-dialog'
import { DeleteAccountDialog } from './delete-account-dialog'
import { AccountMini } from './account-element'
import { networkLabel } from '@/lib/accounts/brands'

export interface ManagedAccount {
  id: string
  kind: AccountKindValue
  provider: string
  displayName: string
  cardLastFour: string | null
  cardNetwork: string | null
  /** Account.color (ENG-66) */
  color: string | null
  archived: boolean
  transactionCount: number
  uploadCount: number
  importSupported: boolean
  /** The account's own saved mapping, if any */
  importProfile: { id: string; name: string } | null
  /** The colour of its position (dots, charts), for the brand default's preview */
  positionColor?: string
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
  const [editing, setEditing] = useState<ManagedAccount | null>(null)

  const refresh = () => startTransition(() => router.refresh())

  const active = accounts.filter(a => !a.archived)
  const archived = accounts.filter(a => a.archived)
  const kindCount = (kind: AccountKindValue) => accounts.filter(a => a.kind === kind).length
  const groups = KIND_META.map(g => ({ ...g, accounts: active.filter(a => a.kind === g.kind) })).filter(g => g.accounts.length)

  function created(account: CreatedAccount) {
    setAdding(null)
    setNotice({ kind: 'created', account })
    // Drop ?new= so a refresh does not reopen the form
    router.replace('/settings#accounts', { scroll: false })
    refresh()
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold mb-1">ניהול חשבונות</h2>
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
              className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 font-medium text-primary shadow-e1 hover:bg-muted"
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
        <section className="rounded-xl surface p-4 md:p-6">
          <AddAccountForm key={adding} initialKind={adding} onCreated={created} onCancel={() => setAdding(null)} />
        </section>
      )}

      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">אין חשבונות פעילים</p>
      )}

      {groups.map(group => (
        <section key={group.kind} className="rounded-xl surface">
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
                onEdit={() => setEditing(a)}
                onDelete={() => setDeleting(a)}
              />
            ))}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <details className="group rounded-xl surface">
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
                  onEdit={() => setEditing(a)}
                  onDelete={() => setDeleting(a)}
                />
              ))}
            </ul>
          </div>
        </details>
      )}

      <EditAccountDialog
        account={
          editing && (editing.kind === 'BANK' || editing.kind === 'CREDIT_CARD')
            ? { ...editing, kind: editing.kind }
            : null
        }
        onOpenChange={open => { if (!open) setEditing(null) }}
        onSaved={() => {
          setEditing(null)
          refresh()
        }}
        onImported={refresh}
        manage={
          editing
            ? {
                archived: editing.archived,
                lastOfKind: kindCount(editing.kind) <= 1,
                onArchiveToggle: async () => {
                  const res = await fetch(`/api/accounts/${encodeURIComponent(editing.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ archived: !editing.archived }),
                  })
                  if (!res.ok) return
                  setEditing(null)
                  refresh()
                },
                // The delete confirmation takes over from the account's window
                onDelete: () => {
                  const account = editing
                  setEditing(null)
                  setDeleting(account)
                },
              }
            : undefined
        }
      />

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
  onEdit,
  onDelete,
}: {
  account: ManagedAccount
  lastOfKind: boolean
  onChanged: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = KIND_META.find(m => m.kind === account.kind)!.icon
  const isCard = account.kind === 'CREDIT_CARD'
  const editable = account.kind === 'BANK' || isCard
  const netLabel = networkLabel(account.cardNetwork)

  async function patch(data: { archived: boolean }) {
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
        return
      }
      onChanged()
    } catch {
      setError('השמירה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  // A bank account or card opens its window (edit, import, archive, delete); the row has no buttons
  if (editable) {
    return (
      <li className={cn(account.archived && 'opacity-80')}>
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/40 active:bg-muted/60 md:px-6"
        >
          <AccountMini
            kind={account.kind as 'BANK' | 'CREDIT_CARD'}
            provider={account.provider}
            network={account.cardNetwork}
            color={account.positionColor}
            colorChoice={account.color}
            className={cn('w-11', account.archived && 'grayscale')}
          />
          <AccountText account={account} netLabel={netLabel} />
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
        </button>
      </li>
    )
  }

  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-4 py-3 md:px-6', account.archived && 'opacity-80')}>
      {editable ? (
        <AccountMini
          kind={account.kind as 'BANK' | 'CREDIT_CARD'}
          provider={account.provider}
          network={account.cardNetwork}
          color={account.positionColor}
          colorChoice={account.color}
          className={cn('w-11', account.archived && 'grayscale')}
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}

      <AccountText account={account} netLabel={netLabel} />

      <div className="flex shrink-0 items-center gap-0.5 ms-auto" aria-busy={busy}>
        {editable && (
          <button type="button" className={iconButton} aria-label={`עריכה: ${account.displayName}`} title="עריכה" disabled={busy} onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        )}
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

      {error && <p className="basis-full text-xs text-destructive" role="alert">{error}</p>}
    </li>
  )
}

/** An account row's name, provider, card details and counts */
function AccountText({ account, netLabel }: { account: ManagedAccount; netLabel: string | null }) {
  return (
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
              {netLabel && <> · <span dir="ltr">{netLabel}</span></>}
            </span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span className="whitespace-nowrap tabular-nums">
              {n(account.transactionCount)} תנועות · {n(account.uploadCount)} העלאות
            </span>
          </p>
        </div>
  )
}
