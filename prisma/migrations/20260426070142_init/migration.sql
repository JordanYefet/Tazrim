-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debit" REAL NOT NULL DEFAULT 0,
    "credit" REAL NOT NULL DEFAULT 0,
    "balance" REAL NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sourceFile" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CreditCardTransaction" (
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
    "cardProvider" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TransactionAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "categoryOverride" TEXT
);

-- CreateTable
CREATE TABLE "UploadHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_date_originalDescription_debit_credit_key" ON "BankTransaction"("date", "originalDescription", "debit", "credit");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardTransaction_transactionDate_originalMerchantName_chargedAmount_cardProvider_key" ON "CreditCardTransaction"("transactionDate", "originalMerchantName", "chargedAmount", "cardProvider");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionAlias_source_originalName_key" ON "TransactionAlias"("source", "originalName");
