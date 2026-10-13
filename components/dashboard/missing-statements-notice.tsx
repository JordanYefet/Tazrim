import { getMissingStatements } from '@/lib/db/missing-statements'
import { groupByProvider } from '@/lib/insights/missing-statements'
import { MissingStatementsBanner } from './missing-statements-banner'

/**
 * Server wrapper for the dashboard: loads the gaps itself so the page only
 * renders <MissingStatementsNotice />. Always as of today, not the selected period.
 */
export async function MissingStatementsNotice() {
  const items = groupByProvider(await getMissingStatements()).map(({ kind, provider, months }) => ({
    kind,
    provider,
    months,
  }))
  return <MissingStatementsBanner items={items} />
}
