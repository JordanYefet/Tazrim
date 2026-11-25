'use client'

/**
 * Adding an approver (ENG-134, ENG-139): the sign-in passkey or the sign-in password, or a key or
 * password made just for approvals. Whichever, the updater first writes a one-time code to a file in
 * the Tazrim folder, which only someone at the computer can read, and the code is typed here.
 */
import { useEffect, useState } from 'react'
import { AppDialog } from '@/components/ui/app-dialog'
import { passkeyBlocker } from '@/components/auth/passkey-client'
import { PASSWORD_MIN } from '@/lib/auth/password-rules'
import { adoptPassword, adoptPasskey, call, registerPasskey, registerPassword } from './api'
import { Busy, Host, INPUT, PRIMARY, SECONDARY } from './ui'

export const MIN_PASSWORD = PASSWORD_MIN

/** What is being added; 'other' first asks which of the two new kinds */
export type RegisterMode = 'signin-passkey' | 'signin-password' | 'other'
type Kind = 'signin-passkey' | 'signin-password' | 'new-passkey' | 'new-password'

interface Begun {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any
  codeFile: string
}

const TITLES: Record<Kind, string> = {
  'signin-passkey': 'אישור עם מפתח הכניסה',
  'signin-password': 'אישור עם סיסמת הכניסה',
  'new-passkey': 'הוספת מפתח אישור',
  'new-password': 'הגדרת סיסמת אישור',
}

export function RegisterDialog({ mode, onClose, onDone }: { mode: RegisterMode | null; onClose: () => void; onDone: () => void }) {
  const [chosen, setChosen] = useState<'new-passkey' | 'new-password' | null>(null)
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

  const current = mode ?? shown
  const kind: Kind | null = current === 'other' ? chosen : current
  const isPassword = kind === 'signin-password' || kind === 'new-password'
  const isSignin = kind === 'signin-passkey' || kind === 'signin-password'
  const isNewPassword = kind === 'new-password'

  useEffect(() => setBlocker(passkeyBlocker()), [])
  useEffect(() => {
    if (!mode) return
    setChosen(null)
    setName('')
    setBegun(null)
    setCode('')
    setPassword('')
    setAgain('')
    setError(null)
  }, [mode])

  const userName = kind === 'new-password' ? 'סיסמת אישור' : kind === 'new-passkey' ? name.trim() : 'x'

  async function begin(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !kind || !userName) return
    setBusy(true)
    setError(null)
    try {
      const r = await call<Begun>('/approvers/register/begin', isSignin ? { source: kind } : { source: kind === 'new-password' ? 'password' : 'new-passkey', name: userName })
      setBegun({ options: r.options, codeFile: typeof r.codeFile === 'string' ? r.codeFile : 'tazrim-approval-code.txt' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const passwordProblem =
    isNewPassword && password.length > 0 && password.length < MIN_PASSWORD
      ? `עוד ${MIN_PASSWORD - password.length} תווים`
      : isNewPassword && again && again !== password
        ? 'שתי הסיסמאות צריכות להיות זהות'
        : null
  const canFinish = !!code.trim() && (!isPassword || (isNewPassword ? password.length >= MIN_PASSWORD && password === again : !!password))

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !begun || !canFinish) return
    setBusy(true)
    setError(null)
    try {
      if (kind === 'signin-password') await adoptPassword(code.trim(), password)
      else if (kind === 'signin-passkey') await adoptPasskey(begun.options, code.trim())
      else if (kind === 'new-password') await registerPassword(code.trim(), userName, password)
      else await registerPasskey(begun.options, code.trim(), userName)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const needsKey = kind === 'signin-passkey' || kind === 'new-passkey'
  const title = kind ? TITLES[kind] : 'מפתח או סיסמה אחרים'

  return (
    <AppDialog open={!!mode} onOpenChange={o => !o && !busy && onClose()} title={title} className="sm:max-w-md">
      <div className="mt-3 space-y-4 text-sm leading-relaxed">
        {!kind ? (
          <div className="space-y-3">
            <p className="text-pretty text-muted-foreground">מפתח או סיסמה שנועדו רק לאישורים האלה, בלי קשר לכניסה לתזרים.</p>
            <button type="button" className={`${SECONDARY} w-full`} onClick={() => setChosen('new-passkey')}>
              מפתח חדש לאישורים
            </button>
            <button type="button" className={`${SECONDARY} w-full`} onClick={() => setChosen('new-password')}>
              סיסמה חדשה לאישורים
            </button>
          </div>
        ) : !begun ? (
          <form onSubmit={begin} className="space-y-3">
            <p className="text-pretty text-muted-foreground">
              כדי שרק מי שיושב ליד המחשב יוכל להוסיף {isPassword ? 'סיסמה' : 'מפתח'}, תזרים ישמור קוד בקובץ בתיקייה של תזרים במחשב. את הקוד מקלידים כאן בשלב הבא.
              {isNewPassword && ' סיסמה חדשה מחליפה את הקודמת.'}
            </p>
            {kind === 'new-passkey' && (
              <div className="space-y-1.5">
                <label htmlFor="egress-key-name" className="font-medium">
                  שם למפתח
                </label>
                <input id="egress-key-name" className={INPUT} value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="למשל: האייפון של דנה" autoComplete="off" />
              </div>
            )}
            {needsKey && blocker && <p className="text-xs text-muted-foreground text-pretty">{blocker}</p>}
            <button type="submit" className={`${PRIMARY} w-full`} disabled={busy || !userName || (needsKey && !!blocker)}>
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
            {kind === 'signin-password' && (
              <div className="space-y-1.5">
                <label htmlFor="egress-signin-password" className="font-medium">
                  סיסמת הכניסה שלי
                </label>
                <input id="egress-signin-password" type="password" autoComplete="current-password" className={INPUT} value={password} onChange={e => setPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground text-pretty">אם תשנו את סיסמת הכניסה, סיסמת האישור נשארת הקודמת עד שתוסיפו אותה שוב.</p>
              </div>
            )}
            {isNewPassword && (
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
              </>
            )}
            {isPassword && <p className="text-xs text-muted-foreground text-pretty">מפתח בטוח יותר: את הסיסמה מקלידים בתוך האפליקציה עצמה, ולכן קוד זדוני בתוכה יכול לראות אותה.</p>}
            <button type="submit" className={`${PRIMARY} w-full`} disabled={busy || !canFinish}>
              <Busy busy={busy}>{kind === 'signin-passkey' ? 'אישור עם Face ID' : kind === 'signin-password' ? 'אישור עם הסיסמה' : kind === 'new-password' ? 'שמירת הסיסמה' : 'יצירת המפתח'}</Busy>
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
