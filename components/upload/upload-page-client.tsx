'use client'

import { useState } from 'react'
import { UploadFlow } from './upload-flow'
import { UploadHistoryTable } from './upload-history-table'
import type { UploadAccount } from './account-picker'

export function UploadPageClient({ accounts }: { accounts: UploadAccount[] }) {
  const [refresh, setRefresh] = useState(0)

  return (
    <div className="max-w-5xl mx-auto space-y-8 min-w-0">
      <div>
        <h1 className="text-2xl font-bold mb-1">העלאת קבצים</h1>
        <p className="text-muted-foreground text-sm">בחר חשבון, העלה קובץ ייצוא ובדוק אותו לפני הייבוא</p>
      </div>

      <UploadFlow accounts={accounts} onImported={() => setRefresh(r => r + 1)} />

      <div className="rounded-lg border bg-card p-4 md:p-6">
        <h2 className="font-semibold mb-4">היסטוריית העלאות</h2>
        <UploadHistoryTable refresh={refresh} />
      </div>
    </div>
  )
}
