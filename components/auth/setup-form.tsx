'use client'

import { BrandMark } from './auth-shell'
import { AccountStep, type AccountValues } from './steps/account-step'

/** Where someone on another device finds the setup code */
export interface SetupCodeInfo {
  /** TAZRIM_SETUP_CODE from .env, or the one the server printed to its log */
  from: 'env' | 'log'
  /** The address that opens Tazrim on the computer itself, which shows the code; null when it can't tell */
  localUrl: string | null
}

/** Where to find the code, in the words of someone looking at a phone: the usual way first, the fallbacks folded */
function CodeHelp({ info }: { info: SetupCodeInfo }) {
  const fallback =
    info.from === 'env' ? (
      <>זה הקוד שקבעתם ב-<code dir="ltr">TAZRIM_SETUP_CODE</code> בקובץ <code dir="ltr">.env</code>.</>
    ) : (
      <>
        הקוד כתוב גם ביומן של השרת: ב-Docker Desktop ← Containers ← tazrim ← Logs, או בפקודה{' '}
        <code dir="ltr" className="whitespace-nowrap">docker compose logs tazrim | grep setup</code>.
      </>
    )
  return (
    <span className="block space-y-2">
      {info.localUrl ? (
        <span className="block">
          הקוד מופיע במחשב שתזרים מותקן עליו. פותחים בו בדפדפן את{' '}
          <span dir="ltr" className="whitespace-nowrap font-mono font-semibold text-foreground/80">{info.localUrl}</span>, והקוד כתוב בתחתית הכרטיס, מתחת לכפתור ״יצירה והמשך״.
        </span>
      ) : (
        <span className="block">{fallback}</span>
      )}
      {info.localUrl && (
        <details className="group">
          <summary className="cursor-pointer list-none font-medium text-foreground/70 underline decoration-dotted underline-offset-4">
            אין גישה לדפדפן במחשב?
          </summary>
          <span className="mt-1.5 block">{fallback}</span>
        </details>
      )}
      <span className="block">כך רק מי שהתקין יכול להתחיל.</span>
    </span>
  )
}

/** Holds the recovery code between the account step and the screen that shows it, in this tab only */
export const RECOVERY_STORAGE_KEY = 'tazrim.setup.recovery'

/**
 * The first run's first step (ENG-89, ENG-119, ENG-125): a name and a password.
 * On the computer itself (`thisComputer`, decided by the server) there is no
 * setup code to type; the page shows it in a quiet line, for finishing from a
 * phone instead. From another device the code comes first, with where to find
 * it. Signs this browser in; `onCreated` gets the recovery code to show next.
 */
export function SetupForm({
  thisComputer,
  code,
  codeInfo,
  counter,
  onCreated,
}: {
  thisComputer: boolean
  code: string | null
  codeInfo: SetupCodeInfo
  counter?: React.ReactNode
  onCreated: (recoveryCode: string | null) => void
}) {
  async function create(v: AccountValues) {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thisComputer ? { name: v.name, password: v.password } : v),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok) throw new Error(data?.error ?? 'משהו השתבש. נסו שוב')
    onCreated(data.recoveryCode ?? null)
  }

  return (
    <AccountStep
      heading={
        <>
          {counter}
          <BrandMark />
        </>
      }
      intro="ברוכים הבאים. יוצרים את האדם הראשון בבית: שם וסיסמה."
      codeHelp={thisComputer ? undefined : <CodeHelp info={codeInfo} />}
      submitLabel="יצירה והמשך"
      onSubmit={create}
      footer={
        thisComputer && code ? (
          <p className="text-center text-xs leading-relaxed text-muted-foreground text-pretty">
            רוצים לסיים מהטלפון? קוד ההגדרה לטלפון: <span dir="ltr" className="select-all whitespace-nowrap font-mono font-semibold text-foreground/80">{code}</span>
          </p>
        ) : undefined
      }
    />
  )
}
