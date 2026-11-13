/**
 * The current or last job (ENG-98): kept in memory and mirrored to <dataDir>/.update-status.json,
 * so the app, coming back up as the new version, can read the outcome even if the helper restarted.
 */
import nodeFs from 'node:fs'

/** A job that was running when the helper stopped can't be resumed: it reads as failed */
function settle(s) {
  if (!s || typeof s !== 'object' || s.state !== 'running') return s
  return {
    ...s,
    state: 'failed',
    error: s.error ?? 'The updater stopped in the middle of the job.',
    steps: (s.steps ?? []).map(step => (step.state === 'running' ? { ...step, state: 'failed' } : step)),
    finishedAt: new Date().toISOString(),
  }
}

export function createStatusStore(file, { fs = nodeFs } = {}) {
  const write = s => {
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o644 })
    fs.renameSync(tmp, file)
  }

  let current = null
  try {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'))
    current = settle(loaded)
    if (current !== loaded) write(current)
  } catch {
    current = null
  }

  return {
    /** A copy of the current or last job, or null */
    get: () => (current ? structuredClone(current) : null),
    save(s) {
      current = structuredClone(s)
      write(current)
    },
  }
}
