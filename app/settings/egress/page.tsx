import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { EgressSettings } from '@/components/egress/egress-settings'
import { isAuthRequired } from '@/lib/auth/config'
import { AdminOnly } from '@/components/settings/admin-only'
import { viewerIsAdmin } from '@/lib/auth/http'
import { mayUseEgress } from '@/lib/egress/access'
import { getEgressView } from '@/lib/egress/helper'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'בידוד רשת · תזרים' }

/** Settings → Network isolation (ENG-133/134). Not in the read-only demo. */
export default async function EgressPage() {
  if (isReadOnly()) redirect('/settings')
  const allowed = mayUseEgress(await headers())
  const admin = await viewerIsAdmin()
  const view = allowed ? await getEgressView().catch(() => null) : null
  return (
    <SettingsSection title="בידוד רשת" description="הקונטיינר של תזרים מדבר רק עם הבנקים וחברות האשראי, דרך פרוקסי שמסנן את השאר.">
      {view ? (
        <AdminOnly admin={admin}>
          <EgressSettings initial={view} />
        </AdminOnly>
      ) : (
        <p className="surface rounded-2xl p-5 text-sm text-muted-foreground text-pretty">
          {allowed
            ? 'לא הצלחנו לקרוא את מצב הבידוד. נסו לרענן את הדף.'
            : `${isAuthRequired() ? 'בידוד הרשת זמין רק למי שמחובר.' : 'בידוד הרשת זמין רק מהמחשב שהאפליקציה רצה עליו.'} אפשר לפתוח את האפליקציה משם, או להפעיל כניסה עם מפתח.`}
        </p>
      )}
    </SettingsSection>
  )
}
