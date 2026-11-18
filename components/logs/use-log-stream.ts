'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LogEntry } from '@/lib/log/buffer'

/** How often the server is asked for new lines */
export const POLL_MS = 1500
/** The browser keeps as many as the server does */
const KEEP = 500

export interface LogStats {
  total: number
  since: number
}

export type StreamStatus = 'loading' | 'live' | 'denied' | 'offline'

/**
 * The debug log as the browser sees it (ENG-104): polls /api/logs for the lines after the last
 * one it has, every POLL_MS while the page is visible. `paused` stops taking lines in (the
 * server keeps logging; resuming catches up). A server restart or a clear elsewhere shows as a
 * new `since`, and the lines start over. A 403 is final (this device may not read the log).
 */
export function useLogStream({ enabled = true, paused = false }: { enabled?: boolean; paused?: boolean } = {}) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [status, setStatus] = useState<StreamStatus>('loading')
  const lastId = useRef(0)
  const since = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wake = useRef<() => void>(() => {})

  useEffect(() => {
    if (!enabled || paused) return
    let stopped = false
    const poll = async () => {
      if (stopped) return
      if (!document.hidden) {
        try {
          const res = await fetch(`/api/logs?after=${lastId.current}`, { cache: 'no-store' })
          if (res.status === 403 || res.status === 401) {
            setStatus('denied')
            return
          }
          if (!res.ok) throw new Error(String(res.status))
          const data = (await res.json()) as { entries: LogEntry[]; total: number; since: number }
          if (stopped) return
          if (since.current !== null && since.current !== data.since) {
            // Cleared (here or elsewhere) or the server restarted: ask again from the start
            since.current = data.since
            lastId.current = 0
            setEntries([])
            setStats({ total: data.total, since: data.since })
            timer.current = setTimeout(poll, 0)
            return
          }
          since.current = data.since
          if (data.entries.length) {
            lastId.current = data.entries[data.entries.length - 1].id
            setEntries(prev => [...prev, ...data.entries].slice(-KEEP))
          }
          setStats({ total: data.total, since: data.since })
          setStatus('live')
        } catch {
          if (!stopped) setStatus('offline')
        }
      }
      if (!stopped) timer.current = setTimeout(poll, POLL_MS)
    }
    wake.current = () => {
      clearTimeout(timer.current)
      void poll()
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer.current)
    }
  }, [enabled, paused])

  /** Empties the server's buffer and this view */
  const clear = useCallback(async () => {
    const res = await fetch('/api/logs', { method: 'DELETE' }).catch(() => null)
    if (res?.ok) {
      const data = (await res.json()) as { total: number; since: number }
      lastId.current = 0
      since.current = data.since
      setEntries([])
      setStats({ total: data.total, since: data.since })
    }
  }, [])

  return { entries, stats, status, clear, refresh: () => wake.current() }
}
