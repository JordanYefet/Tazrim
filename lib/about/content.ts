/*
 * Text and links for the About page (/about).
 *
 * The story is the one block written in the owner's own voice: edit STORY
 * freely, one string per paragraph. The About page and the sign-in page show it. Everything else on the page is factual
 * and should keep matching the README ("רישיון ופרטיות").
 */

// ── הסיפור ─────────────────────────────────────────────────────────────
export const STORY: string[] = [
  'קוראים לי ירדן, נשוי ואבא לשתי בנות. פעם בחודש קבענו ביומן ערב לעבור על כל הוצאות הבית: חשבון הבנק וכל כרטיסי האשראי. רצינו להבין כמה נכנס, כמה יוצא ועל מה, ומה ההוצאות הקבועות שלנו. זה התברר כאתגר לא פשוט, ורציתי לפתור אותו. כך נולד תזרים, שמרכז את כל התזרים של הבית במקום אחד.',
  'הוא רץ אצלכם בבית בכוונה. כך שום מידע לא נשמר אצל אף אחד אחר, והוא חינמי לגמרי: לא רציתי לגבות על זה כסף, ולכן הוא לא יכול היה להיות שירות בענן.',
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
