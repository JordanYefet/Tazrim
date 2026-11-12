/** The phone's "תובנות" tab: three pages behind one switch. */
export const INSIGHTS_STORAGE_KEY = 'tazrim:insights'
export const INSIGHTS_DEFAULT = '/projection'

export const INSIGHTS_PAGES = [
  { href: '/projection', label: 'תחזית' },
  { href: '/recurring', label: 'קבועים', title: 'חיובים קבועים' },
  { href: '/analysis', label: 'ניתוח', title: 'ניתוח לפי קטגוריה' },
] as const

/** The insights page the path belongs to (sub-paths included), or null. */
export function insightsPageOf(pathname: string): string | null {
  const hit = INSIGHTS_PAGES.find(p => pathname === p.href || pathname.startsWith(`${p.href}/`))
  return hit ? hit.href : null
}

export function isInsightsActive(pathname: string): boolean {
  return insightsPageOf(pathname) !== null
}

/** A stored value is only trusted if it is one of the three pages; anything else falls back to the default. */
export function parseInsightsChoice(value: string | null | undefined): string {
  return INSIGHTS_PAGES.find(p => p.href === value)?.href ?? INSIGHTS_DEFAULT
}

export function readInsightsChoice(): string {
  try {
    return parseInsightsChoice(window.localStorage.getItem(INSIGHTS_STORAGE_KEY))
  } catch {
    return INSIGHTS_DEFAULT
  }
}

export function saveInsightsChoice(href: string) {
  try {
    window.localStorage.setItem(INSIGHTS_STORAGE_KEY, parseInsightsChoice(href))
  } catch {}
}
