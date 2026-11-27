import allowlist from '@/docker/squid/allowlist.json'
import { SYNC_COMPANIES } from '@/lib/sync/providers'

export interface ProviderEntry {
  id: string
  /** The allowlist's English name */
  name: string
  /** The Hebrew name the sync sheet uses (the English one for a company the sheet does not know) */
  label: string
  domains: string[]
  thirdParty: { domain: string; why: string }[]
}

/** Hebrew for the reasons the allowlist gives in English; anything else shows the file's own words */
const WHY: Record<string, string> = {
  '.hcaptcha.com': 'הקאפצ׳ה של עמוד הכניסה',
  '.perfdrive.com': 'בדיקת הבוטים (Radware) של עמוד הכניסה',
}

/** The Hebrew name of a scraper company (the sync sheet's), or null for an id that is none */
export const providerLabel = (id: string): string | null => SYNC_COMPANIES.find(c => c.id === id)?.label ?? null

/** The providers the proxy lets the app reach (docker/squid/allowlist.json), in the file's order */
export const PROVIDERS: ProviderEntry[] = Object.entries(allowlist.providers).map(([id, p]) => {
  const third = (p as { thirdParty?: { domain: string; why: string }[] }).thirdParty ?? []
  return { id, name: p.name, label: providerLabel(id) ?? p.name, domains: [...p.domains], thirdParty: third.map(t => ({ domain: t.domain, why: WHY[t.domain] ?? t.why })) }
})
