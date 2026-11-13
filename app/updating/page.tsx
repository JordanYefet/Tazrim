import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { UpdatingScreen } from '@/components/updates/updating-screen'
import { getUpdateView } from '@/lib/updates/state'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'עדכון · תזרים' }

/**
 * The full-screen progress of an update or a roll back (ENG-98), outside the app shell.
 * `?start` (optionally `?start=x.y.z`): a job was just started and may not show yet.
 * With no job and nothing just started there is nothing to follow: back to About.
 */
export default async function UpdatingPage({ searchParams }: { searchParams: Promise<{ start?: string | string[] }> }) {
  const { start } = await searchParams
  const view = await getUpdateView()
  const started = typeof start === 'string' ? start : undefined
  if (!view.job && started === undefined) redirect('/about')
  return <UpdatingScreen initial={view} start={started} />
}
