'use client'

import { useState } from 'react'
import { passkeyBlocker } from './passkey-client'
import { RecoveryCode } from './recovery-code'
import { BrandMark } from './auth-shell'
import { AccountStep, type AccountValues } from './steps/account-step'
import { PasskeyStep } from './steps/passkey-step'
import { card, primaryButton } from './ui'

/** Where someone on another device finds the setup code */
export interface SetupCodeInfo {
  /** TAZRIM_SETUP_CODE from .env, or the one the server printed to its log */
  from: 'env' | 'log'
  /** The address that opens Tazrim on the computer itself, which shows the code; null when it can't tell */
  localUrl: string | null
}

/** Where to find the code, in the words of someone looking at a phone */
function CodeHelp({ info }: { info: SetupCodeInfo }) {
  const onComputer = info.localUrl ? (
    <>פתחו את תזרים על המחשב שהוא מותקן עליו (<span dir="ltr" className="whitespace-nowrap font-mono">{info.localUrl}</span>), והקוד מופיע שם. </>
  ) : null
  if (info.from === 'env') {
    return <>{onComputer}זה הקוד שקבעתם ב-<code dir="ltr">TAZRIM_SETUP_CODE</code> בקובץ <code dir="ltr">.env</code>. כך רק מי שהתקין יכול להתחיל.</>
  }
  return (
    <>
      {onComputer}
      הוא מופיע גם ביומן של השרת: ב-Docker Desktop ← Containers ← tazrim ← Logs, או{' '}
      <code dir="ltr" className="whitespace-nowrap">docker compose logs tazrim | grep setup</code>. כך רק מי שהתקין יכול להתחיל.
    </>
  )
}

/**
 * First run (ENG-89, ENG-119): a name and a password, then a passkey on this
 * device as an optional extra, then the recovery code, shown once. On the
 * computer itself (`thisComputer`, decided by the server) there is no setup
 * code to type; the page shows it in a quiet line, for finishing from a phone
 * instead. From another device the code comes first, with where to find it.
 */
export function SetupForm({ thisComputer, code, codeInfo }: { thisComputer: boolean; code: string | null; codeInfo: SetupCodeInfo }) {
  const [stage, setStage] = useState<'account' | 'passkey' | 'recovery'>('account')
  const [recovery, setRecovery] = useState<string | null>(null)

  async function create(v: AccountValues) {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thisComputer ? { name: v.name, password: v.password } : v),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok) throw new Error(data?.error ?? 'משהו השתבש. נסו שוב')
    setRecovery(data.recoveryCode ?? null)
    // No passkeys here (plain http from a phone): straight on
    if (!passkeyBlocker()) setStage('passkey')
    else if (data.recoveryCode) setStage('recovery')
    else window.location.assign('/')
  }

  if (stage === 'passkey') return <PasskeyStep onDone={() => (recovery ? setStage('recovery') : window.location.assign('/'))} />

  if (stage === 'recovery' && recovery) {
    return (
      <div className={`${card} auth-swap`}>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">קוד השחזור שלכם</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            אם תשכחו את הסיסמה ולא יהיה מכשיר עם מפתח, זו הדרך היחידה להיכנס. שמרו אותו במקום בטוח (מנהל סיסמאות, דף מודפס). הוא לא יוצג שוב.
          </p>
        </div>
        <RecoveryCode code={recovery} />
        <button type="button" onClick={() => window.location.assign('/')} className={primaryButton}>שמרתי, אפשר להמשיך</button>
      </div>
    )
  }

  return (
    <AccountStep
      heading={<BrandMark />}
      intro="ברוכים הבאים. יוצרים את האדם הראשון בבית: שם וסיסמה."
      codeHelp={thisComputer ? undefined : <CodeHelp info={codeInfo} />}
      submitLabel="יצירה והמשך"
      onSubmit={create}
      footer={
        thisComputer && code ? (
          <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
            רוצים לסיים מהטלפון? קוד ההגדרה: <span dir="ltr" className="select-all whitespace-nowrap font-mono font-semibold text-foreground/80">{code}</span>
          </p>
        ) : undefined
      }
    />
  )
}
