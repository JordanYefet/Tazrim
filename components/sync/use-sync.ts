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

/** New rows "sync all" has stored so far */
const createdIn = (queue: QueueView | null) => (queue?.items ?? []).reduce((n, i) => n + (i.created ?? 0), 0)

/**
 * The sync state the header button and the sheet share (ENG-91): what
 * /api/sync reports, and the run (or "sync all"), polled while it is going.
 * When new rows are stored the page refreshes, so they show at once.
 */
export function useSync() {
  const router = useRouter()
  const [info, setInfo] = useState<SyncInfo | null>(null)
  const [run, setRun] = useState<RunView | null>(null)
  const [queue, setQueue] = useState<QueueView | null>(null)
  const runRef = useRef<RunView | null>(null)
  runRef.current = run
  // What "sync all" had stored at the last look, so new rows refresh the page once
  const seenCreated = useRef<{ id: string; created: number } | null>(null)

  const takeQueue = useCallback(
    (next: QueueView | null) => {
      setQueue(next)
      if (!next) return
      const created = createdIn(next)
      const seen = seenCreated.current
      if (seen?.id === next.id && created > seen.created) router.refresh()
      seenCreated.current = { id: next.id, created }
    },
    [router]
  )

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as SyncInfo
      setInfo(data)
      takeQueue(data.queue)
      setRun(prev => (prev && data.run && prev.id === data.run.id ? data.run : (data.run ?? (data.queue ? null : prev))))
    } catch {
      // Offline or the server restarting: the button keeps what it had
    }
  }, [takeQueue])

  useEffect(() => {
    void load()
  }, [load])

  const queueGoing = !!queue && !queue.finishedAt
  const active = isActive(run) || queueGoing
  const runId = run?.id

  // "Sync all": every company's row, polled until the last one ends
  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/all', { cache: 'no-store' })
      if (!res.ok) return
      const { queue: next } = (await res.json()) as { queue: QueueView | null }
      takeQueue(next)
      if (next?.finishedAt) void load()
    } catch {
      // Try again on the next tick
    }
  }, [takeQueue, load])
  useEffect(() => {
    if (!queueGoing) return
    const id = setInterval(() => void loadQueue(), POLL_MS)
    return () => clearInterval(id)
  }, [queueGoing, loadQueue])

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
      if (res.data.run) {
        setRun(res.data.run as RunView)
        setQueue(null)
      }
      if (res.data.queue) {
        setRun(null)
        takeQueue(res.data.queue as QueueView)
      }
      void load()
    }
    return res.ok ? null : String(res.data.error ?? 'הסנכרון לא התחיל')
  }, [load, takeQueue])

  const start = useCallback(
    (company: string, login: LoginInput, startDate: string) => withVault(() => post('/api/sync', { company, ...login, startDate })),
    [withVault]
  )

  /** Every company with a saved sign-in, several at once (ENG-92) */
  const startAll = useCallback(() => withVault(() => post('/api/sync', { all: true })), [withVault])

  /** Answers a run: the single sync's, or one row of "sync all" when `runId` is given */
  const act = useCallback(
    async (body: { code: string } | { links: LinkAction[] } | { cancel: true }, runId?: string) => {
      const id = runId ?? runRef.current?.id
      if (!id) return 'אין סנכרון פעיל'
      const { ok, data } = await post(`/api/sync/runs/${id}`, body)
      if (ok) {
        // Show the next state at once instead of on the next tick
        if (runId) await loadQueue()
        else {
          const res = await fetch(`/api/sync/runs/${id}`, { cache: 'no-store' }).catch(() => null)
          if (res?.ok) setRun(((await res.json()) as { run: RunView }).run)
        }
      }
      return ok ? null : String(data.error ?? 'הפעולה נכשלה')
    },
    [loadQueue]
  )

  return { info, run, queue, active, reload: load, start, startAll, act }
}

export type SyncApi = ReturnType<typeof useSync>
