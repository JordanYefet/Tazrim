'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { PASSWORD_MIN } from '@/lib/auth/password-rules'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from './passkey-client'
import { card, errorText, ghostButton, primaryButton, textButton } from './ui'

/**
 * /invite/<token> (ENG-89): a new person types their name and makes a passkey,
 * or a password where passkeys can't work (plain http); another device of a
 * person only names the device.
 */
export function InviteForm({ token, personName }: { token: string; personName: string | null }) {
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [withPassword, setWithPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  useEffect(() => {
    const b = passkeyBlocker()
    setBlocker(b)
    // No passkeys here (plain http): a new person joins with a password
    if (b && !personName) setWithPassword(true)
    setLabel(guessDeviceLabel())
  }, [personName])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (withPassword) {
        if (password !== repeat) throw new Error('הסיסמאות לא זהות')
        const res = await fetch('/api/auth/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, name, password }),
        }).catch(() => null)
        const data = await res?.json().catch(() => ({}))
        if (!res?.ok) throw new Error(data?.error ?? 'משהו השתבש. נסו שוב')
      } else {
        await createPasskey('/api/auth/register/options', { mode: 'invite', token, name }, label)
      }
      window.location.assign('/')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  // Another device for someone, where passkeys can't work: they sign in with their password instead
  if (personName && blocker) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold">מכשיר חדש עבור {personName}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          כאן אי אפשר ליצור מפתח: מפתחות עובדים רק בחיבור מאובטח (https). אם יש לך סיסמה, פשוט נכנסים איתה.
        </p>
        <a href="/login" className={primaryButton}>כניסה עם סיסמה</a>
      </div>
    )
  }

  const ready = personName || name.trim()
  return (
    <form onSubmit={submit} className={card}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{personName ? `מכשיר חדש עבור ${personName}` : 'הצטרפות לתזרים'}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {withPassword
            ? 'בוחרים שם וסיסמה, ונכנסים איתם מכל מכשיר בבית. הקישור עובד פעם אחת.'
            : 'יוצרים מפתח כניסה (passkey) במכשיר הזה: Face ID, Touch ID או קוד המכשיר. הקישור עובד פעם אחת.'}
        </p>
      </div>
      {error && <p className={errorText} role="alert">{error}</p>}
      {!personName && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">השם שלך</span>
          <input required maxLength={40} autoComplete="username" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </label>
      )}
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
          <button type="submit" disabled={busy || !ready || !password || !repeat} className={primaryButton}>הצטרפות</button>
          {!blocker && (
            <button type="button" onClick={() => { setWithPassword(false); setError(null) }} className={ghostButton}>עם מפתח במקום</button>
          )}
        </div>
      ) : (
        <div key="passkey" className="auth-swap flex flex-col gap-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">שם המכשיר</span>
            <input maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="iPhone, Mac…" className={inputClass} />
          </label>
          <button type="submit" disabled={busy || !ready} className={primaryButton}>
            <KeyRound className="h-5 w-5" aria-hidden />
            יצירת מפתח
          </button>
          {!personName && (
            <button type="button" onClick={() => { setWithPassword(true); setError(null) }} className={textButton}>
              עם סיסמה במקום
            </button>
          )}
        </div>
      )}
    </form>
  )
}
