import { NextRequest, NextResponse } from 'next/server'
import { parseBankLeumi } from '@/lib/parsers/bank-leumi'
import { parseMaxCC } from '@/lib/parsers/max-cc'
import { upsertBankTransactions } from '@/lib/db/bank'
import { upsertCCTransactions } from '@/lib/db/cards'
import { recordUpload } from '@/lib/db/upload'
import { prisma } from '@/lib/db/client'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const source = form.get('source') as string | null

  if (!file || !source) {
    return NextResponse.json({ error: 'חסר קובץ או סוג מקור' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (source === 'BANK') {
    const { transactions, errors } = parseBankLeumi(buffer, file.name)
    if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 422 })

    const result = await upsertBankTransactions(transactions)
    await recordUpload({ fileName: file.name, recordCount: result.created, source: 'BANK' })
    return NextResponse.json(result)
  }

  if (source === 'MAX') {
    const { transactions, errors } = parseMaxCC(buffer)
    if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 422 })

    const existingUpload = await prisma.uploadHistory.findFirst({
      where: { fileName: file.name, source: 'MAX' },
    })
    if (existingUpload) {
      return NextResponse.json(
        { error: 'קובץ זה כבר הועלה בעבר', duplicate: true },
        { status: 409 }
      )
    }

    const result = await upsertCCTransactions(transactions, file.name)
    await recordUpload({ fileName: file.name, recordCount: result.created, source: 'MAX' })

    const txCategories = [...new Set(transactions.map(t => t.category).filter(Boolean))]
    const existing = await prisma.category.findMany({ where: { name: { in: txCategories } } })
    const existingNames = new Set(existing.map(c => c.name))
    const newCategories = txCategories.filter(name => !existingNames.has(name))

    return NextResponse.json({ ...result, newCategories })
  }

  return NextResponse.json({ error: 'מקור לא מוכר' }, { status: 400 })
}
