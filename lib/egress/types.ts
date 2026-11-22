/** Network isolation (ENG-131/133/134): what the browser gets. No Node imports, shared with the client. */

export type EgressHelper = 'ready' | 'unavailable' | 'old' | 'none'

export interface ExtraDomain {
  domain: string
  note: string
  addedAt: string
  approver: string
}

export interface Approver {
  id: string
  name: string
  rpId: string
  createdAt: string
  kind: 'passkey' | 'password'
}

export type ChangeAction = 'add-domain' | 'remove-domain' | 'turn-on' | 'turn-off' | 'add-approver' | 'remove-approver'

export interface EgressChange {
  at: string
  action: ChangeAction
  detail: string
  approver: string
}

/** A line the proxy refused (TCP_DENIED/403) */
export interface Denied {
  /** ms since epoch */
  at: number
  who: 'app' | 'updater' | 'other'
  host: string
}

export interface EgressJob {
  id: string
  state: 'running' | 'done' | 'failed'
  restored: boolean
  steps: { id: string; state: 'waiting' | 'running' | 'done' | 'failed' }[]
  /** Fixed code of a failure */
  code?: string
  finishedAt?: string
  restartingHelper?: boolean
}

export interface EgressView {
  helper: EgressHelper
  reason: string | null
  /** The app container is isolated (TAZRIM_EGRESS=1), or the updater says the compose files include it */
  on: boolean
  /** docker-compose.egress.yml in the install folder differs from the one the image carries */
  overrideDiffers: boolean
  extraDomains: ExtraDomain[]
  approvers: Approver[]
  changes: EgressChange[]
  /** Last refusals, newest first; null while isolation is off */
  blocked: Denied[] | null
  job: EgressJob | null
}

/** What a change asks the updater to do; the updater checks it again */
export type ChangeRequest =
  | { action: 'add-domain'; domain: string; note?: string }
  | { action: 'remove-domain'; domain: string }
  | { action: 'turn-off' }
  | { action: 'remove-approver'; id: string }
