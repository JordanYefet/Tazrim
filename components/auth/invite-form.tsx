'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from './passkey-client'
import { AccountStep, type AccountValues } from './steps/account-step'
import { PasskeyStep } from './steps/passkey-step'
import { card, errorText, primaryButton } from './ui'

/**
 * /invite/<token> (ENG-89, ENG-119): a new person picks a name and a password,
 * then may add a passkey on this device; a link for another device of someone
 * already in the household makes a passkey on it.
 */
export function InviteForm({ token, personName }: { token: string; personName: string | null }) {
  return personName ? <DeviceInvite token={token} personName={personName} /> : <JoinInvite token={token} />
}

function JoinInvite({ token }: { token: string }) {
  const [stage, setStage] = useState<'account' | 'passkey'>('account')

  async function join(v: AccountValues) {
    const res = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: v.name, password: v.password }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok) throw new Error(data?.error ?? 'משהו השתבש. נסו שוב')
    // Signed in now. No passkeys here (plain http from a phone): straight in
    if (passkeyBlocker()) window.location.assign('/')
    else setStage('passkey')
  }

  if (stage === 'passkey') return <PasskeyStep onDone={() => window.location.assign('/')} />
  return (
    <AccountStep
      heading={<h1 className="text-center text-xl font-semibold">הצטרפות לתזרים</h1>}
      intro="בוחרים שם וסיסמה, ונכנסים איתם מכל מכשיר בבית. הקישור עובד פעם אחת."
      submitLabel="הצטרפות"
      onSubmit={join}
    />
  )
}

/** Another device for someone: a passkey on it, or, where passkeys can't work, their password */
function DeviceInvite({ token, personName }: { token: string; personName: string }) {
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  useEffect(() => {
    setBlocker(passkeyBlocker())
    setLabel(guessDeviceLabel())
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createPasskey('/api/auth/register/options', { mode: 'invite', token }, label)
      window.location.assign('/')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (blocker) {
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

  return (
    <form onSubmit={submit} className={card}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">מכשיר חדש עבור {personName}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          יוצרים מפתח כניסה (passkey) במכשיר הזה: Face ID, Touch ID או קוד המכשיר. הקישור עובד פעם אחת.
        </p>
      </div>
      {error && <p className={errorText} role="alert">{error}</p>}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">שם המכשיר</span>
        <input maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="iPhone, Mac…" className={inputClass} />
      </label>
      <button type="submit" disabled={busy} className={primaryButton}>
        <KeyRound className="h-5 w-5" aria-hidden />
        יצירת מפתח
      </button>
    </form>
  )
}
