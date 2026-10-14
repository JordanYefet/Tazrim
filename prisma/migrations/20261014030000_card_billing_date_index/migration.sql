-- ENG-46: card pages and totals filter and group by billing date.
-- CreateIndex
CREATE INDEX "CreditCardTransaction_accountId_billingDate_idx" ON "CreditCardTransaction"("accountId", "billingDate");
