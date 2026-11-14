/**
 * Addresses and the HTTPS switch's profiles (ENG-122/123). Pure; the browser uses them too.
 */
import { parseProfiles } from '@/updater/env-file.mjs'
import type { ConfigValues } from './types'

/** What a phone opens on the home Wi-Fi, or null while this computer's address is unknown */
export function phoneAddress(v: Pick<ConfigValues, 'TAZRIM_LAN_IP' | 'TAZRIM_PHONE_PORT'>): string | null {
  return v.TAZRIM_LAN_IP ? `http://${v.TAZRIM_LAN_IP}:${v.TAZRIM_PHONE_PORT}` : null
}

/** Tazrim over HTTPS: https://tazrim.internal, with the port when it isn't 443 */
export function httpsAddress(host: string, httpsPort: string): string {
  return `https://${host}${httpsPort && httpsPort !== '443' ? `:${httpsPort}` : ''}`
}

/** HTTPS counts as on when both its parts are: Caddy (https) and AdGuard (dns) */
export function isHttpsOn(profiles: string): boolean {
  const list = parseProfiles(profiles) ?? []
  return list.includes('https') && list.includes('dns')
}

/**
 * COMPOSE_PROFILES with HTTPS turned on or off: both https and dns together, everything else
 * kept. With the helper, its own profile (updater) stays on whatever the file said.
 */
export function withHttps(profiles: string, on: boolean, keepUpdater: boolean): string {
  const list = (parseProfiles(profiles) ?? []).filter(p => p !== 'https' && p !== 'dns')
  const next = [...list, ...(on ? ['https', 'dns'] : []), ...(keepUpdater ? ['updater'] : [])]
  return (parseProfiles(next.join(',')) ?? []).join(',')
}
