# התקנה מהטרמינל (Linux, או למי שמעדיף)

[חזרה ל-README](../README.md)

אותו דבר שהמתקין עושה, בידיים. מתאים ל-Linux, ולמי שמעדיף לראות כל צעד. אחרי Docker (שלב 1) צריך שני דברים: טרמינל וקובץ הגדרות אחד.

## פתיחת טרמינל

טרמינל הוא חלון שבו מקלידים פקודות. מעתיקים כל פקודה מכאן, מדביקים בטרמינל ולוחצים Enter.

- **Mac:** לוחצים <kbd>⌘</kbd>+<kbd>רווח</kbd>, מקלידים `Terminal` ולוחצים Enter.
- **Windows:** קליק ימני על כפתור התחל ← **Terminal** (או מחפשים בתפריט התחל `PowerShell`).

בודקים ש-Docker מוכן:

```bash
docker compose version
```

אם מופיע מספר גרסה, אפשר להמשיך. אם מופיעה שגיאה, בודקים ש-Docker Desktop פתוח ושכתוב בו **Engine running**.

## הורדת קובץ ההגדרות
יוצרים תיקייה בשם `tazrim` בתיקיית הבית ומורידים אליה את הקובץ `docker-compose.yml`. מדביקים בטרמינל:

**Mac / Linux:**

```bash
mkdir ~/tazrim
cd ~/tazrim
curl -O https://raw.githubusercontent.com/JordanYefet/Tazrim/main/docker-compose.yml
```

**Windows (PowerShell):**

```powershell
mkdir $HOME\tazrim
cd $HOME\tazrim
curl.exe -O https://raw.githubusercontent.com/JordanYefet/Tazrim/main/docker-compose.yml
```

(ב-Windows כותבים `curl.exe` ולא `curl`. בלי זה, הפקודה לא עובדת ב-PowerShell.)

אפשר גם להוריד את [`docker-compose.yml`](https://raw.githubusercontent.com/JordanYefet/Tazrim/main/docker-compose.yml) בדפדפן (קליק ימני ← שמירה בשם) לתוך התיקייה `tazrim`. במקרה כזה בודקים שהשם הוא בדיוק `docker-compose.yml`: דפדפנים מוסיפים לפעמים `.txt` בסוף, ואז צריך למחוק אותו.


## הפעלה

בטרמינל, באותה תיקייה:

```bash
docker compose pull
docker compose up -d
```

הפקודה הראשונה מורידה את הגרסה האחרונה, גם אם במחשב כבר יש גרסה ישנה יותר מהתקנה קודמת. בפעם הראשונה זה לוקח דקה או שתיים. כשהפקודה מסתיימת, פותחים בדפדפן את **<http://localhost:3000>** ועוברים את ההגדרה הראשונה, כמו ב[שלב 3](../README.md#שלב-3-ההגדרה-הראשונה).

בהתקנה כזו אין שירות עדכון: הוא כבוי עד שמפעילים אותו. כדי שהעדכון וההגדרות באפליקציה (פורטים, HTTPS, הכתובת של המחשב) יעבדו בלחיצה, יוצרים בתיקייה `tazrim` קובץ `.env` עם השורה `COMPOSE_PROFILES=updater` ומריצים שוב `docker compose up -d`. בלי זה האפליקציה עובדת מצוין, והעדכון וההגדרות האלה נעשים בידיים ([עדכון ידני](updates.md#עדכון-לגרסה-חדשה)). שירות העזר מחזיק את ה-Docker socket, ראו את האזהרה ב[עדכון לגרסה חדשה](updates.md).
