'use client'

/**
 * Adding an approver (ENG-134): a passkey or an approval password. Either way the updater first
 * writes a one-time code to a file in the Tazrim folder, which only someone at the computer can
 * read, and the code is typed here.
 */
import { useEffect, useState } from 'react'
import { AppDialog } from '@/components/ui/app-dialog'
import { passkeyBlocker } from '@/components/auth/passkey-client'
import { call, registerPasskey, registerPassword } from './api'
import { Busy, Host, INPUT, PRIMARY, SECONDARY } from './ui'

export const MIN_PASSWORD = 12

interface Begun {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any
  codeFile: string
}

export function RegisterDialog({ mode, onClose, onDone }: { mode: 'passkey' | 'password' | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [begun, setBegun] = useState<Begun | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [shown, setShown] = useState(mode)
  if (mode && mode !== shown) setShown(mode)
  const isPassword = (mode ?? shown) === 'password'

  useEffect(() => setBlocker(passkeyBlocker()), [])
  useEffect(() => {
    if (!mode) return
    setName('')
    setBegun(null)
    setCode('')
    setPassword('')
    setAgain('')
    setError(null)
  }, [mode])

  const userName = isPassword ? 'סיסמת אישור' : name.trim()

  async function begin(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !userName) return
    setBusy(true)
    setError(null)
    try {
      const r = await call<Begun>('/approvers/register/begin', { name: userName })
      setBegun({ options: r.options, codeFile: typeof r.codeFile === 'string' ? r.codeFile : 'tazrim-approval-code.txt' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const passwordProblem = isPassword && password.length > 0 && password.length < MIN_PASSWORD ? `עוד ${MIN_PASSWORD - password.length} תווים` : isPassword && again && again !== password ? 'שתי הסיסמאות צריכות להיות זהות' : null
  const canFinish = !!code.trim() && (!isPassword || (password.length >= MIN_PASSWORD && password === again))

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !begun || !canFinish) return
    setBusy(true)
    setError(null)
    try {
      if (isPassword) await registerPassword(code.trim(), userName, password)
      else await registerPasskey(begun.options, code.trim(), userName)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog open={!!mode} onOpenChange={o => !o && !busy && onClose()} title={isPassword ? 'הגדרת סיסמת אישור' : 'הוספת מפתח אישור'} className="sm:max-w-md">
      <div className="mt-3 space-y-4 text-sm leading-relaxed">
        {!begun ? (
          <form onSubmit={begin} className="space-y-3">
            <p className="text-pretty text-muted-foreground">
              כדי שרק מי שיושב ליד המחשב יוכל להוסיף {isPassword ? 'סיסמה' : 'מפתח'}, תזרים ישמור קוד בקובץ בתיקייה של תזרים במחשב. את הקוד מקלידים כאן בשלב הבא.
              {isPassword && ' סיסמה חדשה מחליפה את הקודמת.'}
            </p>
            {!isPassword && (
              <div className="space-y-1.5">
                <label htmlFor="egress-key-name" className="font-medium">
                  שם למפתח
                </label>
                <input id="egress-key-name" className={INPUT} value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="למשל: האייפון של דנה" autoComplete="off" />
              </div>
            )}
            {!isPassword && blocker && <p className="text-xs text-muted-foreground text-pretty">{blocker}</p>}
            <button type="submit" className={`${PRIMARY} w-full`} disabled={busy || !userName || (!isPassword && !!blocker)}>
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
              <>
                <div className="space-y-1.5">
                  <label htmlFor="egress-new-password" className="font-medium">
                    סיסמה חדשה
                  </label>
                  <input id="egress-new-password" type="password" autoComplete="new-password" className={INPUT} value={password} onChange={e => setPassword(e.target.value)} />
                  <p className="text-xs text-muted-foreground">לפחות {MIN_PASSWORD} תווים.</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="egress-new-password-again" className="font-medium">
                    הסיסמה שוב
                  </label>
                  <input id="egress-new-password-again" type="password" autoComplete="new-password" className={INPUT} value={again} onChange={e => setAgain(e.target.value)} />
                </div>
                <p className="min-h-5 text-xs text-destructive">{passwordProblem}</p>
                <p className="text-xs text-muted-foreground text-pretty">מפתח בטוח יותר: את הסיסמה מקלידים בתוך האפליקציה עצמה, ולכן קוד זדוני בתוכה יכול לראות אותה.</p>
              </>
            )}
            <button type="submit" className={`${PRIMARY} w-full`} disabled={busy || !canFinish}>
              <Busy busy={busy}>{isPassword ? 'שמירת הסיסמה' : 'יצירת המפתח'}</Busy>
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
