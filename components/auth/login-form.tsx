'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { passkeyBlocker, safeNext, signInWithPasskey } from './passkey-client'
import { card, errorText, primaryButton, secondaryButton } from './ui'

type Mode = 'passkey' | 'password' | 'recovery'

const link = 'w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline'

/**
 * /login (ENG-89): "Sign in with passkey"; a password for a device without
 * one (set in Settings → People); the recovery code as the way back.
 */
export function LoginForm() {
  const next = safeNext(useSearchParams().get('next'))
  const [mode, setMode] = useState<Mode>('passkey')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noPasskeyHere, setNoPasskeyHere] = useState(false)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  useEffect(() => setBlocker(passkeyBlocker()), [])

  function show(m: Mode) {
    setMode(m)
    setError(null)
    setNoPasskeyHere(false)
  }

  async function signIn() {
    setBusy(true)
    setError(null)
    setNoPasskeyHere(false)
    try {
      await signInWithPasskey()
      window.location.assign(next)
    } catch (e) {
      setError((e as Error).message)
      // Usually: no passkey for this site on this device (made on the phone, not synced here)
      setNoPasskeyHere(true)
      setBusy(false)
    }
  }

  async function post(url: string, body: unknown, then: string) {
    setBusy(true)
    setError(null)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok) {
      setError(data?.error ?? 'משהו השתבש. נסו שוב')
      setBusy(false)
      return
    }
    window.location.assign(then)
  }

  return (
    <div className={card}>
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">תזרים</h1>
        <p className="text-sm text-muted-foreground">כניסה עם Face ID, Touch ID או קוד המכשיר</p>
      </div>
      {blocker && mode === 'passkey' && <p className={errorText}>{blocker}</p>}
      {error && <p className={errorText} role="alert">{error}</p>}

      {mode === 'passkey' && (
        <>
          {noPasskeyHere && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-pretty">
              אין מפתח במכשיר הזה? היכנסו עם סיסמה, או הוסיפו את המכשיר מהטלפון: הגדרות ← אנשים ומכשירים ← מכשיר נוסף.
            </p>
          )}
          <button type="button" onClick={signIn} disabled={busy || !!blocker} className={primaryButton}>
            <KeyRound className="h-5 w-5" aria-hidden />
            כניסה עם מפתח
          </button>
          <div className="space-y-2">
            <button type="button" onClick={() => show('password')} className={link}>
              כניסה עם סיסמה
            </button>
            <button type="button" onClick={() => show('recovery')} className={link}>
              אין גישה למפתח? כניסה עם קוד שחזור
            </button>
          </div>
        </>
      )}

      {mode === 'password' && (
        <form onSubmit={e => { e.preventDefault(); post('/api/auth/password', { name, password }, next) }} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">שם</span>
            <input autoComplete="username" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">סיסמה</span>
            <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
          </label>
          <p className="text-xs text-muted-foreground">סיסמה מגדירים בהגדרות ← אנשים ומכשירים, אחרי כניסה עם מפתח.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !name.trim() || !password} className={primaryButton}>כניסה</button>
            <button type="button" onClick={() => show('passkey')} className={secondaryButton}>חזרה</button>
          </div>
        </form>
      )}

      {mode === 'recovery' && (
        // Straight to People, to add a passkey on this device and make a new recovery code
        <form onSubmit={e => { e.preventDefault(); post('/api/auth/recover', { code }, '/settings?recovered=1#people') }} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">קוד שחזור</span>
            <input dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} className={`${inputClass} font-mono`} />
          </label>
          <p className="text-xs text-muted-foreground">הקוד עובד פעם אחת. אחרי הכניסה מוסיפים מפתח חדש ויוצרים קוד חדש.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !code.trim()} className={primaryButton}>כניסה</button>
            <button type="button" onClick={() => show('passkey')} className={secondaryButton}>ביטול</button>
          </div>
        </form>
      )}
    </div>
  )
}
