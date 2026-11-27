/**
 * The Squid port of each scraper company (ENG-142). docker/squid/allowlist.json holds them (the proxy's
 * squid.conf is generated from the same file, and a test pins them), so the app and the proxy cannot
 * disagree. A number is never reused or moved to another provider.
 */
import allowlist from '@/docker/squid/allowlist.json'

/** The port for everything that is not a provider's browser: the app's own Node calls (One Zero's scraper) */
export const MAIN_PORT = 3128

/** israeli-bank-scrapers company id -> its port */
export const PROVIDER_PORTS: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(allowlist.providers).map(([id, p]) => [id, (p as { port: number }).port]))

export const portOfProvider = (id: string): number | null => (Object.hasOwn(PROVIDER_PORTS, id) ? PROVIDER_PORTS[id] : null)

/** The company a port belongs to, or null (the main port, or a number the proxy never listened on) */
export function providerOfPort(port: number): string | null {
  for (const [id, p] of Object.entries(PROVIDER_PORTS)) if (p === port) return id
  return null
}

export const isProviderId = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(PROVIDER_PORTS, id)
