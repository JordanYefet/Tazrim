import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAuthRequired } from '@/lib/auth/config'
import { currentSession } from '@/lib/auth/http'
import { hasPeople, setupCode, setupCodeSource } from '@/lib/auth/household'
import { prisma } from '@/lib/db/client'
import { isThisComputer } from '@/lib/local-request'
import { getAppSettingsView } from '@/lib/settings/app-settings'
import { SETUP_STEP_COOKIE, resolveSetup } from '@/lib/setup/steps'
import { getAutoCheck } from '@/lib/updates/settings'
import { timeZoneLabel } from '@/components/settings/time-zone-setting'
import { SetupWizard, type SetupSummaryRow } from '@/components/auth/setup-wizard'
import { AuthShell } from '@/components/auth/auth-shell'

export const dynamic = 'force-dynamic'

/**
 * First run (ENG-89, ENG-119, ENG-125): a short sequence of steps, the current
 * one in `?step=` (lib/setup/steps.ts decides what shows). The first, a name
 * and a password, is open only while nobody has signed up; on the computer
 * itself (the "this computer" door) no setup code is asked and the page shows
 * it; from anywhere else it is asked, and never shown. The rest need the
 * session the first step opens. Off in the read-only demo and without sign-in.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  if (!isAuthRequired()) redirect('/')
  const requested = (await searchParams).step
  const people = await hasPeople()
  const session = people ? await currentSession() : null
  const route = resolveSetup({
    hasPeople: people,
    signedIn: !!session,
    requested: typeof requested === 'string' ? requested : null,
    saved: (await cookies()).get(SETUP_STEP_COOKIE)?.value,
  })
  if ('redirect' in route) redirect(route.redirect)
  const { step } = route

  const thisComputer = isThisComputer(await headers())
  const code = people ? null : setupCode() // printed to the server log the first time, unless .env sets it
  // The door is on (Docker, or TAZRIM_LOCAL_PORT): the computer's own address shows the code
  // (Docker passes TAZRIM_PORT, the host port; a bare run has only the door's own port)
  const doorPort = process.env.TAZRIM_LOCAL_PORT?.trim()
  const localUrl = doorPort ? `http://localhost:${process.env.TAZRIM_PORT?.trim() || doorPort}` : null
  const account = { thisComputer, code: thisComputer ? code : null, codeInfo: { from: setupCodeSource(), localUrl } }

  let basics = null
  let summary: SetupSummaryRow[] | null = null
  if (session) {
    const [view, autoCheck] = await Promise.all([getAppSettingsView(), getAutoCheck()])
    basics = { timeZone: view.timeZone, autoCheck }
    if (step === 'done') summary = await summaryRows(session.personId, view.timeZone.value, autoCheck)
  }

  return (
    <AuthShell>
      <SetupWizard step={step} account={account} basics={basics} summary={summary} />
    </AuthShell>
  )
}

/** What the last step lists: each setting as it is now, and where it lives in Settings */
async function summaryRows(personId: string, timeZone: string, autoCheck: boolean): Promise<SetupSummaryRow[]> {
  const passkeys = await prisma.passkey.count({ where: { personId } })
  // Container-level values, passed in by compose for display (docs/superpowers/specs/2026-11-14-easy-install-design.md)
  const lanIp = process.env.TAZRIM_LAN_IP?.trim()
  const https = (process.env.TAZRIM_PROFILES ?? '').split(',').map(s => s.trim()).includes('https')
  return [
    { label: 'Face ID / Touch ID', value: passkeys > 0 ? 'נוסף' : 'לא נוסף', where: 'הגדרות ← אנשים ומכשירים' },
    { label: 'אזור זמן', value: timeZoneLabel(timeZone).replace(/ \(.*\)$/, ''), where: 'הגדרות ← כללי' },
    { label: 'בדיקת עדכונים יומית', value: autoCheck ? 'פועלת' : 'כבויה', where: 'הגדרות ← עדכונים' },
    { label: 'טלפונים וטאבלטים', value: lanIp || 'לא הוגדר', where: 'הגדרות ← טלפונים ורשת' },
    { label: 'HTTPS ומפתחות בטלפון', value: https ? 'פועל' : 'כבוי', where: 'הגדרות ← טלפונים ורשת' },
  ]
}
