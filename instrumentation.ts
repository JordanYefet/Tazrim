/**
 * Runs once when the server starts (Next.js instrumentation): the one-time data
 * updates a release needs (lib/db/backfills.ts). Never in the read-only demo, and a
 * failure is logged, never fatal: the app works without them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { isReadOnly } = await import('./lib/read-only')
  if (isReadOnly()) return
  try {
    const { runBackfills } = await import('./lib/db/backfills')
    const res = await runBackfills()
    if (res.ran) console.log(`backfills: text rules applied to notes (${res.changed} rows updated)`)
  } catch (e) {
    console.warn('backfills: failed, will try again on the next start', e)
  }
}
