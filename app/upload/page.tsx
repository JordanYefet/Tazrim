'use client'

import { useState } from 'react'
import { UploadZone } from '@/components/upload/upload-zone'
import { UploadHistoryTable } from '@/components/upload/upload-history-table'

export default function UploadPage() {
  const [refresh, setRefresh] = useState(0)

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">העלאת קבצים</h1>
        <p className="text-muted-foreground text-sm">העלה קובץ ייצוא מהבנק או כרטיס האשראי</p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <UploadZone onSuccess={() => setRefresh(r => r + 1)} />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">היסטוריית העלאות</h2>
        <UploadHistoryTable refresh={refresh} />
      </div>
    </div>
  )
}
