'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isDataWrite, staleOnReturn } from '@/lib/nav/fresh-data'

/**
 * Keeps the pages the browser holds on to (next.config.ts, staleTimes) true
 * to the data (lib/nav/fresh-data.ts). A write anywhere (a category, a note,
 * an upload, a setting...) drops them and fetches the page on screen again,
 * so no tab ever shows a figure from before the change. Coming back to the
 * app after a while does the same, for syncs that ran in the meantime.
 * Renders nothing.
 */
export function FreshData() {
  const router = useRouter()

  useEffect(() => {
    const original = window.fetch
    // Several writes in a row (a bulk edit) refresh once
    let pending = 0
    const refreshSoon = () => {
      window.clearTimeout(pending)
      pending = window.setTimeout(() => router.refresh(), 50)
    }
    window.fetch = async (input, init) => {
      const response = await original(input, init)
      try {
        const request = input instanceof Request ? input : null
        const url = new URL(request?.url ?? String(input), window.location.href)
        const method = init?.method ?? request?.method ?? 'GET'
        if (response.ok && url.origin === window.location.origin && isDataWrite(method, url.pathname)) refreshSoon()
      } catch {}
      return response
    }

    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        return
      }
      if (staleOnReturn(hiddenAt, Date.now())) router.refresh()
      hiddenAt = null
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.fetch = original
      window.clearTimeout(pending)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router])

  return null
}
