'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LoginField } from '@/lib/sync/providers'
import type { QueueView, RunView } from '@/lib/sync/runs'
import { vaultWithPasskey } from '@/components/vault/vault-client'
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
  /** The id of a sign-in saved in the vault for it (ENG-92), or null */
  savedLogin: string | null
}

export interface SyncInfo {
  available: boolean
  companies: CompanyInfo[]
  vault: { exists: boolean; open: boolean }
  run: RunView | null
  /** "Sync all" (ENG-92), while going and after */
  queue: QueueView | null
}

/** How a sync gets its login: typed in (and maybe saved to the vault), or the one saved there */
export type LoginInput = { credentials: Record<string, string>; save?: boolean } | { saved: true }

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

  const queueGoing = !!info?.queue && !info.queue.finishedAt
  const active = isActive(run) || queueGoing
  const runId = run?.id

  // "Sync all" between two companies (the next login is being read): ask again
  // until the next run shows up, or the queue ends
  const between = queueGoing && !isActive(run)
  useEffect(() => {
    if (!between) return
    const id = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(id)
  }, [between, load])
  const runGoing = isActive(run)
  useEffect(() => {
    if (!runGoing || !runId) return
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
  }, [runGoing, runId, load, router])

  /**
   * Runs `send`; when the vault is locked (423), opens it with Face ID / Touch ID
   * and tries once more. Returns the error to show, or null.
   */
  const withVault = useCallback(async (send: () => Promise<{ ok: boolean; data: Record<string, unknown> }>) => {
    let res = await send()
    if (!res.ok && res.data.code === 'VAULT_LOCKED') {
      try {
        await vaultWithPasskey('unlock')
      } catch (e) {
        return (e as Error).message
      }
      res = await send()
    }
    if (res.ok) {
      if (res.data.run) setRun(res.data.run as RunView)
      void load()
    }
    return res.ok ? null : String(res.data.error ?? 'הסנכרון לא התחיל')
  }, [load])

  const start = useCallback(
    (company: string, login: LoginInput, startDate: string) => withVault(() => post('/api/sync', { company, ...login, startDate })),
    [withVault]
  )

  /** Every company with a saved sign-in, one after another (ENG-92) */
  const startAll = useCallback(() => withVault(() => post('/api/sync', { all: true })), [withVault])

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

  return { info, run, active, reload: load, start, startAll, act }
}

export type SyncApi = ReturnType<typeof useSync>
