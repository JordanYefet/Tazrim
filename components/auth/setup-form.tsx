'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from './passkey-client'
import { RecoveryCode } from './recovery-code'
import { card, errorText, primaryButton } from './ui'

/**
 * First run (ENG-89): the setup code from the server log, a name and a device
 * name, then a passkey; then the recovery code, shown once.
 */
export function SetupForm() {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<string | null>(null)
  useEffect(() => {
    setBlocker(passkeyBlocker())
    setLabel(guessDeviceLabel())
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await createPasskey('/api/auth/register/options', { mode: 'setup', code, name }, label)
      setRecovery(res.recoveryCode ?? null)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  if (recovery) {
    return (
      <div className={card}>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">קוד השחזור שלכם</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            אם כל המכשירים עם המפתח יאבדו, זו הדרך היחידה להיכנס. שמרו אותו במקום בטוח (מנהל סיסמאות, דף מודפס). הוא לא יוצג שוב.
          </p>
        </div>
        <RecoveryCode code={recovery} />
        <button type="button" onClick={() => window.location.assign('/')} className={primaryButton}>שמרתי, אפשר להמשיך</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className={card}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">ברוכים הבאים לתזרים</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          יוצרים את המשתמש הראשון ומפתח כניסה (passkey) במכשיר הזה. בלי סיסמה: Face ID, Touch ID או קוד המכשיר.
        </p>
      </div>
      {blocker && <p className={errorText}>{blocker}</p>}
      {error && <p className={errorText} role="alert">{error}</p>}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">קוד הגדרה</span>
        <input dir="ltr" required autoComplete="off" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} className={`${inputClass} font-mono`} />
        <span className="block text-xs text-muted-foreground">
          מופיע ביומן של השרת. ב-Docker: <code dir="ltr">docker compose logs tazrim | grep setup</code>
        </span>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">השם שלך</span>
        <input required maxLength={40} value={name} onChange={e => setName(e.target.value)} className={inputClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">שם המכשיר</span>
        <input maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="iPhone, Mac…" className={inputClass} />
      </label>
      <button type="submit" disabled={busy || !!blocker || !code.trim() || !name.trim()} className={primaryButton}>
        <KeyRound className="h-5 w-5" aria-hidden />
        יצירת מפתח
      </button>
    </form>
  )
}
