import { describe, expect, it } from 'vitest'
import {
  addFiles,
  applyForceResult,
  applyForceToFile,
  applyImportOutcome,
  applyPreviewOutcome,
  batchTotals,
  fileKey,
  importableIds,
  mapWithLimit,
  mergeNewCategories,
  removeFile,
  runInSequence,
  selectedOrFirstReady,
  setImporting,
  type BatchFile,
  type FileImportResult,
} from '../batch'

// Made-up values only
type F = { name: string; size: number }
type P = { format: string }
const f = (name: string, size = 100): F => ({ name, size })

function ready(list: BatchFile<F, P>[], id: string, importSupported = true) {
  return applyPreviewOutcome(list, id, { ok: true, preview: { format: 'xlsx' }, importSupported })
}

const result = (over: Partial<FileImportResult> = {}): FileImportResult => ({
  created: 2,
  skipped: 1,
  skippedRows: [{ index: 4, date: '2030-01-05', description: 'עסק בדוי', amount: 10, matchedFile: 'fake.xlsx' }],
  ...over,
})

describe('addFiles', () => {
  it('appends new files as reading, in order', () => {
    const { list, added } = addFiles<F, P>([], [f('a.xlsx'), f('b.xlsx')])
    expect(list.map(x => x.file.name)).toEqual(['a.xlsx', 'b.xlsx'])
    expect(list.every(x => x.read === 'reading' && x.import === 'idle')).toBe(true)
    expect(added).toEqual(list)
  })

  it('skips files already in the list or repeated in the same pick (same name and size)', () => {
    const first = addFiles<F, P>([], [f('a.xlsx')]).list
    const { list, added } = addFiles(first, [f('a.xlsx'), f('b.xlsx'), f('b.xlsx'), f('a.xlsx', 200)])
    expect(list.map(x => x.id)).toEqual([fileKey(f('a.xlsx')), fileKey(f('b.xlsx')), fileKey(f('a.xlsx', 200))])
    expect(added.map(x => x.file.name)).toEqual(['b.xlsx', 'a.xlsx'])
  })

  it('keeps the existing entry (and its state) for a duplicate', () => {
    let list = addFiles<F, P>([], [f('a.xlsx')]).list
    list = ready(list, list[0].id)
    list = addFiles(list, [f('a.xlsx')]).list
    expect(list).toHaveLength(1)
    expect(list[0].read).toBe('ready')
  })
})

describe('removeFile', () => {
  it('drops only that file', () => {
    const list = addFiles<F, P>([], [f('a'), f('b'), f('c')]).list
    expect(removeFile(list, list[1].id).map(x => x.file.name)).toEqual(['a', 'c'])
  })
})

describe('applyPreviewOutcome', () => {
  it('marks a readable file ready, or unsupported when the account cannot import', () => {
    const list = addFiles<F, P>([], [f('a'), f('b')]).list
    const next = ready(ready(list, list[0].id), list[1].id, false)
    expect(next[0]).toMatchObject({ read: 'ready', preview: { format: 'xlsx' } })
    expect(next[1]).toMatchObject({ read: 'unsupported', preview: { format: 'xlsx' } })
  })

  it('marks an unreadable file with its error', () => {
    const list = addFiles<F, P>([], [f('a')]).list
    const next = applyPreviewOutcome(list, list[0].id, { ok: false, error: 'קובץ פגום' })
    expect(next[0]).toMatchObject({ read: 'unreadable', readError: 'קובץ פגום' })
    expect(next[0].preview).toBeUndefined()
  })

  it('ignores a preview for a file that was removed meanwhile', () => {
    const list = addFiles<F, P>([], [f('a')]).list
    expect(ready(list, 'gone')).toEqual(list)
  })
})

describe('importableIds', () => {
  it('is the ready files not imported yet, in list order', () => {
    let list = addFiles<F, P>([], [f('a'), f('b'), f('c'), f('d')]).list
    list = ready(list, list[0].id)
    list = applyPreviewOutcome(list, list[1].id, { ok: false, error: 'x' })
    list = ready(list, list[3].id)
    list = ready(list, list[2].id, false)
    expect(importableIds(list)).toEqual([list[0].id, list[3].id])
    list = applyImportOutcome(list, list[0].id, { ok: true, result: result() })
    expect(importableIds(list)).toEqual([list[3].id])
  })

  it('offers a failed import again', () => {
    let list = addFiles<F, P>([], [f('a')]).list
    list = ready(list, list[0].id)
    list = applyImportOutcome(list, list[0].id, { ok: false, error: 'שגיאה' })
    expect(importableIds(list)).toEqual([list[0].id])
  })
})

describe('import outcomes', () => {
  it('tracks importing, done with the result, and failed with the error', () => {
    let list = addFiles<F, P>([], [f('a'), f('b')]).list
    list = ready(ready(list, list[0].id), list[1].id)
    list = setImporting(list, list[0].id)
    expect(list[0].import).toBe('importing')
    list = applyImportOutcome(list, list[0].id, { ok: true, result: result() })
    list = applyImportOutcome(list, list[1].id, { ok: false, error: 'שגיאה בייבוא' })
    expect(list[0]).toMatchObject({ import: 'done', result: { created: 2, skipped: 1 } })
    expect(list[1]).toMatchObject({ import: 'failed', importError: 'שגיאה בייבוא' })
  })

  it('clears an earlier error once a retry succeeds', () => {
    let list = addFiles<F, P>([], [f('a')]).list
    list = applyImportOutcome(ready(list, list[0].id), list[0].id, { ok: false, error: 'x' })
    list = applyImportOutcome(list, list[0].id, { ok: true, result: result() })
    expect(list[0].importError).toBeUndefined()
  })
})

describe('applyForceResult', () => {
  it('moves the forced rows from skipped to created', () => {
    const before = result({
      created: 3,
      skipped: 2,
      skippedRows: [
        { index: 1, date: '2030-01-01', description: 'א', amount: 5, matchedFile: 'x' },
        { index: 7, date: '2030-01-02', description: 'ב', amount: 6, matchedFile: 'x' },
      ],
      newCategories: ['קטגוריה בדויה'],
    })
    const after = applyForceResult(before, [7], { created: 1 })
    expect(after.created).toBe(4)
    expect(after.skipped).toBe(1)
    expect(after.skippedRows.map(r => r.index)).toEqual([1])
    expect(after.newCategories).toEqual(['קטגוריה בדויה'])
  })

  it('updates only that file in the list', () => {
    let list = addFiles<F, P>([], [f('a'), f('b')]).list
    list = ready(ready(list, list[0].id), list[1].id)
    list = applyImportOutcome(list, list[0].id, { ok: true, result: result() })
    list = applyImportOutcome(list, list[1].id, { ok: true, result: result() })
    const next = applyForceToFile(list, list[1].id, [4], { created: 1 })
    expect(next[0].result).toEqual(result())
    expect(next[1].result).toMatchObject({ created: 3, skipped: 0, skippedRows: [] })
  })
})

describe('batchTotals', () => {
  it('sums created and skipped over imported files', () => {
    let list = addFiles<F, P>([], [f('a'), f('b'), f('c')]).list
    list = ready(ready(ready(list, list[0].id), list[1].id), list[2].id)
    list = applyImportOutcome(list, list[0].id, { ok: true, result: result({ created: 5, skipped: 0, skippedRows: [] }) })
    list = applyImportOutcome(list, list[1].id, { ok: true, result: result({ created: 0, skipped: 3 }) })
    list = applyImportOutcome(list, list[2].id, { ok: false, error: 'x' })
    expect(batchTotals(list)).toEqual({ created: 5, skipped: 3, imported: 2, failed: 1 })
  })
})

describe('mergeNewCategories', () => {
  it('unions the new categories of all results, first seen first', () => {
    expect(
      mergeNewCategories([
        result({ newCategories: ['ב', 'א'] }),
        result(),
        result({ newCategories: ['א', 'ג'] }),
      ])
    ).toEqual(['ב', 'א', 'ג'])
  })
})

describe('selectedOrFirstReady', () => {
  it('keeps a selection that still has a preview, else falls back to the first ready file', () => {
    let list = addFiles<F, P>([], [f('a'), f('b'), f('c')]).list
    expect(selectedOrFirstReady(list, null)).toBeNull()
    list = ready(list, list[1].id)
    expect(selectedOrFirstReady(list, null)).toBe(list[1].id)
    list = ready(list, list[2].id, false)
    expect(selectedOrFirstReady(list, list[2].id)).toBe(list[2].id)
    expect(selectedOrFirstReady(list, list[0].id)).toBe(list[1].id)
    expect(selectedOrFirstReady(removeFile(list, list[1].id), 'gone')).toBe(list[2].id)
  })
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => (resolve = r))
  return { promise, resolve }
}

describe('runInSequence', () => {
  it('starts each item only after the previous one finished', async () => {
    const log: string[] = []
    const gates = [deferred(), deferred(), deferred()]
    const run = runInSequence(['a', 'b', 'c'], async (item, i) => {
      log.push(`start ${item}`)
      await gates[i].promise
      log.push(`end ${item}`)
    })
    await Promise.resolve()
    expect(log).toEqual(['start a'])
    gates[0].resolve()
    gates[1].resolve()
    gates[2].resolve()
    await run
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
  })

  it('keeps going when an item throws, and reports which ones failed', async () => {
    const done: string[] = []
    const failed = await runInSequence(['a', 'b', 'c'], async item => {
      if (item === 'b') throw new Error('boom')
      done.push(item)
    })
    expect(done).toEqual(['a', 'c'])
    expect(failed).toEqual(['b'])
  })
})

describe('mapWithLimit', () => {
  it('never runs more than the limit at once and visits every item', async () => {
    let running = 0
    let peak = 0
    const seen: number[] = []
    await mapWithLimit([1, 2, 3, 4, 5], 2, async n => {
      running++
      peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 1))
      seen.push(n)
      running--
    })
    expect(peak).toBe(2)
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5])
  })
})
