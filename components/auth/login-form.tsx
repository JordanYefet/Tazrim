'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CircleAlert, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { inputClass } from '@/components/accounts/add-account-form'
import { passkeyBlocker, safeNext, signInWithPasskey } from './passkey-client'
import { BrandMark } from './auth-shell'
import { card, errorText, ghostButton, primaryButton, textButton } from './ui'

type Mode = 'passkey' | 'password' | 'recovery'

/**
 * /login (ENG-89): "Sign in with passkey", and under it in the same card a
 * name and password, for a device without a passkey (set in Settings →
 * People); the recovery code as the way back.
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
    setMode('passkey')
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

  const passwordError = mode === 'password' ? error : null
  return (
    <div className={card}>
      <BrandMark />
      {blocker && <p className={errorText}>{blocker}</p>}

      {mode !== 'recovery' ? (
        <div key="main" className="auth-swap flex flex-col gap-5">
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">כניסה עם Face ID, Touch ID או קוד המכשיר</p>
            <button type="button" onClick={signIn} disabled={busy || !!blocker} className={primaryButton}>
              <KeyRound className="h-5 w-5" aria-hidden />
              כניסה עם מפתח
            </button>
            {mode === 'passkey' && error && <p className={errorText} role="alert">{error}</p>}
            {noPasskeyHere && (
              <p className="rounded-xl bg-muted px-3 py-2 text-sm text-pretty">
                אין מפתח במכשיר הזה? היכנסו עם סיסמה, או הוסיפו את המכשיר מהטלפון: הגדרות ← אנשים ומכשירים ← מכשיר נוסף.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            או
            <span className="h-px flex-1 bg-border" />
          </div>

          <form
            onSubmit={e => { e.preventDefault(); setMode('password'); post('/api/auth/password', { name, password }, next) }}
            className="space-y-3"
            aria-label="כניסה עם סיסמה"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">שם</span>
              <input
                autoComplete="username"
                value={name}
                onChange={e => setName(e.target.value)}
                aria-invalid={!!passwordError || undefined}
                className={cn(inputClass, passwordError && 'border-destructive')}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">סיסמה</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                aria-invalid={!!passwordError || undefined}
                aria-describedby={passwordError ? 'password-error' : undefined}
                className={cn(inputClass, passwordError && 'border-destructive')}
              />
            </label>
            {passwordError && (
              <p id="password-error" role="alert" className="flex items-center gap-1.5 text-[13px] text-destructive dark:text-red-400">
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
                {passwordError}
              </p>
            )}
            <button type="submit" disabled={busy || !name.trim() || !password} className={cn(ghostButton, 'mt-1')}>
              כניסה עם סיסמה
            </button>
          </form>

          <button type="button" onClick={() => show('recovery')} className={textButton}>
            אין גישה? כניסה עם קוד שחזור
          </button>

          {/* There is no open sign-up: people join the household by invite */}
          <div className="space-y-1 border-t pt-4 text-center">
            <p className="text-sm font-semibold">חדשים כאן?</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
              מצטרפים עם קישור הזמנה ממי שכבר בפנים: הגדרות ← אנשים ומכשירים ← הזמנת אדם.
            </p>
          </div>
        </div>
      ) : (
        // Straight to People, to add a passkey on this device and make a new recovery code
        <form
          key="recovery"
          onSubmit={e => { e.preventDefault(); post('/api/auth/recover', { code }, '/settings/people?recovered=1') }}
          className="auth-swap flex flex-col gap-5"
        >
          <div className="space-y-1">
            <h1 className="text-xl font-bold">קוד שחזור</h1>
            <p className="text-sm text-muted-foreground text-pretty">הקוד עובד פעם אחת. אחרי הכניסה מוסיפים מפתח חדש ויוצרים קוד חדש.</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">הקוד</span>
            <input
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={e => setCode(e.target.value)}
              aria-invalid={!!error || undefined}
              className={cn(inputClass, 'text-center font-mono tracking-wider', error && 'border-destructive')}
            />
          </label>
          {error && <p className={errorText} role="alert">{error}</p>}
          <div className="flex flex-col gap-2.5">
            <button type="submit" disabled={busy || !code.trim()} className={primaryButton}>כניסה</button>
            <button type="button" onClick={() => show('passkey')} className={ghostButton}>חזרה</button>
          </div>
        </form>
      )}
    </div>
  )
}
