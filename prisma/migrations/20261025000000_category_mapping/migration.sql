-- Issuer categories mapped to yours (ENG-75): each card row keeps the issuer's category
-- as the file had it, and `category` becomes yours, translated per provider by
-- CategoryMapping. Existing rows: the issuer's category is what they hold now, so
-- nothing on screen changes.

-- AlterTable
ALTER TABLE "CreditCardTransaction" ADD COLUMN "sourceCategory" TEXT NOT NULL DEFAULT '';
UPDATE "CreditCardTransaction" SET "sourceCategory" = "category";

-- CreateTable
CREATE TABLE "CategoryMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "sourceCategory" TEXT NOT NULL,
    "category" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMapping_provider_sourceCategory_key" ON "CategoryMapping"("provider", "sourceCategory");
