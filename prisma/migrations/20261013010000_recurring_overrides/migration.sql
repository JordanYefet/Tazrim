-- CreateTable
CREATE TABLE "RecurringSeriesOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "baseKey" TEXT NOT NULL,
    "accountId" TEXT,
    "status" TEXT,
    "displayName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSeriesOverride_key_key" ON "RecurringSeriesOverride"("key");

-- CreateIndex
CREATE INDEX "RecurringSeriesOverride_baseKey_idx" ON "RecurringSeriesOverride"("baseKey");

