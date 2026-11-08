import { isAuthRequired } from '@/lib/auth/config'
import { findInvite } from '@/lib/auth/household'
import { InviteForm } from '@/components/auth/invite-form'
import { card } from '@/components/auth/ui'
import { AuthShell } from '@/components/auth/auth-shell'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = isAuthRequired() ? await findInvite(token) : null
  if (!invite) {
    return (
      <AuthShell>
        <div className={card}>
          <h1 className="text-xl font-semibold">הקישור לא בתוקף</h1>
          <p className="text-sm text-muted-foreground text-pretty">הקישור פג תוקף (אחרי כרבע שעה) או שכבר נוצל. בקשו קישור חדש בהגדרות ← אנשים ומכשירים.</p>
        </div>
      </AuthShell>
    )
  }
  return (
    <AuthShell>
      <InviteForm token={token} personName={invite.person?.name ?? null} />
    </AuthShell>
  )
}
