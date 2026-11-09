import { redirect } from 'next/navigation'
import { isAuthRequired } from '@/lib/auth/config'
import { hasPeople, setupCode, setupCodeSource } from '@/lib/auth/household'
import { SetupForm } from '@/components/auth/setup-form'
import { AuthShell } from '@/components/auth/auth-shell'

export const dynamic = 'force-dynamic'

/** First run (ENG-89): open only while nobody has signed up */
export default async function SetupPage() {
  if (!isAuthRequired()) redirect('/')
  if (await hasPeople()) redirect('/login')
  setupCode() // printed to the server log the first time, unless .env sets it
  return (
    <AuthShell>
      <SetupForm codeFrom={setupCodeSource()} />
    </AuthShell>
  )
}
