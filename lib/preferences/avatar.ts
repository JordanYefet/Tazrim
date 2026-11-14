import { prisma } from '@/lib/db/client'
import { validateAvatar, type Avatar } from '@/lib/avatar/options'

/** Each person's avatar (a JSON value in PersonPreference), shown wherever the person is */
export const AVATAR_KEY = 'avatar'

export function parseAvatar(raw: string | null | undefined): Avatar | null {
  if (!raw) return null
  try {
    return validateAvatar(JSON.parse(raw))
  } catch {
    return null
  }
}

/** The stored avatars of these people; those without one are left out */
export async function getAvatars(personIds: string[]): Promise<Map<string, Avatar>> {
  const out = new Map<string, Avatar>()
  if (personIds.length === 0) return out
  const rows = await prisma.personPreference.findMany({ where: { key: AVATAR_KEY, personId: { in: personIds } } })
  for (const r of rows) {
    const a = parseAvatar(r.value)
    if (a) out.set(r.personId, a)
  }
  return out
}

export async function storeAvatar(personId: string, avatar: Avatar): Promise<void> {
  const value = JSON.stringify(avatar)
  await prisma.personPreference.upsert({
    where: { personId_key: { personId, key: AVATAR_KEY } },
    create: { personId, key: AVATAR_KEY, value },
    update: { value },
  })
}
