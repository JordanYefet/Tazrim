'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from '../passkey-client'
import { card, errorText, primaryButton, textButton } from '../ui'

/**
 * The optional extra after a password (ENG-119): a passkey on this device, for
 * the person just signed in, or skip. `onDone(added)` moves on either way. Where
 * passkeys can't work (plain http from a phone) it says why and only moves on;
 * flows usually skip it there (see passkeyBlocker).
 */
export function PasskeyStep({ onDone }: { onDone: (added: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  useEffect(() => setBlocker(passkeyBlocker()), [])

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await createPasskey('/api/people/devices', {}, guessDeviceLabel() || 'מכשיר')
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className={`${card} auth-swap`}>
      <div className="space-y-3 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary/10 text-primary" aria-hidden>
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-semibold">גם Face ID / Touch ID?</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          לא חובה. במכשיר הזה תיכנסו בלי להקליד סיסמה, עם Face ID, Touch ID או קוד המכשיר. הסיסמה ממשיכה לעבוד.
        </p>
      </div>
      {error && <p className={errorText} role="alert">{error}</p>}
      {blocker && <p className="rounded-xl bg-muted px-3 py-2 text-sm text-pretty">{blocker}</p>}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={add} disabled={busy || !!blocker} className={primaryButton}>
          <KeyRound className="h-5 w-5" aria-hidden />
          הוספת Face ID / Touch ID
        </button>
        <button type="button" onClick={() => onDone(false)} disabled={busy} className={textButton}>
          {blocker ? 'המשך' : 'דילוג, אולי אחר כך'}
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground text-pretty">אפשר להוסיף בכל זמן: הגדרות ← אנשים ומכשירים.</p>
    </div>
  )
}
