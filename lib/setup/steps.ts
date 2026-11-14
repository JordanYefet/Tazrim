/**
 * The guided first run (ENG-125): one step per screen, the current one in the
 * URL (`/setup?step=basics`), so a reload stays put and leaving mid-way breaks
 * nothing. The household exists once the account step is done; after that the
 * account step is never shown again.
 */

export const SETUP_STEPS = ['account', 'recovery', 'passkey', 'basics', 'phones', 'https', 'done'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

/** The count the counter shows: the recovery code closes step 1, so six steps in all */
export const SETUP_STEP_COUNT = 6
const NUMBER: Record<SetupStep, number> = { account: 1, recovery: 1, passkey: 2, basics: 3, phones: 4, https: 5, done: 6 }
export const stepNumber = (s: SetupStep) => NUMBER[s]

/** The steps that can be skipped (each has "דילוג") */
export const OPTIONAL_STEPS: readonly SetupStep[] = ['passkey', 'basics', 'phones', 'https']

/** A cookie on /setup with the last step reached, so a plain later visit to /setup resumes there */
export const SETUP_STEP_COOKIE = 'tazrim-setup-step'

export function isSetupStep(v: unknown): v is SetupStep {
  return typeof v === 'string' && (SETUP_STEPS as readonly string[]).includes(v)
}

/** `passkeyBlocked`: passkeys can't work in this browser (plain http from a phone), so the step is passed over */
export function nextStep(s: SetupStep, passkeyBlocked = false): SetupStep | null {
  const i = SETUP_STEPS.indexOf(s)
  const n = SETUP_STEPS[i + 1] ?? null
  return n === 'passkey' && passkeyBlocked ? 'basics' : n
}

/** Where "חזרה" goes; null where there is no going back (the account is made, the recovery code is gone) */
export function previousStep(s: SetupStep, passkeyBlocked = false): SetupStep | null {
  if (s === 'account' || s === 'recovery' || s === 'passkey') return null
  const p = SETUP_STEPS[SETUP_STEPS.indexOf(s) - 1]
  if (p === 'passkey' && passkeyBlocked) return null
  return p
}

export const setupHref = (s: SetupStep) => (s === 'account' ? '/setup' : `/setup?step=${s}`)

export type SetupRoute = { step: SetupStep } | { redirect: string }

/**
 * What /setup shows. Nobody yet: the account step, whatever the URL says. Then
 * it needs a session: without one, sign in. With one, the step asked for, or
 * where this browser left off, or (all done, or never started here) the overview.
 */
export function resolveSetup({
  hasPeople,
  signedIn,
  requested,
  saved,
}: {
  hasPeople: boolean
  signedIn: boolean
  /** ?step= */
  requested: string | null | undefined
  /** The cookie */
  saved: string | null | undefined
}): SetupRoute {
  if (!hasPeople) return requested ? { redirect: '/setup' } : { step: 'account' }
  if (!signedIn) return { redirect: '/login' }
  if (isSetupStep(requested) && requested !== 'account') return { step: requested }
  if (isSetupStep(saved) && saved !== 'account' && saved !== 'done') return { redirect: setupHref(saved) }
  return { redirect: '/' }
}
