import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { syncCompany } from '../providers'

/*
 * Cal reaches past the library's 18 months only through patches/israeli-bank-scrapers+*.patch
 * (patch-package, run on install). If an upgrade of the library drops the patch, the form
 * would offer 3 years and the library would quietly stop at 18 months: this catches it.
 */
const calSource = () => readFileSync(path.resolve(__dirname, '../../../node_modules/israeli-bank-scrapers/lib/scrapers/visa-cal.js'), 'utf8')

describe('the Cal history patch', () => {
  it('is applied: three years back, and a refused old month ends the walk instead of the sync', () => {
    const src = calSource()
    expect(src).toContain(".subtract(3, 'years')")
    expect(src).toContain('pastUsualHistory')
  })

  it('matches what the form offers for Cal', () => {
    expect(syncCompany('visaCal')).toMatchObject({ historyMonths: 36 })
  })
})
