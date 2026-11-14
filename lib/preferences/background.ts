import { prisma } from '@/lib/db/client'
import { formatBackgroundCookie, parseBackgroundCookie, type BackgroundSetting } from '@/lib/background/setting'

/*
 * The page background, stored per person so it is the same on every device they sign in
 * on. The value uses the cookie's format ("lines.10.indigo-pink"), so the cookie stays a
 * copy of it for the first paint of pages without a session (sign-in, setup).
 * With the login off (TAZRIM_AUTH=off) there is no person: one background for the
 * household, in Setting.
 */

export const BACKGROUND_KEY = 'background'

/** The stored background, or null when nothing is stored yet (the device's cookie decides). */
export async function getStoredBackground(personId: string | null): Promise<BackgroundSetting | null> {
  const row = personId
    ? await prisma.personPreference.findUnique({ where: { personId_key: { personId, key: BACKGROUND_KEY } } })
    : await prisma.setting.findUnique({ where: { key: BACKGROUND_KEY } })
  return row ? parseBackgroundCookie(row.value) : null
}

export async function storeBackground(personId: string | null, s: BackgroundSetting): Promise<void> {
  const value = formatBackgroundCookie(s)
  if (personId) {
    await prisma.personPreference.upsert({
      where: { personId_key: { personId, key: BACKGROUND_KEY } },
      create: { personId, key: BACKGROUND_KEY, value },
      update: { value },
    })
  } else {
    await prisma.setting.upsert({ where: { key: BACKGROUND_KEY }, create: { key: BACKGROUND_KEY, value }, update: { value } })
  }
}
