# התקנת Docker Desktop והרצת המתקין

[חזרה ל-README](../README.md)

## שלב 1: התקנת Docker Desktop

Docker Desktop הוא התוכנה שמריצה את האפליקציה. מתקינים אותו פעם אחת. אין צורך בחשבון Docker: כשמוצע להתחבר, אפשר לדלג.

**ב-Mac:**

1. בודקים איזה מעבד יש במחשב: תפריט Apple () ← **אודות Mac זה**. אם כתוב **Chip** עם Apple M1/M2/M3/M4, זה Apple Silicon. אם כתוב **Processor** עם Intel, זה Intel.
2. נכנסים ל-[docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) ומורידים את הגרסה המתאימה (**Download for Mac – Apple Silicon** או **– Intel Chip**).
3. פותחים את הקובץ שירד (`Docker.dmg`) וגוררים את Docker לתיקייה **Applications**.
4. פותחים את Docker מתיקיית Applications. בפתיחה הראשונה מאשרים את תנאי השימוש, ואם מתבקשים, מקלידים את סיסמת המחשב.
5. מחכים שבתחתית חלון Docker יופיע **Engine running**, ושבסרגל העליון של המסך יופיע אייקון הלווייתן.

**ב-Windows:**

1. נכנסים ל-[docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) ומורידים את **Download for Windows**.
2. מריצים את הקובץ שירד (`Docker Desktop Installer.exe`), ומשאירים מסומנת את האפשרות **Use WSL 2**.
3. בסוף ההתקנה מפעילים מחדש את המחשב, אם מתבקשים.
4. פותחים את **Docker Desktop** מתפריט התחל ומאשרים את תנאי השימוש. אם מופיעה הודעה שצריך להתקין או לעדכן את WSL, מאשרים אותה.
5. מחכים שבתחתית חלון Docker יופיע **Engine running**.

אם מופיעה שגיאה על וירטואליזציה (Virtualization), צריך להפעיל אותה בהגדרות המחשב (BIOS). ההסבר נמצא ב[מדריך התקלות של Docker](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/topics/), בחלק על Virtualization.

**ב-Linux:** מתקינים את Docker Engine עם התוסף Compose לפי [המדריך הרשמי](https://docs.docker.com/engine/install/) להפצה שלכם.

**כדאי לסמן:** בהגדרות של Docker Desktop (גלגל השיניים ← **General**) את **Start Docker Desktop when you sign in to your computer**. כך Docker, והאפליקציה איתו, עולים לבד אחרי הפעלה מחדש של המחשב.


## שלב 2: הורדה והפעלה של המתקין

המתקין הוא קובץ קטן שעושה במקומכם את מה שמתואר ב[התקנה מהטרמינל](install-terminal.md#התקנה-מהטרמינל-linux-או-למי-שמעדיף): יוצר את התיקייה `tazrim` בתיקיית הבית, מוריד אליה את `docker-compose.yml`, כותב קובץ `.env` עם שירות העדכון והכתובת של המחשב ברשת הביתית, מפעיל את האפליקציה ופותח את הדפדפן. הוא מדבר רק עם GitHub ועם Docker. אם תזרים כבר מותקנת, הרצה נוספת רק מפעילה אותה ופותחת את הדפדפן, בלי לשנות את `.env`.

1. נכנסים ל-[עמוד הגרסה האחרונה](https://github.com/JordanYefet/Tazrim/releases/latest) ובחלק **Assets** מורידים את הקובץ המתאים:
   - **Mac:** `Install-Tazrim-Mac.zip`
   - **Windows:** `Install-Tazrim-Windows.zip`
2. פותחים את ה-zip (ב-Mac לוחצים פעמיים עליו, ב-Windows קליק ימני ← **Extract All**).
3. לוחצים פעמיים על הקובץ שבפנים:
   - **Mac:** `Install Tazrim.command`
   - **Windows:** `Install Tazrim.bat` (שני הקבצים שב-zip צריכים להישאר באותה תיקייה)
4. מחכים. בפעם הראשונה Docker מוריד את האפליקציה, וזה לוקח דקה או שתיים. בסוף נפתח הדפדפן.

**אזהרת אבטחה בפעם הראשונה:** המתקין הוא קובץ שהורדתם מהאינטרנט ולא חתום, ולכן המערכת מזהירה לפני שהוא רץ. זה צפוי.

- **Mac:** אם מופיעה הודעה שאי אפשר לפתוח את הקובץ, קליק ימני (או Control+לחיצה) על `Install Tazrim.command` ← **Open** ← **Open** שוב. אם אין כפתור כזה: **System Settings ← Privacy & Security**, גוללים למטה ולוחצים **Open Anyway** ליד שם הקובץ.
- **Windows:** אם מופיע חלון כחול של SmartScreen ("Windows protected your PC"), לוחצים **More info** ואז **Run anyway**.
