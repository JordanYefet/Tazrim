'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { AppDialog } from '@/components/ui/app-dialog'
import { errorText, primaryButton, secondaryButton, textButton } from '@/components/auth/ui'
import { inputClass } from '@/components/accounts/add-account-form'
import { cn } from '@/lib/utils/cn'
import { post, VaultPendingError, vaultWithPasskey } from './vault-client'

/**
 * Opening the vault from anywhere (ENG-135): Settings and the sync prompts all call this.
 * The passkey is tried first, at once; when it can't (cancelled, no key on this device) a
 * window offers the passkey again, then the person's password (only when they turned that on),
 * then the recovery key. Resolves once the vault is open; rejects when the window is closed.
 *
 * A passkey that has no copy yet (ENG-140) is registered by that first try and told so: its message
 * ("next time someone opens it, you are added") shows in the window as a note, not an error, and is
 * what the caller (the sync, the account window) gets when the window is closed.
 */
const EVENT = 'tazrim:vault-unlock'

interface Request { resolve: () => void; reject: (e: Error) => void; message: string | null; pending: boolean }

export async function unlockVault(): Promise<void> {
  let message: string
  let pending = false
  try {
    await vaultWithPasskey('unlock')
    return
  } catch (e) {
    message = (e as Error).message
    pending = e instanceof VaultPendingError
  }
  return new Promise<void>((resolve, reject) => {
    window.dispatchEvent(new CustomEvent<Request>(EVENT, { detail: { resolve, reject, message, pending } }))
  })
}

/** Mounted once (app/providers.tsx): shows the window for unlockVault() */
export function VaultUnlockHost() {
  const [req, setReq] = useState<Request | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The note from the server that this passkey will be added at the next opening */
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [recovery, setRecovery] = useState('')
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<Request>).detail
      setReq(detail)
      setError(detail.pending ? null : detail.message)
      setNote(detail.pending ? detail.message : null)
      setPassword('')
      setRecovery('')
      setRecoveryOpen(false)
      setHasPassword(false)
      fetch('/api/vault', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setHasPassword(!!d?.password?.has && !d.password.optedOut))
        .catch(() => {})
    }
    window.addEventListener(EVENT, onRequest)
    return () => window.removeEventListener(EVENT, onRequest)
  }, [])

  function close(opened: boolean) {
    if (!req) return
    if (opened) req.resolve()
    else req.reject(new Error(note ?? 'הכספת לא נפתחה'))
    setReq(null)
  }

  async function attempt(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setBusy(false)
      close(true)
    } catch (e) {
      if (e instanceof VaultPendingError) {
        setNote(e.message)
      } else {
        setError((e as Error).message)
        setNote(null)
      }
      setBusy(false)
    }
  }

  return (
    <AppDialog open={!!req} onOpenChange={o => !o && close(false)} title="פתיחת הכספת">
      <div className="mt-4 space-y-4">
        {error && <p className={errorText} role="alert">{error}</p>}
        {note && <p className="rounded-xl bg-muted px-3 py-2 text-sm text-pretty" role="status">{note}</p>}

        <button type="button" disabled={busy} onClick={() => attempt(() => vaultWithPasskey('unlock'))} className={primaryButton}>
          <KeyRound className="h-4 w-4" aria-hidden />
          פתיחה עם Face ID או Touch ID
        </button>

        {hasPassword && (
          <form onSubmit={e => { e.preventDefault(); void attempt(() => post('/api/vault/password', { password })) }} className="space-y-2 border-t pt-4">
            <label htmlFor="vault-unlock-password" className="block text-[0.8125rem] font-semibold text-muted-foreground">או עם הסיסמה שלך</label>
            <input id="vault-unlock-password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
            <button type="submit" disabled={busy || !password} className={cn(secondaryButton, 'w-full')}>פתיחה עם הסיסמה</button>
          </form>
        )}

        <div className="space-y-2 border-t pt-4">
          {recoveryOpen ? (
            <form onSubmit={e => { e.preventDefault(); void attempt(() => post('/api/vault/recover', { recoveryKey: recovery })) }} className="space-y-2">
              <label htmlFor="vault-unlock-recovery" className="block text-[0.8125rem] font-semibold text-muted-foreground">מפתח השחזור</label>
              <input id="vault-unlock-recovery" dir="ltr" autoComplete="off" spellCheck={false} value={recovery} onChange={e => setRecovery(e.target.value)} className={cn(inputClass, 'font-mono')} />
              <button type="submit" disabled={busy || !recovery.trim()} className={cn(secondaryButton, 'w-full')}>פתיחה עם מפתח השחזור</button>
            </form>
          ) : (
            <button type="button" onClick={() => setRecoveryOpen(true)} className={cn(textButton, 'w-full')}>עם מפתח השחזור</button>
          )}
        </div>
      </div>
    </AppDialog>
  )
}
