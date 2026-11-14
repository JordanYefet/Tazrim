/**
 * Runs once when the server starts (Next.js instrumentation): the app settings and the
 * clock (lib/settings/app-settings.ts), then the one-time data
 * updates a release needs (lib/db/backfills.ts). Never in the read-only demo, and a
 * failure is logged, never fatal: the app works without them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // TAZRIM_TZ wins over the database (ENG-120); the demo has no stored settings
  if (process.env.TAZRIM_TZ?.trim()) process.env.TZ = process.env.TAZRIM_TZ.trim()
  const { isReadOnly } = await import('./lib/read-only')
  if (isReadOnly()) return
  // The stored app settings (time zone, allowed addresses...) are in memory, and the clock
  // is the effective one, before the first request
  try {
    const { applyTimeZone, loadAppSettings } = await import('./lib/settings/app-settings')
    await loadAppSettings()
    applyTimeZone()
  } catch (e) {
    console.warn('settings: could not load the app settings, using the defaults', e)
  }
  try {
    const { runBackfills } = await import('./lib/db/backfills')
    const res = await runBackfills()
    if (res.ran) console.log(`backfills: text rules applied to notes (${res.changed} rows updated)`)
  } catch (e) {
    console.warn('backfills: failed, will try again on the next start', e)
  }
  try {
    const { startDailyCheck } = await import('./lib/updates/check')
    startDailyCheck()
  } catch (e) {
    console.warn('updates: could not start the daily check', e)
  }
}
