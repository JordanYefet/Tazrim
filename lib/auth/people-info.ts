import { currentSession } from '@/lib/auth/http'
import { hasRecoveryCode, listPeople } from '@/lib/auth/household'
import { getAvatars } from '@/lib/preferences/avatar'

/**
 * Settings → People: everyone with their level and devices, which device this is, and your own
 * level (ENG-140). Shared by GET /api/people and the page itself, which renders it on the server so
 * the cards and the admin controls arrive in place instead of after a loading block.
 */
export async function peopleInfo() {
  const [session, people, recovery] = await Promise.all([currentSession(), listPeople(), hasRecoveryCode()])
  const avatars = await getAvatars(people.map(p => p.id))
  return {
    people: people.map(p => ({ ...p, avatar: avatars.get(p.id) ?? null })),
    me: session?.personId ?? null,
    myRole: session?.role ?? null,
    thisDevice: session?.passkeyId ?? null,
    hasRecoveryCode: recovery,
  }
}
