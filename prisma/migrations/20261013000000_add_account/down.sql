-- Reverts 20261013000000_add_account (ENG-18) and restores the previous schema.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261013000000_add_account/down.sql
--   git checkout <commit before ENG-18> -- prisma/schema.prisma && npx prisma generate
--
-- Mapping back to the enums:
--   CreditCardTransaction.cardProvider = 'HITECH' for the hitech account(s), else 'MAX'
--   UploadHistory.source               = 'BANK' for bank accounts, 'HITECH' for hitech, else 'MAX'
--   TransactionAlias.source            = leumi -> BANK, max -> MAX, hitech -> HITECH (other providers: upper-cased)
-- Limits: rows of different bank accounts that are identical (date, description,
-- debit, credit) cannot coexist under the old unique index, and any provider
-- other than leumi / max / hitech has no enum value to go back to.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "old_TransactionAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "categoryOverride" TEXT
);
INSERT INTO "old_TransactionAlias" ("id", "source", "originalName", "displayName", "categoryOverride")
SELECT "id",
       CASE "provider" WHEN 'leumi' THEN 'BANK' WHEN 'max' THEN 'MAX' WHEN 'hitech' THEN 'HITECH' ELSE upper("provider") END,
       "originalName", "displayName", "categoryOverride"
FROM "TransactionAlias";
DROP TABLE "TransactionAlias";
ALTER TABLE "old_TransactionAlias" RENAME TO "TransactionAlias";

CREATE TABLE "old_UploadHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL
);
INSERT INTO "old_UploadHistory" ("id", "fileName", "uploadedAt", "recordCount", "source")
SELECT u."id", u."fileName", u."uploadedAt", u."recordCount",
       CASE WHEN a."kind" = 'BANK' THEN 'BANK' WHEN a."provider" = 'hitech' THEN 'HITECH' ELSE 'MAX' END
FROM "UploadHistory" u JOIN "Account" a ON a."id" = u."accountId";
DROP TABLE "UploadHistory";
ALTER TABLE "old_UploadHistory" RENAME TO "UploadHistory";
CREATE UNIQUE INDEX "TransactionAlias_source_originalName_key" ON "TransactionAlias"("source", "originalName");

CREATE TABLE "old_BankTransaction" (
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
INSERT INTO "old_BankTransaction" ("id", "date", "originalDescription", "description", "debit", "credit", "balance", "note", "ignored", "sourceFile")
SELECT "id", "date", "originalDescription", "description", "debit", "credit", "balance", "note", "ignored", "sourceFile" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "old_BankTransaction" RENAME TO "BankTransaction";
CREATE UNIQUE INDEX "BankTransaction_date_originalDescription_debit_credit_key" ON "BankTransaction"("date", "originalDescription", "debit", "credit");

CREATE TABLE "old_CreditCardTransaction" (
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
    "cardProvider" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "sourceFile" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "old_CreditCardTransaction" ("id", "transactionDate", "billingDate", "originalMerchantName", "merchantName", "category", "categoryOverride", "chargedAmount", "originalAmount", "originalCurrency", "cardLastFour", "transactionType", "notes", "ignored", "cardProvider", "contentHash", "sourceFile")
SELECT c."id", c."transactionDate", c."billingDate", c."originalMerchantName", c."merchantName", c."category", c."categoryOverride", c."chargedAmount", c."originalAmount", c."originalCurrency", c."cardLastFour", c."transactionType", c."notes", c."ignored",
       CASE WHEN a."provider" = 'hitech' THEN 'HITECH' ELSE 'MAX' END,
       c."contentHash", c."sourceFile"
FROM "CreditCardTransaction" c JOIN "Account" a ON a."id" = c."accountId";
DROP TABLE "CreditCardTransaction";
ALTER TABLE "old_CreditCardTransaction" RENAME TO "CreditCardTransaction";
CREATE INDEX "CreditCardTransaction_contentHash_sourceFile_idx" ON "CreditCardTransaction"("contentHash", "sourceFile");

DROP TABLE "Account";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261013000000_add_account';
