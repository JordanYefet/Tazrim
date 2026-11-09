'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { PASSWORD_MIN } from '@/lib/auth/password-rules'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from './passkey-client'
import { RecoveryCode } from './recovery-code'
import { BrandMark } from './auth-shell'
import { card, errorText, ghostButton, primaryButton, textButton } from './ui'

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary" aria-hidden>{n}</span>
      <span className="text-sm font-semibold">{children}</span>
    </div>
  )
}

/**
 * First run (ENG-89), in three steps: the setup code (TAZRIM_SETUP_CODE from
 * `.env`, or the one in the server log), a name, then a passkey on this device
 * or, instead, a password. Then the recovery code, shown once.
 */
export function SetupForm({ codeFrom }: { codeFrom: 'env' | 'log' }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [withPassword, setWithPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<string | null>(null)
  useEffect(() => setBlocker(passkeyBlocker()), [])

  async function withPasskey() {
    setBusy(true)
    setError(null)
    try {
      const res = await createPasskey('/api/auth/register/options', { mode: 'setup', code, name }, guessDeviceLabel() || 'מכשיר')
      setRecovery(res.recoveryCode ?? null)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function withPasswordSubmit() {
    if (password !== repeat) return setError('הסיסמאות לא זהות')
    setBusy(true)
    setError(null)
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, password }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok) setError(data?.error ?? 'משהו השתבש. נסו שוב')
    else setRecovery(data.recoveryCode ?? null)
    setBusy(false)
  }

  if (recovery) {
    return (
      <div className={card}>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">קוד השחזור שלכם</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            אם תאבדו את הגישה לכל המכשירים ולסיסמה, זו הדרך היחידה להיכנס. שמרו אותו במקום בטוח (מנהל סיסמאות, דף מודפס). הוא לא יוצג שוב.
          </p>
        </div>
        <RecoveryCode code={recovery} />
        <button type="button" onClick={() => window.location.assign('/')} className={primaryButton}>שמרתי, אפשר להמשיך</button>
      </div>
    )
  }

  const ready = !!code.trim() && !!name.trim()
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (withPassword) withPasswordSubmit(); else withPasskey() }}
      className={card}
    >
      <div className="space-y-3">
        <BrandMark />
        <p className="text-center text-sm text-muted-foreground text-pretty">ברוכים הבאים. יוצרים את האדם הראשון בבית, ואיך הוא נכנס.</p>
      </div>
      {error && <p className={errorText} role="alert">{error}</p>}

      <div className="space-y-3">
        <Step n={1}>קוד ההגדרה</Step>
        <label className="block space-y-1.5">
          <span className="sr-only">קוד ההגדרה</span>
          <input dir="ltr" required autoComplete="off" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} className={`${inputClass} text-center font-mono tracking-wider`} />
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          {codeFrom === 'env' ? (
            <>הקוד שקבעתם ב-<code dir="ltr">TAZRIM_SETUP_CODE</code> בקובץ <code dir="ltr">.env</code>. כך רק מי שהתקין יכול להתחיל.</>
          ) : (
            <>מופיע ביומן של השרת, כדי שרק מי שהתקין יוכל להתחיל: <code dir="ltr" className="whitespace-nowrap">docker compose logs tazrim | grep setup</code></>
          )}
        </p>
      </div>

      <div className="space-y-3">
        <Step n={2}>השם שלך</Step>
        <label className="block">
          <span className="sr-only">השם שלך</span>
          <input required maxLength={40} autoComplete="username" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </label>
      </div>

      <div className="space-y-3">
        <Step n={3}>{withPassword ? 'סיסמה' : 'מפתח במכשיר הזה'}</Step>
        {withPassword ? (
          <div key="password" className="auth-swap space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">סיסמה (לפחות {PASSWORD_MIN} תווים)</span>
              <input type="password" dir="ltr" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">שוב, לאימות</span>
              <input type="password" dir="ltr" autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} className={inputClass} />
            </label>
            <button type="submit" disabled={busy || !ready || !password || !repeat} className={primaryButton}>יצירה והתחלה</button>
            <button type="button" onClick={() => { setWithPassword(false); setError(null) }} className={ghostButton}>עם מפתח במקום</button>
          </div>
        ) : (
          <div key="passkey" className="auth-swap flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Face ID, Touch ID או קוד המכשיר. בלי סיסמה לזכור.</p>
            {blocker && <p className={errorText}>{blocker}</p>}
            <button type="submit" disabled={busy || !!blocker || !ready} className={primaryButton}>
              <KeyRound className="h-5 w-5" aria-hidden />
              יצירת מפתח והתחלה
            </button>
            <button type="button" onClick={() => { setWithPassword(true); setError(null) }} className={textButton}>
              עם סיסמה במקום
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
