/** Fixed Hebrew wording for container settings (ENG-121); the helper's English never reaches the browser */
export const INSTALL_MESSAGES: Record<string, string> = {
  // Refused before anything changed
  INVALID: 'אין מה לשנות',
  UNKNOWN_KEY: 'את ההגדרה הזו אי אפשר לשנות מכאן',
  INVALID_VALUE: 'הערך לא תקין',
  SAME_PORT: 'שני הפורטים צריכים להיות שונים',
  SAME_HOST: 'שני השמות צריכים להיות שונים',
  KEEP_UPDATER: 'את רכיב העדכון מכבים רק ידנית',
  BUSY: 'עדכון או שינוי הגדרות כבר רץ. נסו שוב בעוד רגע',
  NOT_AVAILABLE: 'אי אפשר לשנות את זה מכאן. משנים ידנית',
  NO_HELPER: 'רכיב העדכון לא זמין. משנים ידנית',
  HELPER_ERROR: 'השינוי לא התחיל. נסו שוב',
  // The job's outcome
  PORT_BUSY: 'הפורט תפוס בתוכנה אחרת במחשב. ההגדרה הקודמת חזרה',
  APPLY_FAILED: 'השינוי לא הופעל. ההגדרה הקודמת חזרה',
  NOT_HEALTHY: 'תזרים לא עלה עם ההגדרה החדשה. ההגדרה הקודמת חזרה',
  WRITE_FAILED: 'לא הצלחנו לשמור את הקובץ .env. שום דבר לא השתנה',
  NOT_RESTORED: 'השינוי לא הצליח, וגם ההחזרה להגדרה הקודמת. בודקים ידנית בתיקייה של תזרים',
  TIMEOUT: 'השינוי לוקח יותר מהרגיל. רעננו את הדף בעוד דקה',
}

/** Field-specific wording for a bad value */
export const INVALID_VALUE_BY_KEY: Record<string, string> = {
  TAZRIM_PORT: 'פורט הוא מספר בין 1024 ל-65535',
  TAZRIM_PHONE_PORT: 'פורט הוא מספר בין 1024 ל-65535',
  TAZRIM_LAN_IP: 'כתובת ברשת הביתית, למשל 192.168.1.20',
  TAZRIM_HOST: 'שם כמו tazrim.internal',
  TAZRIM_DNS_HOST: 'שם כמו dns.internal',
  TAZRIM_DNS_BIND: 'הערך לא תקין',
  COMPOSE_PROFILES: 'הערך לא תקין',
}
