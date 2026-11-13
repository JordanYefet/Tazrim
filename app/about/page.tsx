import type { Metadata } from 'next'
import { AboutContent } from '@/components/about/about-content'
import { isReadOnly } from '@/lib/read-only'
import { getUpdateView } from '@/lib/updates/state'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'אודות · תזרים',
  description: 'למה נבנה תזרים, איך הוא שומר על הפרטיות שלכם, הרישיון ואיך יוצרים קשר.',
}

/** Who made Tazrim and why, how it treats your data, the license and how to get in touch (ENG-59). */
export default async function AboutPage() {
  // The version card (ENG-98); not in the read-only demo, and a failing read leaves the plain version line
  const update = isReadOnly() ? null : await getUpdateView().catch(() => null)
  return <AboutContent update={update} />
}
