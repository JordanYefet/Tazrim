import { describe, it, expect } from 'vitest'
import { parseBankLeumi } from '../bank-leumi'

const SAMPLE_HTML = `
<HTML dir="RTL"><body>
<table>
  <tr><td>היתרה ₪15,250.00</td><td>מסגרת 0.00</td><td>25.04.26</td></tr>
</table>
<table>
  <tr><td>תנועות בחשבון</td></tr>
  <tr><td>תאריך</td><td>תיאור</td><td>בחובה</td><td>בזכות</td><td>היתרה בש"ח</td><td>הערה</td></tr>
  <tr><td>21/04/2026</td><td>משכורת</td><td>0.00</td><td>2,500.00</td><td>15,250.00</td><td></td></tr>
  <tr><td>19/04/2026</td><td>העברה דיגיטל</td><td>980.00</td><td>0.00</td><td>12,750.00</td><td>הערה כלשהי</td></tr>
  <tr><td></td></tr>
</table>
</body></HTML>
`

describe('parseBankLeumi', () => {
  it('returns 2 transactions skipping title, header, and empty rows', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions).toHaveLength(2)
  })

  it('parses date DD/MM/YYYY correctly', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].date).toEqual(new Date(2026, 3, 21))
  })

  it('parses credit amount removing commas', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].credit).toBe(2500)
    expect(transactions[0].debit).toBe(0)
  })

  it('parses debit amount correctly', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[1].debit).toBe(980)
    expect(transactions[1].credit).toBe(0)
  })

  it('sets description equal to originalDescription by default', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].description).toBe(transactions[0].originalDescription)
  })

  it('captures note field', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[1].note).toBe('הערה כלשהי')
  })

  it('stores sourceFile', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].sourceFile).toBe('test.xls')
  })
})

const SAMPLE_HTML_EXTRA_TABLE = `
<HTML dir="RTL"><body>
<table><tr><td>כותרת ראשית</td></tr></table>
<table><tr><td>מידע כללי</td></tr></table>
<table>
  <tr><td>תנועות בחשבון</td></tr>
  <tr><td>תאריך</td><td>תיאור</td><td>בחובה</td><td>בזכות</td><td>היתרה בש"ח</td><td>הערה</td></tr>
  <tr><td>21/04/2026</td><td>משכורת</td><td>0.00</td><td>2,500.00</td><td>15,250.00</td><td></td></tr>
</table>
</body></HTML>
`

describe('parseBankLeumi — flexible structure', () => {
  it('finds transactions even when they are in the 3rd table', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML_EXTRA_TABLE), 'test.xls')
    expect(transactions).toHaveLength(1)
    expect(transactions[0].credit).toBe(2500)
  })
})
