'use client'

import { useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { inputClass } from './add-account-form'
import type { ManagedAccount } from './accounts-manager'

const n = (v: number) => v.toLocaleString('he-IL')

/**
 * In-page delete confirmation. An account with transactions needs its display
 * name typed; an empty one gets a plain confirm.
 */
export function DeleteAccountDialog({
  account,
  onOpenChange,
  onDeleted,
}: {
  account: ManagedAccount | null
  onOpenChange: (open: boolean) => void
  onDeleted: (account: ManagedAccount) => void
}) {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // The last account shown, so the text stays put while the dialog animates out
  const last = useRef(account)
  if (account) last.current = account
  const shown = last.current

  const needsTyping = !!shown && shown.transactionCount > 0
  const matches = !!account && typed.trim() === account.displayName

  function change(open: boolean) {
    if (!open) {
      setTyped('')
      setError(null)
    }
    onOpenChange(open)
  }

  async function confirm() {
    if (!account || deleting || (needsTyping && !matches)) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(account.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needsTyping ? { confirm: typed } : {}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'המחיקה נכשלה')
        return
      }
      setTyped('')
      onDeleted(account)
    } catch {
      setError('המחיקה נכשלה')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ConfirmDialog
      open={!!account}
      onOpenChange={change}
      onConfirm={confirm}
      title={shown ? <>למחוק את <bdi>{shown.displayName}</bdi>?</> : ''}
      description={
        needsTyping && shown ? (
          <>
            <p>
              יימחקו גם {n(shown.transactionCount)} תנועות ו-{n(shown.uploadCount)} רשומות העלאה של החשבון,
              יחד עם החיובים הקבועים והחריגים שסימנת בו. אי אפשר לבטל את הפעולה.
            </p>
            <p>אם רק רוצים להסתיר אותו, עדיף להעביר לארכיון. הנתונים נשמרים שם.</p>
          </>
        ) : (
          <p>אין בחשבון תנועות. אי אפשר לבטל את הפעולה.</p>
        )
      }
      confirmLabel="מחק לצמיתות"
      busy={deleting}
      busyLabel="מוחק…"
      confirmDisabled={needsTyping && !matches}
      error={error}
    >
      {needsTyping && shown && (
        <div className="space-y-1.5">
          <label htmlFor="delete-confirm" className="text-sm font-medium">
            כדי לאשר, הקלידו את שם החשבון: <bdi className="font-semibold">{shown.displayName}</bdi>
          </label>
          <input
            id="delete-confirm"
            className={inputClass}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
      )}
    </ConfirmDialog>
  )
}
