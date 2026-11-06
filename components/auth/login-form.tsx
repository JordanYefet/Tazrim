'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { passkeyBlocker, safeNext, signInWithPasskey } from './passkey-client'
import { card, errorText, primaryButton, secondaryButton } from './ui'

/** /login (ENG-89): "Sign in with passkey", and the recovery code as the way back */
export function LoginForm() {
  const next = safeNext(useSearchParams().get('next'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [code, setCode] = useState('')
  useEffect(() => setBlocker(passkeyBlocker()), [])

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      await signInWithPasskey()
      window.location.assign(next)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function recover(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/auth/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok) {
      setError(data?.error ?? 'משהו השתבש. נסו שוב')
      setBusy(false)
      return
    }
    // Straight to People, to add a passkey on this device and make a new recovery code
    window.location.assign('/settings?recovered=1#people')
  }

  return (
    <div className={card}>
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">תזרים</h1>
        <p className="text-sm text-muted-foreground">כניסה עם Face ID, Touch ID או קוד המכשיר</p>
      </div>
      {blocker && <p className={errorText}>{blocker}</p>}
      {error && <p className={errorText} role="alert">{error}</p>}
      {!recovering ? (
        <>
          <button type="button" onClick={signIn} disabled={busy || !!blocker} className={primaryButton}>
            <KeyRound className="h-5 w-5" aria-hidden />
            כניסה עם מפתח
          </button>
          <button type="button" onClick={() => { setRecovering(true); setError(null) }} className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
            אין גישה למפתח? כניסה עם קוד שחזור
          </button>
        </>
      ) : (
        <form onSubmit={recover} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">קוד שחזור</span>
            <input dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} className={`${inputClass} font-mono`} />
          </label>
          <p className="text-xs text-muted-foreground">הקוד עובד פעם אחת. אחרי הכניסה מוסיפים מפתח חדש ויוצרים קוד חדש.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !code.trim()} className={primaryButton}>כניסה</button>
            <button type="button" onClick={() => { setRecovering(false); setError(null) }} className={secondaryButton}>ביטול</button>
          </div>
        </form>
      )}
    </div>
  )
}
