-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debit" REAL NOT NULL DEFAULT 0,
    "credit" REAL NOT NULL DEFAULT 0,
    "balance" REAL NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "sourceFile" TEXT NOT NULL
);
INSERT INTO "new_BankTransaction" ("balance", "credit", "date", "debit", "description", "id", "note", "originalDescription", "sourceFile") SELECT "balance", "credit", "date", "debit", "description", "id", "note", "originalDescription", "sourceFile" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
CREATE UNIQUE INDEX "BankTransaction_date_originalDescription_debit_credit_key" ON "BankTransaction"("date", "originalDescription", "debit", "credit");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
