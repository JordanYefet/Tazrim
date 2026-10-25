/**
 * The generic bank descriptions a new database starts with (lib/db/generic-descriptions.ts):
 * general banking terms. Added by the 20261025030000_generic_descriptions migration, whose
 * SQL lists the same ones (a test checks they agree), and again after "delete all data".
 * Kept apart from the database code so tests can import it before pointing Prisma at a test DB.
 */
export const STARTING_GENERIC_DESCRIPTIONS = [
  'שיק',
  'העברה בנקאית',
  'העברה',
  'משיכת מזומן',
  'הפקדה',
  'הפקדת שיק',
  'הפקדת מזומן',
]
