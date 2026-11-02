// lib/db/settings.ts
import { prisma } from './client'

export const CUSHION_KEY = 'projection.cushion'
export const CUSHION_MAX = 100_000_000

export class SettingValidationError extends Error {}

/** The safety cushion of the projection page (ENG-87): tight months dip under it. 0 until set. */
export async function getCushion(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: CUSHION_KEY } })
  const value = row ? Number(row.value) : 0
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export async function setCushion(input: unknown): Promise<number> {
  const value = typeof input === 'number' ? input : typeof input === 'string' && input.trim() !== '' ? Number(input) : Number.NaN
  if (!Number.isFinite(value) || value < 0 || value > CUSHION_MAX) {
    throw new SettingValidationError('סכום הכרית צריך להיות מספר בין 0 ל-100,000,000')
  }
  const rounded = Math.round(value * 100) / 100
  await prisma.setting.upsert({
    where: { key: CUSHION_KEY },
    create: { key: CUSHION_KEY, value: String(rounded) },
    update: { value: String(rounded) },
  })
  return rounded
}
