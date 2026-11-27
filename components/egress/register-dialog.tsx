'use client'

/**
 * Adding an approver (ENG-134, ENG-139): the person's sign-in passkey or sign-in password, never a
 * separate one. The updater first writes a one-time code to a file in the Tazrim folder, which only
 * someone at the computer can read, and the code is typed here.
 */
import { useEffect, useState } from 'react'
import { AppDialog } from '@/components/ui/app-dialog'
import { passkeyBlocker } from '@/components/auth/passkey-client'
import { adoptPassword, adoptPasskey, call } from './api'
import { Busy, Host, INPUT, PRIMARY, SECONDARY } from './ui'

export type RegisterMode = 'signin-passkey' | 'signin-password'

interface Begun {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any
  codeFile: string
}

const TITLES: Record<RegisterMode, string> = {
  'signin-passkey': 'אישור עם מפתח הכניסה',
  'signin-password': 'אישור עם סיסמת הכניסה',
}

export function RegisterDialog({ mode, onClose, onDone }: { mode: RegisterMode | null; onClose: () => void; onDone: () => void }) {
  const [begun, setBegun] = useState<Begun | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [shown, setShown] = useState(mode)
  if (mode && mode !== shown) setShown(mode)

  const kind = mode ?? shown ?? 'signin-passkey'
  const isPassword = kind === 'signin-password'

  useEffect(() => setBlocker(passkeyBlocker()), [])
  useEffect(() => {
    if (!mode) return
    setBegun(null)
    setCode('')
    setPassword('')
    setError(null)
  }, [mode])

  async function begin(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await call<Begun>('/approvers/register/begin', { source: kind })
      setBegun({ options: r.options, codeFile: typeof r.codeFile === 'string' ? r.codeFile : 'tazrim-approval-code.txt' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const canFinish = !!code.trim() && (!isPassword || !!password)

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !begun || !canFinish) return
    setBusy(true)
    setError(null)
    try {
      if (isPassword) await adoptPassword(code.trim(), password)
      else await adoptPasskey(begun.options, code.trim())
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog open={!!mode} onOpenChange={o => !o && !busy && onClose()} title={TITLES[kind]} className="sm:max-w-md">
      <div className="mt-3 space-y-4 text-sm leading-relaxed">
        {!begun ? (
          <form onSubmit={begin} className="space-y-3">
            <p className="text-pretty text-muted-foreground">
              כדי שרק מי שיושב ליד המחשב יוכל להוסיף {isPassword ? 'סיסמה' : 'מפתח'}, תזרים ישמור קוד בקובץ בתיקייה של תזרים במחשב. את הקוד מקלידים כאן בשלב הבא.
            </p>
            {!isPassword && blocker && <p className="text-xs text-muted-foreground text-pretty">{blocker}</p>}
            <button type="submit" className={`${PRIMARY} w-full`} disabled={busy || (!isPassword && !!blocker)}>
              <Busy busy={busy}>המשך: קבלת קוד</Busy>
            </button>
          </form>
        ) : (
          <form onSubmit={finish} className="space-y-3">
            <p className="text-pretty">
              פותחים במחשב את הקובץ <Host>{begun.codeFile}</Host> שבתיקייה של תזרים, ומקלידים כאן את הקוד שבו. הוא תקף 10 דקות.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="egress-code" className="font-medium">
                הקוד מהקובץ
              </label>
              <input id="egress-code" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={6} className={`${INPUT} tabular-nums tracking-widest`} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
            </div>
            {isPassword && (
              <div className="space-y-1.5">
                <label htmlFor="egress-signin-password" className="font-medium">
                  סיסמת הכניסה שלי
                </label>
                <input id="egress-signin-password" type="password" autoComplete="current-password" className={INPUT} value={password} onChange={e => setPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground text-pretty">אם תשנו את סיסמת הכניסה, סיסמת האישור נשארת הקודמת עד שתוסיפו אותה שוב.</p>
                <p className="text-xs text-muted-foreground text-pretty">מפתח בטוח יותר: את הסיסמה מקלידים בתוך האפליקציה עצמה, ולכן קוד זדוני בתוכה יכול לראות אותה.</p>
              </div>
            )}
            <button type="submit" className={`${PRIMARY} w-full`} disabled={busy || !canFinish}>
              <Busy busy={busy}>{isPassword ? 'אישור עם הסיסמה' : 'אישור עם Face ID'}</Busy>
            </button>
          </form>
        )}
        <p role="alert" className="min-h-5 text-destructive">
          {error}
        </p>
        <button type="button" className={`${SECONDARY} w-full`} disabled={busy} onClick={onClose}>
          ביטול
        </button>
      </div>
    </AppDialog>
  )
}
