-- CreateTable
CREATE TABLE "ManualRecurringSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "pattern" TEXT NOT NULL DEFAULT '',
    "dayFrom" INTEGER,
    "dayTo" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ManualRecurringMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    CONSTRAINT "ManualRecurringMember_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ManualRecurringSeries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ManualRecurringSeries_accountId_idx" ON "ManualRecurringSeries"("accountId");

-- CreateIndex
CREATE INDEX "ManualRecurringMember_transactionId_idx" ON "ManualRecurringMember"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualRecurringMember_seriesId_transactionId_key" ON "ManualRecurringMember"("seriesId", "transactionId");

