import { NextRequest, NextResponse } from 'next/server'
import {
  GenericDescriptionError,
  listGenericDescriptions,
  markGenericDescription,
  unmarkGenericDescription,
} from '@/lib/db/generic-descriptions'

/**
 * Generic bank descriptions (lib/db/generic-descriptions.ts). POST `{ description }`
 * marks one: its rules go and the response lists the rows whose rule category was
 * cleared. DELETE `{ description }` takes one off the list, recategorising nothing.
 */
export async function GET() {
  return NextResponse.json(await listGenericDescriptions())
}

async function descriptionFrom(req: NextRequest): Promise<string | null> {
  const body = await req.json().catch(() => null)
  const description = body?.description
  return typeof description === 'string' && description.trim() ? description : null
}

export async function POST(req: NextRequest) {
  const description = await descriptionFrom(req)
  if (!description) return NextResponse.json({ error: 'תיאור נדרש' }, { status: 400 })
  try {
    return NextResponse.json(await markGenericDescription(description))
  } catch (e) {
    if (e instanceof GenericDescriptionError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

export async function DELETE(req: NextRequest) {
  const description = await descriptionFrom(req)
  if (!description) return NextResponse.json({ error: 'תיאור נדרש' }, { status: 400 })
  await unmarkGenericDescription(description)
  return NextResponse.json({ ok: true })
}
