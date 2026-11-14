import { prisma } from '@/lib/db/client'

export const AUTO_KEY = 'updates.auto'
export const CACHE_KEY = 'updates.cache'

/** Is the daily GitHub check on? Absent means on. */
export async function getAutoCheck(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: AUTO_KEY } })
  return row?.value !== '0'
}

export async function setAutoCheck(on: boolean): Promise<void> {
  const value = on ? '1' : '0'
  await prisma.setting.upsert({ where: { key: AUTO_KEY }, create: { key: AUTO_KEY, value }, update: { value } })
}
