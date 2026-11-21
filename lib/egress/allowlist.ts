import allowlist from '@/docker/squid/allowlist.json'

export interface ProviderEntry {
  id: string
  name: string
  domains: string[]
  thirdParty: { domain: string; why: string }[]
}

/** Hebrew for the reasons the allowlist gives in English; anything else shows the file's own words */
const WHY: Record<string, string> = {
  '.hcaptcha.com': 'הקאפצ׳ה של עמוד הכניסה',
  '.perfdrive.com': 'בדיקת הבוטים (Radware) של עמוד הכניסה',
}

/** The providers the proxy lets the app reach (docker/squid/allowlist.json), in the file's order */
export const PROVIDERS: ProviderEntry[] = Object.entries(allowlist.providers).map(([id, p]) => {
  const third = (p as { thirdParty?: { domain: string; why: string }[] }).thirdParty ?? []
  return { id, name: p.name, domains: [...p.domains], thirdParty: third.map(t => ({ domain: t.domain, why: WHY[t.domain] ?? t.why })) }
})
