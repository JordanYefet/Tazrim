import path from 'node:path'

/** Is the app container isolated behind the proxy? compose sets TAZRIM_EGRESS=1 (docker-compose.egress.yml) */
export function egressActive(): boolean {
  return process.env.TAZRIM_EGRESS === '1'
}

/** The read-only mount of the install folder's egress/ (updater-owned state), /egress in the container */
export function egressDir(): string {
  return process.env.TAZRIM_EGRESS_DIR || '/egress'
}

export const egressFile = (name: string) => path.join(egressDir(), name)

/** Squid's access log, mounted read-only from the squid-logs volume */
export function squidLogPath(): string {
  return process.env.TAZRIM_SQUID_LOG || '/squid-logs/access.log'
}
