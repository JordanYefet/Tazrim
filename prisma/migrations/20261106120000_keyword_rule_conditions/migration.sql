-- prisma/migrations/20261106120000_keyword_rule_conditions/migration.sql
-- A contains rule can look only in the name or only in the notes, and be limited to one merchant (ENG-101)
ALTER TABLE "CategoryKeywordRule" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'ANY';
ALTER TABLE "CategoryKeywordRule" ADD COLUMN "merchant" TEXT;

-- DropIndex
DROP INDEX "CategoryKeywordRule_pattern_key";

-- CreateIndex
CREATE UNIQUE INDEX "CategoryKeywordRule_pattern_scope_merchant_key" ON "CategoryKeywordRule"("pattern", "scope", "merchant");
