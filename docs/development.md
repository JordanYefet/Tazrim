# פיתוח

[חזרה ל-README](../README.md)

למי שרוצה לשנות את הקוד או לתרום. לשימוש רגיל עדיף [Docker](../README.md#התקנה-והפעלה).

**דרישות:**

- [Node.js](https://nodejs.org/) גרסה 20 ומעלה (כולל npm)
- Git
- ‏`sqlite3` (שורת פקודה): נדרש רק להרצת הבדיקות. ב-macOS הוא מותקן מראש.

```bash
# 1. הורדת הקוד
git clone https://github.com/JordanYefet/Tazrim.git
cd Tazrim

# 2. התקנת תלויות
npm install

# 3. יצירת Prisma Client ובסיס הנתונים (prisma/tazrim.db)
npx prisma generate
npx prisma migrate deploy

# 4. הרצה
npm run dev
```

פותחים בדפדפן את <http://localhost:3000>. בפעם הראשונה בסיס הנתונים ריק, ומעלים קבצים מדף **העלאת קבצים**.

`npm run dev` מתאים לפיתוח. כדי להריץ מהקוד לשימוש יומיומי, עדיף לבנות פעם אחת ולהריץ את הגרסה הבנויה: `npm run build` ואז `npm start`.

**נתוני דמו:** `npm run db:demo` בונה בסיס נתונים נפרד (`prisma/demo.db`) עם שנה של תנועות מומצאות בשלושה חשבונות בנק ושלושה כרטיסי אשראי, ו-`npm run dev:demo` מריץ את האפליקציה עליו. בסיס הנתונים האמיתי (`prisma/tazrim.db`) לא משתנה, ואפשר להריץ את `db:demo` שוב בכל רגע כדי להתחיל מחדש.

**גיבוי:** כל הנתונים נמצאים בקובץ אחד, ומספיק להעתיק אותו:

```bash
cp prisma/tazrim.db ~/Backups/tazrim-$(date +%Y%m%d).db
```

**עדכון:** הענף `release` מצביע תמיד על הגרסה האחרונה שפורסמה, ו-`main` על הפיתוח השוטף. כדי להישאר על גרסאות שפורסמו, עוברים פעם אחת ל-`release` (`git checkout release`), ומעדכנים כך (אחרי גיבוי):

```bash
git pull
npm install
npx prisma generate
npx prisma migrate deploy   # מעדכן את מבנה בסיס הנתונים, הנתונים נשמרים
```

> בסיס הנתונים וקבצי האקסל/CSV מוחרגים מ-Git (`.gitignore`), כדי שנתונים פיננסיים אישיים לא יגיעו למאגר בטעות.

**בניית האימג' מהקוד:** כדי לנסות שינויים בקוד ב-Docker, בונים את האימג' בתיקיית הקוד ומריצים אותו:

```bash
docker build -t ghcr.io/jordanyefet/tazrim:latest .
docker compose up -d
```

`docker compose pull` מחליף אחר כך את האימג' הזה בגרסה שפורסמה.

## פקודות

| פקודה | מה היא עושה |
| --- | --- |
| `npm run dev` | שרת פיתוח על פורט 3000 |
| `npm run dev:demo` | שרת פיתוח על בסיס נתוני הדמו |
| `npm run db:demo` | בונה מחדש את `prisma/demo.db` עם נתונים מומצאים |
| `npm test` | הרצת הבדיקות (Vitest) |
| `npm run build` | בנייה לסביבת ייצור |
| `npm run db:studio` | עיון בבסיס הנתונים דרך Prisma Studio |

**CI וגרסאות:** כל Pull Request ל-`main` עובר ב-GitHub Actions בדיקת טיפוסים, את כל הבדיקות ובנייה (`.github/workflows/ci.yml`). גרסה חדשה מפרסמים ידנית: **Actions ← Release ← Run workflow**, בלי למלא כלום. מספר הגרסה מחושב לבד מהכותרות של ה-PRs שמוזגו ל-`main` מאז הגרסה האחרונה, לפי הקידומת שלהן: `fix:` (וגם `docs:`, `chore:`, `refactor:` וכדומה) מעלה patch ‏(1.4.2 ← 1.4.3), `feat:` מעלה minor ‏(1.4.2 ← 1.5.0), וכל `<type>!:` (למשל `feat!:`) מעלה major ‏(1.4.2 ← 2.0.0). השינוי הגדול ביותר קובע, וכותרת בלי קידומת נחשבת minor. סיכום ההרצה מראה איזו גרסה יצאה ואילו PRs קבעו אותה (`.github/scripts/release-bump.sh`), ובכל PR בודקת `pr-title.yml` את הקידומת ומזהירה כשאין (בלי לחסום). התהליך מעדכן את הענף `release` (עם commit של מספר הגרסה), בונה ומפרסם את האימג' ב-GHCR, ויוצר את התג ואת ה-Release ב-GitHub. Vercel בונה מהענף `release` את הדמו החי, שמתעדכן גם פעם בשבוע (`demo.yml`) כדי שנתוני הדמו יגיעו עד השבוע הנוכחי.

**סקרייפר הבנקים מוצמד בכוונה:** ‏`israeli-bank-scrapers` נעול בדיוק ל-`6.13.0` ב-`package.json`. משדרגים אותו רק ב-PR משלו, אחרי שעוברים על ההבדלים בין הגרסאות (`npm diff --diff=israeli-bank-scrapers@<ישנה> --diff=israeli-bank-scrapers@<חדשה>`), ובודקים מחדש את `patches/`: התיקונים של patch-package קשורים לגרסה המדויקת. **ובנוסף מעדכנים את רשימת הדומיינים של בידוד הרשת:** בדיקה ב-`scripts/__tests__/egress-allowlist.test.ts` נכשלת כשהסקרייפר מוסיף חברה שחסרה ב-`docker/squid/allowlist.json`. מוסיפים אותה שם, מריצים מחדש את הסקר (`docker compose -f docker/squid/survey.compose.yml up -d`, ‏`node scripts/egress-survey.mjs`, ואז `down`) כדי לראות מה עמודי הכניסה טוענים, מעדכנים את הרשימה ומריצים `node scripts/egress-allowlist.mjs`.

**מצב קריאה בלבד:** עם `TAZRIM_READ_ONLY=1` (מתקדם בלבד, בלי מסך בהגדרות) השרת דוחה כל שינוי בנתונים, והממשק מסביר את זה כשמנסים לשמור. כך רץ הדמו החי.

**עיצוב:** כללי העיצוב, הטוקנים והרכיבים המשותפים מתועדים ב-[`docs/design-system.md`](design-system.md), ובפיתוח אפשר לראות אותם חיים בכתובת `/design`.

**טכנולוגיות:** Next.js 15 (App Router), React 19, TypeScript, Prisma עם SQLite, Tailwind CSS, Recharts.

**מבנה עיקרי:**

```
app/          דפים ונתיבי API
components/   רכיבי ממשק לפי אזור (dashboard, cards, bank, search, upload…)
lib/          לוגיקה: parsers לקבצים, db לשאילתות, insights לזיהוי חיובים קבועים וחריגים
prisma/       סכמה ומיגרציות (בסיס הנתונים עצמו לא נשמר ב-Git)
scripts/      סקריפט נתוני הדמו
.github/      תהליכי GitHub Actions: CI, Release, Demo
docs/         מסמכי תכנון וצילומי מסך
```
