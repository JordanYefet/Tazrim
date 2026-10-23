-- Bank categories: income/expense categories, a category on bank rows, and
-- per-description rules. Existing categories are expense ones (cards use them).

-- CreateTable
CREATE TABLE "BankCategoryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "category" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BankCategoryRule_provider_originalDescription_direction_key" ON "BankCategoryRule"("provider", "originalDescription", "direction");

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "category" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN "categoryManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'EXPENSE';
