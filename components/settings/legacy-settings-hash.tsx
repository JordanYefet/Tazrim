'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** The old one-page Settings' anchors, now their own pages */
const SECTION_FOR_HASH: Record<string, string> = {
  appearance: 'appearance',
  projection: 'projection',
  accounts: 'accounts',
  'import-profiles': 'import-profiles',
  people: 'people',
  'danger-zone': 'danger',
}

/** /settings#accounts and the like (bookmarks, older links) open the section's page */
export function LegacySettingsHash() {
  const router = useRouter()
  useEffect(() => {
    const section = SECTION_FOR_HASH[window.location.hash.slice(1)]
    if (section) router.replace(`/settings/${section}${window.location.search}`)
  }, [router])
  return null
}
