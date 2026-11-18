import { prisma } from '@/lib/db/client'
import { formatA11y, normalizeA11y, parseA11y, type A11ySettings } from '@/lib/a11y/settings'

/*
 * The accessibility options (ENG-128), stored per person so they are the same on every device
 * they sign in on: one JSON value (lib/a11y/settings.ts). The cookie (tazrim_a11y) is a copy of
 * it for pages without a session (sign-in, setup) and for the read-only demo.
 * With the login off (TAZRIM_AUTH=off) there is no person: one value for the household, in Setting.
 */

export const A11Y_KEY = 'a11y'

/** The stored options, or null when nothing is stored yet (the device's cookie decides). */
export async function getStoredA11y(personId: string | null): Promise<A11ySettings | null> {
  const row = personId
    ? await prisma.personPreference.findUnique({ where: { personId_key: { personId, key: A11Y_KEY } } })
    : await prisma.setting.findUnique({ where: { key: A11Y_KEY } })
  return row ? parseA11y(row.value) : null
}

export async function storeA11y(personId: string | null, s: A11ySettings): Promise<A11ySettings> {
  const normal = normalizeA11y(s)
  const value = formatA11y(normal)
  if (personId) {
    await prisma.personPreference.upsert({
      where: { personId_key: { personId, key: A11Y_KEY } },
      create: { personId, key: A11Y_KEY, value },
      update: { value },
    })
  } else {
    await prisma.setting.upsert({ where: { key: A11Y_KEY }, create: { key: A11Y_KEY, value }, update: { value } })
  }
  return normal
}
