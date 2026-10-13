-- CreateTable
CREATE TABLE "UnusualDismissal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "UnusualDismissal_source_transactionId_key" ON "UnusualDismissal"("source", "transactionId");
