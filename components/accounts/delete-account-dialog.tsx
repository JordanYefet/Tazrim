'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
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

  const needsTyping = !!account && account.transactionCount > 0
  const matches = !!account && typed.trim() === account.displayName

  function change(open: boolean) {
    if (!open) {
      setTyped('')
      setError(null)
    }
    onOpenChange(open)
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
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
    <Dialog.Root open={!!account} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          dir="rtl"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 text-card-foreground shadow-lg focus:outline-none"
        >
          {account && (
            <form onSubmit={confirm} className="space-y-4">
              <Dialog.Title className="text-lg font-semibold">למחוק את <bdi>{account.displayName}</bdi>?</Dialog.Title>
              <Dialog.Description asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {needsTyping ? (
                    <>
                      <p>
                        יימחקו גם {n(account.transactionCount)} תנועות ו-{n(account.uploadCount)} רשומות העלאה של החשבון,
                        יחד עם החיובים הקבועים והחריגים שסימנת בו. אי אפשר לבטל את הפעולה.
                      </p>
                      <p>אם רק רוצים להסתיר אותו, עדיף להעביר לארכיון. הנתונים נשמרים שם.</p>
                    </>
                  ) : (
                    <p>אין בחשבון תנועות. אי אפשר לבטל את הפעולה.</p>
                  )}
                </div>
              </Dialog.Description>

              {needsTyping && (
                <div className="space-y-1.5">
                  <label htmlFor="delete-confirm" className="text-sm font-medium">
                    כדי לאשר, הקלידו את שם החשבון: <bdi className="font-semibold">{account.displayName}</bdi>
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

              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center rounded-lg px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    ביטול
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={deleting || (needsTyping && !matches)}
                  className="inline-flex h-10 items-center rounded-lg bg-destructive px-4 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? 'מוחק…' : 'מחק לצמיתות'}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
