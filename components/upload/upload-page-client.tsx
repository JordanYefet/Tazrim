'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadFlow } from './upload-flow'
import { UploadHistoryTable } from './upload-history-table'
import type { UploadAccount } from './account-picker'

export function UploadPageClient({ accounts }: { accounts: UploadAccount[] }) {
  const [refresh, setRefresh] = useState(0)
  const router = useRouter()

  function imported() {
    setRefresh(r => r + 1)
    // re-run the server page so the accounts' missing months update; client state is kept
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">העלאת קבצים</h1>
        <p className="text-muted-foreground text-sm">בחר חשבון, העלה קובץ ייצוא ובדוק אותו לפני הייבוא</p>
      </div>

      <UploadFlow accounts={accounts} onImported={imported} />

      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold">היסטוריית העלאות</h2>
        <UploadHistoryTable refresh={refresh} />
      </div>
    </div>
  )
}
