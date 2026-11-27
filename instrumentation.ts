/**
 * Runs once when the server starts (Next.js instrumentation): the "this computer"
 * door (lib/local-door.ts, when TAZRIM_LOCAL_PORT is set), the app settings and the
 * clock (lib/settings/app-settings.ts), the page-request log hook (lib/log/pages.ts), the one-time data updates a release needs
 * (lib/db/backfills.ts), the household's providers for the egress proxy (lib/egress/household.ts) and the daily update check. Never in the read-only demo
 * (except the time zone), and a failure is logged, never fatal.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // TAZRIM_TZ wins over the database (ENG-120); the demo has no stored settings
  if (process.env.TAZRIM_TZ?.trim()) process.env.TZ = process.env.TAZRIM_TZ.trim()
  const { isReadOnly } = await import('./lib/read-only')
  const { describeError } = await import('./lib/log/redact')
  // The debug log (ENG-104) starts with the server; nothing here is personal
  try {
    const { log } = await import('./lib/log/logger')
    const { CURRENT_VERSION } = await import('./lib/updates/check')
    log.info('app', `server started · v${CURRENT_VERSION}`, { version: CURRENT_VERSION })
  } catch (e) {
    console.warn('debug log: could not write the start line', describeError(e))
  }
  // Page requests with their status and time (ENG-104): hooks the http server, once
  try {
    const { installPageLog } = await import('./lib/log/pages')
    installPageLog()
  } catch (e) {
    console.warn('debug log: could not hook page requests', describeError(e))
  }
  try {
    const { startLocalDoor } = await import('./lib/local-door')
    startLocalDoor({ off: isReadOnly() })
  } catch (e) {
    console.warn('this-computer door: could not start', describeError(e))
  }
  if (isReadOnly()) return
  // The stored app settings (time zone, allowed addresses...) are in memory, and the clock
  // is the effective one, before the first request
  try {
    const { applyTimeZone, loadAppSettings } = await import('./lib/settings/app-settings')
    await loadAppSettings()
    applyTimeZone()
  } catch (e) {
    console.warn('settings: could not load the app settings, using the defaults', describeError(e))
  }
  try {
    const { runBackfills } = await import('./lib/db/backfills')
    const res = await runBackfills()
    if (res.ran) console.log(`backfills: text rules applied to notes (${res.changed} rows updated)`)
  } catch (e) {
    console.warn('backfills: failed, will try again on the next start', describeError(e))
  }
  // Network isolation (ENG-142): the proxy's per-provider lists follow the household's accounts
  try {
    const { startHouseholdSync } = await import('./lib/egress/household')
    startHouseholdSync()
  } catch (e) {
    console.warn('network isolation: could not start telling the updater the household\'s providers', describeError(e))
  }
  try {
    const { startDailyCheck } = await import('./lib/updates/check')
    startDailyCheck()
  } catch (e) {
    console.warn('updates: could not start the daily check', describeError(e))
  }
}
