-- DropIndex
DROP INDEX "CreditCardTransaction_contentHash_idx";

-- CreateIndex
CREATE INDEX "CreditCardTransaction_contentHash_sourceFile_idx" ON "CreditCardTransaction"("contentHash", "sourceFile");
