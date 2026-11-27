/** Fixed Hebrew wording for network isolation; the updater's English and details never reach the browser */
export const EGRESS_MESSAGES: Record<string, string> = {
  // The domain
  BAD_DOMAIN: 'זה לא שם אתר תקין. כותבים שם כמו example.com',
  SHARED_HOST: 'זה אתר משותף (אחסון קבצים, קוד, הודעות), ואי אפשר לאשר אותו. דרכו אפשר להוציא מידע',
  TOO_BROAD: 'זה רחב מדי: הוא כולל אתרים רבים. כותבים את שם האתר המלא',
  ALREADY_ALLOWED: 'האתר הזה כבר מותר',
  NOT_FOUND: 'לא נמצא ברשימה',
  // The approval
  NO_APPROVER: 'אי אפשר לאשר עם המפתח או הסיסמה האלה. נסו שוב עם מפתח הכניסה או סיסמת הכניסה שלכם',
  BOOTSTRAP_TAKEN: 'בינתיים כבר נקבע מפתח אישור. סוגרים ומנסים שוב, והפעם מאשרים עם המפתח הקיים',
  ALREADY_PINNED: 'המפתח הזה כבר מאשר',
  UNKNOWN_CREDENTIAL: 'המפתח הזה לא מוכר לאישור. נסו עם מפתח הכניסה שלכם',
  CHALLENGE_UNKNOWN: 'האישור לא תקף יותר. מתחילים מחדש',
  CHALLENGE_EXPIRED: 'עבר יותר מדי זמן. מתחילים מחדש',
  BAD_SIGNATURE: 'האישור לא התקבל: המפתח לא תקין',
  RECONFIGURE_FAILED: 'הפרוקסי לא קיבל את השינוי, והרשימה חזרה כמו שהייתה',
  // The registration
  BAD_CODE: 'הקוד שגוי',
  CODE_EXPIRED: 'הקוד פג. מבקשים קוד חדש',
  TOO_MANY_TRIES: 'יותר מדי ניסיונות. מבקשים קוד חדש',
  NO_REGISTRATION: 'אין רישום פתוח. מבקשים קוד חדש',
  WEAK_PASSWORD: 'הסיסמה קצרה מדי. צריך לפחות 10 תווים',
  BAD_PASSWORD: 'הסיסמה שגויה',
  LOCKED: 'יותר מדי ניסיונות עם סיסמה. אפשר לנסות שוב בעוד כמה דקות, או לאשר עם מפתח',
  BAD_REGISTRATION: 'המפתח לא התקבל. נסו שוב',
  BAD_ADOPT: 'מפתח הכניסה לא התקבל. נסו שוב או הוסיפו מפתח אחר',
  NO_SIGNIN_PASSKEY: 'עוד אין לך מפתח כניסה (Face ID, Touch ID). אפשר להוסיף מפתח אחר',
  NO_SIGNIN_PASSWORD: 'עוד אין לך סיסמת כניסה. מגדירים אותה בהגדרות ← אנשים',
  SIGNED_OUT: 'צריך להתחבר מחדש',
  // The switch and the helper
  BUSY: 'עדכון או שינוי הגדרות כבר רץ. נסו שוב בעוד רגע',
  NOT_AVAILABLE: 'אי אפשר לשנות את זה מכאן. משנים ידנית',
  NO_HELPER: 'רכיב העדכון לא זמין. אפשר לעשות את זה ידנית',
  HELPER_ERROR: 'הפעולה לא הצליחה. נסו שוב',
  INVALID: 'הבקשה לא תקינה',
  // Gating
  NOT_LOCAL: 'בלי כניסה עם מפתח, אפשר לשנות את הבידוד רק מהמחשב שעליו האפליקציה רצה',
  READ_ONLY: 'לא זמין בדמו לקריאה בלבד',
}

export const egressMessage = (code: string | undefined) => EGRESS_MESSAGES[code ?? ''] ?? EGRESS_MESSAGES.HELPER_ERROR
