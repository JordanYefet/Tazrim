import { NextResponse } from 'next/server'
import { getTransactionForMarking } from '@/lib/db/manual-recurring'
import { getRecurringSeries } from '@/lib/db/recurring'

/**
 * GET /api/recurring/transaction?source=bank|card&id=… (ENG-71)
 * Everything the "mark as recurring" sheet needs: the transaction with a suggested
 * name and rule, the series it is already in (if any), and the account's manual series.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const source = sp.get('source')
  const id = sp.get('id')
  if ((source !== 'bank' && source !== 'card') || !id) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const transaction = await getTransactionForMarking(source, id)
  if (!transaction) return NextResponse.json({ error: 'העסקה לא נמצאה' }, { status: 404 })

  const overview = await getRecurringSeries({ accountId: transaction.accountId })
  const s = overview.series.find(x => x.transactionIds.includes(id))
  const series = s
    ? {
        key: s.key,
        baseKey: s.baseKey,
        overrideKey: s.overrideKey,
        accountId: s.accountId ?? null,
        name: s.name,
        detectedName: s.detectedName,
        status: s.status,
        cadence: s.cadence,
        latestAmount: s.latestAmount,
        occurrences: s.occurrences,
        manualId: s.manual?.id ?? null,
      }
    : null
  const manualSeries = overview.series
    .filter(x => x.manual)
    .map(x => ({ id: x.manual!.id, name: x.name, cadence: x.cadence, latestAmount: x.latestAmount, occurrences: x.occurrences }))
  return NextResponse.json({ transaction, series, manualSeries })
}
