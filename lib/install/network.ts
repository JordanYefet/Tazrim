/**
 * What the phones and HTTPS pages need beside the install view (ENG-122/123): addresses this
 * computer seems to have (outside Docker only), the HTTPS port, whether Caddy's certificate is
 * there, and whether passwords need HTTPS. Never asks anything outside this computer.
 */
import { existsSync } from 'node:fs'
import os from 'node:os'
import { isPrivateIPv4 } from '@/updater/env-file.mjs'
import { getRequireHttps } from '@/lib/settings/app-settings'
import { readRootCert } from './device-files'
import type { NetworkInfo } from './types'

/** Inside a container the interfaces are the container's own, never the computer's */
export const inContainer = () => existsSync('/.dockerenv') || existsSync('/run/.containerenv')

/** The home-network IPv4 addresses among `interfaces` (os.networkInterfaces()), each once */
export function privateAddresses(interfaces: ReturnType<typeof os.networkInterfaces>): string[] {
  const out = new Set<string>()
  for (const list of Object.values(interfaces)) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && isPrivateIPv4(a.address)) out.add(a.address)
  }
  return [...out]
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  const docker = inContainer()
  const [cert, requireHttps] = await Promise.all([readRootCert(), Promise.resolve().then(getRequireHttps).catch(() => false)])
  return {
    lanHints: docker ? [] : privateAddresses(os.networkInterfaces()),
    httpsPort: /^\d{1,5}$/.test(process.env.TAZRIM_HTTPS_PORT ?? '') ? process.env.TAZRIM_HTTPS_PORT! : '443',
    certReady: cert !== null,
    requireHttps,
  }
}

/** A device file that isn't there (HTTPS off, Caddy still starting, or the demo) */
export function deviceFileMissing() {
  return new Response('אין עדיין אישור: מפעילים HTTPS בהגדרות של תזרים, ומחכים כמה שניות.\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
