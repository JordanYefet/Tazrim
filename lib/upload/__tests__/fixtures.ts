// Made-up fixtures for upload tests. Dates are in 2030 so they never overlap real data.
import * as XLSX from 'xlsx'

export function leumiHtml(rows: [string, string, string, string][] = [
  ['05/01/2030', 'חנות בדויה', '12.00', '0.00'],
  ['06/01/2030', 'הפקדה בדויה', '0.00', '30.00'],
]): Buffer {
  const trs = rows
    .map(([d, desc, debit, credit]) => `<tr><td>${d}</td><td>${desc}</td><td>${debit}</td><td>${credit}</td><td>100.00</td><td></td></tr>`)
    .join('')
  return Buffer.from(`<HTML dir="RTL"><body>
<table><tr><td>תנועות בחשבון</td></tr>
<tr><td>תאריך</td><td>תיאור</td><td>בחובה</td><td>בזכות</td><td>היתרה בש"ח</td><td>הערה</td></tr>
${trs}</table></body></HTML>`)
}

const MAX_HEADER = [
  'תאריך עסקה', 'שם בית העסק', 'קטגוריה', '4 ספרות אחרונות של כרטיס האשראי', 'סוג עסקה',
  'סכום חיוב', 'מטבע חיוב', 'סכום עסקה מקורי', 'מטבע עסקה מקורי', 'תאריך חיוב', 'הערות',
]

export function maxXlsx(category = 'קטגוריה בדויה'): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['כל המשתמשים (1)'], ['כל הכרטיסים (1)'], ['2030-01-01-2030-01-31'], MAX_HEADER,
    ['07-01-2030', 'עסק בדוי', category, '0000', 'רגילה', 15, '₪', 15, '₪', '10-02-2030', ''],
    ['סך הכל'],
  ]), 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

export const OTHER_CSV = Buffer.from('תאריך,פירוט,סכום\n2030-01-08,ספק בדוי,9.90\n')

export const TEST_ACCOUNTS_SQL = `
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_test_max2', 'CREDIT_CARD', 'max', 'כרטיס בדיקה', 1900000000000),
  ('acct_test_other', 'BANK', 'otherbank', 'בנק בדוי', 1900000000000);
INSERT INTO "Account" ("id","kind","provider","displayName","archived","createdAt") VALUES
  ('acct_test_archived', 'BANK', 'leumi', 'חשבון בארכיון', true, 1900000000000);
`
