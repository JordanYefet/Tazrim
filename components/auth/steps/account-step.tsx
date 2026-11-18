'use client'

import { useState } from 'react'
import { inputClass } from '@/components/accounts/add-account-form'
import { PASSWORD_MIN } from '@/lib/auth/password-rules'
import { card, errorText, primaryButton } from '../ui'

export interface AccountValues {
  code: string
  name: string
  password: string
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary" aria-hidden>{n}</span>
      <span className="text-sm font-semibold">{children}</span>
    </div>
  )
}

/**
 * A new person's way in (ENG-119): a name, then a password typed twice. Always
 * the first step, for the household's first person (/setup) and for anyone who
 * joins by invite; a passkey is offered after (PasskeyStep). `codeHelp` adds the
 * setup code before them, for first-run setup from another device. `onSubmit`
 * throws an Error whose message is shown.
 */
export function AccountStep({
  heading,
  intro,
  codeHelp,
  submitLabel,
  onSubmit,
  footer,
}: {
  heading: React.ReactNode
  intro: string
  codeHelp?: React.ReactNode
  submitLabel: string
  onSubmit: (values: AccountValues) => Promise<void>
  footer?: React.ReactNode
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const askCode = codeHelp !== undefined
  const n = askCode ? 1 : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < PASSWORD_MIN) return setError(`הסיסמה קצרה מדי: לפחות ${PASSWORD_MIN} תווים`)
    if (password !== repeat) return setError('הסיסמאות לא זהות')
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ code, name: name.trim(), password })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const ready = (!askCode || !!code.trim()) && !!name.trim() && !!password && !!repeat
  return (
    <form onSubmit={submit} className={card}>
      <div className="space-y-3">
        {heading}
        <p className="text-center text-sm text-muted-foreground text-pretty">{intro}</p>
      </div>
      {error && <p className={errorText} role="alert">{error}</p>}

      {askCode && (
        <div className="space-y-3">
          <StepTitle n={1}>קוד ההגדרה</StepTitle>
          <label className="block">
            <span className="sr-only">קוד ההגדרה</span>
            <input dir="ltr" required autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} className={`${inputClass} text-center font-mono tracking-wider`} />
          </label>
          <div className="text-xs leading-relaxed text-muted-foreground text-pretty">{codeHelp}</div>
        </div>
      )}

      <div className="space-y-3">
        <StepTitle n={n + 1}>השם שלך</StepTitle>
        <label className="block">
          <span className="sr-only">השם שלך</span>
          <input required maxLength={40} autoComplete="username" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </label>
        <p className="text-xs text-muted-foreground">נכנסים איתו, יחד עם הסיסמה.</p>
      </div>

      <div className="space-y-3">
        <StepTitle n={n + 2}>סיסמה</StepTitle>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">לפחות {PASSWORD_MIN} תווים</span>
          <input type="password" dir="ltr" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">שוב, לאימות</span>
          <input type="password" dir="ltr" required autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} className={inputClass} />
        </label>
      </div>

      <button type="submit" disabled={busy || !ready} className={primaryButton}>{submitLabel}</button>
      {footer}
    </form>
  )
}
