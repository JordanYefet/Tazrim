'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LoginField } from '@/lib/sync/providers'
import type { RunView } from '@/lib/sync/runs'
import type { LinkAction } from '@/lib/sync/store'

export interface CompanyInfo {
  id: string
  label: string
  kind: 'BANK' | 'CREDIT_CARD'
  fields: LoginField[]
  otp: boolean
  verified: boolean
  /** Display names of the household's accounts this company's sync fills */
  accounts: string[]
  lastSyncedAt: string | null
  defaultStart: string
  /** The earliest start its site allows, YYYY-MM-DD */
  earliest: string
  historyMonths: number
  /** Ranges past this many months are experimental (null: all are proven) */
  provenMonths: number | null
}

export interface SyncInfo {
  available: boolean
  companies: CompanyInfo[]
  run: RunView | null
}

const POLL_MS = 1000

const isActive = (run: RunView | null) =>
  !!run && (run.status.state === 'running' || run.status.state === 'needs-code' || run.status.state === 'needs-links')

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, data }
}

/**
 * The sync state the header button and the sheet share (ENG-91): what
 * /api/sync reports, and the run, polled while it is going. When a run
 * finishes with new rows the page refreshes, so they show at once.
 */
export function useSync() {
  const router = useRouter()
  const [info, setInfo] = useState<SyncInfo | null>(null)
  const [run, setRun] = useState<RunView | null>(null)
  const runRef = useRef<RunView | null>(null)
  runRef.current = run

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as SyncInfo
      setInfo(data)
      setRun(prev => (prev && data.run && prev.id === data.run.id ? data.run : (data.run ?? prev)))
    } catch {
      // Offline or the server restarting: the button keeps what it had
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = isActive(run)
  const runId = run?.id
  useEffect(() => {
    if (!active || !runId) return
    let stopped = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/sync/runs/${runId}`, { cache: 'no-store' })
        if (res.ok && !stopped) {
          const { run: next } = (await res.json()) as { run: RunView }
          setRun(next)
          if (!isActive(next)) {
            void load()
            if (next.status.state === 'done' && next.status.results.some(r => r.created > 0)) router.refresh()
          }
        }
      } catch {
        // Try again on the next tick
      }
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [active, runId, load, router])

  const start = useCallback(async (company: string, credentials: Record<string, string>, startDate: string) => {
    const { ok, data } = await post('/api/sync', { company, credentials, startDate })
    if (ok) setRun(data.run as RunView)
    return ok ? null : String(data.error ?? 'הסנכרון לא התחיל')
  }, [])

  const act = useCallback(async (body: { code: string } | { links: LinkAction[] } | { cancel: true }) => {
    const current = runRef.current
    if (!current) return 'אין סנכרון פעיל'
    const { ok, data } = await post(`/api/sync/runs/${current.id}`, body)
    if (ok) {
      // Show the next state at once instead of on the next tick
      const res = await fetch(`/api/sync/runs/${current.id}`, { cache: 'no-store' }).catch(() => null)
      if (res?.ok) setRun(((await res.json()) as { run: RunView }).run)
    }
    return ok ? null : String(data.error ?? 'הפעולה נכשלה')
  }, [])

  return { info, run, active, reload: load, start, act }
}

export type SyncApi = ReturnType<typeof useSync>
