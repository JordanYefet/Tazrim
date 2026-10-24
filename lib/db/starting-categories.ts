import type { CategoryKind } from '@prisma/client'

/**
 * The categories a new database starts with (ENG-76), so cards whose files carry no
 * categories (Cal, Isracard) have something to pick from. The card ones use MAX's names,
 * so a MAX file matches them without any mapping; the rest are for bank rows. Every one
 * can be renamed or deleted like any other category.
 *
 * Added by the 20261025020000_starting_categories migration when there are no categories
 * yet, and again after "delete all data". The migration's SQL lists the same names
 * (a test checks the two agree).
 */
export const STARTING_CATEGORIES: { name: string; kind: CategoryKind }[] = [
  // MAX's names
  { name: 'מזון וצריכה', kind: 'EXPENSE' },
  { name: 'מסעדות, קפה וברים', kind: 'EXPENSE' },
  { name: 'דלק, חשמל וגז', kind: 'EXPENSE' },
  { name: 'תחבורה ורכבים', kind: 'EXPENSE' },
  { name: 'אופנה', kind: 'EXPENSE' },
  { name: 'עיצוב הבית', kind: 'EXPENSE' },
  { name: 'חשמל ומחשבים', kind: 'EXPENSE' },
  { name: 'שירותי תקשורת', kind: 'EXPENSE' },
  { name: 'ביטוח', kind: 'EXPENSE' },
  { name: 'רפואה ובתי מרקחת', kind: 'EXPENSE' },
  { name: 'קוסמטיקה וטיפוח', kind: 'EXPENSE' },
  { name: 'פנאי, בידור וספורט', kind: 'EXPENSE' },
  { name: 'טיסות ותיירות', kind: 'EXPENSE' },
  { name: 'עירייה וממשלה', kind: 'EXPENSE' },
  { name: 'משיכת מזומן', kind: 'EXPENSE' },
  { name: 'העברת כספים', kind: 'EXPENSE' },
  { name: 'שונות', kind: 'EXPENSE' },
  // Mostly bank debits
  { name: 'דיור', kind: 'EXPENSE' },
  { name: 'חשבונות הבית', kind: 'EXPENSE' },
  { name: 'חינוך וילדים', kind: 'EXPENSE' },
  { name: 'חיסכון', kind: 'EXPENSE' },
  // Bank credits
  { name: 'משכורת', kind: 'INCOME' },
  { name: 'קצבאות', kind: 'INCOME' },
  { name: 'החזרים', kind: 'INCOME' },
  { name: 'ריבית', kind: 'INCOME' },
  { name: 'העברה מחשבון אחר', kind: 'INCOME' },
]
