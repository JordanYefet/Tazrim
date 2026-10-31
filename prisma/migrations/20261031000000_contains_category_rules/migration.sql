-- Contains-text category rules ("every transaction containing ACME MUSIC is ..."), and a
-- hand-picked flag on card charges, so no rule overwrites a category picked on a row.

-- CreateTable
CREATE TABLE "CategoryKeywordRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryKeywordRule_pattern_key" ON "CategoryKeywordRule"("pattern");

-- AlterTable
ALTER TABLE "CreditCardTransaction" ADD COLUMN "categoryManual" BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: an override no merchant rule of the card's provider explains (same
-- merchant, same category) was picked on the row or in bulk, so it is a manual one.
UPDATE "CreditCardTransaction" SET "categoryManual" = true
WHERE "categoryOverride" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TransactionAlias" r
    JOIN "Account" a ON a."provider" = r."provider"
    WHERE a."id" = "CreditCardTransaction"."accountId"
      AND r."originalName" = "CreditCardTransaction"."originalMerchantName"
      AND r."categoryOverride" = "CreditCardTransaction"."categoryOverride"
  );
