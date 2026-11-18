/**
 * The three pages that became Settings → Phones and network: each old address opens its section,
 * and ?guide= (older links to a guide) still opens that guide.
 */
export function networkHref(anchor: 'phones' | 'https' | 'advanced', params: Record<string, string | string[] | undefined>): string {
  const guide = typeof params.guide === 'string' && /^[a-z-]+$/.test(params.guide) ? params.guide : null
  return `/settings/network${guide ? `?guide=${guide}` : ''}#${anchor}`
}
