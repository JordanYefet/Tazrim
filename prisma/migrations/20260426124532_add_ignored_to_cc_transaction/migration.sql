-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreditCardTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionDate" DATETIME NOT NULL,
    "billingDate" DATETIME NOT NULL,
    "originalMerchantName" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryOverride" TEXT,
    "chargedAmount" REAL NOT NULL,
    "originalAmount" REAL NOT NULL,
    "originalCurrency" TEXT NOT NULL,
    "cardLastFour" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "cardProvider" TEXT NOT NULL
);
INSERT INTO "new_CreditCardTransaction" ("billingDate", "cardLastFour", "cardProvider", "category", "categoryOverride", "chargedAmount", "id", "merchantName", "notes", "originalAmount", "originalCurrency", "originalMerchantName", "transactionDate", "transactionType") SELECT "billingDate", "cardLastFour", "cardProvider", "category", "categoryOverride", "chargedAmount", "id", "merchantName", "notes", "originalAmount", "originalCurrency", "originalMerchantName", "transactionDate", "transactionType" FROM "CreditCardTransaction";
DROP TABLE "CreditCardTransaction";
ALTER TABLE "new_CreditCardTransaction" RENAME TO "CreditCardTransaction";
CREATE UNIQUE INDEX "CreditCardTransaction_transactionDate_originalMerchantName_chargedAmount_cardProvider_key" ON "CreditCardTransaction"("transactionDate", "originalMerchantName", "chargedAmount", "cardProvider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
