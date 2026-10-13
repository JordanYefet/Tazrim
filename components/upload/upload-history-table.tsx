'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

interface UploadRecord {
  id: string
  fileName: string
  uploadedAt: string
  recordCount: number
  account: { id: string; kind: string; provider: string; displayName: string }
}

const KIND_COLORS: Record<string, string> = {
  BANK: 'bg-primary/10 text-primary',
  CREDIT_CARD: 'bg-[hsl(var(--cc))]/10 text-[hsl(var(--cc))]',
}

export function UploadHistoryTable({ refresh }: { refresh: number }) {
  const [history, setHistory] = useState<UploadRecord[]>([])

  useEffect(() => {
    fetch('/api/upload/history')
      .then(r => r.json())
      .then(setHistory)
  }, [refresh])

  async function deleteRecord(id: string, fileName: string) {
    if (!window.confirm(`למחוק את הרשומה "${fileName}"?`)) return
    await fetch(`/api/upload/${id}`, { method: 'DELETE' })
    setHistory(prev => prev.filter(r => r.id !== id))
  }

  if (!history.length) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        לא הועלו קבצים עדיין
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['קובץ', 'מקור', 'תאריך', 'עסקאות', ''].map((h, i) => (
                <th key={i} className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map(row => (
              <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="py-2.5 px-4 max-w-[200px] truncate font-medium">{row.fileName}</td>
                <td className="py-2.5 px-4">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', KIND_COLORS[row.account.kind] ?? 'bg-muted text-muted-foreground')}>
                    {row.account.displayName}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-muted-foreground text-xs">{formatDate(row.uploadedAt)}</td>
                <td className="py-2.5 px-4 text-muted-foreground tabular-nums">{row.recordCount}</td>
                <td className="py-2.5 px-4 text-center">
                  <button
                    onClick={() => deleteRecord(row.id, row.fileName)}
                    aria-label="מחק רשומה"
                    className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
