# גיבוי ושחזור

[חזרה ל-README](../README.md)

כל הנתונים נמצאים בתיקייה `/data` בתוך Docker: הקובץ `tazrim.db`, ולידו `tazrim.db-wal` שמחזיק את השינויים האחרונים עד שהם נכנסים לקובץ הראשי. לכן מגבים את כל התיקייה, כשהאפליקציה עצורה. כדאי לגבות לפני כל עדכון, ומדי פעם גם סתם. בטרמינל, מתוך התיקייה `tazrim`:

```bash
docker compose stop
docker compose cp tazrim:/data ./tazrim-backup
docker compose start
```

הגיבוי נשמר בתיקייה `tazrim-backup` בתוך `tazrim`. אפשר להעתיק אותה לדיסק חיצוני או לענן.

שחזור מגיבוי (מחליף את כל הנתונים הנוכחיים בנתונים שבגיבוי):

```bash
docker compose stop
docker compose cp ./tazrim-backup/. tazrim:/data/
docker compose start
```

גיבוי שנוצר אוטומטית לפני עדכון מתוך האפליקציה נמצא בתיקייה `backups` בתוך `/data`, והוא נכלל בהעתקה למעלה.

**שחזור ידני מגיבוי שלפני עדכון** (למשל אם אין שירות עזר, או שהחזרה מתוך האפליקציה כבר לא זמינה). זה מחליף את כל הנתונים הנוכחיים בנתונים מרגע הגיבוי. קודם עוצרים את האפליקציה ורואים אילו גיבויים יש:

```bash
docker compose stop tazrim
docker compose run --rm --no-deps --entrypoint ls tazrim /data/backups
```

שם כל גיבוי אומר מאיזו גרסה לאיזו, ומתי הוא נוצר, למשל `pre-update-v1.0.0-to-v1.2.0-20261113-091400.db`. מעתיקים אותו במקום `tazrim.db`, מוחקים את `tazrim.db-wal` ואת `tazrim.db-shm` (אחרת השינויים שבהם יחולו על הגיבוי), ומפעילים שוב. בפקודה מחליפים את שם הקובץ בשם הגיבוי שבחרתם:

```bash
docker compose run --rm --no-deps --entrypoint sh tazrim -c 'cp /data/backups/pre-update-v1.0.0-to-v1.2.0-20261113-091400.db /data/tazrim.db && rm -f /data/tazrim.db-wal /data/tazrim.db-shm && chown 1000:1000 /data/tazrim.db'
docker compose start tazrim
```

אם הגיבוי נלקח בגרסה ישנה יותר מזו שמותקנת, כדאי להחזיר גם את הגרסה (`TAZRIM_VERSION` בקובץ `.env`, מתקדם בלבד, ואז `docker compose up -d`). גרסה חדשה יותר מעדכנת את מבנה בסיס הנתונים לבד כשהיא עולה. אחרי חזרה אחורה מתוך האפליקציה, הנתונים שהוחלפו נשמרים בתיקייה `backups/before-rollback-<זמן>` (שלוש האחרונות נשארות).

אותו קובץ מתאים גם ל[הרצה מהקוד](development.md): אפשר להעתיק אותו ל-`prisma/tazrim.db`, וגם להפך.

> `docker compose down` משאיר את הנתונים. `docker compose down -v` **מוחק את כל הנתונים**.
