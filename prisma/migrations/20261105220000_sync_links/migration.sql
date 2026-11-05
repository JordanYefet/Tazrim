-- prisma/migrations/20261105220000_sync_links/migration.sql
-- CreateTable
CREATE TABLE "SyncLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "externalAccount" TEXT NOT NULL,
    "accountId" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncLink_company_externalAccount_key" ON "SyncLink"("company", "externalAccount");
