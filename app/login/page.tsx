import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { isAuthRequired } from '@/lib/auth/config'
import { currentSession } from '@/lib/auth/http'
import { hasPeople } from '@/lib/auth/household'
import { LoginForm } from '@/components/auth/login-form'
import { AuthShell } from '@/components/auth/auth-shell'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (!isAuthRequired()) redirect('/')
  if (!(await hasPeople())) redirect('/setup')
  if (await currentSession()) redirect('/')
  return (
    <AuthShell story>
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  )
}
