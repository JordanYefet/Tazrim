-- A starting category list (ENG-76), for cards whose files carry no categories (Cal,
-- Isracard). The card ones use MAX's names, so a MAX file matches them without any
-- mapping; the rest are for bank rows. Added only when there are no categories at all:
-- a database that has any keeps its own list. Same names as lib/db/starting-categories.ts.
-- createdAt is 2026-10-25T00:00:00Z in epoch milliseconds (Prisma's SQLite DateTime format).

INSERT INTO "Category" ("id", "name", "kind", "createdAt")
SELECT "column1", "column2", "column3", 1792886400000
FROM (VALUES
    ('cat_start_01', 'מזון וצריכה', 'EXPENSE'),
    ('cat_start_02', 'מסעדות, קפה וברים', 'EXPENSE'),
    ('cat_start_03', 'דלק, חשמל וגז', 'EXPENSE'),
    ('cat_start_04', 'תחבורה ורכבים', 'EXPENSE'),
    ('cat_start_05', 'אופנה', 'EXPENSE'),
    ('cat_start_06', 'עיצוב הבית', 'EXPENSE'),
    ('cat_start_07', 'חשמל ומחשבים', 'EXPENSE'),
    ('cat_start_08', 'שירותי תקשורת', 'EXPENSE'),
    ('cat_start_09', 'ביטוח', 'EXPENSE'),
    ('cat_start_10', 'רפואה ובתי מרקחת', 'EXPENSE'),
    ('cat_start_11', 'קוסמטיקה וטיפוח', 'EXPENSE'),
    ('cat_start_12', 'פנאי, בידור וספורט', 'EXPENSE'),
    ('cat_start_13', 'טיסות ותיירות', 'EXPENSE'),
    ('cat_start_14', 'עירייה וממשלה', 'EXPENSE'),
    ('cat_start_15', 'משיכת מזומן', 'EXPENSE'),
    ('cat_start_16', 'העברת כספים', 'EXPENSE'),
    ('cat_start_17', 'שונות', 'EXPENSE'),
    ('cat_start_18', 'דיור', 'EXPENSE'),
    ('cat_start_19', 'חשבונות הבית', 'EXPENSE'),
    ('cat_start_20', 'חינוך וילדים', 'EXPENSE'),
    ('cat_start_21', 'חיסכון', 'EXPENSE'),
    ('cat_start_22', 'משכורת', 'INCOME'),
    ('cat_start_23', 'קצבאות', 'INCOME'),
    ('cat_start_24', 'החזרים', 'INCOME'),
    ('cat_start_25', 'ריבית', 'INCOME'),
    ('cat_start_26', 'העברה מחשבון אחר', 'INCOME')
)
WHERE NOT EXISTS (SELECT 1 FROM "Category");
