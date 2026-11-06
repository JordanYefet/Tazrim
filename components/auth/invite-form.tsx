'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from './passkey-client'
import { card, errorText, primaryButton } from './ui'

/** /invite/<token> (ENG-89): a new person types their name; another device of a person only names the device */
export function InviteForm({ token, personName }: { token: string; personName: string | null }) {
  const [name, setName] = useState('')
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
      await createPasskey('/api/auth/register/options', { mode: 'invite', token, name }, label)
      window.location.assign('/')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={card}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{personName ? `מכשיר חדש עבור ${personName}` : 'הצטרפות לתזרים'}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          יוצרים מפתח כניסה (passkey) במכשיר הזה: Face ID, Touch ID או קוד המכשיר. הקישור עובד פעם אחת.
        </p>
      </div>
      {blocker && <p className={errorText}>{blocker}</p>}
      {error && <p className={errorText} role="alert">{error}</p>}
      {!personName && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">השם שלך</span>
          <input required maxLength={40} value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">שם המכשיר</span>
        <input maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="iPhone, Mac…" className={inputClass} />
      </label>
      <button type="submit" disabled={busy || !!blocker || (!personName && !name.trim())} className={primaryButton}>
        <KeyRound className="h-5 w-5" aria-hidden />
        יצירת מפתח
      </button>
    </form>
  )
}
