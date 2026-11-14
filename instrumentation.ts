/**
 * Runs once when the server starts (Next.js instrumentation): the "this computer"
 * door (lib/local-door.ts, when TAZRIM_LOCAL_PORT is set), the one-time data
 * updates a release needs (lib/db/backfills.ts) and the daily update check.
 * Never in the read-only demo, and a failure is logged, never fatal.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { isReadOnly } = await import('./lib/read-only')
  try {
    const { startLocalDoor } = await import('./lib/local-door')
    startLocalDoor({ off: isReadOnly() })
  } catch (e) {
    console.warn('this-computer door: could not start', e)
  }
  if (isReadOnly()) return
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
