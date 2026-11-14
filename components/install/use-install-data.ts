'use client'

/**
 * The data the phones and HTTPS pages need (ENG-122/123): the install view (/api/install) and
 * the network info (/api/install/network). The Settings pages pass both from the server; /setup
 * (ENG-125) renders the same components without them, and they load here.
 */
import { useCallback, useEffect, useState } from 'react'
import type { InstallView, NetworkInfo } from '@/lib/install/types'

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

export const fetchNetwork = () => getJson<NetworkInfo>('/api/install/network')

/** null while loading; `failed` when either request didn't answer */
export function useInstallData(initial?: InstallView, network?: NetworkInfo) {
  const [view, setView] = useState<InstallView | null>(initial ?? null)
  const [net, setNet] = useState<NetworkInfo | null>(network ?? null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    const [v, n] = await Promise.all([view ? Promise.resolve(view) : getJson<InstallView>('/api/install'), net ? Promise.resolve(net) : fetchNetwork()])
    if (v) setView(v)
    if (n) setNet(n)
    if (!v || !n) setFailed(true)
  }, [view, net])

  useEffect(() => {
    if (!view || !net) void load()
    // Once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { view, network: net, failed, retry: load }
}

