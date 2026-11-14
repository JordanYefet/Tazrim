import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAuthRequired } from '@/lib/auth/config'
import { hasPeople, setupCode, setupCodeSource } from '@/lib/auth/household'
import { isThisComputer } from '@/lib/local-request'
import { SetupForm } from '@/components/auth/setup-form'
import { AuthShell } from '@/components/auth/auth-shell'

export const dynamic = 'force-dynamic'

/**
 * First run (ENG-89): open only while nobody has signed up. On the computer
 * itself (ENG-119: through the "this computer" door) no setup code is asked and
 * the page shows it; from anywhere else it is asked, and never shown.
 */
export default async function SetupPage() {
  if (!isAuthRequired()) redirect('/')
  if (await hasPeople()) redirect('/login')
  const code = setupCode() // printed to the server log the first time, unless .env sets it
  const thisComputer = isThisComputer(await headers())
  // The door is on (Docker, or TAZRIM_LOCAL_PORT): the computer's own address shows the code
  const localUrl = process.env.TAZRIM_LOCAL_PORT?.trim() ? `http://localhost:${process.env.TAZRIM_PORT?.trim() || '3000'}` : null
  return (
    <AuthShell>
      <SetupForm thisComputer={thisComputer} code={thisComputer ? code : null} codeInfo={{ from: setupCodeSource(), localUrl }} />
    </AuthShell>
  )
}
