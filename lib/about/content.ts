/*
 * Text and links for the About page (/about).
 *
 * The story is the one block written in the owner's own voice: edit STORY
 * freely, one string per paragraph. Everything else on the page is factual
 * and should keep matching the README ("רישיון ופרטיות").
 */

// ── הסיפור ─────────────────────────────────────────────────────────────
export const STORY: string[] = [
  'בניתי את תזרים כי רציתי להבין לאן הולך הכסף של הבית. התנועות בחשבון הבנק ופירוטי כרטיסי האשראי היו מפוזרים בין כמה קבצים ואתרים, וקשה היה לענות על שאלה פשוטה: כמה נכנס החודש, כמה יצא, ועל מה.',
  'התחלתי לכתוב כלי קטן לעצמי, שמחבר את כל התנועות לתמונה חודשית אחת עם קטגוריות. עם הזמן הוא הפך לכלי שאני חוזר אליו כל חודש, ונראה לי נכון לשתף אותו בחינם עם עוד משקי בית שמחפשים את אותה בהירות.',
]
// ───────────────────────────────────────────────────────────────────────

export const REPO_URL = 'https://github.com/JordanYefet/Tazrim'
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
export const ISSUES_URL = `${REPO_URL}/issues`
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`

/** The main open-source projects Tazrim is built on (see package.json). */
export const CREDITS: { name: string; url: string }[] = [
  { name: 'Next.js', url: 'https://nextjs.org' },
  { name: 'React', url: 'https://react.dev' },
  { name: 'Prisma', url: 'https://www.prisma.io' },
  { name: 'SQLite', url: 'https://sqlite.org' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com' },
  { name: 'Recharts', url: 'https://recharts.org' },
  { name: 'Radix UI', url: 'https://www.radix-ui.com' },
  { name: 'Lucide', url: 'https://lucide.dev' },
  { name: 'SheetJS', url: 'https://sheetjs.com' },
  { name: 'next-themes', url: 'https://github.com/pacocoursey/next-themes' },
  { name: 'Heebo', url: 'https://fonts.google.com/specimen/Heebo' },
]
