-- Generic bank descriptions: wordings that only say how money moved (a cheque, a
-- transfer, a cash withdrawal), so one rule for all their rows would be wrong. Their
-- rows are categorised one by one. Starts with general banking terms (the same list as
-- lib/db/starting-generic-descriptions.ts), then does what marking one does: drops the rules
-- saved for them and clears the categories those rules set. Rows set by hand keep theirs.
-- createdAt is 2026-10-25T00:00:00Z in epoch milliseconds (Prisma's SQLite DateTime format).

-- CreateTable
CREATE TABLE "GenericDescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "GenericDescription_description_key" ON "GenericDescription"("description");

INSERT INTO "GenericDescription" ("id", "description", "createdAt")
SELECT "column1", "column2", 1792886400000
FROM (VALUES
    ('generic_start_1', 'שיק'),
    ('generic_start_2', 'העברה בנקאית'),
    ('generic_start_3', 'העברה'),
    ('generic_start_4', 'משיכת מזומן'),
    ('generic_start_5', 'הפקדה'),
    ('generic_start_6', 'הפקדת שיק'),
    ('generic_start_7', 'הפקדת מזומן')
);

DELETE FROM "BankCategoryRule"
WHERE "originalDescription" IN (SELECT "description" FROM "GenericDescription");

UPDATE "BankTransaction" SET "category" = NULL
WHERE "categoryManual" = false
  AND "originalDescription" IN (SELECT "description" FROM "GenericDescription");
