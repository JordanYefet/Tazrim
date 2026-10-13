-- ENG-18: Account model.
--
-- Adds Account and gives every BankTransaction, CreditCardTransaction and
-- UploadHistory row an accountId. The provider enums go away:
--   * CreditCardTransaction.cardProvider  -> the row's account
--   * UploadHistory.source                -> the row's account
--   * TransactionAlias.source (enum)      -> TransactionAlias.provider (lowercase string)
--
-- The back-fill is reproducible: the accounts have fixed ids and a fixed
-- createdAt, and every legacy enum value maps to exactly one of them.
--   acct_leumi   BANK         leumi   <- BankTransaction, UploadHistory.source = BANK
--   acct_max     CREDIT_CARD  max     <- cardProvider / source = MAX
--   acct_hitech  CREDIT_CARD  hitech  <- cardProvider / source = HITECH (only created if such rows exist)
-- No card digits are stored: cardLastFour stays NULL.
--
-- Reverse with down.sql in this folder.

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cardLastFour" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the accounts the existing data belongs to.
-- createdAt is 2026-10-13T00:00:00Z in epoch milliseconds (Prisma's SQLite DateTime format).
INSERT INTO "Account" ("id", "kind", "provider", "displayName", "cardLastFour", "archived", "createdAt") VALUES
    ('acct_leumi', 'BANK', 'leumi', 'בנק לאומי', NULL, false, 1791849600000),
    ('acct_max', 'CREDIT_CARD', 'max', 'מקס', NULL, false, 1791849600000);

INSERT INTO "Account" ("id", "kind", "provider", "displayName", "cardLastFour", "archived", "createdAt")
SELECT 'acct_hitech', 'CREDIT_CARD', 'hitech', 'הייטקזון', NULL, false, 1791849600000
WHERE EXISTS (SELECT 1 FROM "CreditCardTransaction" WHERE "cardProvider" = 'HITECH')
   OR EXISTS (SELECT 1 FROM "UploadHistory" WHERE "source" = 'HITECH');

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- BankTransaction: every existing row is Leumi.
CREATE TABLE "new_BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debit" REAL NOT NULL DEFAULT 0,
    "credit" REAL NOT NULL DEFAULT 0,
    "balance" REAL NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "sourceFile" TEXT NOT NULL,
    CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BankTransaction" ("accountId", "balance", "credit", "date", "debit", "description", "id", "ignored", "note", "originalDescription", "sourceFile")
SELECT 'acct_leumi', "balance", "credit", "date", "debit", "description", "id", "ignored", "note", "originalDescription", "sourceFile" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
-- date stays the leading column, so date-ordered reads keep their query plan (and tie order)
CREATE UNIQUE INDEX "BankTransaction_date_originalDescription_debit_credit_accountId_key" ON "BankTransaction"("date", "originalDescription", "debit", "credit", "accountId");

-- CreditCardTransaction: cardProvider -> accountId.
CREATE TABLE "new_CreditCardTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
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
    "contentHash" TEXT NOT NULL DEFAULT '',
    "sourceFile" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CreditCardTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreditCardTransaction" ("accountId", "billingDate", "cardLastFour", "category", "categoryOverride", "chargedAmount", "contentHash", "id", "ignored", "merchantName", "notes", "originalAmount", "originalCurrency", "originalMerchantName", "sourceFile", "transactionDate", "transactionType")
SELECT CASE "cardProvider" WHEN 'HITECH' THEN 'acct_hitech' ELSE 'acct_max' END,
       "billingDate", "cardLastFour", "category", "categoryOverride", "chargedAmount", "contentHash", "id", "ignored", "merchantName", "notes", "originalAmount", "originalCurrency", "originalMerchantName", "sourceFile", "transactionDate", "transactionType"
FROM "CreditCardTransaction";
DROP TABLE "CreditCardTransaction";
ALTER TABLE "new_CreditCardTransaction" RENAME TO "CreditCardTransaction";
-- accountId goes last, so list reads keep their query plan (and tie order)
CREATE INDEX "CreditCardTransaction_contentHash_sourceFile_accountId_idx" ON "CreditCardTransaction"("contentHash", "sourceFile", "accountId");

-- TransactionAlias: source enum -> lowercase provider string.
CREATE TABLE "new_TransactionAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "categoryOverride" TEXT
);
INSERT INTO "new_TransactionAlias" ("categoryOverride", "displayName", "id", "originalName", "provider")
SELECT "categoryOverride", "displayName", "id", "originalName",
       CASE "source" WHEN 'BANK' THEN 'leumi' WHEN 'MAX' THEN 'max' WHEN 'HITECH' THEN 'hitech' ELSE lower("source") END
FROM "TransactionAlias";
DROP TABLE "TransactionAlias";
ALTER TABLE "new_TransactionAlias" RENAME TO "TransactionAlias";
CREATE UNIQUE INDEX "TransactionAlias_provider_originalName_key" ON "TransactionAlias"("provider", "originalName");

-- UploadHistory: source -> accountId.
CREATE TABLE "new_UploadHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL,
    CONSTRAINT "UploadHistory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UploadHistory" ("accountId", "fileName", "id", "recordCount", "uploadedAt")
SELECT CASE "source" WHEN 'BANK' THEN 'acct_leumi' WHEN 'HITECH' THEN 'acct_hitech' ELSE 'acct_max' END,
       "fileName", "id", "recordCount", "uploadedAt"
FROM "UploadHistory";
DROP TABLE "UploadHistory";
ALTER TABLE "new_UploadHistory" RENAME TO "UploadHistory";
CREATE INDEX "UploadHistory_accountId_fileName_idx" ON "UploadHistory"("accountId", "fileName");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Account_kind_provider_idx" ON "Account"("kind", "provider");
